import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { getAccountId, LEDGER_CUTOFF_DATE } from "@/lib/ledger"
import { z } from "zod"

const bodySchema = z.object({
  password: z.string().min(1, "Пароль обязателен"),
  opening_balance_card: z.number().int().optional(),
  opening_balance_cash: z.number().int().optional(),
})

/** Full update: user sends desired current balance (computed). We set opening_balance so that computed_balance = value. */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }
  const { password, opening_balance_card, opening_balance_cash } = parsed.data

  if (opening_balance_card === undefined && opening_balance_cash === undefined) {
    return NextResponse.json(
      { error: "Укажите хотя бы один баланс (opening_balance_card или opening_balance_cash)" },
      { status: 400 }
    )
  }

  const email = user.email
  if (!email) {
    return NextResponse.json({ error: "Email не найден" }, { status: 400 })
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    return NextResponse.json(
      { error: "Неверный пароль" },
      { status: 401 }
    )
  }

  const cardId = await getAccountId(supabase, user.id, "card")
  const cashId = await getAccountId(supabase, user.id, "cash")
  if (!cardId || !cashId) {
    return NextResponse.json({ error: "Счета не найдены" }, { status: 500 })
  }

  const { data: ledgerRows } = await supabase
    .from("ledger_entries")
    .select("account_id, direction, amount")
    .eq("user_id", user.id)
    .gte("occurred_on", LEDGER_CUTOFF_DATE)

  const byAccount: Record<string, { in: number; out: number }> = {}
  for (const r of ledgerRows ?? []) {
    if (!byAccount[r.account_id]) byAccount[r.account_id] = { in: 0, out: 0 }
    const amt = Number(r.amount)
    if (r.direction === "in") byAccount[r.account_id].in += amt
    else byAccount[r.account_id].out += amt
  }

  const ledgerDeltaCard = (byAccount[cardId]?.in ?? 0) - (byAccount[cardId]?.out ?? 0)
  const ledgerDeltaCash = (byAccount[cashId]?.in ?? 0) - (byAccount[cashId]?.out ?? 0)

  if (opening_balance_card !== undefined) {
    const newOpeningCard = opening_balance_card - ledgerDeltaCard
    const { error: e1 } = await supabase
      .from("accounts")
      .update({ opening_balance: newOpeningCard, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("user_id", user.id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  }
  if (opening_balance_cash !== undefined) {
    const newOpeningCash = opening_balance_cash - ledgerDeltaCash
    const { error: e2 } = await supabase
      .from("accounts")
      .update({ opening_balance: newOpeningCash, updated_at: new Date().toISOString() })
      .eq("id", cashId)
      .eq("user_id", user.id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
