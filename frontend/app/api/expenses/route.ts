import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  expensesGetQuerySchema,
  expensesPostBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
  categoryExists,
} from "@/lib/api-validation"
type Range = "today" | "7d" | "15d" | "month"

function getDateRange(range: Range): { date_from: string; date_to: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (range === "today") {
    return { date_from: today, date_to: today }
  }
  const from = new Date(now)
  if (range === "7d") from.setDate(from.getDate() - 6)
  else if (range === "15d") from.setDate(from.getDate() - 14)
  else from.setDate(1)
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: today,
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = expensesGetQuerySchema.safeParse({
    range: searchParams.get("range") ?? "month",
    category_id: searchParams.get("category_id") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    limit: searchParams.get("limit") ?? "100",
    offset: searchParams.get("offset") ?? "0",
    date_from: searchParams.get("date_from") ?? undefined,
    date_to: searchParams.get("date_to") ?? undefined,
    includeExcluded: searchParams.get("includeExcluded") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { range, category_id, search, limit, offset, date_from, date_to, includeExcluded } = parsed.data

  const { date_from: df, date_to: dt } = date_from && date_to
    ? { date_from, date_to }
    : getDateRange(range as Range)

  const supabase = await createClient()
  let query = supabase
    .from("expenses")
    .select("*, category:categories(id, label, color)")
    .eq("user_id", user.id)
    .gte("date", df)
    .lte("date", dt)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1)

  if (includeExcluded !== 1) query = query.eq("exclude_from_budget", false)
  if (category_id) query = query.eq("category_id", category_id)
  if (search) {
    query = query.or(`merchant.ilike.%${search}%,note.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
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
  const parsed = expensesPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { merchant, category_id, amount, date, note, payment_method } = parsed.data

  const supabase = await createClient()
  const exists = await categoryExists(supabase, category_id)
  if (!exists) {
    return NextResponse.json(
      validationErrorResponse("category_id does not exist", { category_id: ["Category not found"] }),
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      merchant,
      category_id,
      amount,
      date,
      note: note ?? null,
      exclude_from_budget: false,
      source_type: "manual",
      payment_method: payment_method ?? "card",
    })
    .select("*, category:categories(id, label, color)")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { ensureAccounts, createExpenseLedger } = await import("@/lib/ledger")
  const accounts = await ensureAccounts(supabase, user.id)
  if (accounts && !data.exclude_from_budget) {
    const ledgerErr = await createExpenseLedger(supabase, {
      id: data.id,
      user_id: user.id,
      amount: data.amount,
      date: data.date,
      merchant: data.merchant,
      note: data.note,
      payment_method: data.payment_method ?? "card",
      exclude_from_budget: data.exclude_from_budget ?? false,
    })
    if (ledgerErr.error) {
      return NextResponse.json({ error: ledgerErr.error }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}
