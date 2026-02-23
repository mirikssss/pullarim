import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { callOpenRouter } from "@/lib/openrouter"
import { runTool } from "@/lib/assistant-tools"

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
})

const VOICE_PARSE_PROMPT = `Ты извлекаешь один расход из короткой голосовой фразы пользователя (русский, Узбекистан, суммы в сумах).
Верни ТОЛЬКО один JSON-объект без пояснений и markdown:
{ "amount": number, "date": "YYYY-MM-DD", "merchant": string, "hint_category": string }

Правила:
- amount: целое число в UZS (если сказано "пять тысяч" или "5 тысяч" → 5000; "30 тысяч" → 30000; "сто тысяч" → 100000)
- date: сегодня в формате YYYY-MM-DD, если не сказано иное; "вчера" → вчера; "позавчера" → позавчера
- merchant: название места/магазина/сервиса (Korzinka, такси, Yandex, магазин, кафе — кратко, без кавычек)
- hint_category: одна подсказка: еда, продукты, транспорт, такси, подписки, покупки, развлечения, счета, здоровье, прочее
- Если сумму или мерчант извлечь нельзя — верни amount: 0
- Текущая дата для "сегодня": подставь сам в YYYY-MM-DD`

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
    const result = await callOpenRouter({
      messages: [
        { role: "system", content: promptWithDate },
        { role: "user", content: parsed.data.text.trim() },
      ],
      tools: undefined,
      max_tokens: 256,
      temperature: 0.1,
    })

    const content = result.content ?? "{}"
    let item: { amount: number; date: string; merchant: string; hint_category: string }
    try {
      const raw = content.replace(/```json?\s*|\s*```/g, "").trim()
      item = JSON.parse(raw)
      if (!item || typeof item.amount !== "number") {
        return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Не удалось извлечь расход" } }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Не удалось разобрать ответ" } }, { status: 400 })
    }

    const amount = Math.round(Number(item.amount)) || 0
    if (amount <= 0) {
      return NextResponse.json({ error: { code: "PARSE_ERROR", message: "Не удалось определить сумму" } }, { status: 400 })
    }

    const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : today
    const merchant = String(item.merchant || "Без названия").trim().slice(0, 120)
    const hint = String(item.hint_category || "прочее").toLowerCase()

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
