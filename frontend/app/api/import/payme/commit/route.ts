import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  importPaymeCommitBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
  categoryExists,
} from "@/lib/api-validation"

const EXTERNAL_SOURCE = "payme"

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = importPaymeCommitBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { rows, default_category_id } = parsed.data

  const supabase = await createClient()
  const defaultCat = default_category_id ?? rows[0]?.category_id
  if (!defaultCat) {
    return NextResponse.json(
      validationErrorResponse("default_category_id or category_id in rows required"),
      { status: 400 }
    )
  }

  const exists = await categoryExists(supabase, defaultCat)
  if (!exists) {
    return NextResponse.json(
      validationErrorResponse("default_category_id does not exist", { default_category_id: ["Category not found"] }),
      { status: 400 }
    )
  }

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const categoryId = row.category_id || defaultCat
    const catExists = await categoryExists(supabase, categoryId)
    if (!catExists) {
      skipped++
      continue
    }

    const externalId = row.external_id ?? `payme-${row.date}-${row.amount}-${row.merchant}`
    const { error } = await supabase.from("expenses").insert({
      user_id: user.id,
      merchant: row.merchant,
      category_id: categoryId,
      amount: row.amount,
      date: row.date,
      note: row.note ?? null,
      external_source: EXTERNAL_SOURCE,
      external_id: externalId,
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
    inserted,
    skipped,
    total: rows.length,
  })
}
