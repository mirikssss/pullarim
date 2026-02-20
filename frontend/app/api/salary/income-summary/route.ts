import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

const DEFAULT_FROM = "2026-01-05"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const from = searchParams.get("from") ?? DEFAULT_FROM
  const to = searchParams.get("to") ?? today

  const supabase = await createClient()
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", user.id)
    .eq("received", true)
    .gte("pay_date", from)
    .lte("pay_date", to)
    .order("pay_date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = payments ?? []
  const total_received = list.reduce((sum, p) => sum + Number(p.amount), 0)

  return NextResponse.json({
    from,
    to,
    total_received,
    payments: list,
  })
}
