import { Router } from "express";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();

// ─── Helper: Get JWT secret ─────────────────────────────────────
function getSecret() {
  return process.env.ADMIN_PASSWORD + ":haloprofile-admin-secret-salt";
}

// ─── POST /api/admin/login ─────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid admin password" });
    }

    const secret = getSecret();
    const token = jwt.sign({ role: "admin" }, secret, { expiresIn: "24h" });

    return res.json({ token });
  } catch (err) {
    console.error("[Admin] Login error:", err.message);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ─── GET /api/admin/stats ──────────────────────────────────────
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    // Total profiles (registered users)
    const { count: totalUsers, error: err1 } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Users with active subscription
    const { count: subscribedUsers, error: err2 } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("subscription_status", "active");

    // Uploads that are still pending_payment (uploaded but not paid)
    const { count: pendingUploads, error: err3 } = await supabaseAdmin
      .from("uploads")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_payment");

    // Total revenue from orders
    const { data: orders, error: err4 } = await supabaseAdmin
      .from("orders")
      .select("amount")
      .eq("status", "paid");

    const totalRevenue = orders
      ? orders.reduce((sum, o) => sum + (o.amount || 0), 0)
      : 0;

    // Total credits issued (sum of subscription_credits + purchased_credits across all profiles)
    const { data: allProfiles, error: err5 } = await supabaseAdmin
      .from("profiles")
      .select("subscription_credits, purchased_credits");

    const totalCredits = allProfiles
      ? allProfiles.reduce((sum, p) => sum + (p.subscription_credits || 0) + (p.purchased_credits || 0), 0)
      : 0;

    // Distinct users who have uploaded
    const { count: uploaders, error: err6 } = await supabaseAdmin
      .from("uploads")
      .select("user_id", { count: "exact", head: true });

    if (err1 || err2 || err3 || err4 || err5 || err6) {
      console.error("[Admin] Stats query error:", { err1, err2, err3, err4, err5, err6 });
    }

    return res.json({
      totalUsers: totalUsers || 0,
      subscribedUsers: subscribedUsers || 0,
      pendingUploads: pendingUploads || 0,
      totalRevenue,
      totalRevenueFormatted: (totalRevenue / 100).toFixed(2),
      totalCredits,
      totalUploaders: uploaders || 0,
    });
  } catch (err) {
    console.error("[Admin] Stats error:", err.message);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET /api/admin/users ──────────────────────────────────────
// Query params:
//   filter: "all" | "pending" | "subscribed"
//   search: string (matches email or full_name)
//   page: number (1-based)
//   limit: number (default 50)
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    const search = req.query.search || "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    // Start building the main query
    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, plan, subscription_status, subscription_credits, purchased_credits, created_at, updated_at, gender, avatar_url", { count: "exact" });

    if (filter === "subscribed") {
      query = query.eq("subscription_status", "active");
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: profiles, count: totalCount, error } = await query;

    if (error) {
      console.error("[Admin] Users query error:", error.message);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    // For each user, also get their upload status and upload count
    const userIds = profiles.map(p => p.id);

    // Get uploads info
    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("user_id, status, id")
      .in("user_id", userIds);

    // Get training job info (latest status)
    const { data: trainingJobs } = await supabaseAdmin
      .from("training_jobs")
      .select("user_id, status, id")
      .in("user_id", userIds);

    // Get photo counts
    const { data: generatedPhotos } = await supabaseAdmin
      .from("generated_photos")
      .select("user_id, id")
      .in("user_id", userIds);

    // Build lookup maps
    const uploadMap = {};
    for (const u of (uploads || [])) {
      if (!uploadMap[u.user_id]) uploadMap[u.user_id] = [];
      uploadMap[u.user_id].push(u);
    }

    const trainingMap = {};
    for (const t of (trainingJobs || [])) {
      if (!trainingMap[t.user_id]) trainingMap[t.user_id] = [];
      trainingMap[t.user_id].push(t);
    }

    const photoCountMap = {};
    for (const p of (generatedPhotos || [])) {
      photoCountMap[p.user_id] = (photoCountMap[p.user_id] || 0) + 1;
    }

    // Enrich users
    const enriched = profiles.map(profile => {
      const userUploads = uploadMap[profile.id] || [];
      const userTraining = trainingMap[profile.id] || [];
      const hasPendingUpload = userUploads.some(u => u.status === "pending_payment");
      const hasPaidUpload = userUploads.some(u => u.status === "paid");
      const completedTraining = userTraining.some(t => t.status === "completed");
      const photoCount = photoCountMap[profile.id] || 0;

      return {
        ...profile,
        uploads: userUploads,
        uploadCount: userUploads.length,
        hasPendingUpload,
        hasPaidUpload,
        hasCompletedTraining: completedTraining,
        trainingJobs: userTraining,
        generatedPhotoCount: photoCount,
      };
    });

    // For "pending" filter, filter in-memory for users who have uploaded but NOT subscribed
    let filtered = enriched;
    if (filter === "pending") {
      // Users who have uploads (any) but subscription status is not active
      filtered = enriched.filter(p =>
        p.uploadCount > 0 && p.subscription_status !== "active"
      );
    }

    return res.json({
      users: filtered,
      total: filter === "pending" ? filtered.length : (totalCount || 0),
      page,
      limit,
      totalPages: Math.ceil((filter === "pending" ? filtered.length : (totalCount || 0)) / limit),
    });
  } catch (err) {
    console.error("[Admin] Users error:", err.message);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ─── GET /api/admin/users/:id ──────────────────────────────────
router.get("/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Profile
    const { data: profile, error: err1 } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (err1 || !profile) {
      return res.status(404).json({ error: "User not found" });
    }

    // Uploads
    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    // Training jobs
    const { data: trainingJobs } = await supabaseAdmin
      .from("training_jobs")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    // Orders
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    // Generated photos count
    const { count: generatedPhotoCount } = await supabaseAdmin
      .from("generated_photos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id);

    // Total credits used (sum of all order amounts? or just profile)
    const totalCredits = (profile.subscription_credits || 0) + (profile.purchased_credits || 0);

    return res.json({
      profile,
      uploads: uploads || [],
      trainingJobs: trainingJobs || [],
      orders: orders || [],
      generatedPhotoCount: generatedPhotoCount || 0,
      totalCredits,
    });
  } catch (err) {
    console.error("[Admin] User detail error:", err.message);
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
});

// ─── GET /api/admin/users/:id/photos ──────────────────────────
router.get("/users/:id/photos", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: photos, error } = await supabaseAdmin
      .from("generated_photos")
      .select("id, image_url, style, prompt_used, created_at, training_job_id")
      .eq("user_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin] User photos error:", error.message);
      return res.status(500).json({ error: "Failed to fetch photos" });
    }

    // Generate signed URLs
    const photosWithSignedUrls = await Promise.all(
      (photos || []).map(async (photo) => {
        const bucketUrlPath = "generated-photos/";
        let path = photo.image_url;
        if (path && path.includes(bucketUrlPath)) {
          path = path.split(bucketUrlPath)[1];
        }

        const { data: signedData } = await supabaseAdmin.storage
          .from("generated-photos")
          .createSignedUrl(path, 3600);

        return {
          ...photo,
          signedUrl: signedData?.signedUrl || photo.image_url,
        };
      })
    );

    return res.json({ photos: photosWithSignedUrls });
  } catch (err) {
    console.error("[Admin] User photos error:", err.message);
    return res.status(500).json({ error: "Failed to fetch user photos" });
  }
});

// ─── POST /api/admin/users/:id/credits ──────────────────────
// Body: { type: "subscription" | "purchased", amount: number }
router.post("/users/:id/credits", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    if (type !== "subscription" && type !== "purchased") {
      return res.status(400).json({ error: "Type must be 'subscription' or 'purchased'" });
    }

    const column = type === "subscription" ? "subscription_credits" : "purchased_credits";

    // Fetch current value
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(column)
      .eq("id", id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    const current = profile[column] || 0;
    const newValue = current + parseInt(amount, 10);

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ [column]: newValue })
      .eq("id", id);

    if (updateError) {
      console.error("[Admin] Credit update error:", updateError.message);
      return res.status(500).json({ error: "Failed to update credits" });
    }

    console.log(`[Admin] Added ${amount} ${type} credits to user ${id}. New balance: ${newValue}`);

    return res.json({
      success: true,
      [column]: newValue,
      added: parseInt(amount, 10),
    });
  } catch (err) {
    console.error("[Admin] Add credits error:", err.message);
    return res.status(500).json({ error: "Failed to add credits" });
  }
});

export default router;
