import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { validationErrorResponse, categoryMappingSchema } from "@/lib/api-validation"
import { resolveCategory } from "@/lib/payme-category-mapper"
import * as XLSX from "xlsx"
import { createHash } from "crypto"

const PAYME_SHEET = "Filtered_Cheques"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

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
  chequeState: "Состояние чека",
} as const

export type PaymePreviewRow = {
  date: string
  time: string
  type: string
  merchant: string
  amount: number
  paymeCategory: string
  suggestedCategory: string
  resolvedSource: "transfer" | "memory" | "mapping" | "seed" | "rule" | "ai" | "default"
  exclude_from_budget: boolean
  note: string
  external_id: string
  raw: Record<string, unknown>
}

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
  const str = `${date}|${time}|${amount}|${merchant}|${card}|${type}`
  return createHash("sha256").update(str).digest("hex").slice(0, 32)
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const defaultCategoryId = (formData.get("default_category_id") as string | null)?.trim() || null
  let categoryMapping: Record<string, string> = {}
  const mappingJson = formData.get("category_mapping") as string | null
  if (mappingJson && mappingJson.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(mappingJson)
    } catch {
      return NextResponse.json(
        validationErrorResponse("Некорректный JSON в category_mapping"),
        { status: 400 }
      )
    }
    const mapped = categoryMappingSchema.safeParse(parsed)
    if (!mapped.success) {
      return NextResponse.json(
        validationErrorResponse("category_mapping: ожидается объект с ключами и id категорий (строки)"),
        { status: 400 }
      )
    }
    categoryMapping = mapped.data
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(validationErrorResponse("file required"), { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      validationErrorResponse(`File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB`),
      { status: 400 }
    )
  }
  const contentType = file.type
  if (
    !contentType.includes("spreadsheet") &&
    !contentType.includes("excel") &&
    !file.name.match(/\.(xlsx|xls)$/i)
  ) {
    return NextResponse.json(
      validationErrorResponse("Invalid file type. Expected .xlsx or .xls"),
      { status: 400 }
    )
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "buffer" })
  } catch {
    return NextResponse.json(
      validationErrorResponse("Invalid or unsupported file format"),
      { status: 400 }
    )
  }

  const sheetIdx = wb.SheetNames.findIndex((n) => n === PAYME_SHEET)
  if (sheetIdx < 0) {
    return NextResponse.json(
      validationErrorResponse(`Не найден лист "${PAYME_SHEET}". Убедитесь, что файл экспортирован из Payme.`),
      { status: 400 }
    )
  }

  const ws = wb.Sheets[wb.SheetNames[sheetIdx]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })

  if (rawRows.length === 0) {
    return NextResponse.json({ rows: [], columns: Object.values(PAYME_COLUMNS), total: 0, totalSpend: 0 })
  }

  const sample = rawRows[0] as Record<string, unknown>
  const headers = Object.keys(sample)
  const missing: string[] = []
  for (const [key, col] of Object.entries(PAYME_COLUMNS)) {
    if (!headers.includes(col)) missing.push(col)
  }
  if (missing.length > 0) {
    return NextResponse.json(
      validationErrorResponse(`Отсутствуют колонки: ${missing.join(", ")}`),
      { status: 400 }
    )
  }

  const importOnlySpisanie = formData.get("importOnlySpisanie") !== "false"

  const supabase = await createClient()
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
  const fallbackDefault = appCategories[0]?.id ?? "other"
  const effectiveDefault = defaultCategoryId && appCategories.some((c) => c.id === defaultCategoryId)
    ? defaultCategoryId
    : fallbackDefault

  const rows: PaymePreviewRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i] as Record<string, unknown>
    const type = String(raw[PAYME_COLUMNS.type] ?? "").trim()
    if (importOnlySpisanie && type !== "Списание") continue

    const dateRaw = String(raw[PAYME_COLUMNS.date] ?? "")
    const dateStr = ddMmYyyyToYyyyMmDd(dateRaw) || (dateRaw.match(/^\d{4}-\d{2}-\d{2}/) ? dateRaw.slice(0, 10) : "")
    if (!dateStr) continue

    const time = String(raw[PAYME_COLUMNS.time] ?? "").trim()
    const orgName = String(raw[PAYME_COLUMNS.orgName] ?? "").trim()
    const supplierName = String(raw[PAYME_COLUMNS.supplierName] ?? "").trim()
    const merchant = orgName || supplierName || "Без названия"
    const amount = parseAmount(raw[PAYME_COLUMNS.amount])
    if (amount <= 0) continue

    const paymeCategory = String(raw[PAYME_COLUMNS.category] ?? "").trim()
    const comment = String(raw[PAYME_COLUMNS.comment] ?? "").trim()
    const requisites = String(raw[PAYME_COLUMNS.requisites] ?? "").trim()
    const note = [comment, requisites].filter(Boolean).join(" ").slice(0, 500)
    const card = String(raw[PAYME_COLUMNS.cardNumber] ?? "").trim()

    const resolved = await resolveCategory({
      userId: user.id,
      merchant,
      paymeCategory,
      amount,
      categoryMapping,
      defaultCategoryId: effectiveDefault,
      appCategories,
      supabase,
    })

    const external_id = hashExternalId(dateStr, time, amount, merchant, card, type)

    const catLabel = appCategories.find((c) => c.id === resolved.category_id)?.label ?? resolved.category_id

    rows.push({
      date: dateStr,
      time,
      type,
      merchant,
      amount,
      paymeCategory,
      suggestedCategory: catLabel,
      resolvedSource: resolved.source,
      exclude_from_budget: resolved.exclude_from_budget,
      note,
      external_id,
      raw: raw as Record<string, unknown>,
    })
  }

  const previewRows = rows.slice(0, 30)
  const totalSpend = rows.reduce((s, r) => s + r.amount, 0)
  const uniquePaymeCategories = [...new Set(rows.map((r) => r.paymeCategory).filter(Boolean))].sort()

  return NextResponse.json({
    rows: previewRows,
    total: rows.length,
    totalSpend,
    uniquePaymeCategories,
    columns: Object.values(PAYME_COLUMNS),
  })
}
