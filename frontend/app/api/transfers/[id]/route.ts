import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const { id } = await params
  const supabase = await createClient()

  const { data: transfer } = await supabase
    .from("transfers")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!transfer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error: ledgerErr } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("source_type", "transfer")
    .eq("source_id", id)
  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 })
  }

  const { error: delErr } = await supabase
    .from("transfers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
