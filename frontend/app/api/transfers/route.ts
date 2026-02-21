import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  transfersPostBodySchema,
  transfersGetQuerySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"
import { createTransferLedger } from "@/lib/ledger"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = transfersGetQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? "50",
  })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { from, to, limit } = parsed.data

  const supabase = await createClient()
  let query = supabase
    .from("transfers")
    .select("id, from_account_id, to_account_id, amount, date, note, created_at, from_account:accounts!from_account_id(type, name), to_account:accounts!to_account_id(type, name)")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(limit)
  if (from) query = query.gte("date", from)
  if (to) query = query.lte("date", to)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = (data ?? []).map((t) => ({
    id: t.id,
    from_account_id: t.from_account_id,
    to_account_id: t.to_account_id,
    from_account: (t as { from_account?: { type: string; name: string } }).from_account,
    to_account: (t as { to_account?: { type: string; name: string } }).to_account,
    amount: Number(t.amount),
    date: t.date,
    note: t.note,
    created_at: t.created_at,
  }))

  return NextResponse.json(list)
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = transfersPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { from_account_id, to_account_id, amount, date, note } = parsed.data

  if (from_account_id === to_account_id) {
    return NextResponse.json(
      validationErrorResponse("from_account_id and to_account_id must differ"),
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("user_id", user.id)
    .in("id", [from_account_id, to_account_id])
  const ids = new Set((accounts ?? []).map((a) => a.id))
  if (!ids.has(from_account_id) || !ids.has(to_account_id)) {
    return NextResponse.json(
      validationErrorResponse("Invalid account ids or not owned by user"),
      { status: 400 }
    )
  }

  const { data: transfer, error: insertErr } = await supabase
    .from("transfers")
    .insert({
      user_id: user.id,
      from_account_id,
      to_account_id,
      amount,
      date,
      note: note ?? null,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const ledgerErr = await createTransferLedger(supabase, {
    userId: user.id,
    transferId: transfer.id,
    fromAccountId: from_account_id,
    toAccountId: to_account_id,
    amount,
    date,
    note,
  })
  if (ledgerErr.error) {
    await supabase.from("transfers").delete().eq("id", transfer.id).eq("user_id", user.id)
    return NextResponse.json({ error: ledgerErr.error }, { status: 500 })
  }

  return NextResponse.json(transfer)
}
