import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { createWorker } from "tesseract.js"

const ocrPreviewBodySchema = z.object({
  image_path: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, { status: 400 })
  }

  const parsed = ocrPreviewBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, { status: 400 })
  }

  const { image_path } = parsed.data

  if (!image_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("assistant_uploads")
    .download(image_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Image not found" } }, { status: 404 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const worker = await createWorker("rus+eng", 1, { logger: () => {} })

  try {
    const { data } = await worker.recognize(buffer)
    await worker.terminate()

    const extractedText = (data.text || "").trim().slice(0, 20000)
    const confidence = data.confidence ?? 0

    return NextResponse.json({ extracted_text: extractedText, confidence })
  } catch (err) {
    await worker.terminate().catch(() => {})
    console.error("[assistant/ocr-preview]", err)
    return NextResponse.json(
      { error: { code: "OCR_ERROR", message: err instanceof Error ? err.message : "OCR failed" } },
      { status: 500 }
    )
  }
}
