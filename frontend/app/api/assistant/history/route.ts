import { NextResponse } from "next/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"

const MAX_MESSAGES = 20

export async function GET() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const messages = (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    created_at: m.created_at,
  }))

  return NextResponse.json({ messages })
}
