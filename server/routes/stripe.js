import { Router } from "express";
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { stripe } from "../lib/stripe.js";
import { fal } from "@fal-ai/client";

const router = Router();

// Configure fal with key
fal.config({ credentials: process.env.FAL_KEY });

const SUBSCRIPTION_PRICE = 4999; // $49.99

const CREDIT_PACKAGES = {
  10: { price: 1000, credits: 150, name: "150 Credits ($10)" },
  20: { price: 2000, credits: 350, name: "350 Credits ($20)" },
  50: { price: 5000, credits: 1000, name: "1000 Credits ($50)" },
  100: { price: 10000, credits: 2500, name: "2500 Credits ($100)" },
};

/**
 * POST /api/stripe/create-checkout
 * For the initial upload and training (subscription).
 */
router.post("/create-checkout", requireAuth, async (req, res) => {
  try {
    const { uploadId, gender, currency = "usd", locale } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    const safeGender = gender === "female" ? "female" : "male"; // whitelist

    // Validate currency
    const supportedCurrencies = ["usd", "cad", "eur"];
    const cur = supportedCurrencies.includes(currency) ? currency : "usd";

    // Locale-aware redirects
    const prefix = locale === "fr" ? "/fr" : "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: cur,
            product_data: {
              name: "HaloProfile Premium Subscription",
              description: "Model Training + 500 Credits / month",
            },
            unit_amount: SUBSCRIPTION_PRICE,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}${prefix}/status.html?uploadId=${uploadId}`,
      cancel_url: `${process.env.APP_URL}${prefix}/upload.html`,
      metadata: {
        type: "subscription",
        userId,
        uploadId,
        gender: safeGender,
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Create subscription error:", error);
    return res.status(500).json({ error: "Failed to create subscription checkout" });
  }
});

/**
 * POST /api/stripe/buy-credits
 * For purchasing extra credits.
 */
router.post("/buy-credits", requireAuth, async (req, res) => {
  try {
    const { amount } = req.body; // 10, 20, 50, 100
    const userId = req.user.id;
    const email = req.user.email;

    if (!CREDIT_PACKAGES[amount]) {
      return res.status(400).json({ error: "Invalid credit package selected" });
    }

    const pkg = CREDIT_PACKAGES[amount];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: pkg.name,
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/gallery.html?credits_purchased=true`,
      cancel_url: `${process.env.APP_URL}/gallery.html`,
      metadata: {
        type: "credits",
        userId,
        credits: pkg.credits,
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Buy credits error:", error);
    return res.status(500).json({ error: "Failed to create credits checkout" });
  }
});

/**
 * POST /api/stripe/webhook
 * Stripe sends webhooks here. We use express.raw() in index.js for this route to verify signature.
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const type = session.metadata?.type;
    const userId = session.metadata?.userId;

    if (type === "credits") {
      const credits = parseInt(session.metadata.credits, 10);
      console.log(`[Stripe Webhook] Credit purchase successful for user ${userId}, adding ${credits} credits`);
      
      try {
        // Fetch current purchased_credits
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("purchased_credits")
          .eq("id", userId)
          .single();
          
        const currentCredits = profile?.purchased_credits || 0;
        
        await supabaseAdmin
          .from("profiles")
          .update({ purchased_credits: currentCredits + credits })
          .eq("id", userId);
      } catch (err) {
        console.error("[Stripe Webhook] Failed to add credits:", err.message);
      }
      return res.json({ received: true });
    }

    if (type === "subscription") {
      const { uploadId, gender } = session.metadata;
      const safeGender = gender === "female" ? "female" : "male";

      console.log(`[Stripe Webhook] Subscription successful for user ${userId}`);

      try {
        // Update user profile with subscription info and give 500 initial credits
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_subscription_id: session.subscription,
            subscription_status: 'active',
            subscription_credits: 500, // Initial grant
          })
          .eq("id", userId);

        // 1. Mark discount as used if one was applied
        const discountCode = session.metadata?.discountCode;
        if (discountCode) {
          await supabaseAdmin
            .from("abandoned_upload_discounts")
            .update({ used_at: new Date().toISOString() })
            .eq("discount_code", discountCode)
            .eq("user_id", userId);
          console.log(`[Stripe Webhook] Marked discount ${discountCode} as used for user ${userId}`);
        }

        // 2. Insert into orders table
        await supabaseAdmin.from("orders").insert({
          user_id: userId,
          upload_id: uploadId,
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || session.subscription,
          amount: session.amount_total,
          plan: 'premium_subscription',
          status: "paid",
        });

        // 3. Fetch upload row
        const { data: upload } = await supabaseAdmin
          .from("uploads")
          .select("zip_url, photo_count")
          .eq("id", uploadId)
          .single();

        if (!upload) throw new Error("Upload not found");

        const triggerWord = "ohwx" + userId.replace(/-/g, "").substring(0, 6).toLowerCase();
        const steps = 1000;

        const { data: job, error: jobError } = await supabaseAdmin
          .from("training_jobs")
          .insert({
            user_id: userId,
            upload_id: uploadId,
            trigger_word: triggerWord,
            steps: steps,
            plan: 'premium_subscription',
            gender: safeGender,
            status: "pending",
            photo_count: upload.photo_count,
          })
          .select("id")
          .single();

        if (jobError) throw jobError;

        const storagePath = `${userId}/${uploadId}/photos.zip`;
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from("pending-uploads")
          .createSignedUrl(storagePath, 3600);
        
        const falZipUrl = signedUrlData?.signedUrl || upload.zip_url;

        console.log(`[Stripe Webhook] Calling fal.ai for job ${job.id} with ${steps} steps...`);
        const webhookUrl = `${process.env.APP_URL}/api/training/webhook`;
        
        const falResult = await fal.subscribe("fal-ai/flux-lora-fast-training", {
          input: {
            images_data_url: falZipUrl,
            trigger_word: triggerWord,
            is_style: false,
            steps: steps,
            create_masks: true,
            multiresolution_training: true,
          },
          webhookUrl: webhookUrl,
        });

        await supabaseAdmin
          .from("training_jobs")
          .update({
            fal_request_id: falResult.requestId,
            status: "training",
          })
          .eq("id", job.id);

        await supabaseAdmin
          .from("uploads")
          .update({ status: "paid" })
          .eq("id", uploadId);

        console.log(`[Stripe Webhook] Successfully initiated training for job ${job.id}`);
      } catch (err) {
        console.error("[Stripe Webhook] Failed to process subscription order:", err.message);
      }
    }
  }

  // Handle subscription renewals
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    if (invoice.subscription) {
      const customerEmail = invoice.customer_email;
      if (customerEmail) {
        try {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", customerEmail)
            .single();

          if (profile) {
            console.log(`[Stripe Webhook] Subscription renewed for user ${profile.id}, resetting credits to 500.`);
            await supabaseAdmin
              .from("profiles")
              .update({
                subscription_credits: 500,
                subscription_status: 'active',
                current_period_end: new Date(invoice.lines.data[0].period.end * 1000).toISOString()
              })
              .eq("id", profile.id);
          }
        } catch (err) {
          console.error("[Stripe Webhook] Failed to handle invoice.payment_succeeded:", err.message);
        }
      }
    }
  }

  // Handle subscription cancellations / failures
  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .single();
          
        if (profile) {
          await supabaseAdmin
            .from("profiles")
            .update({ subscription_status: subscription.status })
            .eq("id", profile.id);
        }
      } catch (err) {
        console.error("[Stripe Webhook] Failed to handle subscription status update:", err.message);
      }
    }
  }

  // Always return 200 to acknowledge receipt
  res.json({ received: true });
});

/**
 * POST /api/stripe/generate-discount
 * Creates a 50% off coupon (first month only) for exit-intent offers.
 * Body: { uploadId }
 */
router.post("/generate-discount", requireAuth, async (req, res) => {
  try {
    const { uploadId } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    if (!uploadId) {
      return res.status(400).json({ error: "uploadId is required" });
    }

    // Check if user already has an active (unused, not expired) discount
    const { data: existing } = await supabaseAdmin
      .from("abandoned_upload_discounts")
      .select("id, discount_code, expires_at")
      .eq("user_id", userId)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Reuse existing discount
      console.log(`[Discount] Reusing existing discount ${existing.discount_code} for user ${userId}`);
      return res.json({
        discountCode: existing.discount_code,
        expiresAt: existing.expires_at,
      });
    }

    // Generate unique discount code
    const code = "HALO50" + userId.replace(/-/g, "").substring(0, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

    // Create Stripe coupon: 50% off, first month only
    const coupon = await stripe.coupons.create({
      name: `50% off - First Month (${email})`,
      percent_off: 50,
      duration: "once",
      max_redemptions: 1,
    });

    console.log(`[Discount] Created Stripe coupon ${coupon.id} for user ${userId}`);

    // Store in database
    const { data: discount, error: dbError } = await supabaseAdmin
      .from("abandoned_upload_discounts")
      .insert({
        user_id: userId,
        upload_id: uploadId,
        discount_code: code,
        discount_percent: 50,
        stripe_coupon_id: coupon.id,
        expires_at: expiresAt,
      })
      .select("id, discount_code, expires_at")
      .single();

    if (dbError) {
      console.error("[Discount] Failed to store discount:", dbError.message);
      // Clean up the Stripe coupon
      await stripe.coupons.del(coupon.id);
      return res.status(500).json({ error: "Failed to create discount" });
    }

    console.log(`[Discount] Created discount ${code} for user ${userId}, expires ${expiresAt}`);

    return res.json({
      discountCode: code,
      expiresAt,
    });
  } catch (error) {
    console.error("[Discount] Error generating discount:", error);
    return res.status(500).json({ error: "Failed to generate discount" });
  }
});

/**
 * GET /api/stripe/discount-status
 * Returns any active (unused, not expired) discount for the current user.
 */
router.get("/discount-status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: discount, error } = await supabaseAdmin
      .from("abandoned_upload_discounts")
      .select("discount_code, discount_percent, expires_at")
      .eq("user_id", userId)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[Discount] Error fetching discount status:", error.message);
      return res.status(500).json({ error: "Failed to fetch discount status" });
    }

    if (!discount) {
      return res.json({ discount: null });
    }

    // Calculate remaining time
    const remainingMs = new Date(discount.expires_at).getTime() - Date.now();
    const remainingMinutes = Math.max(0, Math.round(remainingMs / 60000));

    return res.json({
      discount: {
        code: discount.discount_code,
        percentOff: discount.discount_percent,
        expiresAt: discount.expires_at,
        remainingMinutes,
      },
    });
  } catch (error) {
    console.error("[Discount] Error checking discount status:", error);
    return res.status(500).json({ error: "Failed to check discount status" });
  }
});

/**
 * POST /api/stripe/checkout-with-discount
 * Creates a Stripe checkout session with a discount coupon applied.
 * Body: { uploadId, gender, discountCode }
 */
router.post("/checkout-with-discount", requireAuth, async (req, res) => {
  try {
    const { uploadId, gender, discountCode, currency = "usd", locale } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    if (!uploadId || !discountCode) {
      return res.status(400).json({ error: "uploadId and discountCode are required" });
    }

    const safeGender = gender === "female" ? "female" : "male";

    // Locale-aware redirects
    const prefix = locale === "fr" ? "/fr" : "";

    // Validate currency
    const supportedCurrencies = ["usd", "cad", "eur"];
    const cur = supportedCurrencies.includes(currency) ? currency : "usd";

    // Validate the discount code and get stripe_coupon_id

    const { data: discount } = await supabaseAdmin
      .from("abandoned_upload_discounts")
      .select("stripe_coupon_id, expires_at")
      .eq("discount_code", discountCode)
      .eq("user_id", userId)
      .is("used_at", null)
      .single();

    if (!discount) {
      return res.status(400).json({ error: "Invalid or expired discount code" });
    }

    if (new Date(discount.expires_at) < new Date()) {
      return res.status(400).json({ error: "Discount code has expired" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: cur,
            product_data: {
              name: "HaloProfile Premium Subscription",
              description: "Model Training + 500 Credits / month",
            },
            unit_amount: SUBSCRIPTION_PRICE,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      discounts: [{ coupon: discount.stripe_coupon_id }],
      success_url: `${process.env.APP_URL}${prefix}/status.html?uploadId=${uploadId}`,
      cancel_url: `${process.env.APP_URL}${prefix}/upload.html`,
      metadata: {
        type: "subscription",
        userId,
        uploadId,
        gender: safeGender,
        discountCode,
      },
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Checkout with discount error:", error);
    return res.status(500).json({ error: "Failed to create checkout" });
  }
});

// In the webhook handler, mark discount as used when checkout completes with a discountCode
// (This is handled within the webhook's "subscription" type branch above)

export default router;
