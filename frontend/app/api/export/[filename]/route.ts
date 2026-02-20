import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  exportQuerySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"
import * as XLSX from "xlsx"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  if (filename !== "expenses.xlsx") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = exportQuerySchema.safeParse({
    format: "xlsx",
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    category_id: searchParams.get("category_id") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { from, to, category_id, q } = parsed.data

  const supabase = await createClient()
  let query = supabase
    .from("expenses")
    .select("id, merchant, category_id, amount, date, note, created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })

  if (from) query = query.gte("date", from)
  if (to) query = query.lte("date", to)
  if (category_id) query = query.eq("category_id", category_id)
  if (q) query = query.or(`merchant.ilike.%${q}%,note.ilike.%${q}%`)

  const { data: expenses, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const list = expenses ?? []
  const totalSpend = list.reduce((s, e) => s + (e.amount ?? 0), 0)
  const summaryRow = {
    Дата: `Итого: ${list.length} записей, период ${from ?? "—"} — ${to ?? "—"}`,
    Название: "",
    Категория: "",
    "Сумма (сум)": totalSpend,
    Заметка: "",
  }
  const dataRows = list.map((e) => ({
    Дата: e.date,
    Название: e.merchant ?? "",
    Категория: e.category_id,
    "Сумма (сум)": e.amount,
    Заметка: e.note ?? "",
  }))
  const rows = [summaryRow, ...dataRows]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, "Расходы")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pullarim-expenses-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
