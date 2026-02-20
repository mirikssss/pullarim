/**
 * Multi-level category resolution for Payme import.
 * Priority: 1) User Merchant Memory 2) category_mapping 3) regex+Payme 4) AI 5) default
 */

import { normalizeMerchant } from "@/lib/merchant-normalize"
import { classifyCategory } from "@/lib/ai/classify-category"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any

export type AppCategory = { id: string; label: string }

export type ResolveInput = {
  userId: string
  merchant: string
  paymeCategory: string
  amount: number
  categoryMapping: Record<string, string>
  defaultCategoryId: string
  appCategories: AppCategory[]
  supabase: SupabaseClientLike
}

export type ResolveResult = {
  category_id: string
  source: "memory" | "mapping" | "rule" | "ai" | "default"
}

/** Merchant keywords → app category id */
const MERCHANT_RULES: { pattern: RegExp; categoryId: string }[] = [
  { pattern: /atto\s*tolov|attotolov/i, categoryId: "transport" },
  { pattern: /uzbektelekom|o['`]?zbektelekom|payme\s*\(|ucell|beeline|uzmobile|mobiuz|telecom/i, categoryId: "communication" },
]

/** Payme category (lowercase) → app category id */
const PAYME_TO_APP: Record<string, string> = {
  транспорт: "transport",
  transport: "transport",
  такси: "transport",
  taxi: "transport",
  продукты: "food",
  еда: "food",
  food: "food",
  общепит: "food",
  связь: "communication",
  communication: "communication",
  интернет: "communication",
  internet: "communication",
  телефон: "communication",
  phone: "communication",
  перевод: "cash",
  "p2p перевод": "cash",
  наличные: "cash",
  cash: "cash",
  покупки: "shopping",
  shopping: "shopping",
  магазин: "shopping",
  store: "shopping",
  услуги: "shopping",
  services: "shopping",
  развлечения: "entertainment",
  entertainment: "entertainment",
  счета: "bills",
  bills: "bills",
  здоровье: "health",
  health: "health",
  прочее: "other",
  other: "other",
}

function suggestFromMerchant(merchant: string, appCategories: AppCategory[]): string | null {
  const ids = new Set(appCategories.map((c) => c.id))
  for (const { pattern, categoryId } of MERCHANT_RULES) {
    if (ids.has(categoryId) && pattern.test(merchant)) return categoryId
  }
  return null
}

function suggestFromPaymeCategory(paymeCat: string, appCategories: AppCategory[]): string | null {
  if (!paymeCat?.trim()) return null
  const key = paymeCat.trim().toLowerCase()
  const categoryId = PAYME_TO_APP[key]
  if (categoryId && appCategories.some((c) => c.id === categoryId)) return categoryId
  return null
}

/**
 * Async pipeline: memory → mapping → regex → AI → default
 */
export async function resolveCategory(input: ResolveInput): Promise<ResolveResult> {
  const m = normalizeMerchant(input.merchant)
  const ids = new Set(input.appCategories.map((c) => c.id))
  const defaultId = ids.has(input.defaultCategoryId) ? input.defaultCategoryId : input.appCategories[0]?.id ?? "other"

  // STEP 1: User Merchant Memory
  if (m) {
    const { data } = await input.supabase
      .from("merchant_category_map")
      .select("category_id")
      .eq("user_id", input.userId)
      .eq("merchant_norm", m)
      .maybeSingle()
    if (data?.category_id && ids.has(data.category_id)) {
      return { category_id: data.category_id, source: "memory" }
    }
  }

  // STEP 2: category_mapping from import
  const mapped = input.categoryMapping[input.paymeCategory?.trim() ?? ""]
  if (mapped && ids.has(mapped)) {
    return { category_id: mapped, source: "mapping" }
  }

  // STEP 3: Existing regex + PAYME_TO_APP
  const fromMerchant = suggestFromMerchant(input.merchant, input.appCategories)
  if (fromMerchant) return { category_id: fromMerchant, source: "rule" }
  const fromPayme = suggestFromPaymeCategory(input.paymeCategory, input.appCategories)
  if (fromPayme) return { category_id: fromPayme, source: "rule" }

  // STEP 4: AI fallback
  const aiResult = await classifyCategory({
    merchant: input.merchant,
    paymeCategory: input.paymeCategory,
    amount: input.amount,
    allowedCategoryIds: input.appCategories.map((c) => c.id),
  })
  if (aiResult?.category_slug && ids.has(aiResult.category_slug) && m) {
    await upsertMerchantMemory(input.supabase, input.userId, m, aiResult.category_slug, -0.6)
    return { category_id: aiResult.category_slug, source: "ai" }
  }

  // STEP 5: default
  return { category_id: defaultId, source: "default" }
}

/**
 * Upsert merchant memory (learning loop). Call when user edits category manually.
 * @param confidenceDelta - add to existing (default 0.1). Use negative to set absolute (e.g. -0.6 means set to 0.6).
 */
export async function upsertMerchantMemory(
  supabase: SupabaseClientLike,
  userId: string,
  merchantNorm: string,
  categoryId: string,
  confidenceDelta = 0.1
): Promise<void> {
  if (!merchantNorm?.trim()) return

  const { data: existing } = await supabase
    .from("merchant_category_map")
    .select("id, confidence")
    .eq("user_id", userId)
    .eq("merchant_norm", merchantNorm)
    .maybeSingle()

  const newConfidence =
    confidenceDelta < 0
      ? Math.abs(confidenceDelta)
      : Math.min(1.0, (existing?.confidence ?? 0) + confidenceDelta)

  await supabase.from("merchant_category_map").upsert(
    {
      user_id: userId,
      merchant_norm: merchantNorm,
      category_id: categoryId,
      confidence: newConfidence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,merchant_norm" }
  )
}
