import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { getAccountId } from "@/lib/ledger"
import { z } from "zod"

const bodySchema = z.object({
  password: z.string().min(1, "Пароль обязателен"),
  opening_balance_card: z.number().int().optional(),
  opening_balance_cash: z.number().int().optional(),
})

/** Update opening_balance for card/cash. Requires current password. */
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

  if (opening_balance_card !== undefined) {
    const { error: e1 } = await supabase
      .from("accounts")
      .update({ opening_balance: opening_balance_card, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("user_id", user.id)
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  }
  if (opening_balance_cash !== undefined) {
    const { error: e2 } = await supabase
      .from("accounts")
      .update({ opening_balance: opening_balance_cash, updated_at: new Date().toISOString() })
      .eq("id", cashId)
      .eq("user_id", user.id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
