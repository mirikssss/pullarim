import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  forecastQuerySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"

function isWeekday(d: Date): boolean {
  const dow = d.getDay()
  return dow >= 1 && dow <= 5
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0")
}

/** Normalize to YYYY-MM-DD for reliable date-only comparison (no timezone) */
function toDateStr(val: string | Date): string {
  if (typeof val === "string") return val.slice(0, 10)
  const d = val as Date
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = forecastQuerySchema.safeParse({ month: searchParams.get("month") ?? undefined })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { month } = parsed.data

  const now = new Date()
  const targetMonth = month
    ? `${month}-01`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`

  const [y, m] = targetMonth.slice(0, 7).split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()

  const supabase = await createClient()

  // All modes (not just active) - for timeline, sorted by start_date DESC (latest first)
  const { data: modes } = await supabase
    .from("salary_modes")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })

  const date_from = `${y}-${pad(m)}-01`
  const date_to = `${y}-${pad(m)}-${pad(lastDay)}`

  const { data: exceptions } = await supabase
    .from("work_exceptions")
    .select("date")
    .eq("user_id", user.id)
    .gte("date", date_from)
    .lte("date", date_to)

  const exceptionSet = new Set((exceptions ?? []).map((e) => toDateStr(e.date)))

  // N = weekdays in month (Mon-Fri count), exceptions do NOT change N
  let N = 0
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(y, m - 1, day)
    if (isWeekday(d)) N++
  }

  // mode(day) = salary_mode with latest start_date <= day, and (end_date is null OR end_date >= day)
  // start_date and end_date are both inclusive
  // Modes sorted by start_date DESC, so first match has max start_date
  const getModeForDay = (day: number) => {
    const dateStr = `${y}-${pad(m)}-${pad(day)}`
    const applicable = (modes ?? []).filter((mode) => {
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

  // Earliest mode start_date - for warning if month has days before any mode
  const modeDates = (modes ?? []).map((mo) => toDateStr(mo.start_date))
  const earliestModeDate = modeDates.length > 0 ? modeDates.reduce((a, b) => (a < b ? a : b)) : null
  const firstMonthDate = date_from
  const hasDaysBeforeFirstMode = earliestModeDate && firstMonthDate < earliestModeDate

  // Compute per-day amounts and breakdown - FULL periods 1-15 and 16-end (no "today" cutoff)
  type DayEntry = { day: number; worked: boolean; modeId: string; modeLabel: string; amount: number; dailyRate: number }
  const period1Entries: DayEntry[] = []
  const period2Entries: DayEntry[] = []
  const debugPeriod1: { day: number; date: string; worked: boolean; mode_label: string; dailyRate: number }[] = []

  let payout_20th = 0
  let payout_5th_next = 0
  let period1DaysWorked = 0
  let period2DaysWorked = 0

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
      period1DaysWorked++
      if (process.env.NODE_ENV === "development") {
        debugPeriod1.push({
          day,
          date: `${y}-${pad(m)}-${pad(day)}`,
          worked: true,
          mode_label: mode.label,
          dailyRate: Math.round(dailyRate),
        })
      }
    } else {
      period2Entries.push(entry)
      payout_5th_next += amount
      period2DaysWorked++
    }
  }

  // Breakdown by mode for each period
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

  const breakdown_20th = breakdownByMode(period1Entries)
  const breakdown_5th_next = breakdownByMode(period2Entries)

  const response: Record<string, unknown> = {
    month: targetMonth.slice(0, 7),
    N,
    period1DaysWorked,
    period2DaysWorked,
    payout_20th,
    payout_5th_next,
    breakdown_20th,
    breakdown_5th_next,
    exceptions_count: exceptionSet.size,
    has_days_before_first_mode: hasDaysBeforeFirstMode ?? false,
    earliest_mode_date: earliestModeDate,
  }

  if (process.env.NODE_ENV === "development") {
    response.debug_period1 = debugPeriod1
  }

  return NextResponse.json(response)
}
