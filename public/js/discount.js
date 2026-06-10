/**
 * discount.js — Shared discount detection for return visits.
 * Include this on any page to auto-detect active discounts and show a banner.
 */

export async function checkDiscount() {
  try {
    const token = await getToken?.() || (await import("/js/auth.js")).getToken?.();
    if (!token) return;

    const res = await fetch("/api/stripe/discount-status", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;

    const data = await res.json();
    if (!data.discount) return;

    showDiscountBanner(data.discount);
  } catch (err) {
    console.error("[Discount] Check error:", err);
  }
}

function showDiscountBanner(discount) {
  // Remove existing banner if any
  const existing = document.getElementById("halo-discount-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "halo-discount-banner";
  banner.className = "fixed bottom-0 left-0 right-0 z-[60] bg-gradient-to-r from-rose-600 to-orange-600 text-white px-6 py-4 shadow-2xl shadow-rose-500/30";

  const remaining = discount.remainingMinutes;
  const timeText = remaining > 60
    ? `${Math.floor(remaining / 60)}h ${remaining % 60}m`
    : `${remaining}m`;

  banner.innerHTML = `
    <div class="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🔥</span>
        <div>
          <p class="font-bold text-sm sm:text-base">
            You have <span class="text-yellow-200">${discount.percentOff}% off</span> your first month!
          </p>
          <p class="text-rose-200 text-xs">⏳ Expires in ${timeText}</p>
        </div>
      </div>
      <a href="/onboarding.html"
        class="px-6 py-2 bg-white text-rose-600 font-bold rounded-xl text-sm hover:bg-rose-50 transition-all shadow-lg whitespace-nowrap">
        Claim Now →
      </a>
    </div>
  `;

  document.body.appendChild(banner);
}