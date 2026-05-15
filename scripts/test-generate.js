import "dotenv/config";
import { supabaseAdmin } from "../server/lib/supabase.js";

async function run() {
  const userId = "4cce4baf-ccd5-438d-90be-600fb55158e7"; // From previous sql execution
  
  // 1. Get or create an upload
  let { data: upload } = await supabaseAdmin.from("uploads").select("id").eq("user_id", userId).limit(1).single();
  
  if (!upload) {
    const { data: newUpload } = await supabaseAdmin.from("uploads").insert({
      user_id: userId,
      zip_url: "http://dummy.zip",
      photo_count: 20,
      status: "paid"
    }).select("id").single();
    upload = newUpload;
  }
  
  // 2. Create a training job
  const falRequestId = "req_test_" + Date.now();
  const { data: job, error: jobError } = await supabaseAdmin.from("training_jobs").insert({
    user_id: userId,
    upload_id: upload.id,
    fal_request_id: falRequestId,
    trigger_word: "glowperson",
    plan: "starter",
    status: "pending"
  }).select("id").single();
  
  if (jobError) {
    console.error("Failed to insert training job:", jobError);
    process.exit(1);
  }
  
  console.log("Created training job:", job.id);
  console.log("Simulating webhook...");
  
  // 3. Hit the webhook
  // We use a public LoRA URL as a dummy, or just let fal.ai ignore it if it doesn't exist, though an invalid URL might fail.
  // Actually, fal.ai handles loras nicely. If it's empty, it might fail. Let's provide a real URL format.
  const payload = {
    request_id: falRequestId,
    status: "OK",
    payload: {
      diffusers_lora_file: {
        url: "https://huggingface.co/nerijs/pixel-art-xl/resolve/main/pixel-art-xl.safetensors" // Random public safetensor
      }
    }
  };
  
  const response = await fetch("http://localhost:3000/api/training/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  const text = await response.text();
  console.log("Webhook response:", response.status, text);
  
  if (response.ok) {
    console.log("Check the server console for generation logs!");
    console.log(`Once complete, check the 'generated_photos' table or visit http://localhost:3000/status.html?uploadId=${upload.id}`);
  }
}

run().catch(console.error);
