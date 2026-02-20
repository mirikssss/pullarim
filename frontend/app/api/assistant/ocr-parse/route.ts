import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { callOpenRouter } from "@/lib/openrouter"
import { runTool } from "@/lib/assistant-tools"

const ocrParseBodySchema = z.object({
  extracted_text: z.string().min(1).max(50000),
})

const OCR_PARSE_PROMPT = `Ты парсишь OCR-текст из скриншота банковского приложения (транзакции, расходы).
Верни ТОЛЬКО JSON-массив объектов без пояснений. Каждый объект:
{ "amount": number, "date": "YYYY-MM-DD", "merchant": string, "hint_category": string, "note": string? }

Правила:
- amount: целое число в UZS (сумма расхода, положительная)
- date: если не ясно — используй сегодня
- merchant: название магазина/получателя (кратко)
- hint_category: подсказка категории: еда, транспорт, покупки, развлечения, счета, здоровье, прочее
- note: опционально
- Пропускай входящие переводы, пополнения. Только расходы.
- Если не удалось извлечь ни одной транзакции — верни []`

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, { status: 400 })
  }

  const parsed = ocrParseBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    )
  }

  const { extracted_text } = parsed.data

  try {
    const result = await callOpenRouter({
      messages: [
        { role: "system", content: OCR_PARSE_PROMPT },
        { role: "user", content: extracted_text.slice(0, 15000) },
      ],
      tools: undefined,
      max_tokens: 2048,
      temperature: 0.2,
    })

    const content = result.content ?? "[]"
    let items: Array<{ amount: number; date: string; merchant: string; hint_category: string; note?: string }>
    try {
      const parsedJson = JSON.parse(content.replace(/```json?\s*|\s*```/g, "").trim())
      items = Array.isArray(parsedJson) ? parsedJson : []
    } catch {
      items = []
    }

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" })
    const supabase = await createClient()
    const { data: defaults } = await supabase.from("categories").select("id, label").eq("is_default", true).is("user_id", null)
    const { data: userCats } = await supabase.from("categories").select("id, label").eq("user_id", user.id)
    const allCats = [...(defaults ?? []), ...(userCats ?? [])]

    const preview: Array<{
      amount: number
      date: string
      merchant: string
      category_id: string
      category_label: string
      note?: string
      confidence: number
    }> = []

    for (const item of items) {
      const amount = Math.round(Number(item.amount)) || 0
      if (amount <= 0) continue

      const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : today
      const merchant = String(item.merchant || "Без названия").trim().slice(0, 120)
      const hint = String(item.hint_category || "прочее").toLowerCase()

      const resolved = await runTool("resolve_category", { hint, merchant })
      const category_id = resolved.ok && typeof resolved.data === "string" ? resolved.data : "other"
      const catLabel = allCats.find((c: { id: string }) => c.id === category_id)?.label ?? category_id

      preview.push({
        amount,
        date,
        merchant,
        category_id,
        category_label: catLabel,
        note: item.note,
        confidence: date === today && !item.date ? 0.5 : 0.9,
      })
    }

    return NextResponse.json({ preview })
  } catch (err) {
    console.error("[assistant/ocr-parse]", err)
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: err instanceof Error ? err.message : "Parse failed" } },
      { status: 500 }
    )
  }
}
