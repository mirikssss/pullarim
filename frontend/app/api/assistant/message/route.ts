import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser, unauthorized } from "@/lib/api-auth"
import { createClient } from "@/lib/supabase/server"
import { callAssistant, detectIntent } from "@/lib/ai-assistant"
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant-tools"
import {
  buildUserContext,
  formatUserContextForPrompt,
  analyzeStats,
  formatAnalyzeStatsForPrompt,
} from "@/lib/assistant-context"
import type { ChatMessage } from "@/lib/openrouter"

const messageBodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().optional(),
})

const MAX_HISTORY = 8

async function loadHistory(userId: string): Promise<ChatMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY)
  const rows = (data ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
  return rows.reverse()
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

function getSystemPrompt(userContext: string): string {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" })
  return `Ты — персональный финансовый аналитик Pullarim (UZS, Uzbekistan).
Текущая дата: ${today} (Asia/Tashkent).

СВОДКА ПОЛЬЗОВАТЕЛЯ (контекст, не замена tools):
${userContext}

Для плана бюджета — сводки недостаточно. Вызови get_spending_insights (14d) для by_category и top_merchants.

ТВОЯ РОЛЬ:
Ты не “мотивационный бот”.
Ты — аналитик, который помогает пользователю понимать деньги и управлять ими.

Главная цель — находить реальные паттерны трат и давать практичные выводы.

---

ОБРАБОТКА ДАННЫХ (КРИТИЧНО):

1) Всегда фильтруй:
- exclude_from_budget = true → НЕ учитывать в расходах
- transfers → НЕ считать тратой, считать движением денег

2) Всегда проверяй:
Есть ли “выбросы” (разовые крупные траты).
Если есть — анализируй отдельно:
"С покупкой X" / "Без покупки X".

3) Категория "Прочее":
Никогда не делай выводы только на её основе.
Если доля >20% — предложи разметить.

4) Наличка:
Рассматривай как риск потери контроля.
Отдельно упоминай, если >20%.

---

СТИЛЬ ОТВЕТА:

- Коротко и по делу.
- Сначала вывод → потом цифры.
- 3–6 предложений — оптимум.
- Никакой воды и “финансовых цитат”.

Формат:

1. Главный вывод
2. Поддержка цифрами
3. Практический шаг

Пример:
"Основная проблема — доставка еды.
За 7 дней: **210 000 сум** через YandexEats.
Это 46% всех трат.
Если сократить вдвое — сэкономишь ~100k в неделю."

---

ОФОРМЛЕНИЕ:

- Все суммы — **жирным**
- Даты — явно
- Мерчанты — всегда упоминать
- Эмодзи максимум 1 и только если уместно (💸📊)

Запрещено:
❌ “Старайтесь больше копить”
❌ “Рекомендуем быть внимательнее”
❌ Общие советы без данных

---

ИСПОЛЬЗОВАНИЕ ИНСТРУМЕНТОВ:

НИКОГДА не выдумывай цифры.

Запрет на голословные экономии: никогда не писать "можно сэкономить до X" (и подобное), если X не вычислен из данных tools. Любая сумма экономии должна быть явно получена из by_category, top_merchants или лимитов.

Обязательные вызовы:

• "сколько потратил" → get_spending_summary
• "анализ / топ / куда уходит" → get_spending_by_category
• "зарплата / когда получу" → get_salary_context
• "план / бюджет / уложиться в X" → ОБЯЗАТЕЛЬНО get_spending_insights (14d) + get_salary_context. Без by_category и top_merchants отвечать ЗАПРЕЩЕНО.

ЗАПРЕЩЕНО: "проанализируй расходы", "рекомендую посмотреть" — ты УЖЕ имеешь данные из tools. Дай конкретный план.

---

СОЗДАНИЕ РАСХОДОВ:

create_expense ТОЛЬКО если:
- есть сумма
- есть мерчант
- есть дата
- пользователь явно сказал "добавь"

Если чего-то нет → уточни.

---

РАБОТА С ЦЕЛЯМИ (бюджет до ЗП, уложиться в X):

1) Вызови get_spending_insights (14d) и get_salary_context. days_count и daily_limit бери ТОЛЬКО из ответов tools (не считай сам).
2) Ответ ДОЛЖЕН содержать блоки:

   A) Цель: total_budget (сум), days_count (дней), daily_limit (сум/день) — из get_salary_context.budget_period и suggested_daily_limit (или из target_budget пользователя).

   B) База: baseline_avg_per_day (14д без выбросов) из get_spending_insights + разница в % к daily_limit.

   C) Лимиты по категориям (минимум 4 строки): out_of_home_food (кафе/доставка) отдельно от groceries; transport/taxi отдельно если есть; misc/other; buffer (подушка) как остаток. Формула: доли из baseline (14д, без exclude/transfers), сжать пропорционально до daily_limit; floor для groceries/transport, резать out_of_home_food и misc.

   D) Контроль: 2 правила — "если сегодня превысил лимит → завтра лимит X"; "если 2 дня подряд превышение → запрет доставок/такси".

   E) Выбросы: список 1–3 outliers отдельным блоком (из biggest_outliers), если есть.

3) Упоминай конкретные мерчанты из top_merchants: YandexEats, Buenoo, Plov City, YandexGo — где резать в первую очередь.

---

ЗАРПЛАТА:

Всегда учитывай:
- последнюю выплату
- следующую выплату
- остаток дней
- текущие траты

При планировании — используй реальные числа.

---

КОНТЕКСТ:

Помни историю диалога.
Если пользователь уточняет — опирайся на прошлые данные.

Не повторяй одно и то же.

---
ФИНАЛ:

Твоя задача — быть умным финансовым вторым мозгом пользователя.
Не болтай.
Анализируй.
Помогай принимать решения.

КРИТИЧНО: Отвечай ТОЛЬКО на последний вопрос пользователя. История — для контекста (уточнения, "а за месяц?"), не для ответа. Игнорируй старые вопросы.

ЭМОДЗИ: максимум 1 на ответ, только уместно.

ВАЖНО: Всегда завершай ответ полностью. Не обрывай на середине фразы. Если лимит — сократи блоки, но закончи мысль.`
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

  const supabase = await createClient()
  const userContext = await buildUserContext(supabase, user.id)
  const userContextStr = formatUserContextForPrompt(userContext)

  const history = await loadHistory(user.id)
  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt(userContextStr) },
    ...history,
    { role: "user", content: message },
  ]

  const intent = detectIntent(message)
  const temperature = intent === "creative" ? 0.7 : 0.4

  const toolDebug: Array<{ name: string; args: unknown; result: unknown; fields_used?: string[] }> = []
  const devLog: { context_sent: boolean; tools_called: string[]; analytics_injected?: string } = {
    context_sent: true,
    tools_called: [],
  }
  let maxIterations = 5

  try {
    while (maxIterations-- > 0) {
      const result = await callAssistant({
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: "auto",
        max_tokens: 8192,
        temperature,
      })

      if (result.tool_calls && result.tool_calls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: result.content,
          tool_calls: result.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments ?? "{}" },
          })),
        }
        messages.push(assistantMsg)

        let lastSpendingData: { total?: number; by_category?: Array<{ category_slug: string; total: number }>; biggest_outliers?: Array<{ amount: number }>; daily_series?: Array<{ date: string; total: number }> } | null = null

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
            devLog.tools_called.push(tc.name)
            const fieldsUsed = toolResult.ok && typeof toolResult.data === "object"
              ? Object.keys(toolResult.data as object)
              : []
            toolDebug.push({
              name: tc.name,
              args,
              result: toolResult.ok ? toolResult.data : toolResult.error,
              fields_used: fieldsUsed,
            })
          }

          if (toolResult.ok && (tc.name === "get_spending_insights" || tc.name === "get_spending_by_category")) {
            lastSpendingData = toolResult.data as typeof lastSpendingData
          }

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolContent,
          })
        }

        if (lastSpendingData) {
          const stats = analyzeStats(lastSpendingData, userContext)
          const statsStr = formatAnalyzeStatsForPrompt(stats)
          messages.push({
            role: "user",
            content: `[Структурированный анализ по данным tools] ${statsStr}. Учти при формировании вывода.`,
          })
          if (process.env.NODE_ENV === "development") {
            devLog.analytics_injected = statsStr
          }
        }
        continue
      }

      const assistantMessage = typeof result.content === "string" ? result.content : (result.content ? String(result.content) : "Не удалось получить ответ.")
      await saveMessages(user.id, message, assistantMessage)
      return NextResponse.json({
        assistant_message: assistantMessage,
        model_used: result.model_used,
        ...(process.env.NODE_ENV === "development"
          ? { tool_debug: toolDebug, dev_log: devLog }
          : {}),
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
