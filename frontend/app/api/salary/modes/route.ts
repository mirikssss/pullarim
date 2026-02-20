import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  salaryModesPostBodySchema,
  salaryModesPatchBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
  salaryModesOverlap,
} from "@/lib/api-validation"

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("salary_modes")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = salaryModesPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { label, amount, start_date, end_date, active } = parsed.data

  const isActive = active === true
  const startDateStr = start_date
  const endDateStr = end_date ?? null

  const supabase = await createClient()

  // Overlap check: no overlapping date ranges (exclude current active when adding new active - we replace it)
  const { data: existingModes } = await supabase
    .from("salary_modes")
    .select("id, start_date, end_date, active")
    .eq("user_id", user.id)
  const modesToCheck = (existingModes ?? []).filter(
    (m) => !(isActive && m.active) // exclude current active when adding new active
  )
  const overlaps = salaryModesOverlap(
    modesToCheck.map((m) => ({ start_date: m.start_date, end_date: m.end_date })),
    { start_date: startDateStr, end_date: endDateStr }
  )
  if (overlaps) {
    return NextResponse.json(
      validationErrorResponse("Salary mode date range overlaps with existing mode", {
        start_date: ["Overlapping date range"],
      }),
      { status: 400 }
    )
  }

  if (isActive) {
    const { data: prevActive } = await supabase
      .from("salary_modes")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle()

    if (prevActive) {
      const [sy, sm, sd] = startDateStr.split("-").map(Number)
      const prev = new Date(sy, sm - 1, sd - 1)
      const prevEndDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`
      await supabase
        .from("salary_modes")
        .update({ active: false, end_date: prevEndDate })
        .eq("id", prevActive.id)
    } else {
      await supabase
        .from("salary_modes")
        .update({ active: false })
        .eq("user_id", user.id)
    }
  }

  const { data, error } = await supabase
    .from("salary_modes")
    .insert({
      user_id: user.id,
      label,
      amount: Number(amount),
      start_date: startDateStr,
      end_date: endDateStr,
      active: isActive,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(validationErrorResponse("Invalid JSON"), { status: 400 })
  }
  const parsed = salaryModesPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { id, label, amount, start_date, end_date, active } = parsed.data

  const supabase = await createClient()

  // Overlap check if dates are being updated
  if (start_date !== undefined || end_date !== undefined || active !== undefined) {
    const { data: current } = await supabase
      .from("salary_modes")
      .select("start_date, end_date")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()
    const { data: others } = await supabase
      .from("salary_modes")
      .select("start_date, end_date")
      .eq("user_id", user.id)
      .neq("id", id)
    const newStart = start_date ?? current?.start_date ?? ""
    const newEnd = end_date !== undefined ? end_date : (current?.end_date ?? null)
    const overlaps = salaryModesOverlap(others ?? [], { start_date: newStart, end_date: newEnd })
    if (overlaps) {
      return NextResponse.json(
        validationErrorResponse("Salary mode date range overlaps with existing mode"),
        { status: 400 }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  if (label != null) updates.label = label
  if (amount != null) updates.amount = Number(amount)
  if (start_date != null) updates.start_date = String(start_date).slice(0, 10)
  if (end_date !== undefined) updates.end_date = end_date ? String(end_date).slice(0, 10) : null
  if (active !== undefined) updates.active = active === true

  const { data, error } = await supabase
    .from("salary_modes")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
