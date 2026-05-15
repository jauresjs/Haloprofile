import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { generatePhotosForStyle } from "../lib/generate.js";

const router = Router();

/**
 * GET /api/photos/credits
 * Fetch the user's current credit balance.
 */
router.get("/credits", requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_credits, purchased_credits")
      .eq("id", req.user.id)
      .single();

    const sub = profile?.subscription_credits || 0;
    const pur = profile?.purchased_credits || 0;

    const { data: jobs } = await supabaseAdmin
      .from("training_jobs")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("status", "completed")
      .limit(1);

    const hasModel = jobs && jobs.length > 0;

    return res.json({
      subscription_credits: sub,
      purchased_credits: pur,
      total: sub + pur,
      hasModel,
    });
  } catch (err) {
    console.error("Error fetching credits:", err);
    return res.status(500).json({ error: "Failed to fetch credits" });
  }
});

/**
 * GET /api/photos/:jobId
 * Fetch all generated_photos for this jobId.
 * Generates signed URLs. Supports optional ?style= query param.
 */
router.get("/:jobId", requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const { style } = req.query;
  const userId = req.user.id;

  // 1. Verify training_job belongs to req.user.id
  const { data: job, error: jobError } = await supabaseAdmin
    .from("training_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (jobError || !job) {
    console.warn(`[Photos] Unauthorized or job not found. jobId: ${jobId}, userId: ${userId}`);
    return res.status(403).json({ error: "Unauthorized or job not found" });
  }

  console.log(`[Photos] Fetching photos for jobId: ${jobId}, userId: ${userId}`);

  // 2. Fetch all generated_photos
  let query = supabaseAdmin
    .from("generated_photos")
    .select("id, image_url, style, created_at")
    .eq("training_job_id", jobId)
    .order("created_at", { ascending: false });

  if (style) {
    query = query.eq("style", style);
  }

  const { data: photos, error: photosError } = await query;

  if (photosError) {
    console.error("Error fetching photos:", photosError.message);
    return res.status(500).json({ error: "Failed to fetch photos" });
  }

  // 3. Generate signed URLs (1 hour expiry)
  const photosWithSignedUrls = await Promise.all(
    photos.map(async (photo) => {
      // Extract the relative path from the stored public URL
      // Stored URL looks like: https://.../object/public/generated-photos/{userId}/{jobId}/{style}/{uuid}.jpg
      // We want: {userId}/{jobId}/{style}/{uuid}.jpg
      const bucketUrlPath = "generated-photos/";
      let path = photo.image_url;
      if (path.includes(bucketUrlPath)) {
        path = path.split(bucketUrlPath)[1];
      }

      // Generate signed URL
      const { data, error } = await supabaseAdmin.storage
        .from("generated-photos")
        .createSignedUrl(path, 3600);

      return {
        id: photo.id,
        signedUrl: error ? photo.image_url : data.signedUrl,
        style: photo.style,
        created_at: photo.created_at,
      };
    })
  );

  return res.json({ photos: photosWithSignedUrls });
});

/**
 * GET /api/photos
 * Fetch ALL generated photos across all jobs for the authenticated user.
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { style } = req.query;

  console.log(`[Photos] Fetching all photos for userId: ${userId}`);

  // 1. Get all training job IDs for this user
  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("training_jobs")
    .select("id")
    .eq("user_id", userId);

  if (jobsError) {
    console.error("Error fetching jobs:", jobsError.message);
    return res.status(500).json({ error: "Failed to fetch jobs" });
  }

  const hasModel = jobs && jobs.length > 0;

  if (!hasModel) {
    return res.json({ photos: [], hasModel: false });
  }

  const jobIds = jobs.map(j => j.id);

  // 2. Fetch all generated_photos for those jobs
  let query = supabaseAdmin
    .from("generated_photos")
    .select("id, image_url, style, created_at, training_job_id")
    .in("training_job_id", jobIds)
    .order("created_at", { ascending: false });

  if (style) {
    query = query.eq("style", style);
  }

  const { data: photos, error: photosError } = await query;

  if (photosError) {
    console.error("Error fetching photos:", photosError.message);
    return res.status(500).json({ error: "Failed to fetch photos" });
  }

  // 3. Generate signed URLs (1 hour expiry)
  const photosWithSignedUrls = await Promise.all(
    photos.map(async (photo) => {
      const bucketUrlPath = "generated-photos/";
      let path = photo.image_url;
      if (path.includes(bucketUrlPath)) {
        path = path.split(bucketUrlPath)[1];
      }

      const { data, error } = await supabaseAdmin.storage
        .from("generated-photos")
        .createSignedUrl(path, 3600);

      return {
        id: photo.id,
        signedUrl: error ? photo.image_url : data.signedUrl,
        style: photo.style,
        created_at: photo.created_at,
        training_job_id: photo.training_job_id,
      };
    })
  );

  return res.json({ photos: photosWithSignedUrls, hasModel });
});

/**
 * POST /api/photos/generate
 * Generate additional photos for a single style using the user's latest trained LoRA.
 * Body: { style: string, count?: number } (count defaults to 1, max 10)
 */
router.post("/generate", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { style, count = 1, gender: reqGender, shotType: reqShotType, customPrompt } = req.body;

  // Validate style
  const validStyles = ["outdoor", "professional", "lifestyle", "travel"];
  if (!validStyles.includes(style)) {
    return res.status(400).json({ error: `Invalid style. Must be one of: ${validStyles.join(", ")}` });
  }

  // Validate count
  const photoCount = Math.min(Math.max(1, parseInt(count, 10) || 1), 10);
  const cost = photoCount * 25;

  console.log(`[Photos] Generate additional photos request. userId: ${userId}, style: ${style}, count: ${photoCount}, cost: ${cost}`);

  try {
    // Find the user's most recent completed training job that has a lora_url
    const { data: job, error: jobError } = await supabaseAdmin
      .from("training_jobs")
      .select("id, lora_url, trigger_word, gender")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("lora_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (jobError || !job) {
      console.warn(`[Photos] No completed training job found for userId: ${userId}`);
      return res.status(404).json({ error: "No completed training job found. Please upload photos and train a model first." });
    }

    if (!job.lora_url) {
      return res.status(400).json({ error: "Training job has no LoRA model URL." });
    }

    // Allow gender/shotType overrides from request body
    const genderOverride = reqGender === "female" ? "female" : reqGender === "male" ? "male" : null;
    const gender = genderOverride ?? job.gender ?? "male";

    const validShotTypes = ["face", "bust", "torso", "fullbody"];
    const shotTypeOverride = validShotTypes.includes(reqShotType) ? reqShotType : null;
    const shotType = shotTypeOverride ?? job.shot_type ?? "bust";

    // Check Credits
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_credits, purchased_credits")
      .eq("id", userId)
      .single();

    const subCredits = profile?.subscription_credits || 0;
    const purCredits = profile?.purchased_credits || 0;
    const totalCredits = subCredits + purCredits;

    if (totalCredits < cost) {
      return res.status(400).json({ error: `Insufficient credits. You need ${cost} credits but only have ${totalCredits}.` });
    }

    console.log(`[Photos] Using job ${job.id} for generation. Trigger word: ${job.trigger_word}, gender: ${gender}, shotType: ${shotType}`);

    // Deduct credits
    let newSub = subCredits;
    let newPur = purCredits;
    let remainingCost = cost;

    if (newSub >= remainingCost) {
      newSub -= remainingCost;
    } else {
      remainingCost -= newSub;
      newSub = 0;
      newPur -= remainingCost;
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        subscription_credits: newSub,
        purchased_credits: newPur
      })
      .eq("id", userId);

    // Generate photos
    const generatedPhotos = await generatePhotosForStyle({
      userId,
      jobId: job.id,
      loraUrl: job.lora_url,
      triggerWord: job.trigger_word,
      style,
      count: photoCount,
      gender,
      shotType,
      customPrompt,
    });

    console.log(`[Photos] Generated ${generatedPhotos.length} photos for ${style}`);

    return res.json({ photos: generatedPhotos, credits: newSub + newPur });

  } catch (err) {
    console.error("[Photos] Error generating additional photos:", err.message);
    return res.status(500).json({ error: "Failed to generate photos. Please try again." });
  }
});

export default router;
