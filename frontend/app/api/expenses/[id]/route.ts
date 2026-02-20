import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  expensesPatchBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
  categoryExists,
} from "@/lib/api-validation"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = expensesPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { merchant, category_id, amount, date, note } = parsed.data

  const supabase = await createClient()
  if (category_id !== undefined) {
    const exists = await categoryExists(supabase, category_id)
    if (!exists) {
      return NextResponse.json(
        validationErrorResponse("category_id does not exist", { category_id: ["Category not found"] }),
        { status: 400 }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  if (merchant !== undefined) updates.merchant = merchant
  if (category_id !== undefined) updates.category_id = category_id
  if (amount !== undefined) updates.amount = amount
  if (date !== undefined) updates.date = date
  if (note !== undefined) updates.note = note

  const { data, error } = await supabase
    .from("expenses")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, category:categories(id, label, color)")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { id } = await params
  const supabase = await createClient()
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
