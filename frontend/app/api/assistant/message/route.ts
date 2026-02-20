import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { callOpenRouter } from "@/lib/openrouter"
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant-tools"
import type { ChatMessage } from "@/lib/openrouter"

const messageBodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().optional(),
})

const MAX_HISTORY = 20

async function loadHistory(userId: string): Promise<ChatMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY)
  return (data ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
}

async function saveMessages(userId: string, userContent: string, assistantContent: string) {
  const supabase = await createClient()
  await supabase.from("assistant_messages").insert([
    { user_id: userId, role: "user", content: userContent },
    { user_id: userId, role: "assistant", content: assistantContent },
  ])

  const { data: rows } = await supabase
    .from("assistant_messages")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  const toDelete = (rows ?? []).length - MAX_HISTORY
  if (toDelete > 0) {
    const idsToDelete = (rows ?? [])
      .slice(0, toDelete)
      .map((r) => r.id)
    await supabase.from("assistant_messages").delete().in("id", idsToDelete)
  }
}

function getSystemPrompt(): string {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" })
  return `Ты — персональный финансовый помощник Pullarim (UZS, Uzbekistan). Текущая дата = ${today} (Asia/Tashkent).

ГЛАВНЫЙ ПРИНЦИП: отвечай коротко, конкретно и по делу. Никакой воды.

СТИЛЬ:
- 1–3 коротких предложения по умолчанию. Если пользователь просит “подробно/анализ” — тогда расширяй.
- Всегда показывай ключевое число жирным (**... сум**). Упоминай конкретные мерчанты (Korzinka, Yandex) — не только категории.
- Эмодзи максимум 1 на ответ и только уместно (💸📊). Не превращай ответ в “мотивашку”.
- Не притворяйся, что знаешь больше данных, чем вернули инструменты.

ПРАВИЛА ДАННЫХ:
1) НИКОГДА не выдумывай цифры. Любые суммы/кол-во — только из инструментов.
2) "сколько потратил" -> get_spending_summary.
   "топ/анализ/на что уходит" -> get_spending_by_category (есть top_merchants и top_merchants_overall — используй имена мерчантов).
   "зарплата/когда получу/последняя выплата" -> get_salary_context (last_payment + next_payment с датами).
   Если данных нет — честно скажи и предложи добавить расход.
3) Даты считаются от ${today}:
   "7 дней" = сегодня и 6 дней назад включительно.
4) Создание расхода: делай create_expense только если пользователь явно сказал “добавь/запиши” и поля однозначны.
5) Категории только существующие. Если не уверен — ставь "Нужно разобрать".
6) OCR: никогда не записывай в БД без подтверждения. Сначала превью, потом “Добавить”.
7) Если пользователь просит “совет/экономию” — давай совет только на основе фактов (инструменты). Если фактов нет — спроси, какой лимит/цель.`
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

  const parsed = messageBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      { status: 400 }
    )
  }

  const { message } = parsed.data

  const history = await loadHistory(user.id)
  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt() },
    ...history,
    { role: "user", content: message },
  ]

  const toolDebug: Array<{ name: string; args: unknown; result: unknown }> = []
  let maxIterations = 5

  try {
    while (maxIterations-- > 0) {
      const result = await callOpenRouter({
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
        temperature: 0.8,
      })

      if (result.tool_calls && result.tool_calls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.content,
          tool_calls: result.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        }
        messages.push(assistantMsg)

        for (const tc of result.tool_calls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.arguments || "{}")
          } catch {
            args = {}
          }

          const toolResult = await runTool(tc.name, args)
          const toolContent = JSON.stringify(toolResult.ok ? toolResult.data : { error: toolResult.error })

          if (process.env.NODE_ENV === "development") {
            toolDebug.push({ name: tc.name, args, result: toolResult.ok ? toolResult.data : toolResult.error })
          }

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolContent,
          })
        }
        continue
      }

      const assistantMessage = typeof result.content === "string" ? result.content : (result.content ? String(result.content) : "Не удалось получить ответ.")
      await saveMessages(user.id, message, assistantMessage)
      return NextResponse.json({
        assistant_message: assistantMessage,
        model_used: result.model_used,
        ...(process.env.NODE_ENV === "development" && toolDebug.length > 0 ? { tool_debug: toolDebug } : {}),
      })
    }

    return NextResponse.json({
      assistant_message: "Превышено количество итераций. Попробуйте ещё раз.",
      error: { code: "MAX_ITERATIONS", message: "Too many tool calls" },
    }, { status: 500 })
  } catch (err) {
    console.error("[assistant/message]", err)
    return NextResponse.json(
      {
        error: {
          code: "ASSISTANT_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      },
      { status: 500 }
    )
  }
}
