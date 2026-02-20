import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

/** DELETE all expenses for current user. Only available in development. */
export async function DELETE() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("user_id", user.id)
    .select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ deleted: data?.length ?? 0 })
}
