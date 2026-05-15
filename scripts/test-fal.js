#!/usr/bin/env node
/**
 * HaloProfile — fal.ai LoRA Training + Inference Test Script
 *
 * This script tests the full AI pipeline end-to-end:
 *   1. Generates a signed URL for an existing zip in Supabase Storage
 *   2. Submits a LoRA training job to fal.ai (fal-ai/flux-lora-fast-training)
 *   3. Polls until training completes and prints the lora_url
 *   4. Runs a test image generation using that LoRA (fal-ai/flux/dev/lora)
 *   5. Prints the generated image URL
 *
 * Usage:
 *   node scripts/test-fal.js <storage-path-to-zip>
 *
 * Example:
 *   node scripts/test-fal.js abc-user-id/abc-upload-id/photos.zip
 *
 * If no path is provided, it uses FAL_TEST_ZIP_URL from .env directly.
 */

import "dotenv/config";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";

// ─── Config ────────────────────────────────────────────────────────────────

const FAL_KEY           = process.env.FAL_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET            = "pending-uploads";

// A unique trigger word for this test run
const TRIGGER_WORD = "glowperson";

// Steps: lower = faster + cheaper for testing. Production uses 1000+
const STEPS = 200;

// ─── Validate env ──────────────────────────────────────────────────────────

if (!FAL_KEY) {
  console.error("❌ FAL_KEY is missing from .env — get your key at https://fal.ai/dashboard/keys");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env");
  process.exit(1);
}

fal.config({ credentials: FAL_KEY });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const storagePath = process.argv[2];

  let zipUrl;

  if (storagePath) {
    // Generate a 1-hour signed URL for the zip in Supabase Storage
    console.log(`\n📦 Generating signed URL for: ${BUCKET}/${storagePath}`);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (error) {
      console.error("❌ Failed to create signed URL:", error.message);
      console.log("   Make sure the file exists in Supabase Storage.");
      console.log(`   Check the bucket "${BUCKET}" in your Supabase dashboard.`);
      process.exit(1);
    }

    zipUrl = data.signedUrl;
    console.log("✅ Signed URL created");
  } else if (process.env.FAL_TEST_ZIP_URL) {
    zipUrl = process.env.FAL_TEST_ZIP_URL;
    console.log(`\n📦 Using FAL_TEST_ZIP_URL from .env`);
  } else {
    console.error("❌ Provide a storage path or set FAL_TEST_ZIP_URL in .env");
    console.log("\nUsage:");
    console.log("  node scripts/test-fal.js <userId>/<uploadId>/photos.zip");
    console.log("\nOr add to .env:");
    console.log("  FAL_TEST_ZIP_URL=https://your-public-zip-url.zip");
    process.exit(1);
  }

  // ── Step 1: Submit LoRA Training ────────────────────────────────────────

  console.log("\n🚀 Submitting LoRA training job to fal.ai...");
  console.log(`   Model:        fal-ai/flux-lora-fast-training`);
  console.log(`   Trigger word: ${TRIGGER_WORD}`);
  console.log(`   Steps:        ${STEPS} (use 1000+ for production)`);
  console.log(`   Cost estimate: ~$2 base + per-step`);
  console.log("");

  let loraUrl;
  const trainingStart = Date.now();

  try {
    const result = await fal.subscribe("fal-ai/flux-lora-fast-training", {
      input: {
        images_data_url: zipUrl,
        trigger_word: TRIGGER_WORD,
        is_style: false, // false = subject/face training (correct for portraits)
        steps: STEPS,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_QUEUE") {
          process.stdout.write(`\r⏳ In queue... position: ${update.queue_position ?? "?"}`);
        } else if (update.status === "IN_PROGRESS") {
          const lastLog = update.logs?.at(-1)?.message ?? "";
          process.stdout.write(`\r🔥 Training: ${lastLog.slice(0, 80).padEnd(80)}`);
        }
      },
    });

    const elapsed = ((Date.now() - trainingStart) / 1000).toFixed(1);
    console.log(`\n\n✅ Training complete in ${elapsed}s`);
    console.log(`   Request ID: ${result.requestId}`);
    console.log(`   LoRA URL:   ${result.data?.diffusers_lora_file?.url}`);

    loraUrl = result.data?.diffusers_lora_file?.url;
    if (!loraUrl) throw new Error("No lora_url in response — check fal.ai dashboard");

  } catch (err) {
    console.error("\n❌ Training failed:", err.message);
    process.exit(1);
  }

  // ── Step 2: Generate a Test Image ───────────────────────────────────────

  console.log("\n🎨 Generating test image with trained LoRA...");

  const testPrompt = `A professional headshot of ${TRIGGER_WORD}, soft studio lighting, clean background, photorealistic`;

  try {
    const genResult = await fal.subscribe("fal-ai/flux/dev/lora", {
      input: {
        prompt: testPrompt,
        loras: [{ path: loraUrl, scale: 1.0 }],
        num_images: 1,
        image_size: "portrait_4_3",
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
      logs: false,
    });

    const imageUrl = genResult.data?.images?.[0]?.url;
    console.log("\n✅ Image generated!");
    console.log(`   Prompt:    ${testPrompt}`);
    console.log(`   Image URL: ${imageUrl}`);
    console.log("\n🎉 Full pipeline test PASSED. Open the image URL in your browser to view.\n");

  } catch (err) {
    console.error("\n❌ Image generation failed:", err.message);
    console.log("   Training succeeded — generation issue may be prompt or LoRA scale related.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
