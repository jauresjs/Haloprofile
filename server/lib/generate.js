import "dotenv/config";
import { fal } from "@fal-ai/client";
import { supabaseAdmin } from "./supabase.js";
import { STYLE_PROMPTS } from "./prompts.js";
import crypto from "crypto";

fal.config({ credentials: process.env.FAL_KEY });

async function enhanceFace(imageUrl) {
  try {
    console.log("  Enhancing face with fal-ai/image-editing/face-enhancement...");
    
    const enhanced = await fal.subscribe("fal-ai/image-editing/face-enhancement", {
      input: {
        image_url: imageUrl,
      },
    });

    const enhancedUrl = enhanced?.data?.image?.url 
                     || enhanced?.data?.images?.[0]?.url;

    if (enhancedUrl) {
      console.log("  Face enhanced successfully");
      return enhancedUrl;
    }

    console.error("  Face enhancement returned no URL, using original");
    return imageUrl;

  } catch (err) {
    console.error(`  Face enhancement failed: ${err.message}, using original`);
    return imageUrl;
  }
}

const PHOTOS_PER_STYLE = {
  starter: 5,
  pro: 12,
  premium: 25,
};

// Maps shot type to (a) a framing directive injected into the prompt and
// (b) the fal.ai image_size that gives the model enough canvas for the frame.
const SHOT_FRAMING = {
  face:     { directive: "85mm lens, extreme close-up portrait, face and neck only, tight chin-to-forehead crop",      imageSize: "portrait_4_3" },
  bust:     { directive: "85mm lens, bust shot portrait, head and shoulders framed from chest up",                     imageSize: "portrait_4_3" },
  torso:    { directive: "50mm lens, three-quarter length portrait, subject framed from head to hip, torso and hands visible, taken from a distance",   imageSize: "portrait_16_9" },
  fullbody: { directive: "35mm wide angle lens, full body portrait, head to toe, entire figure visible, full length shot, standing, taken from far away, shoes visible",        imageSize: "portrait_16_9" },
};

function buildPrompt(template, triggerWord, gender = "male", shotType = "bust", customPrompt = "") {
  const genderWord = gender === "female" ? "a woman" : "a man";
  const { directive } = SHOT_FRAMING[shotType] || SHOT_FRAMING.bust;
  
  let cleanTemplate = template;
  
  // If we are doing a wider shot, remove extreme close-up details that force the model to crop in.
  // Keep facial feature terms (face, eyes, smile, etc.) intact — those preserve identity.
  if (shotType === "torso" || shotType === "fullbody") {
    const phrasesToDrop = [
      "nostril", "ear tip", "iris", "catchlight", "pore", "vellus", "macro",
      "headshot", "close-up", "face focus", "eye detail",
      "85mm", "135mm", "200mm"
    ];
    
    // Split the template by commas and drop any chunk that contains a banned word
    cleanTemplate = template.split(',').map(s => s.trim()).filter(chunk => {
      const lowerChunk = chunk.toLowerCase();
      return !phrasesToDrop.some(drop => lowerChunk.includes(drop));
    }).join(', ');
  }
  
  // Replace TOK placeholder with trigger word + gender + framing directive
  let prompt = cleanTemplate.replace(/\bTOK\b/g, `${triggerWord} ${genderWord}, ${directive}`);
  
  if (customPrompt) {
    prompt = `${prompt}, ${customPrompt}`;
  }

  // Safety check — if trigger word not at start, prepend it
  if (!prompt.startsWith(triggerWord)) {
    return `${triggerWord} ${genderWord}, ${directive}, ${prompt}`;
  }
  
  return prompt;
}

function getImageSize(shotType) {
  return (SHOT_FRAMING[shotType] || SHOT_FRAMING.bust).imageSize;
}

/**
 * Generate additional photos for a single style using an already-trained LoRA.
 * @param {Object} options
 * @param {string} options.userId - The user ID
 * @param {string} options.jobId - The training job ID (for reference in the DB)
 * @param {string} options.loraUrl - The LoRA model URL
 * @param {string} options.triggerWord - The trigger word for the LoRA
 * @param {string} options.style - The style key (outdoor, professional, lifestyle, travel)
 * @param {number} options.count - Number of photos to generate (max 10)
 * @returns {Promise<Array<{id: string|undefined, imageUrl: string, signedUrl: string, style: string}>>}
 */
export async function generatePhotosForStyle({ userId, jobId, loraUrl, triggerWord, style, count, gender = "male", shotType = "bust", customPrompt = "" }) {
  const prompts = STYLE_PROMPTS[style];
  if (!prompts) {
    throw new Error(`Unknown style: ${style}`);
  }

  const maxCount = Math.min(count, 10);
  const generatedPhotos = [];

  console.log(`[generatePhotosForStyle] Generating ${maxCount} photos for style: ${style}, job: ${jobId}`);

  for (let i = 0; i < maxCount; i++) {
    const promptTemplate = prompts[i % prompts.length];
    const prompt = buildPrompt(promptTemplate, triggerWord, gender, shotType, customPrompt);
    const uuid = crypto.randomUUID();

    try {
      // LoRA scale stays at 1.0 for all shot types — composition is controlled by the prompt
      // and image_size, not by weakening the identity signal. The LoRA should ONLY provide identity.
      const loraScale = 1.0;

      // IMPORTANT: Use fal-ai/flux-lora (FLUX 1 base) — the LoRA was trained on
      // flux-lora-fast-training which targets FLUX.1. Using flux-2-lora-gallery
      // applies the LoRA to a completely different base model, breaking identity.
      const genResult = await fal.subscribe("fal-ai/flux-lora", {
        input: {
          prompt,
          loras: [{ path: loraUrl, scale: loraScale }],
          image_size: getImageSize(shotType),
          num_inference_steps: 35,
          guidance_scale: 3.5,
          num_images: 1,
          output_format: "jpeg",
          enable_safety_checker: true,
        },
        logs: false,
      });

      const rawImageUrl = genResult.data?.images?.[0]?.url;
      if (!rawImageUrl) {
        throw new Error(`No image URL returned from fal.ai for ${style} photo ${i + 1}`);
      }

      // Step 2: Enhance face before saving
      console.log(`[generatePhotosForStyle] Photo ${i + 1}/${maxCount} generated for ${style}`);
      const enhancedImageUrl = await enhanceFace(rawImageUrl);
      console.log(`[generatePhotosForStyle] Photo ${i + 1}/${maxCount} enhanced for ${style}`);

      // Step 3: Fetch the enhanced image
      const imageResponse = await fetch(enhancedImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${enhancedImageUrl}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();

      // Step 4: Upload to Supabase Storage
      const storagePath = `${userId}/${jobId}/${style}/${uuid}.jpg`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("generated-photos")
        .upload(storagePath, imageBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
      }

      // Step 5: Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from("generated-photos")
        .getPublicUrl(storagePath);
        
      const imageUrl = publicUrlData.publicUrl;

      // Step 6: Insert into generated_photos table
      const { data: insertData, error: dbError } = await supabaseAdmin
        .from("generated_photos")
        .insert({
          user_id: userId,
          training_job_id: jobId,
          image_url: imageUrl,
          style,
          prompt_used: prompt,
        })
        .select("id")
        .single();

      if (dbError) {
        throw new Error(`Database insert failed: ${dbError.message}`);
      }

      // Step 7: Generate signed URL for immediate return
      const { data: signedUrlData } = await supabaseAdmin.storage
        .from("generated-photos")
        .createSignedUrl(storagePath, 3600);

      generatedPhotos.push({
        id: insertData?.id,
        imageUrl,
        signedUrl: signedUrlData?.signedUrl || imageUrl,
        style,
      });

      console.log(`[generatePhotosForStyle] Photo ${i + 1}/${maxCount} saved for ${style}`);

    } catch (error) {
      console.error(`[generatePhotosForStyle] Error generating ${style} photo ${i + 1}:`, error.message);
      // Continue to next photo even if one fails
    }
  }

  console.log(`[generatePhotosForStyle] Completed. Generated ${generatedPhotos.length}/${maxCount} photos for ${style}`);
  return generatedPhotos;
}

export async function generateAllPhotos({ userId, jobId, loraUrl, triggerWord, plan, gender = "male", shotType = "bust" }) {
  const numPhotosPerStyle = PHOTOS_PER_STYLE[plan] || 5;
  const styles = Object.keys(STYLE_PROMPTS);

  console.log(`[generateAllPhotos] Starting generation for job ${jobId}`);
  console.log(`Plan: ${plan}, ${numPhotosPerStyle} photos per style, ${styles.length} styles.`);

  const totalPerStyle = numPhotosPerStyle;
  console.log(`[Job ${jobId}] Total: ${styles.length} styles × ${totalPerStyle} photos = ${styles.length * totalPerStyle} photos`);

  // Process all styles in parallel
  await Promise.all(
    styles.map(async (style) => {
      const prompts = STYLE_PROMPTS[style];
      
      console.log(`Starting generation for style: ${style}`);
      
      // Run sequentially within each style
      for (let i = 0; i < totalPerStyle; i++) {
        const promptTemplate = prompts[i % prompts.length];
        const prompt = buildPrompt(promptTemplate, triggerWord, gender, shotType);
        const uuid = crypto.randomUUID();

        try {
          // Step 1: Generate photo with fal.ai
          // LoRA scale stays at 1.0 for all shot types — composition is controlled by the prompt
          // and image_size, not by weakening the identity signal. The LoRA should ONLY provide identity.
          const loraScale = 1.0;

          // IMPORTANT: Use fal-ai/flux-lora (FLUX 1 base) — the LoRA was trained on
          // flux-lora-fast-training which targets FLUX.1. Using flux-2-lora-gallery
          // applies the LoRA to a completely different base model, breaking identity.
          const genResult = await fal.subscribe("fal-ai/flux-lora", {
            input: {
              prompt,
              loras: [{ path: loraUrl, scale: loraScale }],
              image_size: getImageSize(shotType),
              num_inference_steps: 35,
              guidance_scale: 3.5,
              num_images: 1,
              output_format: "jpeg",
              enable_safety_checker: true,
            },
            logs: false,
          });

          const rawImageUrl = genResult.data?.images?.[0]?.url;
          if (!rawImageUrl) {
            throw new Error(`No image URL returned from fal.ai for ${style} photo ${i + 1}`);
          }

          // Step 2: Enhance face before saving
          console.log(`[Job ${jobId}] Photo ${i + 1}/${totalPerStyle} generated for ${style}`);
          const enhancedImageUrl = await enhanceFace(rawImageUrl);
          console.log(`[Job ${jobId}] Photo ${i + 1}/${totalPerStyle} enhanced for ${style}`);

          // Step 3: Fetch the enhanced image
          const imageResponse = await fetch(enhancedImageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image from URL: ${enhancedImageUrl}`);
          }
          const imageBuffer = await imageResponse.arrayBuffer();

          // Step 4: Upload to Supabase Storage
          const storagePath = `${userId}/${jobId}/${style}/${uuid}.jpg`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from("generated-photos")
            .upload(storagePath, imageBuffer, {
              contentType: "image/jpeg",
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
          }

          // Step 5: Get public URL
          const { data: publicUrlData } = supabaseAdmin.storage
            .from("generated-photos")
            .getPublicUrl(storagePath);
            
          const imageUrl = publicUrlData.publicUrl;

          // Step 6: Insert into generated_photos table
          const { error: dbError } = await supabaseAdmin
            .from("generated_photos")
            .insert({
              user_id: userId,
              training_job_id: jobId,
              image_url: imageUrl,
              style,
              prompt_used: prompt,
            });

          if (dbError) {
            throw new Error(`Database insert failed: ${dbError.message}`);
          }

          console.log(`[Job ${jobId}] Photo ${i + 1}/${totalPerStyle} saved for ${style}`);

        } catch (error) {
          console.error(`[Job ${jobId}] Error generating ${style} photo ${i + 1}:`, error.message);
          // We continue to the next photo even if one fails
        }
      }
    })
  );

  console.log(`All photos complete for job ${jobId}`);
}