import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { stripe } from "../lib/stripe.js";
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

/**
 * POST /api/auth/auto-confirm
 * Auto-confirms a user's email after signup so they can continue without
 * waiting for the verification email.
 * Body: { userId: string }
 */
router.post("/auto-confirm", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email_confirm: true }
    );

    if (error) {
      console.error("[Auth] Auto-confirm error:", error.message);
      return res.status(500).json({ error: "Failed to confirm user" });
    }

    console.log(`[Auth] Auto-confirmed user ${userId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error("[Auth] Auto-confirm error:", error.message);
    return res.status(500).json({ error: "Failed to confirm user" });
  }
});

/**
 * POST /api/auth/unsubscribe
 * Cancels the user's active Stripe subscription.
 */
router.post("/unsubscribe", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch profile to get stripe_subscription_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_subscription_id, subscription_status")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("[Auth] Unsubscribe profile error:", profileError.message);
      return res.status(500).json({ error: "Failed to fetch profile" });
    }

    if (!profile?.stripe_subscription_id || profile.subscription_status !== "active") {
      return res.status(400).json({ error: "No active subscription found" });
    }

    // Cancel the Stripe subscription at period end
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update profile status
    await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "cancelled",
        subscription_credits: 0,
      })
      .eq("id", userId);

    console.log(`[Auth] Subscription cancelled for user ${userId}`);
    return res.json({ success: true, message: "Subscription cancelled. You'll retain access until the end of the billing period." });
  } catch (error) {
    console.error("[Auth] Unsubscribe error:", error.message);
    return res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * POST /api/auth/delete-account
 * Cancels subscription (if any) and permanently deletes the user account.
 */
router.post("/delete-account", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Attempt to cancel subscription if active
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_subscription_id, subscription_status")
        .eq("id", userId)
        .single();

      if (profile?.stripe_subscription_id && profile.subscription_status === "active") {
        await stripe.subscriptions.cancel(profile.stripe_subscription_id);
        console.log(`[Auth] Stripe subscription cancelled for user ${userId} during account deletion`);
      }
    } catch (subErr) {
      // Don't block deletion if Stripe cancel fails
      console.warn(`[Auth] Failed to cancel Stripe sub for ${userId}:`, subErr.message);
    }

    // Delete the user from Supabase Auth — all related data cascades
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[Auth] Delete account error:", deleteError.message);
      return res.status(500).json({ error: "Failed to delete account" });
    }

    console.log(`[Auth] Account deleted for user ${userId}`);
    return res.json({ success: true, message: "Account permanently deleted." });
  } catch (error) {
    console.error("[Auth] Delete account error:", error.message);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
