import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import {
  categoriesPostBodySchema,
  validationErrorResponse,
  zodErrorToFieldErrors,
} from "@/lib/api-validation"

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  const { data: defaults, error: defErr } = await supabase
    .from("categories")
    .select("*")
    .eq("is_default", true)
    .is("user_id", null)

  if (defErr) {
    return NextResponse.json({ error: defErr.message }, { status: 500 })
  }

  const { data: userCats, error: userErr } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  const categories = [...(defaults ?? []), ...(userCats ?? [])]
  return NextResponse.json(categories)
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
  const parsed = categoriesPostBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorResponse(parsed.error.message, zodErrorToFieldErrors(parsed.error)),
      { status: 400 }
    )
  }
  const { id, label, color } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("categories")
    .insert({
      id: id.toLowerCase().replace(/\s+/g, "_"),
      label,
      color,
      user_id: user.id,
      is_default: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
