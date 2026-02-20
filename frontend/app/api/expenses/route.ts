import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

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
  const range = (searchParams.get("range") as Range) ?? "month"
  const category_id = searchParams.get("category_id")
  const search = searchParams.get("search")
  const limit = parseInt(searchParams.get("limit") ?? "100", 10)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const date_from = searchParams.get("date_from")
  const date_to = searchParams.get("date_to")

  const { date_from: df, date_to: dt } = date_from && date_to
    ? { date_from, date_to }
    : getDateRange(range)

  const supabase = await createClient()
  let query = supabase
    .from("expenses")
    .select("*, category:categories(id, label, color)")
    .eq("user_id", user.id)
    .gte("date", df)
    .lte("date", dt)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1)

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

  const body = await request.json()
  const { merchant, category_id, amount, date, note } = body

  if (!merchant || !category_id || amount == null) {
    return NextResponse.json(
      { error: "merchant, category_id, amount required" },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      merchant: String(merchant).trim() || "Без названия",
      category_id,
      amount: Number(amount) || 0,
      date: date ?? new Date().toISOString().slice(0, 10),
      note: note ?? null,
    })
    .select("*, category:categories(id, label, color)")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
