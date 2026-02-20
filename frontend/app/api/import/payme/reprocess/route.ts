import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { resolveCategory } from "@/lib/payme-category-mapper"

/**
 * Re-categorize expenses from last 30 days that are in "other".
 * Uses the full resolveCategory pipeline (memory → mapping → rule → AI → default).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()

  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 30)
  const dateFrom = from.toISOString().slice(0, 10)
  const dateTo = today.toISOString().slice(0, 10)

  const { data: expenses, error: fetchError } = await supabase
    .from("expenses")
    .select("id, merchant, amount, date, category_id")
    .eq("user_id", user.id)
    .eq("category_id", "other")
    .gte("date", dateFrom)
    .lte("date", dateTo)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const { data: defaultCats = [] } = await supabase
    .from("categories")
    .select("id, label")
    .eq("is_default", true)
    .is("user_id", null)
  const { data: userCats = [] } = await supabase
    .from("categories")
    .select("id, label")
    .eq("user_id", user.id)
  const appCategories = [...(defaultCats ?? []), ...(userCats ?? [])] as { id: string; label: string }[]

  let updated = 0
  for (const exp of expenses ?? []) {
    const resolved = await resolveCategory({
      userId: user.id,
      merchant: exp.merchant ?? "Без названия",
      paymeCategory: "",
      amount: exp.amount ?? 0,
      categoryMapping: {},
      defaultCategoryId: "other",
      appCategories,
      supabase,
    })
    if (resolved.category_id !== "other") {
      const { error } = await supabase
        .from("expenses")
        .update({ category_id: resolved.category_id })
        .eq("id", exp.id)
        .eq("user_id", user.id)
      if (!error) updated++
    }
  }

  return NextResponse.json({
    total_in_other: (expenses ?? []).length,
    updated,
    date_from: dateFrom,
    date_to: dateTo,
  })
}
