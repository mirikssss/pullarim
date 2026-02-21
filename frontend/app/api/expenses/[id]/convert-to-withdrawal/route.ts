import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { normalizeMerchant } from "@/lib/merchant-normalize"
import { ensureAccounts, createTransferLedger, deleteExpenseLedger } from "@/lib/ledger"

/** Convert an expense (UZCASH or transfers+exclude) into a Card->Cash transfer and remove expense from ledger. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { id } = await params
  const supabase = await createClient()

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, amount, date, merchant, category_id, exclude_from_budget")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!expense) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const norm = normalizeMerchant(expense.merchant ?? "")
  const isUzcash = /uzcash/i.test(norm || (expense.merchant ?? ""))
  const isTransferExcluded =
    expense.category_id === "transfers" && expense.exclude_from_budget
  if (!isUzcash && !isTransferExcluded) {
    return NextResponse.json(
      { error: "Only UZCASH or transfer/excluded operations can be converted to withdrawal" },
      { status: 400 }
    )
  }

  const accounts = await ensureAccounts(supabase, user.id)
  if (!accounts) {
    return NextResponse.json({ error: "Accounts not found" }, { status: 500 })
  }

  const { data: transfer, error: transferInsertErr } = await supabase
    .from("transfers")
    .insert({
      user_id: user.id,
      from_account_id: accounts.cardId,
      to_account_id: accounts.cashId,
      amount: expense.amount,
      date: expense.date,
      note: "Снятие наличных",
    })
    .select()
    .single()
  if (transferInsertErr) {
    return NextResponse.json({ error: transferInsertErr.message }, { status: 500 })
  }

  const ledgerErr = await createTransferLedger(supabase, {
    userId: user.id,
    transferId: transfer.id,
    fromAccountId: accounts.cardId,
    toAccountId: accounts.cashId,
    amount: expense.amount,
    date: expense.date,
    note: "Снятие наличных",
  })
  if (ledgerErr.error) {
    await supabase.from("transfers").delete().eq("id", transfer.id).eq("user_id", user.id)
    return NextResponse.json({ error: ledgerErr.error }, { status: 500 })
  }

  await deleteExpenseLedger(supabase, user.id, expense.id)

  const { error: updateErr } = await supabase
    .from("expenses")
    .update({
      exclude_from_budget: true,
      source_type: "cash_withdrawal",
    })
    .eq("id", id)
    .eq("user_id", user.id)
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    transfer_id: transfer.id,
    expense_id: id,
  })
}
