import { Resend } from "resend";
import {
  welcomeEmail,
  paymentConfirmationEmail,
  trainingCompleteEmail,
} from "./email-templates.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "noreply@haloprofile.art";

if (!RESEND_API_KEY) {
  console.warn("⚠️ RESEND_API_KEY is missing from .env — emails will not be sent");
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Safely sends an email via Resend, logging errors without throwing.
 * Returns true on success, false on failure.
 */
async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.warn("[Email] Resend not configured. Skipping email to:", to);
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Failed to send:", error.message);
      return false;
    }

    console.log(`[Email] Sent "${subject}" to ${to} (id: ${data?.id})`);
    return true;
  } catch (err) {
    console.error("[Email] Unexpected error:", err.message);
    return false;
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────

/**
 * Sends a welcome email after user registration.
 * @param {string} email - Recipient email address
 * @param {string} locale - "en" or "fr"
 */
export async function sendWelcomeEmail(email, locale = "en") {
  const { subject, html } = welcomeEmail({ email, locale });
  return sendEmail({ to: email, subject, html });
}

/**
 * Sends a payment confirmation email after the first subscription payment.
 * @param {string} email - Recipient email address
 * @param {string} locale - "en" or "fr"
 * @param {object} orderDetails - { amount, currency, uploadId, plan }
 */
export async function sendPaymentConfirmationEmail(email, locale = "en", orderDetails) {
  const { subject, html } = paymentConfirmationEmail({ email, locale, orderDetails });
  return sendEmail({ to: email, subject, html });
}

/**
 * Sends a notification when LoRA training is complete.
 * @param {string} email - Recipient email address
 * @param {string} locale - "en" or "fr"
 * @param {object} trainingDetails - { jobId, uploadId, triggerWord }
 */
export async function sendTrainingCompleteEmail(email, locale = "en", trainingDetails) {
  const { subject, html } = trainingCompleteEmail({ email, locale, trainingDetails });
  return sendEmail({ to: email, subject, html });
}
