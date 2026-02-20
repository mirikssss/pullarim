import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

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

  const body = await request.json()
  const { label, amount, start_date, active } = body

  if (!label || amount == null || !start_date) {
    return NextResponse.json(
      { error: "label, amount, start_date required" },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  if (active === true) {
    await supabase
      .from("salary_modes")
      .update({ active: false })
      .eq("user_id", user.id)
  }

  const { data, error } = await supabase
    .from("salary_modes")
    .insert({
      user_id: user.id,
      label,
      amount: Number(amount),
      start_date,
      active: active === true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
