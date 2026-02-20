import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const year = searchParams.get("year") // filter by year
  const month = searchParams.get("month") // YYYY-MM filter

  const supabase = await createClient()
  let query = supabase
    .from("payments")
    .select("*")
    .eq("user_id", user.id)
    .order("pay_date", { ascending: false })

  if (year) {
    query = query.gte("pay_date", `${year}-01-01`).lte("pay_date", `${year}-12-31`)
  }
  if (month) {
    const [y, m] = month.split("-")
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    query = query.gte("pay_date", `${month}-01`).lte("pay_date", `${month}-${String(lastDay).padStart(2, "0")}`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const body = await request.json()
  const { period, pay_date, amount, received } = body

  if (!period || !pay_date || amount == null) {
    return NextResponse.json(
      { error: "period, pay_date, amount required" },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      period,
      pay_date,
      amount: Number(amount),
      received: received === true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const body = await request.json()
  const { id, received, pay_date, amount } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof received === "boolean") updates.received = received
  if (pay_date) updates.pay_date = pay_date
  if (amount != null) updates.amount = Number(amount)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
