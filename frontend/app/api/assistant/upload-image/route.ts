import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"

const MAX_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "file required" } }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "File too large (max 8MB)" } }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Only jpg, png, webp allowed" } }, { status: 400 })
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"
  const timestamp = Date.now()
  const path = `${user.id}/${timestamp}.${ext}`

  const supabase = await createClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { data, error } = await supabase.storage
    .from("assistant_uploads")
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) {
    console.error("[assistant/upload-image]", error)
    return NextResponse.json({ error: { code: "UPLOAD_ERROR", message: error.message } }, { status: 500 })
  }

  const { data: urlData } = await supabase.storage.from("assistant_uploads").createSignedUrl(data.path, 3600)

  return NextResponse.json({ path: data.path, public_url: urlData?.signedUrl ?? null })
}
