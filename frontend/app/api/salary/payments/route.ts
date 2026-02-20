import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  paymentsPostBodySchema,
  paymentsPatchBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = paymentsPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { period, pay_date, amount, received } = parsed.data

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = paymentsPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { id, received, pay_date, amount } = parsed.data

  const updates: Record<string, unknown> = {}
  if (typeof received === "boolean") updates.received = received
  if (pay_date) updates.pay_date = pay_date
  if (amount != null) updates.amount = amount

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
