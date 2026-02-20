import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { validationErrorResponse, categoryExists } from "@/lib/api-validation"
import { resolveCategory } from "@/lib/payme-category-mapper"
import * as XLSX from "xlsx"
import { createHash } from "crypto"

const PAYME_SHEET = "Filtered_Cheques"
const MAX_FILE_SIZE = 10 * 1024 * 1024

const PAYME_COLUMNS = {
  date: "Дата платежа",
  time: "Время платежа",
  type: "Тип операции",
  supplierName: "Имя поставщика",
  orgName: "Название организации поставщика",
  amount: "Сумма платежа",
  category: "Категория",
  comment: "Комментарий к платежу",
  requisites: "Реквизиты платежа",
  cardNumber: "Номер карты",
} as const

function ddMmYyyyToYyyyMmDd(val: string): string {
  const m = val.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/)
  if (!m) return ""
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

function parseAmount(val: unknown): number {
  if (typeof val === "number" && !Number.isNaN(val)) return Math.round(Math.abs(val))
  if (typeof val === "string") {
    const cleaned = val.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "")
    const n = parseFloat(cleaned)
    return Number.isNaN(n) ? 0 : Math.round(Math.abs(n))
  }
  return 0
}

function hashExternalId(date: string, time: string, amount: number, merchant: string, card: string, type: string): string {
  return createHash("sha256").update(`${date}|${time}|${amount}|${merchant}|${card}|${type}`).digest("hex").slice(0, 32)
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const defaultCategoryId = formData.get("default_category_id") as string | null
  const importOnlySpisanie = formData.get("importOnlySpisanie") !== "false"
  const categoryMappingJson = formData.get("category_mapping") as string | null

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(validationErrorResponse("file required"), { status: 400 })
  }
  if (!defaultCategoryId?.trim()) {
    return NextResponse.json(
      validationErrorResponse("default_category_id required"),
      { status: 400 }
    )
  }

  let categoryMapping: Record<string, string> = {}
  if (categoryMappingJson) {
    try {
      categoryMapping = JSON.parse(categoryMappingJson) as Record<string, string>
    } catch {
      // ignore
    }
  }

  const supabase = await createClient()
  const catExists = await categoryExists(supabase, defaultCategoryId)
  if (!catExists) {
    return NextResponse.json(
      validationErrorResponse("default_category_id does not exist", { default_category_id: ["Category not found"] }),
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(validationErrorResponse("File too large"), { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "buffer" })
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid file format"), { status: 400 })
  }

  const sheetIdx = wb.SheetNames.findIndex((n) => n === PAYME_SHEET)
  if (sheetIdx < 0) {
    return NextResponse.json(
      validationErrorResponse(`Не найден лист "${PAYME_SHEET}"`),
      { status: 400 }
    )
  }

  const ws = wb.Sheets[wb.SheetNames[sheetIdx]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
  const sample = rawRows[0] as Record<string, unknown>
  const headers = Object.keys(sample)
  const hasRequired = Object.values(PAYME_COLUMNS).every((c) => headers.includes(c))
  if (!hasRequired) {
    return NextResponse.json(
      validationErrorResponse("Отсутствуют обязательные колонки"),
      { status: 400 }
    )
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

  const rows: { merchant: string; amount: number; date: string; note: string; category_id: string; external_id: string; exclude_from_budget: boolean; source_type: string }[] = []
  for (const raw of rawRows) {
    const r = raw as Record<string, unknown>
    const type = String(r[PAYME_COLUMNS.type] ?? "").trim()
    if (importOnlySpisanie && type !== "Списание") continue

    const dateRaw = String(r[PAYME_COLUMNS.date] ?? "")
    const dateStr = ddMmYyyyToYyyyMmDd(dateRaw) || (dateRaw.match(/^\d{4}-\d{2}-\d{2}/) ? dateRaw.slice(0, 10) : "")
    if (!dateStr) continue

    const time = String(r[PAYME_COLUMNS.time] ?? "").trim()
    const orgName = String(r[PAYME_COLUMNS.orgName] ?? "").trim()
    const supplierName = String(r[PAYME_COLUMNS.supplierName] ?? "").trim()
    const merchant = orgName || supplierName || "Без названия"
    const amount = parseAmount(r[PAYME_COLUMNS.amount])
    if (amount <= 0) continue

    const paymeCategory = String(r[PAYME_COLUMNS.category] ?? "").trim()
    const comment = String(r[PAYME_COLUMNS.comment] ?? "").trim()
    const requisites = String(r[PAYME_COLUMNS.requisites] ?? "").trim()
    const note = [comment, requisites].filter(Boolean).join(" ").slice(0, 500)
    const card = String(r[PAYME_COLUMNS.cardNumber] ?? "").trim()

    const resolved = await resolveCategory({
      userId: user.id,
      merchant,
      paymeCategory,
      amount,
      categoryMapping,
      defaultCategoryId,
      appCategories,
      supabase,
    })
    const external_id = hashExternalId(dateStr, time, amount, merchant, card, type)

    rows.push({
      merchant,
      amount,
      date: dateStr,
      note,
      category_id: resolved.category_id,
      external_id,
      exclude_from_budget: resolved.exclude_from_budget,
      source_type: resolved.source_type,
    })
  }

  let inserted = 0
  let skipped = 0
  const skippedRows: { reason: string; count: number }[] = []

  for (const row of rows) {
    const catExists = await categoryExists(supabase, row.category_id)
    if (!catExists) {
      skipped++
      continue
    }

    const { error } = await supabase.from("expenses").insert({
      user_id: user.id,
      merchant: row.merchant.slice(0, 120),
      category_id: row.category_id,
      amount: row.amount,
      date: row.date,
      note: row.note || null,
      external_source: "payme",
      external_id: row.external_id,
      exclude_from_budget: row.exclude_from_budget,
      source_type: row.source_type,
    })

    if (error) {
      if (error.code === "23505") {
        skipped++
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      inserted++
    }
  }

  return NextResponse.json({
    count_inserted: inserted,
    count_skipped_duplicates: skipped,
    total: rows.length,
    skipped_rows: skippedRows,
  })
}
