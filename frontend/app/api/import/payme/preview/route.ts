import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { validationErrorResponse } from "@/lib/api-validation"
import * as XLSX from "xlsx"

/** Normalized row for preview */
export type PaymePreviewRow = {
  merchant: string
  amount: number
  date: string
  note?: string
  external_id?: string
  raw: Record<string, unknown>
}

/** Common column name mappings for Payme-style exports */
const COLUMN_ALIASES: Record<string, string[]> = {
  merchant: ["merchant", "название", "описание", "description", "получатель", "recipient", "кард", "card", "магазин", "store"],
  amount: ["amount", "сумма", "sum", "сумм", "amount_sum", "сумма операции"],
  date: ["date", "дата", "create_time", "pay_time", "время", "time"],
  note: ["note", "заметка", "comment", "описание", "description"],
}

function findColumn(row: Record<string, unknown>, aliases: string[]): string | null {
  const keys = Object.keys(row).map((k) => k.toLowerCase().trim())
  for (const alias of aliases) {
    const found = keys.find((k) => k.includes(alias) || alias.includes(k))
    if (found) {
      const orig = Object.keys(row).find((k) => k.toLowerCase().trim() === found)
      return orig ?? null
    }
  }
  return null
}

function parseAmount(val: unknown): number {
  if (typeof val === "number" && !Number.isNaN(val)) return Math.round(val)
  if (typeof val === "string") {
    const cleaned = val.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "")
    const n = parseFloat(cleaned)
    return Number.isNaN(n) ? 0 : Math.round(n)
  }
  return 0
}

function parseDate(val: unknown): string {
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10)
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === "number") {
    const d = new Date(val)
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === "string") {
    const parsed = new Date(val)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      validationErrorResponse("file required"),
      { status: 400 }
    )
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "buffer" })
  } catch (e) {
    return NextResponse.json(
      validationErrorResponse("Invalid or unsupported file format"),
      { status: 400 }
    )
  }

  const firstSheet = wb.SheetNames[0]
  const ws = wb.Sheets[firstSheet]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })

  if (rawRows.length === 0) {
    return NextResponse.json({ rows: [], columns: [] })
  }

  const sample = rawRows[0] as Record<string, unknown>
  const merchantCol = findColumn(sample, COLUMN_ALIASES.merchant)
  const amountCol = findColumn(sample, COLUMN_ALIASES.amount)
  const dateCol = findColumn(sample, COLUMN_ALIASES.date)
  const noteCol = findColumn(sample, COLUMN_ALIASES.note)

  const rows: PaymePreviewRow[] = rawRows.map((raw, idx) => {
    const merchant = String(merchantCol ? raw[merchantCol] ?? "" : "").trim() || "Без названия"
    const amount = parseAmount(amountCol ? raw[amountCol] : 0)
    const date = parseDate(dateCol ? raw[dateCol] : new Date())
    const note = noteCol ? String(raw[noteCol] ?? "").trim() || undefined : undefined
    const external_id = raw._id ? String(raw._id) : `payme-${idx}-${date}-${amount}`

    return {
      merchant,
      amount,
      date,
      note,
      external_id,
      raw: raw as Record<string, unknown>,
    }
  }).filter((r) => r.amount > 0)

  const columns = Object.keys(sample)

  return NextResponse.json({
    rows,
    columns,
    mapping: {
      merchant: merchantCol,
      amount: amountCol,
      date: dateCol,
      note: noteCol,
    },
  })
}
