import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const format = searchParams.get("format") ?? "csv"

  if (format !== "csv") {
    return NextResponse.json({ error: "Only CSV supported" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, merchant, category_id, amount, date, note, created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const headers = ["Дата", "Название", "Категория", "Сумма (сум)", "Заметка"]
  const rows = (expenses ?? []).map((e) => [
    e.date,
    `"${(e.merchant ?? "").replace(/"/g, '""')}"`,
    e.category_id,
    e.amount,
    `"${(e.note ?? "").replace(/"/g, '""')}"`,
  ])

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  const bom = "\uFEFF"

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pullarim-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
