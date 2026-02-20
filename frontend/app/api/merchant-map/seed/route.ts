import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { UZ_MERCHANT_SEED_ENTRIES } from "@/lib/merchant-seed-uz"

/**
 * POST /api/merchant-map/seed
 * Upsert predefined UZ merchant_norm -> category_id for current user.
 * confidence=1.0, source=seed
 */
export async function POST() {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const supabase = await createClient()
  let upserted = 0

  for (const { merchant_norm, category_id } of UZ_MERCHANT_SEED_ENTRIES) {
    const { error } = await supabase.from("merchant_category_map").upsert(
      {
        user_id: user.id,
        merchant_norm,
        category_id,
        confidence: 1.0,
        source: "seed",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,merchant_norm" }
    )
    if (!error) upserted++
  }

  return NextResponse.json({ upserted, total: UZ_MERCHANT_SEED_ENTRIES.length })
}
