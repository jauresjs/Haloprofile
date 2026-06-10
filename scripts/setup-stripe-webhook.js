#!/usr/bin/env node
/**
 * setup-stripe-webhook.js
 * 
 * Creates a production Stripe webhook endpoint.
 * Run: node scripts/setup-stripe-webhook.js
 * 
 * Prerequisites:
 *   - Stripe CLI installed (stripe login first)
 *   - OR use Stripe Dashboard manually
 * 
 * After running, add the webhook signing secret to your .env as STRIPE_WEBHOOK_SECRET
 */

import "dotenv/config";

const APP_URL = process.env.APP_URL || "https://haloprofile.art";

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Stripe Webhook Setup Instructions                  ║
╚══════════════════════════════════════════════════════════════╝

Your webhook endpoint URL is:
  ${APP_URL}/api/stripe/webhook

Events to subscribe:
  • checkout.session.completed
  • invoice.payment_succeeded
  • customer.subscription.deleted
  • customer.subscription.updated

─── Option 1: Stripe Dashboard (recommended) ─────────────────
  1. Go to https://dashboard.stripe.com/webhooks
  2. Click "Add endpoint"
  3. Endpoint URL: ${APP_URL}/api/stripe/webhook
  4. Select events above
  5. Click "Add endpoint"
  6. Copy the "Signing secret" (whsec_...)
  7. Add to .env: STRIPE_WEBHOOK_SECRET=whsec_...

─── Option 2: Stripe CLI ─────────────────────────────────────
  stripe trigger checkout.session.completed
  (For local development only)

─── Option 3: API Key (from script) ──────────────────────────
  If you have a restricted key with webhook admin permissions,
  you can create it via the Stripe API programmatically.

Current .env webhook secret: ${process.env.STRIPE_WEBHOOK_SECRET ? "✓ Set" : "✗ Not set"}
`);