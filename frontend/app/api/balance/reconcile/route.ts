import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

/** Dev-only: sanity check that every expense has exactly one ledger out, every received payment one ledger in, every transfer two entries. */
export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 })
  }

  const supabase = await createClient()

  const { data: expenses } = await supabase.from("expenses").select("id").eq("user_id", user.id)
  const { data: ledgerExpense } = await supabase
    .from("ledger_entries")
    .select("source_id, account_id, direction")
    .eq("user_id", user.id)
    .eq("source_type", "expense")
  const expenseIds = new Set((expenses ?? []).map((e) => e.id))
  const ledgerByExpense: Record<string, { out: number }> = {}
  for (const l of ledgerExpense ?? []) {
    if (l.direction !== "out") continue
    const sid = l.source_id as string
    if (!ledgerByExpense[sid]) ledgerByExpense[sid] = { out: 0 }
    ledgerByExpense[sid].out++
  }
  const expenseMissing = (expenses ?? []).filter((e) => (ledgerByExpense[e.id]?.out ?? 0) !== 1)
  const ledgerOrphanExpense = (ledgerExpense ?? [])
    .filter((l) => l.direction === "out")
    .filter((l) => !expenseIds.has(l.source_id as string))

  const { data: paymentsReceived } = await supabase
    .from("payments")
    .select("id")
    .eq("user_id", user.id)
    .eq("received", true)
  const { data: ledgerSalary } = await supabase
    .from("ledger_entries")
    .select("source_id")
    .eq("user_id", user.id)
    .eq("source_type", "salary_payment")
  const paymentIds = new Set((paymentsReceived ?? []).map((p) => p.id))
  const ledgerByPayment: Record<string, number> = {}
  for (const l of ledgerSalary ?? []) {
    const sid = l.source_id as string
    ledgerByPayment[sid] = (ledgerByPayment[sid] ?? 0) + 1
  }
  const paymentMissing = (paymentsReceived ?? []).filter((p) => (ledgerByPayment[p.id] ?? 0) !== 1)
  const ledgerOrphanSalary = (ledgerSalary ?? []).filter((l) => !paymentIds.has(l.source_id as string))

  const { data: transfers } = await supabase.from("transfers").select("id").eq("user_id", user.id)
  const { data: ledgerTransfer } = await supabase
    .from("ledger_entries")
    .select("source_id, direction")
    .eq("user_id", user.id)
    .eq("source_type", "transfer")
  const transferIds = new Set((transfers ?? []).map((t) => t.id))
  const ledgerByTransfer: Record<string, { in: number; out: number }> = {}
  for (const l of ledgerTransfer ?? []) {
    const sid = l.source_id as string
    if (!ledgerByTransfer[sid]) ledgerByTransfer[sid] = { in: 0, out: 0 }
    if (l.direction === "in") ledgerByTransfer[sid].in++
    else ledgerByTransfer[sid].out++
  }
  const transferBad = (transfers ?? []).filter(
    (t) => (ledgerByTransfer[t.id]?.in ?? 0) !== 1 || (ledgerByTransfer[t.id]?.out ?? 0) !== 1
  )

  const ok =
    expenseMissing.length === 0 &&
    ledgerOrphanExpense.length === 0 &&
    paymentMissing.length === 0 &&
    ledgerOrphanSalary.length === 0 &&
    transferBad.length === 0

  return NextResponse.json({
    ok,
    expenses: { total: expenseIds.size, missing_ledger: expenseMissing.length, ids: expenseMissing.map((e) => e.id) },
    payments_received: { total: paymentIds.size, missing_ledger: paymentMissing.length, ids: paymentMissing.map((p) => p.id) },
    transfers: { total: transferIds.size, bad: transferBad.length, ids: transferBad.map((t) => t.id) },
    orphan_ledger_expense: ledgerOrphanExpense.length,
    orphan_ledger_salary: ledgerOrphanSalary.length,
  })
}
