import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

/**
 * POST /api/upload/complete
 * Called after the client has uploaded the zip to Supabase Storage.
 * Inserts a row into the uploads table with status "pending_payment".
 */
router.post("/complete", requireAuth, async (req, res) => {
  const { zipUrl, photoCount, uploadId } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!zipUrl || !photoCount || !uploadId) {
    return res.status(400).json({ error: "Missing required fields: zipUrl, photoCount, uploadId" });
  }

  // Validate photo count
  if (photoCount < 15) {
    return res.status(400).json({ error: "Minimum 15 photos required" });
  }

  if (photoCount > 30) {
    return res.status(400).json({ error: "Maximum 30 photos allowed" });
  }

  // Insert upload record
  const { data, error } = await supabaseAdmin
    .from("uploads")
    .insert({
      id: uploadId,
      user_id: userId,
      zip_url: zipUrl,
      photo_count: photoCount,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Upload insert error:", error.message);
    return res.status(500).json({ error: "Failed to save upload record" });
  }

  return res.json({ success: true, uploadId: data.id });
});

export default router;
