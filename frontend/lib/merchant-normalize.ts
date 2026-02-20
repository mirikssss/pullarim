/**
 * Merchant name normalization for consistent lookup in merchant_category_map.
 * - lowercase
 * - remove ООО, MCHJ, XK, SP, IP, LLC, quotes, dots
 * - normalize YANDEXGO UB / OOO YANDEXGO UB -> yandexgo
 */

const REMOVE_PATTERNS = [
  /\bООО\b/gi,
  /\bOOO\b/gi,
  /\bMCHJ\b/gi,
  /\bM\.?C\.?H\.?J\.?\b/gi,
  /\bXK\b/gi,
  /\bSP\b/gi,
  /\bИП\b/gi,
  /\bIP\b/gi,
  /\bLLC\b/gi,
  /\bL\.?L\.?C\.?\b/gi,
  /["'«»]/g,
  /\./g,
]

export function normalizeMerchant(merchant: string): string {
  if (!merchant || typeof merchant !== "string") return ""
  let s = merchant.trim()
  for (const re of REMOVE_PATTERNS) {
    s = s.replace(re, " ")
  }
  s = s.replace(/\s+/g, " ").trim().toLowerCase()
  // YANDEXGO UB, OOO YANDEXGO UB -> yandexgo
  s = s.replace(/\byandex\s*go\b/gi, "yandexgo").replace(/\bub\b/gi, "").replace(/\s+/g, " ").trim()
  return s
}
