/**
 * Auto-mapping rules for Payme import:
 * 1) Merchant-based: atto tolov → transport, telecom → communication, person names → cash
 * 2) Payme category: транспорт→transport, продукты→food, etc.
 */

export type AppCategory = { id: string; label: string }

/** Merchant keywords → app category id (checked first) */
const MERCHANT_RULES: { pattern: RegExp; categoryId: string }[] = [
  { pattern: /atto\s*tolov|attotolov/i, categoryId: "transport" },
  { pattern: /uzbektelekom|o['`]?zbektelekom|payme\s*\(|ucell|beeline|uzmobile|mobiuz|telecom/i, categoryId: "communication" },
]

/** Payme category (lowercase) → app category id — автоматом по логике */
const PAYME_TO_APP: Record<string, string> = {
  // Транспорт
  транспорт: "transport",
  transport: "transport",
  такси: "transport",
  taxi: "transport",
  // Еда
  продукты: "food",
  еда: "food",
  food: "food",
  общепит: "food",
  // Связь
  связь: "communication",
  communication: "communication",
  интернет: "communication",
  internet: "communication",
  телефон: "communication",
  phone: "communication",
  // Переводы / наличка
  перевод: "cash",
  "p2p перевод": "cash",
  наличные: "cash",
  cash: "cash",
  // Покупки / услуги
  покупки: "shopping",
  shopping: "shopping",
  магазин: "shopping",
  store: "shopping",
  услуги: "shopping",
  services: "shopping",
  // Остальное
  развлечения: "entertainment",
  entertainment: "entertainment",
  счета: "bills",
  bills: "bills",
  здоровье: "health",
  health: "health",
  прочее: "other",
  other: "other",
}

/**
 * Suggest category from merchant name (e.g. "OOO ATTO TOLOV" → transport)
 */
export function suggestFromMerchant(merchant: string, appCategories: AppCategory[]): string | null {
  const ids = new Set(appCategories.map((c) => c.id))
  for (const { pattern, categoryId } of MERCHANT_RULES) {
    if (ids.has(categoryId) && pattern.test(merchant)) {
      return categoryId
    }
  }
  return null
}

/**
 * Auto-map Payme category to app category (case-insensitive)
 */
export function suggestFromPaymeCategory(paymeCat: string, appCategories: AppCategory[]): string | null {
  if (!paymeCat?.trim()) return null
  const key = paymeCat.trim().toLowerCase()
  const categoryId = PAYME_TO_APP[key]
  if (categoryId && appCategories.some((c) => c.id === categoryId)) {
    return categoryId
  }
  return null
}

/**
 * Определяет категорию для строки: мерчант → категория Payme → по умолчанию
 * Всё автоматом, без ручного маппинга.
 */
export function resolveCategory(
  merchant: string,
  paymeCategory: string,
  _categoryMapping: Record<string, string>,
  defaultCategoryId: string,
  appCategories: AppCategory[]
): string {
  const fromMerchant = suggestFromMerchant(merchant, appCategories)
  if (fromMerchant) return fromMerchant

  const fromPayme = suggestFromPaymeCategory(paymeCategory, appCategories)
  if (fromPayme) return fromPayme

  return defaultCategoryId
}
