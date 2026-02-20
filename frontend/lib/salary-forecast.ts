/**
 * Shared salary forecast computation. Used by /api/salary/forecast and assistant tool.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

function isWeekday(d: Date): boolean {
  return d.getDay() >= 1 && d.getDay() <= 5
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0")
}

function toDateStr(val: string | Date): string {
  if (typeof val === "string") return val.slice(0, 10)
  const d = val as Date
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type ForecastResult = {
  month: string
  N: number
  payout_20th: number
  payout_5th_next: number
  breakdown_20th: { mode_id: string; label: string; amount: number; days: number }[]
  breakdown_5th_next: { mode_id: string; label: string; amount: number; days: number }[]
}

export async function computeForecast(
  supabase: SupabaseClient,
  userId: string,
  month?: string
): Promise<ForecastResult> {
  const now = new Date()
  const targetMonth = month
    ? `${month}-01`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`

  const [y, m] = targetMonth.slice(0, 7).split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()

  const { data: modes } = await supabase
    .from("salary_modes")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })

  const date_from = `${y}-${pad(m)}-01`
  const date_to = `${y}-${pad(m)}-${pad(lastDay)}`

  const { data: exceptions } = await supabase
    .from("work_exceptions")
    .select("date")
    .eq("user_id", userId)
    .gte("date", date_from)
    .lte("date", date_to)

  const exceptionSet = new Set((exceptions ?? []).map((e) => toDateStr(e.date)))

  let N = 0
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(y, m - 1, day)
    if (isWeekday(d)) N++
  }

  const getModeForDay = (day: number) => {
    const dateStr = `${y}-${pad(m)}-${pad(day)}`
    const applicable = (modes ?? []).filter((mode: { start_date: string; end_date?: string | null }) => {
      const modeStart = toDateStr(mode.start_date)
      const modeEnd = mode.end_date ? toDateStr(mode.end_date) : null
      if (modeStart > dateStr) return false
      if (modeEnd != null && modeEnd < dateStr) return false
      return true
    })
    return applicable[0] ?? null
  }

  const isWorked = (day: number) => {
    const dateStr = `${y}-${pad(m)}-${pad(day)}`
    const d = new Date(y, m - 1, day)
    const defaultWorked = isWeekday(d)
    const isException = exceptionSet.has(dateStr)
    return defaultWorked ? !isException : isException
  }

  type DayEntry = { day: number; worked: boolean; modeId: string; modeLabel: string; amount: number; dailyRate: number }
  const period1Entries: DayEntry[] = []
  const period2Entries: DayEntry[] = []

  let payout_20th = 0
  let payout_5th_next = 0

  for (let day = 1; day <= lastDay; day++) {
    const mode = getModeForDay(day)
    const worked = isWorked(day)
    if (!mode || !worked) continue

    const monthlyAmount = Number(mode.amount)
    const dailyRate = monthlyAmount / N
    const amount = Math.round(dailyRate)

    const entry: DayEntry = {
      day,
      worked: true,
      modeId: mode.id,
      modeLabel: mode.label,
      amount,
      dailyRate,
    }

    if (day <= 15) {
      period1Entries.push(entry)
      payout_20th += amount
    } else {
      period2Entries.push(entry)
      payout_5th_next += amount
    }
  }

  const breakdownByMode = (entries: DayEntry[]) => {
    const byMode: Record<string, { label: string; amount: number; days: number }> = {}
    for (const e of entries) {
      if (!byMode[e.modeId]) {
        byMode[e.modeId] = { label: e.modeLabel, amount: 0, days: 0 }
      }
      byMode[e.modeId].amount += e.amount
      byMode[e.modeId].days++
    }
    return Object.entries(byMode).map(([modeId, v]) => ({ mode_id: modeId, label: v.label, amount: v.amount, days: v.days }))
  }

  return {
    month: targetMonth.slice(0, 7),
    N,
    payout_20th,
    payout_5th_next,
    breakdown_20th: breakdownByMode(period1Entries),
    breakdown_5th_next: breakdownByMode(period2Entries),
  }
}
