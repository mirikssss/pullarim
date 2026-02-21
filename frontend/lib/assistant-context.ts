/**
 * Assistant context: user summary + analytics for LLM.
 * Built before each call, injected as system/context.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { computeForecast } from "./salary-forecast"

const TZ = "Asia/Tashkent"

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ })
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export type UserContextSummary = {
  current_month: string
  active_salary_modes: string[]
  last_payment: { date: string; amount: number } | null
  next_payment: { date: string; amount: number } | null
  days_until_next: number | null
  avg_spend_7d: number
  avg_spend_14d: number
  avg_spend_30d: number
  share_transfers: number
  share_excluded: number
}

export type AnalyzeStatsResult = {
  has_outliers: boolean
  outliers_count: number
  exceeds_avg: boolean
  taxi_delivery_share: number
  taxi_delivery_dominant: boolean
  trend: "up" | "down" | "stable"
  trend_pct: number
}

export async function buildUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserContextSummary> {
  const today = todayStr()
  const [y, m, day] = today.split("-").map(Number)

  const current_month = `${y}-${pad(m)}`

  const { data: modes } = await supabase
    .from("salary_modes")
    .select("id, label, start_date, end_date")
    .eq("user_id", userId)
  const active_modes = (modes ?? []).filter((mode: { start_date: string; end_date?: string | null }) => {
    if (mode.start_date > today) return false
    if (!mode.end_date) return true
    return mode.end_date >= today
  })
  const active_salary_modes = active_modes.map((m: { label: string }) => m.label)

  const { data: lastPayments } = await supabase
    .from("payments")
    .select("amount, pay_date")
    .eq("user_id", userId)
    .order("pay_date", { ascending: false })
    .limit(1)
  const last_payment = lastPayments?.[0]
    ? { date: lastPayments[0].pay_date, amount: Number(lastPayments[0].amount) }
    : null

  const forecast = await computeForecast(supabase, userId)
  const isBefore20th = day < 20
  const next_payout_date = isBefore20th
    ? `${y}-${pad(m)}-20`
    : m === 12
      ? `${y + 1}-01-05`
      : `${y}-${pad(m + 1)}-05`
  const next_payout_amount = isBefore20th ? forecast.payout_20th : forecast.payout_5th_next
  const next_payment = { date: next_payout_date, amount: next_payout_amount }

  const daysUntil = (() => {
    const next = new Date(next_payout_date + "T12:00:00")
    const now = new Date()
    const diff = Math.ceil((next.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    return diff
  })()

  const ranges = [
    { days: 7, key: "avg_spend_7d" },
    { days: 14, key: "avg_spend_14d" },
    { days: 30, key: "avg_spend_30d" },
  ] as const

  const avgs: Record<string, number> = {}
  for (const { days, key } of ranges) {
    const from = new Date(y, m - 1, day - days)
    const date_from = from.toISOString().slice(0, 10)

    const { data: all } = await supabase
      .from("expenses")
      .select("amount, category_id, exclude_from_budget")
      .eq("user_id", userId)
      .gte("date", date_from)
      .lte("date", today)

    const rows = all ?? []
    const totalAll = rows.reduce((s, r) => s + Number(r.amount), 0)
    const totalExcluded = rows
      .filter((r) => r.exclude_from_budget || r.category_id === "transfers")
      .reduce((s, r) => s + Number(r.amount), 0)
    const totalInBudget = totalAll - totalExcluded

    avgs[key] = days > 0 ? Math.round(totalInBudget / days) : 0
  }

  const date_from_30 = new Date(y, m - 1, day - 30).toISOString().slice(0, 10)
  const { data: all30 } = await supabase
    .from("expenses")
    .select("amount, category_id, exclude_from_budget")
    .eq("user_id", userId)
    .gte("date", date_from_30)
    .lte("date", today)
  const rows30 = all30 ?? []
  const total30 = rows30.reduce((s, r) => s + Number(r.amount), 0)
  const transfers30 = rows30
    .filter((r) => r.category_id === "transfers")
    .reduce((s, r) => s + Number(r.amount), 0)
  const excluded30 = rows30
    .filter((r) => r.exclude_from_budget)
    .reduce((s, r) => s + Number(r.amount), 0)
  const share_transfers = total30 > 0 ? Math.round((transfers30 / total30) * 1000) / 10 : 0
  const share_excluded = total30 > 0 ? Math.round((excluded30 / total30) * 1000) / 10 : 0

  return {
    current_month,
    active_salary_modes,
    last_payment,
    next_payment,
    days_until_next: daysUntil,
    avg_spend_7d: avgs.avg_spend_7d,
    avg_spend_14d: avgs.avg_spend_14d,
    avg_spend_30d: avgs.avg_spend_30d,
    share_transfers,
    share_excluded,
  }
}

export function formatUserContextForPrompt(ctx: UserContextSummary): string {
  const lines: string[] = [
    `Месяц: ${ctx.current_month}`,
    `Активные режимы ЗП: ${ctx.active_salary_modes.length ? ctx.active_salary_modes.join(", ") : "нет"}`,
    ctx.last_payment
      ? `Последняя выплата: ${ctx.last_payment.date} — ${ctx.last_payment.amount.toLocaleString("ru-RU")} сум`
      : "Последняя выплата: нет данных",
    ctx.next_payment
      ? `Следующая выплата: ${ctx.next_payment.date} — ~${ctx.next_payment.amount.toLocaleString("ru-RU")} сум`
      : "Следующая выплата: нет данных",
    ctx.days_until_next != null ? `Дней до следующей ЗП: ${ctx.days_until_next}` : "",
    `Средний расход: 7д=${ctx.avg_spend_7d.toLocaleString("ru-RU")}, 14д=${ctx.avg_spend_14d.toLocaleString("ru-RU")}, 30д=${ctx.avg_spend_30d.toLocaleString("ru-RU")} сум/день`,
    `Доля переводов: ${ctx.share_transfers}%, exclude_from_budget: ${ctx.share_excluded}%`,
  ]
  return lines.filter(Boolean).join("\n")
}

export type AnalyzeStatsResultExtra = { baseline_avg_per_day?: number }

export function analyzeStats(
  toolData: {
    total?: number
    count?: number
    by_category?: Array<{ category_slug: string; total?: number; amount?: number }>
    biggest_outliers?: Array<{ amount: number }>
    daily_series?: Array<{ date: string; total: number }>
    baseline_avg_per_day?: number
    out_of_home_food?: number
  },
  ctx: UserContextSummary
): AnalyzeStatsResult & AnalyzeStatsResultExtra {
  const outliers = toolData.biggest_outliers ?? []
  const has_outliers = outliers.length > 0
  const outliers_count = outliers.length

  const dailyTotals = (toolData.daily_series ?? []).map((d) => d.total)
  const avgFromData = dailyTotals.length > 0
    ? dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length
    : ctx.avg_spend_14d
  const exceeds_avg = ctx.avg_spend_7d > avgFromData * 1.2

  const byCat = toolData.by_category ?? []
  const getTotal = (c: { total?: number; amount?: number }) => c.total ?? c.amount ?? 0
  const taxi = getTotal(byCat.find((c) => c.category_slug === "taxi") ?? {})
  const food = getTotal(byCat.find((c) => c.category_slug === "food") ?? {})
  const groceries = getTotal(byCat.find((c) => c.category_slug === "groceries") ?? {})
  const totalCat = byCat.reduce((s, c) => s + getTotal(c as { total?: number; amount?: number }), 0)
  const taxi_delivery_share = totalCat > 0 ? (taxi + food) / totalCat : 0
  const taxi_delivery_dominant = taxi_delivery_share > 0.4

  let trend: "up" | "down" | "stable" = "stable"
  let trend_pct = 0
  if (dailyTotals.length >= 7) {
    const half = Math.floor(dailyTotals.length / 2)
    const firstHalf = dailyTotals.slice(0, half).reduce((a, b) => a + b, 0) / half
    const secondHalf = dailyTotals.slice(half).reduce((a, b) => a + b, 0) / (dailyTotals.length - half)
    if (firstHalf > 0) {
      trend_pct = Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
      trend = trend_pct > 10 ? "up" : trend_pct < -10 ? "down" : "stable"
    }
  }

  return {
    has_outliers,
    outliers_count,
    exceeds_avg,
    taxi_delivery_share: Math.round(taxi_delivery_share * 100),
    taxi_delivery_dominant,
    trend,
    trend_pct,
    baseline_avg_per_day: toolData.baseline_avg_per_day,
    out_of_home_food: toolData.out_of_home_food,
  }
}

export function formatAnalyzeStatsForPrompt(stats: AnalyzeStatsResult & AnalyzeStatsResultExtra): string {
  const lines: string[] = [
    `Выбросы: ${stats.has_outliers ? `да (${stats.outliers_count})` : "нет"}`,
    `Превышение среднего: ${stats.exceeds_avg ? "да" : "нет"}`,
    `Доля такси+еда: ${stats.taxi_delivery_share}%${stats.taxi_delivery_dominant ? " (доминирует)" : ""}`,
    `Тренд: ${stats.trend}${stats.trend_pct !== 0 ? ` (${stats.trend_pct > 0 ? "+" : ""}${stats.trend_pct}%)` : ""}`,
    ...(stats.baseline_avg_per_day != null ? [`baseline_avg_per_day: ${stats.baseline_avg_per_day.toLocaleString("ru-RU")} сум/день`] : []),
    ...(stats.out_of_home_food != null ? [`out_of_home_food: ${stats.out_of_home_food.toLocaleString("ru-RU")} сум`] : []),
  ]
  return lines.join(", ")
}
