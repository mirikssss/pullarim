import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { getAccountId } from "@/lib/ledger"
import { z } from "zod"

const querySchema = z.object({
  account: z.enum(["card", "cash", "all"]).optional().default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

const SOURCE_LABELS: Record<string, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  salary_payment: "Зарплата",
  cash_withdrawal: "Снятие наличных",
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    account: searchParams.get("account") ?? "all",
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? "100",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }
  const { account, from, to, limit } = parsed.data

  const supabase = await createClient()
  let accountIds: string[] | null = null
  if (account !== "all") {
    const id = await getAccountId(supabase, user.id, account)
    if (!id) return NextResponse.json({ error: "Account not found" }, { status: 404 })
    accountIds = [id]
  }

  let query = supabase
    .from("ledger_entries")
    .select("id, account_id, direction, amount, occurred_on, source_type, source_id, merchant, note, created_at, account:accounts(type, name)")
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (accountIds) query = query.in("account_id", accountIds)
  if (from) query = query.gte("occurred_on", from)
  if (to) query = query.lte("occurred_on", to)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const entries = (data ?? []).map((r) => {
    const acc = r.account as { type?: string; name?: string } | null
    return {
      id: r.id,
      account_id: r.account_id,
      account_type: acc?.type ?? null,
      account_name: acc?.name ?? null,
      direction: r.direction,
      amount: Number(r.amount),
      occurred_on: r.occurred_on,
      source_type: r.source_type,
      source_id: r.source_id,
      source_label: SOURCE_LABELS[r.source_type] ?? r.source_type,
      merchant: r.merchant,
      note: r.note,
      created_at: r.created_at,
    }
  })

  return NextResponse.json({ entries })
}
