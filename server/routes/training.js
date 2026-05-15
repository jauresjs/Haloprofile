import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
// Removed generateAllPhotos import

const router = Router();

/**
 * POST /api/training/webhook
 * Called by fal.ai when training completes.
 */
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    
    // In fal.ai webhooks, the request_id is usually provided, but you can also pass custom params in the webhook URL or payload
    // We'll extract fal_request_id from the payload. fal.ai sends it as `request_id`.
    const falRequestId = payload.request_id;
    const loraUrl = payload.payload?.diffusers_lora_file?.url || payload.diffusers_lora_file?.url;

    console.log(`[Webhook received] fal_request_id: ${falRequestId}, status: ${payload.status}`);

    if (payload.status !== "OK") {
      console.error("[Webhook] Training failed:", payload.error);
      if (falRequestId) {
        await supabaseAdmin
          .from("training_jobs")
          .update({ status: "failed" })
          .eq("fal_request_id", falRequestId);
      }
      return res.status(200).send("Acknowledged failure");
    }

    if (!falRequestId || !loraUrl) {
      console.error("[Webhook] Missing falRequestId or loraUrl in payload:", payload);
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Update job to completed
    const { data: job, error: updateError } = await supabaseAdmin
      .from("training_jobs")
      .update({
        lora_url: loraUrl,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("fal_request_id", falRequestId)
      .select("id")
      .single();

    if (updateError || !job) {
      console.error("[Webhook] Failed to update training job:", updateError?.message);
      return res.status(500).json({ error: "Failed to update job" });
    }

    console.log(`[Webhook] Job ${job.id} marked as completed.`);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("[Webhook] Unhandled error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * GET /api/training/status/:jobId
 * Returns training_job row for the current user.
 */
router.get("/status/:jobId", requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  const { data: job, error } = await supabaseAdmin
    .from("training_jobs")
    .select("id, status, steps, created_at, completed_at")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: "Job not found" });
  }

  // Get photo count
  const { count, error: countError } = await supabaseAdmin
    .from("generated_photos")
    .select("*", { count: "exact", head: true })
    .eq("training_job_id", jobId);

  return res.json({
    ...job,
    photo_count: countError ? 0 : count,
  });
});

/**
 * GET /api/training/by-upload/:uploadId
 * Finds a training_job by upload_id for the current user.
 */
router.get("/by-upload/:uploadId", requireAuth, async (req, res) => {
  const { uploadId } = req.params;
  const userId = req.user.id;

  const { data: job, error } = await supabaseAdmin
    .from("training_jobs")
    .select("id, status")
    .eq("upload_id", uploadId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: "Training job not found for this upload" });
  }

  return res.json({ jobId: job.id, status: job.status });
});

export default router;
