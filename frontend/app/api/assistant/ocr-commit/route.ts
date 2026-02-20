import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { categoryExists } from "@/lib/api-validation"

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const ocrCommitBodySchema = z.object({
  items: z.array(
    z.object({
      amount: z.number().int().positive(),
      date: dateStr,
      merchant: z.string().min(1).max(120),
      category_id: z.string().optional(),
      note: z.string().max(500).optional(),
    })
  ),
})

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, { status: 400 })
  }

  const parsed = ocrCommitBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    )
  }

  const { items } = parsed.data
  const supabase = await createClient()
  const created: string[] = []

  for (const item of items) {
    const category_id = item.category_id ?? "other"
    const exists = await categoryExists(supabase, category_id)
    if (!exists) continue

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        user_id: user.id,
        merchant: item.merchant.trim(),
        category_id,
        amount: item.amount,
        date: item.date,
        note: item.note ?? null,
      })
      .select("id")
      .single()

    if (!error && data) created.push(data.id)
  }

  return NextResponse.json({ inserted_count: created.length, created_ids: created })
}
