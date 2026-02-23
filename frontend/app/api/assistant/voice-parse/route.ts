import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { callAssistant } from "@/lib/ai-assistant"
import { runTool } from "@/lib/assistant-tools"

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
})

const VOICE_PARSE_PROMPT = `Ты извлекаешь один расход из голосовой фразы (русский, Узбекистан, суммы в сумах).
Ответь СТРОГО одним JSON-объектом, без текста до или после, без markdown и без \\\`\\\`\\\`:
{"amount": число, "date": "YYYY-MM-DD", "merchant": "строка", "hint_category": "строка"}

Правила:
- amount: целое число UZS ("пять тысяч"→5000, "30 тысяч"→30000). Если не ясно — 0.
- date: YYYY-MM-DD; если не сказано — сегодня; "вчера"/"позавчера" — вычисли от текущей даты.
- merchant: кратко (такси, Korzinka, кафе, магазин).
- hint_category: одно из: еда, продукты, транспорт, такси, подписки, покупки, развлечения, счета, здоровье, прочее.
- Текущая дата для "сегодня": подставь сам в YYYY-MM-DD.`

const TZ = "Asia/Tashkent"

function todayStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ })
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    )
  }

  const today = todayStr()
  const promptWithDate = VOICE_PARSE_PROMPT.replace(
    "Текущая дата для \"сегодня\": подставь сам в YYYY-MM-DD",
    `Текущая дата для "сегодня": ${today}`
  )

  try {
    const result = await callAssistant({
      messages: [
        { role: "system", content: promptWithDate },
        { role: "user", content: parsed.data.text.trim() },
      ],
      max_tokens: 512,
      temperature: 0.1,
    })

    const content = (result.content ?? "").trim()
    if (!content) {
      return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Пустой ответ от сервиса" } }, { status: 400 })
    }

    function extractJson(raw: string): Record<string, unknown> | null {
      const noMarkdown = raw.replace(/```json?\s*|\s*```/g, "").trim()
      const tryParse = (s: string) => {
        try {
          return JSON.parse(s) as Record<string, unknown>
        } catch {
          return null
        }
      }
      let obj = tryParse(noMarkdown)
      if (obj) return obj
      const start = noMarkdown.indexOf("{")
      const end = noMarkdown.lastIndexOf("}")
      if (start !== -1 && end !== -1 && end > start) {
        obj = tryParse(noMarkdown.slice(start, end + 1))
        if (obj) return obj
      }
      return null
    }

    const item = extractJson(content)
    if (!item || (typeof item.amount !== "number" && typeof item.amount !== "string")) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[voice-parse] raw content:", content.slice(0, 500))
      }
      return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Не удалось извлечь расход из фразы" } }, { status: 400 })
    }

    const amount = Math.round(Number(item.amount)) || 0
    if (amount <= 0) {
      return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Не удалось определить сумму" } }, { status: 400 })
    }

    const dateStr = item.date != null ? String(item.date) : today
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : today
    const merchant = String(item.merchant ?? "Без названия").trim().slice(0, 120)
    const hint = String(item.hint_category ?? "прочее").toLowerCase()

    const resolved = await runTool("resolve_category", { hint, merchant })
    const category_id = resolved.ok && typeof resolved.data === "string" ? resolved.data : "other"

    return NextResponse.json({
      amount,
      date,
      merchant,
      category_id,
    })
  } catch (err) {
    console.error("[assistant/voice-parse]", err)
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: err instanceof Error ? err.message : "Ошибка разбора" } },
      { status: 500 }
    )
  }
}
