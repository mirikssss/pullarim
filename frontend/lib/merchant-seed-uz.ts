/**
 * UZ merchant seed: merchant_norm -> category_id for local knowledge base.
 * Used by POST /api/merchant-map/seed and resolveCategory.
 */

/** Explicit merchant_norm -> category_id for seed upsert */
export const UZ_MERCHANT_SEED_ENTRIES: { merchant_norm: string; category_id: string }[] = [
  { merchant_norm: "atto tolov", category_id: "transport" },
  { merchant_norm: "yandexgo", category_id: "taxi" },
  { merchant_norm: "yandexgo eats", category_id: "food" },
  { merchant_norm: "yandexplus", category_id: "subscriptions" },
  { merchant_norm: "yandexgo scooter", category_id: "transport" },
  { merchant_norm: "scooter", category_id: "transport" },
  { merchant_norm: "buenoo", category_id: "food" },
  { merchant_norm: "kfc", category_id: "food" },
  { merchant_norm: "plov city", category_id: "food" },
  { merchant_norm: "anglesey food", category_id: "groceries" },
  { merchant_norm: "korzinka", category_id: "groceries" },
  { merchant_norm: "xalq retail", category_id: "groceries" },
  { merchant_norm: "beeline", category_id: "communication" },
  { merchant_norm: "uzmobile", category_id: "communication" },
  { merchant_norm: "ucell", category_id: "communication" },
  { merchant_norm: "humans dealer", category_id: "communication" },
  { merchant_norm: "beepul", category_id: "communication" },
  { merchant_norm: "rahmat", category_id: "food" },
  { merchant_norm: "qr pay", category_id: "food" },
  { merchant_norm: "la mode trade", category_id: "clothes" },
  { merchant_norm: "retail boutique", category_id: "clothes" },
  { merchant_norm: "payme plus", category_id: "subscriptions" },
]

/** Pattern-based for resolveCategory (checks if merchant_norm matches any seed) */
const SEED_PATTERNS: { pattern: RegExp; categoryId: string }[] = [
  { pattern: /atto\s*tolov|attotolov/i, categoryId: "transport" },
  { pattern: /yandexgo\s*eats|yandex\s*eats/i, categoryId: "food" },
  { pattern: /yandexplus|yandex\s*plus/i, categoryId: "subscriptions" },
  { pattern: /yandexgo\s*scooter|scooter/i, categoryId: "transport" },
  { pattern: /yandexgo/i, categoryId: "taxi" },
  { pattern: /buenoo/i, categoryId: "food" },
  { pattern: /kfc/i, categoryId: "food" },
  { pattern: /plov\s*city|plovcity/i, categoryId: "food" },
  { pattern: /anglesey\s*food|angleseyfood/i, categoryId: "groceries" },
  { pattern: /korzinka/i, categoryId: "groceries" },
  { pattern: /xalq\s*retail|xalqretail/i, categoryId: "groceries" },
  { pattern: /beeline/i, categoryId: "communication" },
  { pattern: /uzmobile|uz\s*mobile/i, categoryId: "communication" },
  { pattern: /ucell/i, categoryId: "communication" },
  { pattern: /humans\s*dealer|humansdealer/i, categoryId: "communication" },
  { pattern: /beepul/i, categoryId: "communication" },
  { pattern: /rahmat/i, categoryId: "food" },
  { pattern: /qr\s*pay|qrpay/i, categoryId: "food" },
  { pattern: /la\s*mode\s*trade|lamodetrade/i, categoryId: "clothes" },
  { pattern: /retail\s*boutique|retailboutique/i, categoryId: "clothes" },
  { pattern: /payme\s*plus|paymeplus/i, categoryId: "subscriptions" },
]

export function matchSeed(merchantNorm: string): string | null {
  for (const { pattern, categoryId } of SEED_PATTERNS) {
    if (pattern.test(merchantNorm)) return categoryId
  }
  return null
}
