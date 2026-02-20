/**
 * Merchant name normalization for consistent lookup in merchant_category_map.
 * - lowercase
 * - remove ООО, LLC, OOO, quotes
 * - remove extra spaces
 * - trim
 */

const REMOVE_PATTERNS = [
  /\bООО\b/gi,
  /\bOOO\b/gi,
  /\bLLC\b/gi,
  /\bL\.?L\.?C\.?\b/gi,
  /\bИП\b/gi,
  /\bIP\b/gi,
  /["'«»]/g,
]

export function normalizeMerchant(merchant: string): string {
  if (!merchant || typeof merchant !== "string") return ""
  let s = merchant.trim()
  for (const re of REMOVE_PATTERNS) {
    s = s.replace(re, " ")
  }
  s = s.replace(/\s+/g, " ").trim().toLowerCase()
  return s
}
