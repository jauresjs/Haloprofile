/**
 * Bilingual (EN/FR) HTML email templates for HaloProfile
 */

const BASE_URL = process.env.APP_URL || "https://haloprofile.art";

// ─── Shared Styles ────────────────────────────────────────────────
const STYLES = {
  container: `
    max-width:600px; margin:0 auto; padding:20px;
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#ffffff;
  `,
  header: `
    text-align:center; padding:32px 0 24px;
  `,
  logo: `
    font-size:28px; font-weight:800;
    background:linear-gradient(135deg, #f43f5e, #f97316);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    background-clip:text;
    letter-spacing:-0.5px;
  `,
  divider: `
    height:1px; background:linear-gradient(to right, transparent, #fecaca, transparent);
    margin:24px 0;
  `,
  bodyText: `
    font-size:15px; line-height:1.7; color:#374151; margin:0 0 16px;
  `,
  button: (url, label) => `
    <a href="${url}"
      style="display:inline-block; padding:14px 32px; border-radius:12px;
             background:linear-gradient(135deg, #f43f5e, #f97316);
             color:#ffffff !important; text-decoration:none; font-size:15px;
             font-weight:600; margin:16px 0 24px; box-shadow:0 4px 14px rgba(244,63,94,0.3);">
      ${label}
    </a>
  `,
  footer: `
    text-align:center; padding:24px 0 8px; font-size:12px; color:#9ca3af; line-height:1.6;
  `,
  featureCard: (emoji, title, desc) => `
    <tr>
      <td style="padding:12px 0; vertical-align:top; width:40px; font-size:24px;">${emoji}</td>
      <td style="padding:12px 0; vertical-align:top;">
        <div style="font-size:14px; font-weight:600; color:#111827;">${title}</div>
        <div style="font-size:13px; color:#6b7280; margin-top:2px;">${desc}</div>
      </td>
    </tr>
  `,
  summaryRow: (label, value) => `
    <tr>
      <td style="padding:6px 0; font-size:14px; color:#6b7280;">${label}</td>
      <td style="padding:6px 0; font-size:14px; color:#111827; font-weight:500; text-align:right;">${value}</td>
    </tr>
  `,
  statusBadge: (text, color) => `
    <span style="display:inline-block; padding:4px 12px; border-radius:999px;
           font-size:13px; font-weight:600; background:${color}15; color:${color};">
      ${text}
    </span>
  `,
};

function wrapHtml(content, previewText = "") {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${previewText ? `<meta name="description" content="${previewText}">` : ""}
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fafafa; padding:20px; }
    @media (max-width:480px) { body { padding:10px; } }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;">
    <tr><td align="center" style="padding:20px 0;">
      <table style="${STYLES.container}" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="${STYLES.header}">
          <div style="${STYLES.logo}">✨ HaloProfile</div>
        </td></tr>
        ${content}
      </table>
      <table style="${STYLES.container}; background:transparent; box-shadow:none;" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="${STYLES.footer}">
          HaloProfile &bull; Your AI-powered dating photos<br>
          <a href="${BASE_URL}" style="color:#9ca3af; text-decoration:underline;">${BASE_URL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── WELCOME EMAIL ────────────────────────────────────────────────

export function welcomeEmail({ email, locale }) {
  const isFr = locale === "fr";

  const subject = isFr
    ? "Bienvenue sur HaloProfile ✨"
    : "Welcome to HaloProfile ✨";

  const content = isFr ? frWelcome() : enWelcome();

  return { subject, html: wrapHtml(content, subject) };
}

function enWelcome() {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Welcome to HaloProfile! 🎉
      </h1>
      <p style="${STYLES.bodyText}">
        We're thrilled to have you on board. HaloProfile uses cutting-edge AI to
        transform your everyday photos into stunning dating profile pictures that
        make you stand out.
      </p>
      <div style="${STYLES.divider}"></div>
      <h2 style="font-size:16px; font-weight:600; color:#111827; margin-bottom:12px;">
        Here's what you can do:
      </h2>
      <table cellpadding="0" cellspacing="0" width="100%">
        ${STYLES.featureCard("📸", "Upload Your Photos",
          "Pick 15–30 of your best selfies and casual shots.")}
        ${STYLES.featureCard("🤖", "AI Model Training",
          "Our AI learns your face and creates a custom model just for you.")}
        ${STYLES.featureCard("✨", "Generate Stunning Photos",
          "Get professional-quality dating photos in various styles and settings.")}
        ${STYLES.featureCard("🚀", "Boost Your Matches",
          "Profile photos make up 90% of first impressions — make yours count!")}
      </table>
      <div style="${STYLES.divider}"></div>
      <p style="${STYLES.bodyText}">
        <strong>Ready to get started?</strong> Upload your photos and subscribe
        to start your AI training.
      </p>
      ${STYLES.button(`${BASE_URL}/upload.html`, "Upload Your Photos →")}
      <p style="font-size:13px; color:#6b7280; text-align:center;">
        If you have any questions, reply to this email — we're here to help!
      </p>
    </td></tr>
  `;
}

function frWelcome() {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Bienvenue sur HaloProfile ! 🎉
      </h1>
      <p style="${STYLES.bodyText}">
        Nous sommes ravis de vous compter parmi nous. HaloProfile utilise une IA
        de pointe pour transformer vos photos du quotidien en superbes photos de
        profil qui vous feront remarquer.
      </p>
      <div style="${STYLES.divider}"></div>
      <h2 style="font-size:16px; font-weight:600; color:#111827; margin-bottom:12px;">
        Voici ce que vous pouvez faire :
      </h2>
      <table cellpadding="0" cellspacing="0" width="100%">
        ${STYLES.featureCard("📸", "Téléchargez vos photos",
          "Sélectionnez 15 à 30 de vos meilleurs selfies et photos naturelles.")}
        ${STYLES.featureCard("🤖", "Entraînement IA",
          "Notre IA apprend votre visage et crée un modèle personnalisé pour vous.")}
        ${STYLES.featureCard("✨", "Générez des photos époustouflantes",
          "Obtenez des photos de qualité professionnelle dans différents styles et décors.")}
        ${STYLES.featureCard("🚀", "Multipliez vos matches",
          "Les photos de profil représentent 90% des premières impressions — faites la différence !")}
      </table>
      <div style="${STYLES.divider}"></div>
      <p style="${STYLES.bodyText}">
        <strong>Prêt à commencer ?</strong> Téléchargez vos photos et abonnez-vous
        pour lancer votre entraînement IA.
      </p>
      ${STYLES.button(`${BASE_URL}/fr/upload.html`, "Télécharger mes photos →")}
      <p style="font-size:13px; color:#6b7280; text-align:center;">
        Si vous avez des questions, répondez à cet email — nous sommes là pour vous aider !
      </p>
    </td></tr>
  `;
}

// ─── PAYMENT CONFIRMATION EMAIL ───────────────────────────────────

export function paymentConfirmationEmail({ email, locale, orderDetails }) {
  const isFr = locale === "fr";
  const { amount, currency, uploadId, plan } = orderDetails;

  const formattedAmount = new Intl.NumberFormat(isFr ? "fr-FR" : "en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format((amount || 4999) / 100);

  const subject = isFr
    ? "Paiement confirmé — Votre entraînement commence ! 🚀"
    : "Payment confirmed — Your training is starting! 🚀";

  const content = isFr
    ? frPaymentConfirmation(formattedAmount, uploadId)
    : enPaymentConfirmation(formattedAmount, uploadId);

  return { subject, html: wrapHtml(content, subject) };
}

function enPaymentConfirmation(amount, uploadId) {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Payment Confirmed! ✅
      </h1>
      <p style="${STYLES.bodyText}">
        Thank you for subscribing to HaloProfile Premium! Your payment of
        <strong>${amount}</strong> has been received successfully.
      </p>

      <table cellpadding="0" cellspacing="0" width="100%"
        style="background:#f9fafb; border-radius:12px; padding:20px; margin:16px 0;">
        <tr><td>
          <div style="font-size:14px; font-weight:600; color:#111827; margin-bottom:12px;">
            Order Summary
          </div>
          <table cellpadding="0" cellspacing="0" width="100%">
            ${STYLES.summaryRow("Plan", "Premium Subscription")}
            ${STYLES.summaryRow("Amount", amount)}
            ${STYLES.summaryRow("Status", STYLES.statusBadge("Paid", "#10b981"))}
          </table>
        </td></tr>
      </table>

      <p style="${STYLES.bodyText}">
        <strong>What's happening now?</strong> Your photos are being uploaded to
        our AI training system. The training process typically takes
        <strong>30–45 minutes</strong>. You'll receive an email as soon as your
        custom AI model is ready!
      </p>

      <div style="background:#fff7ed; border-left:4px solid #f97316; border-radius:8px; padding:16px; margin:16px 0;">
        <p style="font-size:14px; color:#9a3412; margin:0;">
          <strong>⏳ In the meantime:</strong> You can close this page and we'll
          notify you when everything is ready. Your 500 monthly credits are now
          available for generating photos!
        </p>
      </div>

      ${STYLES.button(`${BASE_URL}/status.html?uploadId=${uploadId}`,
        "Track Your Progress →")}
    </td></tr>
  `;
}

function frPaymentConfirmation(amount, uploadId) {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Paiement confirmé ! ✅
      </h1>
      <p style="${STYLES.bodyText}">
        Merci d'avoir souscrit à HaloProfile Premium ! Votre paiement de
        <strong>${amount}</strong> a bien été reçu.
      </p>

      <table cellpadding="0" cellspacing="0" width="100%"
        style="background:#f9fafb; border-radius:12px; padding:20px; margin:16px 0;">
        <tr><td>
          <div style="font-size:14px; font-weight:600; color:#111827; margin-bottom:12px;">
            Récapitulatif de la commande
          </div>
          <table cellpadding="0" cellspacing="0" width="100%">
            ${STYLES.summaryRow("Forfait", "Abonnement Premium")}
            ${STYLES.summaryRow("Montant", amount)}
            ${STYLES.summaryRow("Statut", STYLES.statusBadge("Payé", "#10b981"))}
          </table>
        </td></tr>
      </table>

      <p style="${STYLES.bodyText}">
        <strong>Que se passe-t-il maintenant ?</strong> Vos photos sont en cours
        d'analyse par notre système d'IA. L'entraînement prend généralement
        <strong>30 à 45 minutes</strong>. Vous recevrez un email dès que votre
        modèle IA personnalisé sera prêt !
      </p>

      <div style="background:#fff7ed; border-left:4px solid #f97316; border-radius:8px; padding:16px; margin:16px 0;">
        <p style="font-size:14px; color:#9a3412; margin:0;">
          <strong>⏳ En attendant :</strong> Vous pouvez fermer cette page et
          nous vous avertirons quand tout sera prêt. Vos 500 crédits mensuels
          sont déjà disponibles pour générer des photos !
        </p>
      </div>

      ${STYLES.button(`${BASE_URL}/fr/status.html?uploadId=${uploadId}`,
        "Suivre votre progression →")}
    </td></tr>
  `;
}

// ─── TRAINING COMPLETE EMAIL ──────────────────────────────────────

export function trainingCompleteEmail({ email, locale, trainingDetails }) {
  const isFr = locale === "fr";
  const { jobId, uploadId, triggerWord } = trainingDetails;

  const subject = isFr
    ? "Votre modèle IA est prêt ! Générez vos photos maintenant ✨"
    : "Your AI model is ready! Generate your photos now ✨";

  const content = isFr
    ? frTrainingComplete(jobId, uploadId, triggerWord)
    : enTrainingComplete(jobId, uploadId, triggerWord);

  return { subject, html: wrapHtml(content, subject) };
}

function enTrainingComplete(jobId, uploadId, triggerWord) {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Your AI Model is Ready! 🎉
      </h1>
      <p style="${STYLES.bodyText}">
        Great news! Our AI has finished learning your face and your custom
        model is now ready to use. You can start generating professional-quality
        dating photos right away.
      </p>

      <table cellpadding="0" cellspacing="0" width="100%"
        style="background:#f0fdf4; border-radius:12px; padding:20px; margin:16px 0;">
        <tr><td style="text-align:center; font-size:48px; padding-bottom:12px;">
          🤖✨
        </td></tr>
        <tr><td style="text-align:center; padding-bottom:8px;">
          <div style="font-size:16px; font-weight:600; color:#166534;">
            Model Training Complete
          </div>
          <div style="font-size:13px; color:#6b7280; margin-top:4px;">
            Ready to generate unlimited photos
          </div>
        </td></tr>
      </table>

      <p style="${STYLES.bodyText}">
        Here's how to generate your photos:
      </p>
      <ol style="font-size:15px; line-height:1.8; color:#374151; padding-left:20px; margin-bottom:20px;">
        <li>Go to your <strong>Gallery</strong> page</li>
        <li>Choose a style or describe the scene you want</li>
        <li>Click "Generate" and watch the magic happen</li>
        <li>Download your favorite photos and update your dating profiles!</li>
      </ol>

      ${STYLES.button(`${BASE_URL}/gallery.html?jobId=${jobId}`,
        "Generate Your Photos →")}

      <div style="background:#eff6ff; border-left:4px solid #3b82f6; border-radius:8px; padding:16px; margin:16px 0;">
        <p style="font-size:13px; color:#1e40af; margin:0;">
          <strong>💡 Pro tip:</strong> Try different styles and settings to get
          a variety of photos. Each generation uses 1 credit, and you have
          monthly credits included with your subscription.
        </p>
      </div>
    </td></tr>
  `;
}

function frTrainingComplete(jobId, uploadId, triggerWord) {
  return `
    <tr><td style="padding:0 24px;">
      <h1 style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
        Votre modèle IA est prêt ! 🎉
      </h1>
      <p style="${STYLES.bodyText}">
        Bonne nouvelle ! Notre IA a fini d'apprendre votre visage et votre
        modèle personnalisé est maintenant prêt à l'emploi. Vous pouvez
        commencer à générer des photos de qualité professionnelle dès
        maintenant.
      </p>

      <table cellpadding="0" cellspacing="0" width="100%"
        style="background:#f0fdf4; border-radius:12px; padding:20px; margin:16px 0;">
        <tr><td style="text-align:center; font-size:48px; padding-bottom:12px;">
          🤖✨
        </td></tr>
        <tr><td style="text-align:center; padding-bottom:8px;">
          <div style="font-size:16px; font-weight:600; color:#166534;">
            Entraînement terminé
          </div>
          <div style="font-size:13px; color:#6b7280; margin-top:4px;">
            Prêt à générer des photos en illimité
          </div>
        </td></tr>
      </table>

      <p style="${STYLES.bodyText}">
        Voici comment générer vos photos :
      </p>
      <ol style="font-size:15px; line-height:1.8; color:#374151; padding-left:20px; margin-bottom:20px;">
        <li>Allez dans votre <strong>Galerie</strong></li>
        <li>Choisissez un style ou décrivez la scène que vous souhaitez</li>
        <li>Cliquez sur "Générer" et regardez la magie opérer</li>
        <li>Téléchargez vos photos préférées et mettez à jour vos profils de rencontre !</li>
      </ol>

      ${STYLES.button(`${BASE_URL}/fr/gallery.html?jobId=${jobId}`,
        "Générer mes photos →")}

      <div style="background:#eff6ff; border-left:4px solid #3b82f6; border-radius:8px; padding:16px; margin:16px 0;">
        <p style="font-size:13px; color:#1e40af; margin:0;">
          <strong>💡 Astuce :</strong> Essayez différents styles et paramètres
          pour obtenir une variété de photos. Chaque génération utilise 1 crédit,
          et vous avez des crédits mensuels inclus avec votre abonnement.
        </p>
      </div>
    </td></tr>
  `;
}
