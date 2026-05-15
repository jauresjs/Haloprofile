import "dotenv/config";
import { fal } from "@fal-ai/client";
import { supabaseAdmin } from "../server/lib/supabase.js";

const STEPS = 200; // Use 200 for a quick, cheap test. Use 1000+ for high quality.
const TRIGGER_WORD = "glowperson";

async function run() {
  const uploadId = process.argv[2];

  if (!uploadId) {
    console.error("❌ Please provide an uploadId.");
    console.log("Usage: node scripts/start-training.js <uploadId>");
    process.exit(1);
  }

  // 1. Fetch the upload record
  const { data: upload, error: uploadError } = await supabaseAdmin
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    console.error("❌ Upload not found:", uploadError?.message);
    process.exit(1);
  }

  console.log(`✅ Found upload for user ${upload.user_id}`);

  // 2. Insert the training_job record
  const falRequestId = `req_manual_${Date.now()}`;
  const { data: job, error: jobError } = await supabaseAdmin
    .from("training_jobs")
    .insert({
      user_id: upload.user_id,
      upload_id: upload.id,
      fal_request_id: falRequestId,
      trigger_word: TRIGGER_WORD,
      plan: "starter", // 5 photos per style
      status: "training",
    })
    .select("id")
    .single();

  if (jobError) {
    console.error("❌ Failed to create training job:", jobError.message);
    process.exit(1);
  }

  console.log(`✅ Created training job: ${job.id}`);

  // 3. Kick off fal.ai training
  console.log(`🚀 Starting fal.ai training (${STEPS} steps)...`);
  
  // Create a signed URL for the zip file so fal.ai can download it
  // The zip_url stored in the DB is currently the public bucket URL or a signed URL depending on how it was uploaded.
  // In upload.html, it uploads to: pending-uploads/{userId}/{uploadId}/photos.zip
  const storagePath = `${upload.user_id}/${upload.id}/photos.zip`;
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
    .from("pending-uploads")
    .createSignedUrl(storagePath, 3600);

  if (signedUrlError) {
    console.error("❌ Failed to create signed URL for zip:", signedUrlError.message);
    process.exit(1);
  }

  const zipUrl = signedUrlData.signedUrl;

  try {
    // Note: We use fal.subscribe with webhookUrl to trigger our backend!
    const webhookUrl = `${process.env.APP_URL}/api/training/webhook`;
    console.log(`🔗 Webhook URL: ${webhookUrl}`);
    console.log("⚠️  Note: If your APP_URL is localhost, fal.ai cannot reach your webhook!");
    console.log("   To test locally, you MUST use ngrok or similar to expose port 3000.");

    const result = await fal.subscribe("fal-ai/flux-lora-fast-training", {
      input: {
        images_data_url: zipUrl,
        trigger_word: TRIGGER_WORD,
        is_style: false,
        steps: STEPS,
      },
      webhookUrl: webhookUrl,
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

    console.log(`\n\n✅ Training completed on fal.ai!`);
    console.log(`   LoRA URL: ${result.data?.diffusers_lora_file?.url}`);
    
    // Check if webhook worked (if APP_URL is a public URL like ngrok)
    console.log(`\n👉 The webhook should now have been triggered on your server.`);
    console.log(`👉 Check your server terminal logs for generation progress!`);
    console.log(`👉 Visit the status page to watch it live: ${process.env.APP_URL}/status.html?uploadId=${upload.id}`);

    // Fallback: If using localhost without ngrok, manually hit the webhook
    if (process.env.APP_URL.includes("localhost")) {
      console.log(`\n⚠️  Detected localhost. fal.ai couldn't hit your webhook.`);
      console.log(`   Manually simulating the webhook call now...`);
      
      const payload = {
        request_id: result.requestId, // We use the actual request ID from fal so our DB matches
        status: "OK",
        payload: { diffusers_lora_file: { url: result.data.diffusers_lora_file.url } }
      };

      // Force update the fal_request_id in our DB since we generated a fake one earlier
      await supabaseAdmin.from("training_jobs").update({ fal_request_id: result.requestId }).eq("id", job.id);

      const res = await fetch(`${process.env.APP_URL}/api/training/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log(`   Webhook simulation response: ${res.status}`);
      console.log(`\n🎉 Check your server terminal! It should be generating photos now.`);
    }

  } catch (err) {
    console.error("\n❌ fal.ai training failed:", err.message);
  }
}

run();
