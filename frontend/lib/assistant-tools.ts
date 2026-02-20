/**
 * Assistant tools: definitions and server-side executor.
 * Uses Supabase with user session (RLS).
 */

import { createClient } from "@/lib/supabase/server"
import { getAuthUser } from "@/lib/api-auth"
import { categoryExists } from "@/lib/api-validation"
import { computeForecast } from "@/lib/salary-forecast"
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

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_spending_summary",
      description: "Получить суммарные расходы за период. Вызывай всегда при вопросе 'сколько потратил'.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["today", "yesterday", "7d", "15d", "month"],
            description: "today | yesterday | 7d | 15d | month",
          },
          month: { type: "string", description: "YYYY-MM для month (опционально)" },
        },
        required: ["range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_category",
      description: "Разбивка расходов по категориям + топ мерчантов. Возвращает by_category (каждая с top_merchants) и top_merchants_overall. Используй имена мерчантов в ответах. Даты на сервере.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            enum: ["today", "yesterday", "7d", "15d", "month"],
            description: "today | yesterday | 7d | 15d | month",
          },
          month: { type: "string", description: "YYYY-MM для month (опционально)" },
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
      description: "Полный контекст по зарплате: последняя полученная выплата (сумма, дата) + следующая ожидаемая (сумма, дата). Вызывай при вопросах про зарплату, выплаты, бюджет.",
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
    case "get_spending_summary": {
      const range = args.range as string
      const month = args.month as string | undefined
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
        .select("amount")
        .eq("user_id", user.id)
        .gte("date", date_from)
        .lte("date", date_to)

      if (error) return { ok: false, error: error.message }
      const total = (data ?? []).reduce((s, r) => s + Number(r.amount), 0)
      return { ok: true, data: { total, count: data?.length ?? 0, from: date_from, to: date_to } }
    }

    case "get_spending_by_category": {
      const range = args.range as string
      const month = args.month as string | undefined
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
        .select("amount, merchant, category:categories(id, label)")
        .eq("user_id", user.id)
        .gte("date", date_from)
        .lte("date", date_to)

      if (error) return { ok: false, error: error.message }

      const byCat: Record<string, { label: string; amount: number; count: number; merchants: Record<string, number> }> = {}
      const byMerchant: Record<string, { amount: number; count: number; category: string }> = {}

      for (const row of data ?? []) {
        const label = (row.category as { label?: string })?.label ?? "Прочее"
        const id = (row.category as { id?: string })?.id ?? "other"
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
      }

      const breakdown = Object.entries(byCat)
        .map(([id, c]) => ({
          category: c.label,
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

      const total = breakdown.reduce((s, c) => s + c.amount, 0)

      return {
        ok: true,
        data: {
          total,
          count: (data ?? []).length,
          from: date_from,
          to: date_to,
          by_category: breakdown,
          top_merchants_overall,
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
        })
        .select("*, category:categories(id, label, color)")
        .single()

      if (error) return { ok: false, error: error.message }
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
      const today = todayStr()
      const [y, m, day] = today.split("-").map(Number)

      const { data: lastPayments } = await supabase
        .from("payments")
        .select("amount, pay_date, period")
        .eq("user_id", user.id)
        .eq("received", true)
        .order("pay_date", { ascending: false })
        .limit(1)
      const last_payment = lastPayments?.[0]
        ? { amount: lastPayments[0].amount, pay_date: lastPayments[0].pay_date, period: lastPayments[0].period }
        : null

      const forecast = await computeForecast(supabase, user.id, month)
      const isBefore20th = day < 20
      const next_payout_20th_date = `${y}-${String(m).padStart(2, "0")}-20`
      const nextMonth = m === 12 ? 1 : m + 1
      const nextYear = m === 12 ? y + 1 : y
      const next_payout_5th_date = `${nextYear}-${String(nextMonth).padStart(2, "0")}-05`

      const next_payment = isBefore20th
        ? { amount: forecast.payout_20th, date: next_payout_20th_date, label: "20-го этого месяца" }
        : { amount: forecast.payout_5th_next, date: next_payout_5th_date, label: "5-го следующего месяца" }

      return {
        ok: true,
        data: {
          last_payment,
          next_payment,
          forecast: { month: forecast.month, payout_20th: forecast.payout_20th, payout_5th_next: forecast.payout_5th_next },
        },
      }
    }

    case "get_salary_next_payout": {
      const month = args.month as string | undefined
      const result = await computeForecast(supabase, user.id, month)
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
