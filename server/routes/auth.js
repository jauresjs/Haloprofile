import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { sendWelcomeEmail } from "../lib/email.js";

const router = Router();

/**
 * POST /api/auth/welcome
 * Called from the client after successful registration.
 * Sends a welcome email and saves the user's locale preference.
 * Body: { locale?: "en" | "fr" }
 */
router.post("/welcome", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const locale = req.body?.locale === "fr" ? "fr" : "en";

    // Save locale preference on the user's profile
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, email, locale },
        { onConflict: "id" }
      );

    // Send welcome email (non-blocking — don't wait for it)
    sendWelcomeEmail(email, locale)
      .then((sent) => {
        if (sent) {
          console.log(`[Auth] Welcome email sent to ${email} (${locale})`);
        } else {
          console.warn(`[Auth] Failed to send welcome email to ${email}`);
        }
      });

    return res.json({ success: true, message: "Welcome email sent" });
  } catch (error) {
    console.error("[Auth] Welcome error:", error.message);
    // Don't fail the request — the user is already registered
    return res.json({ success: true, message: "Registered" });
  }
});

export default router;
