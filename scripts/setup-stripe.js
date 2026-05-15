import fs from "fs";
import path from "path";
import Stripe from "stripe";
import "dotenv/config";

// ─── Config ───────────────────────────────────────────────────────────────────
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const APP_URL = "https://haloprofile.art";

if (!STRIPE_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is missing from your .env file.");
  process.exit(1);
}

if (!STRIPE_KEY.startsWith("sk_live_")) {
  console.error(
    "❌ Your STRIPE_SECRET_KEY does not look like a live key (should start with sk_live_)."
  );
  console.error(`   Found: ${STRIPE_KEY.substring(0, 12)}...`);
  console.error(
    "   Go to https://dashboard.stripe.com/apikeys (Live mode) to get your live key."
  );
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16" });

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log("🚀 Setting up Stripe PRODUCTION configuration...");
  console.log(`   Using key: ${STRIPE_KEY.substring(0, 12)}...`);
  console.log(`   App URL:   ${APP_URL}\n`);

  try {
    // ── 1. Webhook Endpoint ──────────────────────────────────────────────────
    const webhookUrl = `${APP_URL}/api/stripe/webhook`;
    console.log(`🔗 Registering webhook: ${webhookUrl}`);

    // Clean up any duplicate webhooks for this URL
    const existingWebhooks = await stripe.webhookEndpoints.list({ limit: 100 });
    for (const wh of existingWebhooks.data) {
      if (wh.url === webhookUrl) {
        console.log(`   Removing existing webhook: ${wh.id}`);
        await stripe.webhookEndpoints.del(wh.id);
      }
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [
        "checkout.session.completed",
        "invoice.payment_succeeded",
        "customer.subscription.deleted",
        "customer.subscription.updated",
      ],
    });
    console.log(`✅ Webhook created  → secret: ${webhook.secret}\n`);

    // ── 2. Products & Prices ─────────────────────────────────────────────────
    console.log("📦 Creating Products and Prices in live mode...");

    // Starter – $9.99 one-time
    const starterProduct = await stripe.products.create({
      name: "HaloProfile Starter (20 Photos)",
      description: "20 AI-generated headshots across 5 styles",
    });
    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 999,
      currency: "usd",
    });
    console.log(`✅ Starter  → Price ID: ${starterPrice.id}`);

    // Pro – $19.99 one-time
    const proProduct = await stripe.products.create({
      name: "HaloProfile Pro (50 Photos)",
      description: "50 AI-generated headshots across 12 styles",
    });
    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 1999,
      currency: "usd",
    });
    console.log(`✅ Pro       → Price ID: ${proPrice.id}`);

    // Premium – $34.99 one-time
    const premiumProduct = await stripe.products.create({
      name: "HaloProfile Premium (100 Photos)",
      description:
        "100 AI-generated headshots across all styles with commercial license",
    });
    const premiumPrice = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: 3499,
      currency: "usd",
    });
    console.log(`✅ Premium   → Price ID: ${premiumPrice.id}\n`);

    // ── 3. Update .env ───────────────────────────────────────────────────────
    console.log("📝 Writing values to .env...");
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.readFileSync(envPath, "utf8");

    const replacements = {
      STRIPE_WEBHOOK_SECRET: webhook.secret,
      STRIPE_STARTER_PRICE_ID: starterPrice.id,
      STRIPE_PRO_PRICE_ID: proPrice.id,
      STRIPE_PREMIUM_PRICE_ID: premiumPrice.id,
      APP_URL: APP_URL,
    };

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`^${key}=.*`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(envPath, envContent);
    console.log("✅ .env updated successfully!\n");

    console.log("─".repeat(60));
    console.log("🎉 PRODUCTION Stripe Setup Complete!");
    console.log("─".repeat(60));
    console.log("\nNew live values written to .env:");
    console.log(`  APP_URL                = ${APP_URL}`);
    console.log(`  STRIPE_WEBHOOK_SECRET  = ${webhook.secret}`);
    console.log(`  STRIPE_STARTER_PRICE_ID= ${starterPrice.id}`);
    console.log(`  STRIPE_PRO_PRICE_ID    = ${proPrice.id}`);
    console.log(`  STRIPE_PREMIUM_PRICE_ID= ${premiumPrice.id}`);
    console.log("\n⚠️  Restart your server to pick up the new env values.");
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    if (error.type === "StripeAuthenticationError") {
      console.error("   → Your STRIPE_SECRET_KEY is invalid or revoked.");
    }
  }
}

run();
