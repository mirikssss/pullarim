import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { ensureAccounts, LEDGER_CUTOFF_DATE } from "@/lib/ledger"

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  const accounts = await ensureAccounts(supabase, user.id)
  if (!accounts) {
    return NextResponse.json({ error: "Failed to ensure accounts" }, { status: 500 })
  }

  const { data: accountRows, error } = await supabase
    .from("accounts")
    .select("id, type, name, opening_balance, created_at")
    .eq("user_id", user.id)
    .order("type")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: ledgerSums } = await supabase
    .from("ledger_entries")
    .select("account_id, direction, amount")
    .eq("user_id", user.id)
    .gte("occurred_on", LEDGER_CUTOFF_DATE)

  const byAccount: Record<string, { in: number; out: number }> = {}
  for (const r of ledgerSums ?? []) {
    if (!byAccount[r.account_id]) byAccount[r.account_id] = { in: 0, out: 0 }
    const amt = Number(r.amount)
    if (r.direction === "in") byAccount[r.account_id].in += amt
    else byAccount[r.account_id].out += amt
  }

  const list = (accountRows ?? []).map((a) => {
    const sums = byAccount[a.id] ?? { in: 0, out: 0 }
    const computed_balance = Number(a.opening_balance) + sums.in - sums.out
    return {
      id: a.id,
      type: a.type,
      name: a.name,
      opening_balance: Number(a.opening_balance),
      computed_balance,
      created_at: a.created_at,
    }
  })

  const total = list.reduce((s, a) => s + a.computed_balance, 0)
  return NextResponse.json({ accounts: list, total })
}
