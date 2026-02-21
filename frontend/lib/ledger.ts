/**
 * Ledger service: keep balance as computed from ledger (opening_balance + in - out).
 * All mutations go through this module so ledger stays in sync.
 * Movements before LEDGER_CUTOFF_DATE are not applied to balance (opening_balance = balance as of that day).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/** Only ledger entries with occurred_on >= this date affect computed balance. */
export const LEDGER_CUTOFF_DATE = process.env.LEDGER_CUTOFF_DATE ?? "2026-02-20"

export type AccountType = "card" | "cash"

export interface ExpenseRow {
  id: string
  user_id: string
  amount: number
  date: string
  merchant: string
  note?: string | null
  payment_method?: string | null
  /** Если true — перевод/не в бюджете, в леджер не пишем и не минусуем баланс. */
  exclude_from_budget?: boolean
}

export interface PaymentRow {
  id: string
  user_id: string
  pay_date: string
  amount: number
  received: boolean
}

/** Get account id by user and type. Creates account if missing (e.g. after schema migration). */
export async function getAccountId(
  supabase: SupabaseClient,
  userId: string,
  type: AccountType
): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .maybeSingle()
  return data?.id ?? null
}

/** Ensure user has card and cash accounts; returns card id and cash id. */
export async function ensureAccounts(supabase: SupabaseClient, userId: string): Promise<{ cardId: string; cashId: string } | null> {
  const { data: existing } = await supabase.from("accounts").select("id, type").eq("user_id", userId)
  const card = existing?.find((r) => r.type === "card")
  const cash = existing?.find((r) => r.type === "cash")

  let cardId = card?.id
  let cashId = cash?.id

  if (!cardId) {
    const { data: insCard, error: eCard } = await supabase
      .from("accounts")
      .insert({ user_id: userId, type: "card", name: "Card" })
      .select("id")
      .single()
    if (eCard) return null
    cardId = insCard?.id
  }
  if (!cashId) {
    const { data: insCash, error: eCash } = await supabase
      .from("accounts")
      .insert({ user_id: userId, type: "cash", name: "Cash" })
      .select("id")
      .single()
    if (eCash) return null
    cashId = insCash?.id
  }
  return cardId && cashId ? { cardId, cashId } : null
}

/** Create one ledger OUT entry for a new expense. Не создаём запись, если exclude_from_budget — это перевод, не расход. */
export async function createExpenseLedger(supabase: SupabaseClient, expense: ExpenseRow): Promise<{ error: string | null }> {
  if (expense.exclude_from_budget) return { error: null }

  const method = (expense.payment_method === "cash" ? "cash" : "card") as AccountType
  const accountId = await getAccountId(supabase, expense.user_id, method)
  if (!accountId) return { error: "Account not found" }

  const { error } = await supabase.from("ledger_entries").insert({
    user_id: expense.user_id,
    account_id: accountId,
    direction: "out",
    amount: expense.amount,
    occurred_on: expense.date,
    source_type: "expense",
    source_id: expense.id,
    merchant: expense.merchant,
    note: expense.note ?? null,
  })
  return { error: error?.message ?? null }
}

/** Update ledger after expense change. Если «не в бюджете» — запись в леджере удаляем (перевод не минусует баланс). */
export async function updateExpenseLedger(
  supabase: SupabaseClient,
  before: ExpenseRow & { exclude_from_budget?: boolean },
  after: ExpenseRow & { exclude_from_budget?: boolean }
): Promise<{ error: string | null }> {
  const afterExcluded = !!after.exclude_from_budget
  const beforeExcluded = !!before.exclude_from_budget

  if (afterExcluded) {
    const beforeMethod = (before.payment_method === "cash" ? "cash" : "card") as AccountType
    const beforeAccountId = await getAccountId(supabase, before.user_id, beforeMethod)
    if (beforeAccountId) {
      await supabase
        .from("ledger_entries")
        .delete()
        .eq("source_type", "expense")
        .eq("source_id", before.id)
        .eq("account_id", beforeAccountId)
    }
    return { error: null }
  }

  const beforeMethod = (before.payment_method === "cash" ? "cash" : "card") as AccountType
  const afterMethod = (after.payment_method === "cash" ? "cash" : "card") as AccountType
  const sameAccount = beforeMethod === afterMethod
  const changed =
    before.amount !== after.amount ||
    before.date !== after.date ||
    before.merchant !== after.merchant ||
    (before.note ?? null) !== (after.note ?? null)

  const afterAccountId = await getAccountId(supabase, after.user_id, afterMethod)
  if (!afterAccountId) return { error: "Account not found" }

  if (beforeExcluded) {
    const { error: insErr } = await supabase.from("ledger_entries").insert({
      user_id: after.user_id,
      account_id: afterAccountId,
      direction: "out",
      amount: after.amount,
      occurred_on: after.date,
      source_type: "expense",
      source_id: after.id,
      merchant: after.merchant,
      note: after.note ?? null,
    })
    return { error: insErr?.message ?? null }
  }

  const beforeAccountId = await getAccountId(supabase, before.user_id, beforeMethod)
  if (!beforeAccountId) return { error: "Account not found" }

  if (sameAccount && !changed) return { error: null }

  if (!sameAccount) {
    const { error: delErr } = await supabase
      .from("ledger_entries")
      .delete()
      .eq("source_type", "expense")
      .eq("source_id", before.id)
      .eq("account_id", beforeAccountId)
    if (delErr) return { error: delErr.message }
    const { error: insErr } = await supabase.from("ledger_entries").insert({
      user_id: after.user_id,
      account_id: afterAccountId,
      direction: "out",
      amount: after.amount,
      occurred_on: after.date,
      source_type: "expense",
      source_id: after.id,
      merchant: after.merchant,
      note: after.note ?? null,
    })
    return { error: insErr?.message ?? null }
  }

  const { error: updErr } = await supabase
    .from("ledger_entries")
    .update({
      amount: after.amount,
      occurred_on: after.date,
      merchant: after.merchant,
      note: after.note ?? null,
    })
    .eq("source_type", "expense")
    .eq("source_id", before.id)
    .eq("account_id", beforeAccountId)
  return { error: updErr?.message ?? null }
}

/** Remove ledger entry for deleted expense. */
export async function deleteExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expenseId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "expense")
    .eq("source_id", expenseId)
  return { error: error?.message ?? null }
}

/** Create ledger IN for salary payment (Card only). Called when payment is marked received. */
export async function createSalaryIncomeLedger(
  supabase: SupabaseClient,
  payment: PaymentRow
): Promise<{ error: string | null }> {
  if (!payment.received) return { error: null }
  const accountId = await getAccountId(supabase, payment.user_id, "card")
  if (!accountId) return { error: "Card account not found" }

  const { error } = await supabase.from("ledger_entries").insert({
    user_id: payment.user_id,
    account_id: accountId,
    direction: "in",
    amount: payment.amount,
    occurred_on: payment.pay_date,
    source_type: "salary_payment",
    source_id: payment.id,
    merchant: null,
    note: "Зарплата",
  })
  return { error: error?.message ?? null }
}

/** Create two ledger entries for a transfer: out from fromAccount, in to toAccount. */
export async function createTransferLedger(
  supabase: SupabaseClient,
  params: {
    userId: string
    transferId: string
    fromAccountId: string
    toAccountId: string
    amount: number
    date: string
    note?: string | null
  }
): Promise<{ error: string | null }> {
  const { userId, transferId, fromAccountId, toAccountId, amount, date, note } = params
  const { error: outErr } = await supabase.from("ledger_entries").insert({
    user_id: userId,
    account_id: fromAccountId,
    direction: "out",
    amount,
    occurred_on: date,
    source_type: "transfer",
    source_id: transferId,
    merchant: null,
    note: note ?? "Перевод",
  })
  if (outErr) return { error: outErr.message }
  const { error: inErr } = await supabase.from("ledger_entries").insert({
    user_id: userId,
    account_id: toAccountId,
    direction: "in",
    amount,
    occurred_on: date,
    source_type: "transfer",
    source_id: transferId,
    merchant: null,
    note: note ?? "Перевод",
  })
  return { error: inErr?.message ?? null }
}

/** Check if ledger entry already exists for this source (idempotent). */
export async function hasLedgerEntryForPayment(
  supabase: SupabaseClient,
  paymentId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("source_type", "salary_payment")
    .eq("source_id", paymentId)
    .limit(1)
  return (data?.length ?? 0) > 0
}
