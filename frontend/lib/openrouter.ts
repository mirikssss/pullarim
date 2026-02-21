/**
 * OpenRouter API client with primary/fallback model retry logic.
 * Free models with tool calling support. On 429 we retry same model after delay.
 */

export const PRIMARY_MODEL = "openai/gpt-oss-120b:free"
export const FALLBACK_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free"

// openrouter/free — авто-выбор из доступных бесплатных моделей (быстрее)
// Trinity-mini стабильно работает; gpt-oss-120b даёт 404 (data policy)
const FALLBACK_MODELS = [
  "openrouter/free",
  "arcee-ai/trinity-mini:free",
  "openai/gpt-oss-20b:free",
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
]

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const RETRY_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504])
const RATE_LIMIT_DELAY_MS = 2500

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "assistant"
      content: string | null
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
    }
  | {
      role: "tool"
      tool_call_id: string
      content: string
    }

export type ToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, { type: string; description?: string; enum?: string[] }>
      required?: string[]
    }
  }
}

export type CallOptions = {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } }
  max_tokens?: number
  temperature?: number
}

export type CallResult = {
  content: string | null
  tool_calls?: Array<{ id: string; name: string; arguments: string }>
  model_used: string
  latency_ms: number
  finish_reason?: string
}

async function callModel(
  model: string,
  options: CallOptions,
  apiKey: string
): Promise<{ response: Response; body: unknown }> {
  const body = {
    model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.tool_choice ?? (options.tools ? "auto" : undefined),
    max_tokens: options.max_tokens ?? 8192,
    temperature: options.temperature ?? 0.7,
  }
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { response: res, body: data }
}

export async function callOpenRouter(options: CallOptions): Promise<CallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set")
  }

  const start = Date.now()
  let lastError: Error | null = null

  for (const model of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
        }
        const { response, body } = await callModel(model, options, apiKey)
        const latency = Date.now() - start

        if (response.ok) {
          const data = body as {
            choices?: Array<{
              message?: {
                content?: string | null
                tool_calls?: Array<{
                  id: string
                  function: { name: string; arguments: string }
                }>
              }
              finish_reason?: string
            }>
          }
          const choice = data.choices?.[0]
          const msg = choice?.message
          const toolCalls = msg?.tool_calls?.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments ?? "{}",
          }))

          let content: string | null = null
          const raw = msg?.content
          if (typeof raw === "string") content = raw
          else if (Array.isArray(raw)) {
            const textPart = raw.find((b: unknown) => (b as { type?: string })?.type === "text")
            const textFromPart = textPart ? (textPart as { text?: string }).text : undefined
            const textFromMap = raw.map((b: unknown) => (b as { text?: string }).text).filter(Boolean).join("\n")
            content = textFromPart ?? textFromMap
            if (content === "") content = null
          }

          if (process.env.NODE_ENV === "development") {
            console.log(`[OpenRouter] model=${model} latency=${latency}ms finish=${choice?.finish_reason}`)
          }

          return {
            content,
            tool_calls: toolCalls,
            model_used: model,
            latency_ms: latency,
            finish_reason: choice?.finish_reason,
          }
        }

        const status = response.status
        if (RETRY_STATUSES.has(status)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[OpenRouter] ${model} failed: ${status} (attempt ${attempt + 1})`, (body as { error?: unknown })?.error)
          }
          lastError = new Error(`OpenRouter ${status}: ${JSON.stringify((body as { error?: unknown })?.error ?? body)}`)
          if (status === 429 && attempt === 0) continue
          break
        }

        lastError = new Error(`OpenRouter ${status}: ${JSON.stringify((body as { error?: unknown })?.error ?? body)}`)
        throw lastError
      } catch (err) {
        const isNetwork = err instanceof TypeError && err.message?.includes("fetch")
        const isTimeout = err instanceof Error && (err.message?.includes("timeout") || err.message?.includes("aborted"))
        if (isNetwork || isTimeout) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (process.env.NODE_ENV === "development") {
            console.warn(`[OpenRouter] ${model} network/timeout:`, lastError.message)
          }
          if (attempt === 0) continue
        }
        break
      }
    }
  }

  throw lastError ?? new Error("OpenRouter: all models failed")
}
