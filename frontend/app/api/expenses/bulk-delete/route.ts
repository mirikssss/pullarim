import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { z } from "zod"

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one id required").max(500),
})

/** Delete multiple expenses by ids. User must own all. */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = bulkDeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }
  const { ids } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { deleteExpenseLedger } = await import("@/lib/ledger")
  for (const id of ids) {
    await deleteExpenseLedger(supabase, user.id, id)
  }
  return NextResponse.json({ deleted: data?.length ?? 0 })
}
