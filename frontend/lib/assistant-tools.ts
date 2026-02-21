/**
 * Assistant tools: definitions and server-side executor.
 * Uses Supabase with user session (RLS).
 */

import { createClient } from "@/lib/supabase/server"
import { getAuthUser } from "@/lib/api-auth"
import { categoryExists } from "@/lib/api-validation"
import { computeForecast } from "@/lib/salary-forecast"
import { normalizeMerchant } from "@/lib/merchant-normalize"
import { matchSeed } from "@/lib/merchant-seed-uz"
import type { ToolDefinition } from "./openrouter"

const TZ = "Asia/Tashkent"

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ })
}

function parseRelativeDate(hint: string): string {
  const today = todayStr()
  const [y, m] = today.split("-").map(Number)
  const day = Number(today.slice(8, 10))

  const lower = (hint || "").toLowerCase().trim()
  if (!lower || lower.includes("сегодня") || lower.includes("today")) return today
  if (lower.includes("вчера") || lower.includes("yesterday") || lower.includes("вчерашн")) {
    const d = new Date(Date.UTC(y, m - 1, day - 1))
    return d.toISOString().slice(0, 10)
  }
  if (lower.includes("позавчера")) {
    const d = new Date(Date.UTC(y, m - 1, day - 2))
    return d.toISOString().slice(0, 10)
  }
  if (lower.includes("прошлый понедельник") || lower.includes("last monday")) {
    const d = new Date(y, m - 1, day)
    const dow = d.getDay()
    const diff = dow === 0 ? 7 : dow
    d.setDate(d.getDate() - diff - 7)
    return d.toISOString().slice(0, 10)
  }
  return today
}

const FOOD_OUT_OF_HOME_PATTERNS = /yandex\s*eats|yandexgo\s*eats|buenoo|kfc|plov\s*city/i
const FOOD_GROCERIES_PATTERNS = /korzinka|anglesey|xalq\s*retail/i

const MERCHANT_HINTS: { pattern: RegExp; known_as: string; hint: string }[] = [
  { pattern: /korzinka|anglesey|xalq\s*retail/i, known_as: "Korzinka/Anglesey/Xalq", hint: "продукты" },
  { pattern: /buenoo/i, known_as: "Buenoo", hint: "доставка еды" },
  { pattern: /yandexgo\s*eats|yandex\s*eats/i, known_as: "Yandex Eats", hint: "доставка еды" },
  { pattern: /yandexgo\s*scooter|scooter/i, known_as: "YandexGo Scooter", hint: "аренда самоката" },
  { pattern: /yandexplus|yandex\s*plus/i, known_as: "Yandex Plus", hint: "подписки" },
  { pattern: /yandexgo/i, known_as: "YandexGo", hint: "такси" },
  { pattern: /atto\s*tolov|attotolov/i, known_as: "Atto", hint: "транспортная карта" },
  { pattern: /beeline|ucell|uzmobile|beepul|humans/i, known_as: "Операторы связи", hint: "связь" },
  { pattern: /payme\s*plus/i, known_as: "Payme Plus", hint: "подписки" },
]

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_spending_summary",
      description: "Суммарные расходы за период. Возвращает total, avg_per_day, max_day, min_day. По умолчанию exclude_from_budget и transfers исключены.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["today", "yesterday", "7d", "15d", "month"],
            description: "today | yesterday | 7d | 15d | month",
          },
          month: { type: "string", description: "YYYY-MM для month (опционально)" },
          includeExcluded: { type: "number", description: "1 чтобы включить переводы и exclude_from_budget" },
        },
        required: ["range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_insights",
      description: "Полный анализ расходов: total, by_category, out_of_home_food, food_groceries, baseline_avg_per_day (14д без выбросов), top_merchants, top_merchants_food, top_merchants_groceries, daily_series, biggest_outliers. ОБЯЗАТЕЛЕН для плана бюджета. range=14d для плана. includeExcluded=false по умолчанию.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["today", "yesterday", "7d", "14d", "15d", "month", "custom"],
            description: "today | yesterday | 7d | 14d | 15d | month | custom",
          },
          from: { type: "string", description: "YYYY-MM-DD для custom" },
          to: { type: "string", description: "YYYY-MM-DD для custom" },
          month: { type: "string", description: "YYYY-MM для month" },
          includeExcluded: { type: "number", description: "1 чтобы включить переводы" },
        },
        required: ["range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_category",
      description: "Разбивка по категориям + top_merchants, outliers (топ-3 крупных), share_excluded, share_transfers. По умолчанию transfers и exclude исключены.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["today", "yesterday", "7d", "15d", "month"],
            description: "today | yesterday | 7d | 15d | month",
          },
          month: { type: "string", description: "YYYY-MM для month (опционально)" },
          includeExcluded: { type: "number", description: "1 чтобы включить переводы" },
        },
        required: ["range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_expenses",
      description: "Список расходов за период. from/to — YYYY-MM-DD. Для '7 дней' используй (сегодня-6)..сегодня. Текущая дата указана в системном промпте.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD начало периода" },
          to: { type: "string", description: "YYYY-MM-DD конец периода" },
          limit: { type: "number", description: "max items" },
          q: { type: "string", description: "search merchant/note" },
          category_id: { type: "string", description: "filter by category" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "Создать расход. Вызывай когда пользователь явно просит добавить/записать расход. date принимает YYYY-MM-DD или 'вчера'/'сегодня'/'позавчера' — сервер сам преобразует.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "сумма в UZS (целое)" },
          date: { type: "string", description: "YYYY-MM-DD или 'вчера'/'сегодня'/'позавчера'" },
          merchant: { type: "string", description: "название/место" },
          category_id: { type: "string", description: "id категории (опционально)" },
          note: { type: "string", description: "заметка" },
        },
        required: ["amount", "date", "merchant"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_salary_context",
      description: "Контекст по зарплате: next_payouts, last_payments, ytd_received, days_until_next_payment, current_balance_estimate, budget_period (days_count, range_from, range_to до дня перед ЗП включительно), suggested_daily_limit (баланс/days_count при наличии баланса), daily_limit_for_target (если передан target_budget). Вызывай при вопросах про ЗП, план бюджета до ЗП.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "YYYY-MM (опционально)" },
          from: { type: "string", description: "YYYY-MM-DD для ytd (опционально)" },
          to: { type: "string", description: "YYYY-MM-DD для ytd (опционально)" },
          target_budget: { type: "number", description: "Целевой бюджет в UZS до следующей ЗП — при указании возвращается daily_limit_for_target = target/days_count" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_salary_next_payout",
      description: "Прогноз следующей выплаты (20-го и 5-го). Вызывай при вопросе 'сколько получу'.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "YYYY-MM (опционально)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_merchants_help",
      description: "Узнать что за мерчант: Korzinka=продукты, YandexGo=такси, Atto=транспорт. Возвращает merchant_norm, known_as, hint. Если не знаем — hint null. merchants — строка через запятую.",
      parameters: {
        type: "object",
        properties: {
          merchants: { type: "string", description: "названия мерчантов через запятую" },
        },
        required: ["merchants"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_category",
      description: "Подобрать категорию по подсказке/мерчанту.",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", description: "подсказка: такси, еда, корзина и т.д." },
          merchant: { type: "string", description: "название мерчанта" },
        },
        required: ["hint"],
      },
    },
  },
]

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const user = await getAuthUser()
  if (!user) return { ok: false, error: "Unauthorized" }

  const supabase = await createClient()

  switch (name) {
    case "get_spending_insights": {
      const range = args.range as string
      const fromArg = args.from as string | undefined
      const toArg = args.to as string | undefined
      const month = args.month as string | undefined
      const includeExcluded = args.includeExcluded === 1
      const now = new Date()
      const today = todayStr()
      let date_from: string
      let date_to: string

      if (range === "custom" && fromArg && toArg) {
        date_from = fromArg.slice(0, 10)
        date_to = toArg.slice(0, 10)
      } else if (range === "today") {
        date_from = date_to = today
      } else if (range === "yesterday") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 1))
        date_from = date_to = d.toISOString().slice(0, 10)
      } else if (range === "7d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 6))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else if (range === "14d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 13))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else if (range === "15d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 14))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else {
        const [y, m] = month
          ? month.split("-").map(Number)
          : [now.getFullYear(), now.getMonth() + 1]
        date_from = `${y}-${String(m).padStart(2, "0")}-01`
        const lastDay = new Date(y, m, 0).getDate()
        date_to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      }

      let query = supabase
        .from("expenses")
        .select("id, date, amount, merchant, category_id, exclude_from_budget")
        .eq("user_id", user.id)
        .gte("date", date_from)
        .lte("date", date_to)
      if (!includeExcluded) {
        query = query.eq("exclude_from_budget", false).neq("category_id", "transfers")
      }

      const { data: rows, error } = await query
      if (error) return { ok: false, error: error.message }

      const expenses = rows ?? []
      const total = expenses.reduce((s, r) => s + Number(r.amount), 0)

      const byCat: Record<string, { category_name: string; total: number; count: number }> = {}
      const byMerchant: Record<string, { merchant_display: string; total: number; count: number; category_slug: string }> = {}
      const byDay: Record<string, number> = {}
      let food_out_of_home = 0
      let food_groceries = 0

      const { data: cats } = await supabase.from("categories").select("id, label")
      const catMap = new Map((cats ?? []).map((c: { id: string; label: string }) => [c.id, c.label]))

      for (const r of expenses) {
        const amt = Number(r.amount)
        const mNormForMatch = normalizeMerchant(r.merchant ?? "") || (r.merchant ?? "").trim()
        if (FOOD_OUT_OF_HOME_PATTERNS.test(mNormForMatch)) food_out_of_home += amt
        else if (FOOD_GROCERIES_PATTERNS.test(mNormForMatch)) food_groceries += amt

        const catLabel = catMap.get(r.category_id) ?? r.category_id
        if (!byCat[r.category_id]) byCat[r.category_id] = { category_name: catLabel, total: 0, count: 0 }
        byCat[r.category_id].total += amt
        byCat[r.category_id].count += 1

        const mNorm = normalizeMerchant(r.merchant ?? "")
        const mKey = (mNorm || r.merchant) ?? "Без названия"
        if (!byMerchant[mKey]) byMerchant[mKey] = { merchant_display: r.merchant ?? mKey, total: 0, count: 0, category_slug: r.category_id }
        byMerchant[mKey].total += amt
        byMerchant[mKey].count += 1

        byDay[r.date] = (byDay[r.date] ?? 0) + amt
      }

      const dailyTotals = Object.values(byDay)
      const p95 = dailyTotals.length > 0
        ? dailyTotals.sort((a, b) => a - b)[Math.floor(dailyTotals.length * 0.95)] ?? 200000
        : 200000
      const outlierThreshold = Math.max(200000, p95)

      const biggest_outliers: Array<{ id: string; date: string; merchant: string; amount: number; category_slug: string; reason: string }> = []
      for (const r of expenses) {
        const amt = Number(r.amount)
        if (r.exclude_from_budget || r.category_id === "transfers") {
          biggest_outliers.push({
            id: r.id,
            date: r.date,
            merchant: r.merchant ?? "",
            amount: amt,
            category_slug: r.category_id,
            reason: "transfer_suspect",
          })
        } else if (amt > outlierThreshold) {
          biggest_outliers.push({
            id: r.id,
            date: r.date,
            merchant: r.merchant ?? "",
            amount: amt,
            category_slug: r.category_id,
            reason: "large_purchase",
          })
        } else if ((r.category_id === "clothes" || r.category_id === "shopping") && amt > 300000) {
          biggest_outliers.push({
            id: r.id,
            date: r.date,
            merchant: r.merchant ?? "",
            amount: amt,
            category_slug: r.category_id,
            reason: "large_purchase",
          })
        }
      }
      biggest_outliers.sort((a, b) => b.amount - a.amount)

      const by_category = Object.entries(byCat).map(([slug, c]) => ({
        category_slug: slug,
        category_name: c.category_name,
        total: c.total,
        count: c.count,
      })).sort((a, b) => b.total - a.total)

      const top_merchants = Object.entries(byMerchant)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 15)
        .map(([mNorm, v]) => ({
          merchant_norm: mNorm,
          merchant_display: v.merchant_display,
          total: v.total,
          count: v.count,
          category_slug: v.category_slug,
        }))

      const daily_series = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total }))

      const outlierDates = new Set(biggest_outliers.slice(0, 10).map((o) => o.date))
      const baselineDays = daily_series.filter((d) => !outlierDates.has(d.date))
      const baselineTotal = baselineDays.reduce((s, d) => s + d.total, 0)
      const baseline_avg_per_day =
        baselineDays.length > 0 ? Math.round(baselineTotal / baselineDays.length) : (daily_series.length > 0 ? Math.round(total / daily_series.length) : 0)

      const top_merchants_food = Object.entries(byMerchant)
        .filter(([, v]) => v.category_slug === "food")
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([mNorm, v]) => ({
          merchant_norm: mNorm,
          merchant_display: v.merchant_display,
          total: v.total,
          count: v.count,
          category_slug: v.category_slug,
        }))
      const top_merchants_groceries = Object.entries(byMerchant)
        .filter(([, v]) => v.category_slug === "groceries")
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([mNorm, v]) => ({
          merchant_norm: mNorm,
          merchant_display: v.merchant_display,
          total: v.total,
          count: v.count,
          category_slug: v.category_slug,
        }))

      return {
        ok: true,
        data: {
          total,
          count: expenses.length,
          from: date_from,
          to: date_to,
          by_category,
          out_of_home_food: food_out_of_home,
          food_groceries,
          baseline_avg_per_day,
          top_merchants,
          top_merchants_food,
          top_merchants_groceries,
          daily_series,
          biggest_outliers: biggest_outliers.slice(0, 10),
        },
      }
    }

    case "get_spending_summary": {
      const range = args.range as string
      const month = args.month as string | undefined
      const includeExcluded = args.includeExcluded === 1
      const now = new Date()
      const today = todayStr()
      let date_from: string
      let date_to: string

      if (range === "today") {
        date_from = date_to = today
      } else if (range === "yesterday") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 1))
        date_from = date_to = d.toISOString().slice(0, 10)
      } else if (range === "7d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 6))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else if (range === "15d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 14))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else {
        const [y, m] = month
          ? month.split("-").map(Number)
          : [now.getFullYear(), now.getMonth() + 1]
        date_from = `${y}-${String(m).padStart(2, "0")}-01`
        const lastDay = new Date(y, m, 0).getDate()
        date_to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      }

      let query = supabase
        .from("expenses")
        .select("amount, date")
        .eq("user_id", user.id)
        .gte("date", date_from)
        .lte("date", date_to)
      if (!includeExcluded) {
        query = query.eq("exclude_from_budget", false).neq("category_id", "transfers")
      }

      const { data, error } = await query
      if (error) return { ok: false, error: error.message }

      const rows = data ?? []
      const total = rows.reduce((s, r) => s + Number(r.amount), 0)
      const byDay: Record<string, number> = {}
      for (const r of rows) {
        byDay[r.date] = (byDay[r.date] ?? 0) + Number(r.amount)
      }
      const dayTotals = Object.values(byDay)
      const daysCount = dayTotals.length || 1
      const avg_per_day = Math.round(total / daysCount)
      const max_day = dayTotals.length > 0 ? Math.max(...dayTotals) : 0
      const min_day = dayTotals.length > 0 ? Math.min(...dayTotals) : 0

      return {
        ok: true,
        data: {
          total,
          count: rows.length,
          from: date_from,
          to: date_to,
          avg_per_day,
          max_day,
          min_day,
        },
      }
    }

    case "get_spending_by_category": {
      const range = args.range as string
      const month = args.month as string | undefined
      const includeExcluded = args.includeExcluded === 1
      const now = new Date()
      const today = todayStr()
      let date_from: string
      let date_to: string

      if (range === "today") {
        date_from = date_to = today
      } else if (range === "yesterday") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 1))
        date_from = date_to = d.toISOString().slice(0, 10)
      } else if (range === "7d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 6))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else if (range === "15d") {
        const [y, m, day] = today.split("-").map(Number)
        const d = new Date(Date.UTC(y, m - 1, day - 14))
        date_from = d.toISOString().slice(0, 10)
        date_to = today
      } else {
        const [y, m] = month
          ? month.split("-").map(Number)
          : [now.getFullYear(), now.getMonth() + 1]
        date_from = `${y}-${String(m).padStart(2, "0")}-01`
        const lastDay = new Date(y, m, 0).getDate()
        date_to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      }

      const { data, error } = await supabase
        .from("expenses")
        .select("amount, merchant, category_id, exclude_from_budget, category:categories(id, label)")
        .eq("user_id", user.id)
        .gte("date", date_from)
        .lte("date", date_to)

      if (error) return { ok: false, error: error.message }

      const allRows = data ?? []
      const totalAll = allRows.reduce((s, r) => s + Number(r.amount), 0)
      const totalTransfers = allRows.filter((r) => r.category_id === "transfers").reduce((s, r) => s + Number(r.amount), 0)
      const totalExcluded = allRows.filter((r) => r.exclude_from_budget).reduce((s, r) => s + Number(r.amount), 0)
      const share_transfers = totalAll > 0 ? Math.round((totalTransfers / totalAll) * 1000) / 10 : 0
      const share_excluded = totalAll > 0 ? Math.round((totalExcluded / totalAll) * 1000) / 10 : 0

      const filtered = includeExcluded ? allRows : allRows.filter((r) => !r.exclude_from_budget && r.category_id !== "transfers")

      const byCat: Record<string, { label: string; amount: number; count: number; merchants: Record<string, number> }> = {}
      const byMerchant: Record<string, { amount: number; count: number; category: string }> = {}
      const allAmounts: Array<{ amount: number; merchant: string; category: string }> = []

      for (const row of filtered) {
        const label = (row.category as { label?: string })?.label ?? "Прочее"
        const id = (row.category as { id?: string })?.id ?? row.category_id ?? "other"
        const merchant = String(row.merchant || "Без названия").trim()
        const amt = Number(row.amount)

        if (!byCat[id]) byCat[id] = { label, amount: 0, count: 0, merchants: {} }
        byCat[id].amount += amt
        byCat[id].count += 1
        byCat[id].merchants[merchant] = (byCat[id].merchants[merchant] ?? 0) + amt

        const mKey = merchant
        if (!byMerchant[mKey]) byMerchant[mKey] = { amount: 0, count: 0, category: label }
        byMerchant[mKey].amount += amt
        byMerchant[mKey].count += 1

        allAmounts.push({ amount: amt, merchant, category: label })
      }

      const breakdown = Object.entries(byCat)
        .map(([id, c]) => ({
          category: c.label,
          category_slug: id,
          amount: c.amount,
          count: c.count,
          top_merchants: Object.entries(c.merchants)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([m, a]) => ({ merchant: m, amount: a })),
        }))
        .sort((a, b) => b.amount - a.amount)

      const top_merchants_overall = Object.entries(byMerchant)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 10)
        .map(([merchant, v]) => ({ merchant, amount: v.amount, count: v.count, category: v.category }))

      const outliers = allAmounts
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map((o) => ({ merchant: o.merchant, amount: o.amount, category: o.category }))

      const total = breakdown.reduce((s, c) => s + c.amount, 0)

      return {
        ok: true,
        data: {
          total,
          count: filtered.length,
          from: date_from,
          to: date_to,
          by_category: breakdown,
          top_merchants: top_merchants_overall,
          outliers,
          share_excluded,
          share_transfers,
        },
      }
    }

    case "list_expenses": {
      const from = args.from as string
      const to = args.to as string
      const limit = Math.min(args.limit as number ?? 20, 50)
      const q = args.q as string | undefined
      const category_id = args.category_id as string | undefined

      let query = supabase
        .from("expenses")
        .select("id, date, amount, merchant, note, category:categories(id, label, color)")
        .eq("user_id", user.id)
        .eq("exclude_from_budget", false)
        .neq("category_id", "transfers")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .limit(limit)

      if (category_id) query = query.eq("category_id", category_id)
      if (q) query = query.or(`merchant.ilike.%${q}%,note.ilike.%${q}%`)

      const { data, error } = await query
      if (error) return { ok: false, error: error.message }
      const items = (data ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        amount: e.amount,
        merchant: e.merchant,
        category: (e.category as { label?: string })?.label ?? "—",
        note: e.note ?? null,
      }))
      return { ok: true, data: items }
    }

    case "create_expense": {
      const amount = Math.round(Number(args.amount))
      let date = String(args.date || "").trim()
      const merchant = String(args.merchant || "Без названия").trim()
      let category_id = args.category_id as string | undefined
      const note = (args.note as string) ?? null

      if (!amount || amount <= 0) return { ok: false, error: "amount must be > 0" }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = parseRelativeDate(date || "сегодня")
      }
      if (merchant.length > 120) return { ok: false, error: "merchant too long" }

      if (!category_id) {
        const resolved = await runTool("resolve_category", { hint: merchant, merchant })
        if (resolved.ok && resolved.data) {
          category_id = resolved.data as string
        }
        if (!category_id) {
          category_id = "other"
        }
      }

      const exists = await categoryExists(supabase, category_id)
      if (!exists) return { ok: false, error: "Category not found" }

      const { data, error } = await supabase
        .from("expenses")
        .insert({
          user_id: user.id,
          merchant,
          category_id,
          amount,
          date,
          note,
          payment_method: "card",
        })
        .select("*, category:categories(id, label, color)")
        .single()

      if (error) return { ok: false, error: error.message }
      const { ensureAccounts, createExpenseLedger } = await import("@/lib/ledger")
      const accounts = await ensureAccounts(supabase, user.id)
      if (accounts) {
        await createExpenseLedger(supabase, {
          id: data.id,
          user_id: user.id,
          amount: data.amount,
          date: data.date,
          merchant: data.merchant,
          note: data.note,
          payment_method: data.payment_method ?? "card",
        })
      }
      return {
        ok: true,
        data: {
          id: data.id,
          merchant: data.merchant,
          amount: data.amount,
          date: data.date,
          category: (data.category as { label?: string })?.label ?? category_id,
        },
      }
    }

    case "get_salary_context": {
      const month = args.month as string | undefined
      const fromArg = args.from as string | undefined
      const toArg = args.to as string | undefined
      const targetBudget = typeof args.target_budget === "number" ? Math.round(args.target_budget) : undefined
      const today = todayStr()
      const [y, m, day] = today.split("-").map(Number)

      const { data: lastPayments } = await supabase
        .from("payments")
        .select("amount, pay_date, period, received")
        .eq("user_id", user.id)
        .order("pay_date", { ascending: false })
        .limit(5)
      const last_payments = (lastPayments ?? []).map((p) => ({
        pay_date: p.pay_date,
        period_from: p.period,
        period_to: p.period,
        amount: p.amount,
        received: p.received,
      }))

      const forecast = await computeForecast(supabase, user.id, month)
      const isBefore20th = day < 20
      const next_payout_20th_date = `${y}-${String(m).padStart(2, "0")}-20`
      const nextMonth = m === 12 ? 1 : m + 1
      const nextYear = m === 12 ? y + 1 : y
      const next_payout_5th_date = `${nextYear}-${String(nextMonth).padStart(2, "0")}-05`

      const next_date = isBefore20th ? next_payout_20th_date : next_payout_5th_date
      const next_amount = isBefore20th ? forecast.payout_20th : forecast.payout_5th_next

      const nextDateObj = new Date(next_date + "T12:00:00")
      const nowObj = new Date()
      const days_until_next_payment = Math.ceil((nextDateObj.getTime() - nowObj.getTime()) / (24 * 60 * 60 * 1000))

      const range_from = today
      const range_to_date = new Date(next_date + "T12:00:00")
      range_to_date.setDate(range_to_date.getDate() - 1)
      const range_to = range_to_date.toISOString().slice(0, 10)
      const diffMs = new Date(range_to + "T12:00:00").getTime() - new Date(range_from + "T12:00:00").getTime()
      const days_count = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1)
      const budget_period = { days_count, range_from, range_to }

      const daily_limit_for_target = targetBudget != null && targetBudget > 0 && days_count > 0
        ? Math.round(targetBudget / days_count)
        : undefined

      const lastReceived = lastPayments?.find((p) => p.received)
      let current_balance_estimate: number | null = null
      if (lastReceived) {
        const lastDate = lastReceived.pay_date
        const { data: expSince } = await supabase
          .from("expenses")
          .select("amount")
          .eq("user_id", user.id)
          .eq("exclude_from_budget", false)
          .neq("category_id", "transfers")
          .gte("date", lastDate)
          .lte("date", today)
        const spentSince = (expSince ?? []).reduce((s, r) => s + Number(r.amount), 0)
        current_balance_estimate = Math.round(Number(lastReceived.amount) - spentSince)
      }

      const suggested_daily_limit =
        current_balance_estimate != null && current_balance_estimate > 0 && days_count > 0
          ? Math.round(current_balance_estimate / days_count)
          : undefined

      const next_payouts = isBefore20th
        ? [{ pay_date: next_payout_20th_date, period_from: `1-${m}`, period_to: `20-${m}`, predicted_amount: forecast.payout_20th, breakdown_by_mode: forecast.breakdown_20th }]
        : [{ pay_date: next_payout_5th_date, period_from: `21-${m}`, period_to: `5-${nextMonth}`, predicted_amount: forecast.payout_5th_next, breakdown_by_mode: forecast.breakdown_5th_next }]

      const ytdFrom = fromArg ?? `${y}-01-01`
      const ytdTo = toArg ?? today
      const { data: ytdPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("user_id", user.id)
        .eq("received", true)
        .gte("pay_date", ytdFrom)
        .lte("pay_date", ytdTo)
      const ytd_received = (ytdPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)

      return {
        ok: true,
        data: {
          month: forecast.month,
          next_payouts,
          last_payments,
          ytd_received,
          days_until_next_payment,
          current_balance_estimate,
          budget_period,
          ...(suggested_daily_limit != null ? { suggested_daily_limit } : {}),
          ...(daily_limit_for_target != null ? { daily_limit_for_target } : {}),
        },
      }
    }

    case "get_salary_next_payout": {
      const month = args.month as string | undefined
      const result = await computeForecast(supabase, user.id, month)
      return { ok: true, data: result }
    }

    case "resolve_merchants_help": {
      const merchantsStr = (args.merchants as string) ?? ""
      const merchants = merchantsStr.split(",").map((s) => s.trim()).filter(Boolean)
      const result = merchants.map((m) => {
        const norm = normalizeMerchant(m)
        const seedCat = matchSeed(norm)
        let known_as: string | undefined
        let hint: string | null = null
        for (const { pattern, known_as: ka, hint: h } of MERCHANT_HINTS) {
          if (pattern.test(norm || m)) {
            known_as = ka
            hint = h
            break
          }
        }
        if (seedCat && !hint) {
          hint = seedCat === "food" ? "еда" : seedCat === "groceries" ? "продукты" : seedCat === "taxi" ? "такси" : seedCat === "transport" ? "транспорт" : seedCat === "communication" ? "связь" : seedCat === "subscriptions" ? "подписки" : seedCat
        }
        return { merchant_norm: norm || m, known_as, hint }
      })
      return { ok: true, data: result }
    }

    case "resolve_category": {
      const hint = String(args.hint || "").trim()
      const merchant = String(args.merchant || hint || "Без названия").trim()
      const { resolveCategory } = await import("@/lib/payme-category-mapper")
      const { data: defaults } = await supabase.from("categories").select("id, label").eq("is_default", true).is("user_id", null)
      const { data: userCats } = await supabase.from("categories").select("id, label").eq("user_id", user.id)
      const appCategories = [...(defaults ?? []), ...(userCats ?? [])] as { id: string; label: string }[]
      const resolved = await resolveCategory({
        userId: user.id,
        merchant: hint ? `${hint} ${merchant}` : merchant,
        paymeCategory: "",
        amount: 0,
        categoryMapping: {},
        defaultCategoryId: "other",
        appCategories,
        supabase,
      })
      return { ok: true, data: resolved.category_id }
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` }
  }
}

export { parseRelativeDate, todayStr }
