import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { getAccountId } from "@/lib/ledger"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const range = searchParams.get("range") === "15d" ? "15d" : searchParams.get("range") === "30d" ? "30d" : "7d"
  const days = range === "7d" ? 7 : range === "15d" ? 15 : 30
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date()
  from.setDate(from.getDate() - days)
  const date_from = from.toISOString().slice(0, 10)

  const supabase = await createClient()
  const [cardId, cashId] = await Promise.all([
    getAccountId(supabase, user.id, "card"),
    getAccountId(supabase, user.id, "cash"),
  ])
  if (!cardId || !cashId) {
    return NextResponse.json({ error: "Accounts not found" }, { status: 404 })
  }

  const { data: ledgerRows } = await supabase
    .from("ledger_entries")
    .select("account_id, direction, amount, merchant")
    .eq("user_id", user.id)
    .gte("occurred_on", date_from)
    .lte("occurred_on", today)

  let card_out_total = 0
  let cash_out_total = 0
  const cardMerchants: Record<string, number> = {}
  const cashMerchants: Record<string, number> = {}
  for (const r of ledgerRows ?? []) {
    const amt = Number(r.amount)
    const m = (r.merchant ?? "Без названия").trim()
    if (r.direction !== "out") continue
    if (r.account_id === cardId) {
      card_out_total += amt
      cardMerchants[m] = (cardMerchants[m] ?? 0) + amt
    } else if (r.account_id === cashId) {
      cash_out_total += amt
      cashMerchants[m] = (cashMerchants[m] ?? 0) + amt
    }
  }

  const top = (obj: Record<string, number>, n: number) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([merchant, amount]) => ({ merchant, amount }))

  const [expensesCardResult, expensesCashResult] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount, category_id")
      .eq("user_id", user.id)
      .eq("payment_method", "card")
      .gte("date", date_from)
      .lte("date", today),
    supabase
      .from("expenses")
      .select("amount, category_id")
      .eq("user_id", user.id)
      .eq("payment_method", "cash")
      .gte("date", date_from)
      .lte("date", today),
  ])
  const { data: expensesCard } = expensesCardResult
  const { data: expensesCash } = expensesCashResult

  const byCategory = (rows: { amount: number; category_id: string }[] | null) => {
    const map: Record<string, number> = {}
    for (const r of rows ?? []) {
      map[r.category_id] = (map[r.category_id] ?? 0) + r.amount
    }
    return Object.entries(map)
      .map(([category_id, amount]) => ({ category_id, amount }))
      .sort((a, b) => b.amount - a.amount)
  }

  return NextResponse.json({
    range,
    date_from,
    date_to: today,
    card_out_total,
    cash_out_total,
    top_merchants_card: top(cardMerchants, 5),
    top_merchants_cash: top(cashMerchants, 5),
    by_category_card: byCategory(expensesCard ?? []),
    by_category_cash: byCategory(expensesCash ?? []),
  })
}
