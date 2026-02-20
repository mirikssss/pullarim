import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

function isWeekday(d: Date): boolean {
  const dow = d.getDay()
  return dow >= 1 && dow <= 5
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0")
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") // YYYY-MM

  const now = new Date()
  const targetMonth = month
    ? `${month}-01`
    : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`

  const [y, m] = targetMonth.slice(0, 7).split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()

  const supabase = await createClient()

  // All modes (not just active) - for timeline
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

  const exceptionSet = new Set((exceptions ?? []).map((e) => e.date))

  // N = weekdays in month (Mon-Fri count, exceptions do NOT change N)
  let N = 0
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(y, m - 1, day)
    if (isWeekday(d)) N++
  }

  // For each day: mode(day) = latest mode with start_date <= day
  const getModeForDay = (day: number) => {
    const dateStr = `${y}-${pad(m)}-${pad(day)}`
    const applicable = (modes ?? []).filter((mode) => mode.start_date <= dateStr)
    return applicable[0] ?? null
  }

  const isWorked = (day: number) => {
    const dateStr = `${y}-${pad(m)}-${pad(day)}`
    const d = new Date(y, m - 1, day)
    const defaultWorked = isWeekday(d)
    const isException = exceptionSet.has(dateStr)
    return defaultWorked ? !isException : isException
  }

  // Compute per-day amounts and breakdown
  type DayEntry = { day: number; worked: boolean; modeId: string; modeLabel: string; amount: number }
  const period1Entries: DayEntry[] = []
  const period2Entries: DayEntry[] = []

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
    }

    if (day <= 15) {
      period1Entries.push(entry)
      payout_20th += amount
      period1DaysWorked++
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

  return NextResponse.json({
    month: targetMonth.slice(0, 7),
    N,
    period1DaysWorked,
    period2DaysWorked,
    payout_20th,
    payout_5th_next,
    breakdown_20th,
    breakdown_5th_next,
    exceptions_count: exceptionSet.size,
  })
}
