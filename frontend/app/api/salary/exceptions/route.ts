import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  exceptionsGetQuerySchema,
  exceptionsPostBodySchema,
  exceptionsDeleteQuerySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = exceptionsGetQuerySchema.safeParse({ month: searchParams.get("month") })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { month } = parsed.data

  const [y, m] = month.split("-").map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  const date_from = start.toISOString().slice(0, 10)
  const date_to = end.toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("work_exceptions")
    .select("id, date")
    .eq("user_id", user.id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date")

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
  const parsed = exceptionsPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { date } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("work_exceptions")
    .upsert({ user_id: user.id, date }, { onConflict: "user_id,date" })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const parsed = exceptionsDeleteQuerySchema.safeParse({ date: searchParams.get("date") })
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { date } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from("work_exceptions")
    .delete()
    .eq("user_id", user.id)
    .eq("date", date)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
