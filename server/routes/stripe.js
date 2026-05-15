import { Router } from "express";
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { stripe } from "../lib/stripe.js";
import { fal } from "@fal-ai/client";

const router = Router();

// Configure fal with key
fal.config({ credentials: process.env.FAL_KEY });

const SUBSCRIPTION_PRICE = 2999; // $29.99

const CREDIT_PACKAGES = {
  10: { price: 1000, credits: 150, name: "150 Credits ($10)" },
  20: { price: 2000, credits: 350, name: "350 Credits ($20)" },
  50: { price: 5000, credits: 1000, name: "1000 Credits ($50)" },
  100: { price: 10000, credits: 2500, name: "2500 Credits ($100)" },
};

/**
 * POST /api/stripe/create-subscription
 * For the initial upload and training.
 */
router.post("/create-subscription", requireAuth, async (req, res) => {
  try {
    const { uploadId, gender } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    const safeGender = gender === "female" ? "female" : "male"; // whitelist

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
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
      success_url: `${process.env.APP_URL}/status.html?uploadId=${uploadId}`,
      cancel_url: `${process.env.APP_URL}/upload.html`,
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

        // 1. Insert into orders table
        await supabaseAdmin.from("orders").insert({
          user_id: userId,
          upload_id: uploadId,
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || session.subscription, // Might not have intent initially
          amount: session.amount_total,
          plan: 'premium_subscription',
          status: "paid",
        });

        // 2. Fetch upload row
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

export default router;
