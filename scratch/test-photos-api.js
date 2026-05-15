import "dotenv/config";
import { supabaseAdmin } from "../server/lib/supabase.js";

const jobId = "b44e005f-a94c-40a0-b7e1-43e19cf720da";
const userId = "07a2cd90-020c-4310-a565-6cfcee7fb66f";

async function test() {
  console.log(`Checking job ${jobId} for user ${userId}...`);
  
  const { data: job, error: jobError } = await supabaseAdmin
    .from("training_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (jobError) {
    console.error("Job check failed:", jobError.message);
    return;
  }
  console.log("Job found:", job);

  const { data: photos, error: photosError } = await supabaseAdmin
    .from("generated_photos")
    .select("id, image_url, style, created_at")
    .eq("training_job_id", jobId);

  if (photosError) {
    console.error("Photos fetch failed:", photosError.message);
    return;
  }
  
  console.log(`Photos found: ${photos.length}`);
}

test();
