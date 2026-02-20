/**
 * Multi-level category resolution for Payme import.
 * Priority: 0) transfers 1) memory 2) mapping 3) seed 4) rules 5) AI 6) default
 */

import { normalizeMerchant } from "@/lib/merchant-normalize"
import { classifyCategory } from "@/lib/ai/classify-category"
import { matchSeed } from "@/lib/merchant-seed-uz"
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
  source: "transfer" | "memory" | "mapping" | "seed" | "rule" | "ai" | "default"
  exclude_from_budget: boolean
  source_type: string
}

const TRANSFER_PAYME_PATTERNS = [
  /перевод/i,
  /p2p/i,
  /uzcard\s*to\s*visa/i,
  /visa\s*to\s*uzcard/i,
]

function isTransferPaymeCategory(paymeCat: string): boolean {
  return TRANSFER_PAYME_PATTERNS.some((re) => re.test(paymeCat))
}

/** Merchant keywords → app category id (used when seed doesn't match) */
const MERCHANT_RULES: { pattern: RegExp; categoryId: string }[] = [
  { pattern: /atto\s*tolov|attotolov/i, categoryId: "transport" },
  { pattern: /yandexgo\s*eats|yandex\s*eats/i, categoryId: "food" },
  { pattern: /yandexplus|yandex\s*plus/i, categoryId: "subscriptions" },
  { pattern: /yandexgo\s*scooter|scooter/i, categoryId: "transport" },
  { pattern: /yandexgo/i, categoryId: "taxi" },
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
 * Async pipeline: transfer → memory → mapping → seed → rules → AI → default
 */
export async function resolveCategory(input: ResolveInput): Promise<ResolveResult> {
  const m = normalizeMerchant(input.merchant)
  const ids = new Set(input.appCategories.map((c) => c.id))
  const defaultId = ids.has(input.defaultCategoryId) ? input.defaultCategoryId : input.appCategories[0]?.id ?? "other"
  const hasTransfers = ids.has("transfers")

  // STEP 0: Transfers (paymeCategory contains перевод/p2p/uzcard to visa)
  if (isTransferPaymeCategory(input.paymeCategory)) {
    const catId = hasTransfers ? "transfers" : "other"
    return { category_id: catId, source: "transfer", exclude_from_budget: true, source_type: "payme_import" }
  }

  // STEP 1: User Merchant Memory
  if (m) {
    const { data } = await input.supabase
      .from("merchant_category_map")
      .select("category_id, include_in_budget_override")
      .eq("user_id", input.userId)
      .eq("merchant_norm", m)
      .maybeSingle()
    if (data?.category_id && ids.has(data.category_id)) {
      const override = data.include_in_budget_override
      const exclude = override === false ? true : override === true ? false : data.category_id === "transfers"
      return { category_id: data.category_id, source: "memory", exclude_from_budget: exclude, source_type: "memory" }
    }
  }

  // STEP 2: category_mapping from import (user mapping)
  const mapped = input.categoryMapping[input.paymeCategory?.trim() ?? ""]
  if (mapped && ids.has(mapped)) {
    return { category_id: mapped, source: "mapping", exclude_from_budget: false, source_type: "rule" }
  }

  // STEP 3: Seed / local KB (UZ merchants)
  const seedCat = m ? matchSeed(m) : null
  if (seedCat && ids.has(seedCat)) {
    return { category_id: seedCat, source: "seed", exclude_from_budget: false, source_type: "rule" }
  }

  // STEP 4: Rules (regex + PAYME_TO_APP)
  const fromMerchant = suggestFromMerchant(input.merchant, input.appCategories)
  if (fromMerchant) return { category_id: fromMerchant, source: "rule", exclude_from_budget: false, source_type: "rule" }
  const fromPayme = suggestFromPaymeCategory(input.paymeCategory, input.appCategories)
  if (fromPayme) return { category_id: fromPayme, source: "rule", exclude_from_budget: false, source_type: "rule" }

  // STEP 5: AI fallback
  const aiResult = await classifyCategory({
    merchant: input.merchant,
    paymeCategory: input.paymeCategory,
    amount: input.amount,
    allowedCategoryIds: input.appCategories.map((c) => c.id),
  })
  if (aiResult?.category_slug && ids.has(aiResult.category_slug) && m) {
    await upsertMerchantMemory(input.supabase, input.userId, m, aiResult.category_slug, -0.6)
    return { category_id: aiResult.category_slug, source: "ai", exclude_from_budget: false, source_type: "ai" }
  }

  // STEP 6: default
  return { category_id: defaultId, source: "default", exclude_from_budget: false, source_type: "rule" }
}

/**
 * Upsert merchant memory (learning loop). Call when user edits category manually.
 * @param confidenceDelta - add to existing (default 0.1). Use negative to set absolute (e.g. -0.6 means set to 0.6).
 * @param includeInBudgetOverride - true = include in budget, false = exclude, undefined = keep existing
 */
export async function upsertMerchantMemory(
  supabase: SupabaseClientLike,
  userId: string,
  merchantNorm: string,
  categoryId: string,
  confidenceDelta = 0.1,
  includeInBudgetOverride?: boolean
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

  const row: Record<string, unknown> = {
    user_id: userId,
    merchant_norm: merchantNorm,
    category_id: categoryId,
    confidence: newConfidence,
    updated_at: new Date().toISOString(),
  }
  if (includeInBudgetOverride !== undefined) {
    row.include_in_budget_override = includeInBudgetOverride
  }

  await supabase.from("merchant_category_map").upsert(row, { onConflict: "user_id,merchant_norm" })
}
