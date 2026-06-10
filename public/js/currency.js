/**
 * currency.js — Detects user's region and provides price formatting.
 */

export function getUserCurrency() {
  const lang = navigator.language || navigator.userLanguage || 'en-US';
  if (lang.endsWith('-CA') || lang === 'fr-CA') return 'cad';
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