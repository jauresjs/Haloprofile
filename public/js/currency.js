/**
 * currency.js — Detects user's region and provides price formatting.
 */

export function getUserCurrency() {
  const lang = navigator.language || navigator.userLanguage || 'en-US';

  // 1. Check full language tag for Canadian variants
  if (lang.endsWith('-CA') || lang === 'fr-CA') return 'cad';

  // 2. Check navigator.languages array (often includes full locale like en-CA / fr-CA)
  if (navigator.languages) {
    for (const l of navigator.languages) {
      if (l.endsWith('-CA') || l === 'fr-CA') return 'cad';
    }
  }

  // 3. Check timezone for Canadian regions (catches fr-CA / en-CA when only 'fr'/'en' is reported)
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && (tz.startsWith('America/') && (
      tz === 'America/Toronto' || tz === 'America/Vancouver' ||
      tz === 'America/Montreal' || tz === 'America/Edmonton' ||
      tz === 'America/Winnipeg' || tz === 'America/Regina' ||
      tz === 'America/Halifax' || tz === 'America/St_Johns' ||
      tz === 'America/Ottawa' || tz === 'America/Thunder_Bay' ||
      tz === 'America/Glace_Bay' || tz === 'America/Iqaluit' ||
      tz === 'America/Moncton' || tz === 'America/Panama' /* = Toronto */ ||
      tz === 'America/Creston' /* = MST no DST */ || tz.startsWith('Canada/')
    ))) return 'cad';
  } catch (e) { /* fall through */ }

  // 4. EU countries
  const euLangs = ['de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'sv', 'da', 'fi', 'nb', 'nn'];
  const prefix = lang.split('-')[0];
  if (euLangs.includes(prefix)) return 'eur';

  return 'usd';
}

export function formatPrice(amount, currency) {
  if (currency === 'cad') return `CAN$${amount.toFixed(2)}`;
  if (currency === 'eur') return `${amount.toFixed(2).replace('.', ',')} €`;
  return `$${amount.toFixed(2)}`; // USD
}
