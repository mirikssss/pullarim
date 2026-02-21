import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  expensesPatchBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
  categoryExists,
} from "@/lib/api-validation"
import { upsertMerchantMemory } from "@/lib/payme-category-mapper"
import { normalizeMerchant } from "@/lib/merchant-normalize"

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
  const { merchant, category_id, amount, date, note, exclude_from_budget, payment_method } = parsed.data

  const supabase = await createClient()

  const { data: before } = await supabase
    .from("expenses")
    .select("merchant, category_id, amount, date, note, payment_method, exclude_from_budget")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const beforeId = id

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
  if (exclude_from_budget !== undefined) updates.exclude_from_budget = exclude_from_budget
  if (payment_method !== undefined) updates.payment_method = payment_method

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

  const { ensureAccounts, updateExpenseLedger } = await import("@/lib/ledger")
  const accounts = await ensureAccounts(supabase, user.id)
  if (accounts) {
    const afterRow = {
      id: data.id,
      user_id: user.id,
      amount: data.amount,
      date: data.date,
      merchant: data.merchant,
      note: data.note,
      payment_method: data.payment_method ?? "card",
      exclude_from_budget: data.exclude_from_budget ?? false,
    }
    const beforeRow = {
      id: beforeId,
      user_id: user.id,
      amount: before.amount,
      date: before.date,
      merchant: before.merchant,
      note: before.note,
      payment_method: before.payment_method ?? "card",
      exclude_from_budget: before.exclude_from_budget ?? false,
    }
    const ledgerErr = await updateExpenseLedger(supabase, beforeRow, afterRow)
    if (ledgerErr.error) {
      return NextResponse.json({ error: ledgerErr.error }, { status: 500 })
    }
  }

  // Learning loop: when user edits category or exclude_from_budget, save to merchant memory
  const finalMerchant = (merchant ?? before?.merchant ?? data.merchant) as string
  const finalCategoryId = category_id ?? data.category_id
  const m = normalizeMerchant(finalMerchant)
  if (m && (category_id !== undefined || exclude_from_budget !== undefined)) {
    const includeOverride = exclude_from_budget !== undefined
      ? !exclude_from_budget
      : undefined
    await upsertMerchantMemory(supabase, user.id, m, finalCategoryId, -1, includeOverride)
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

  const { deleteExpenseLedger } = await import("@/lib/ledger")
  await deleteExpenseLedger(supabase, user.id, id)

  return NextResponse.json({ success: true })
}
