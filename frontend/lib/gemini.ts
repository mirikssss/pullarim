/**
 * Gemini 2.0 Flash API client. Primary AI for assistant, fallback to OpenRouter.
 */

import type { ChatMessage, ToolDefinition } from "./openrouter"

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

function openRouterToGeminiTools(tools: ToolDefinition[]): object[] {
  return [
    {
      functionDeclarations: tools.map((t) => {
        const fn = t.function
        const props: Record<string, { type: string; description?: string; enum?: string[] }> = {}
        for (const [k, v] of Object.entries(fn.parameters.properties ?? {})) {
          props[k] = {
            type: v.type,
            description: v.description,
            ...(v.enum ? { enum: v.enum } : {}),
          }
        }
        return {
          name: fn.name,
          description: fn.description,
          parameters: {
            type: "object",
            properties: props,
            required: fn.parameters.required ?? [],
          },
        }
      }),
    },
  ]
}

function messagesToGeminiContents(messages: ChatMessage[]): object[] {
  const contents: object[] = []
  let systemText = ""
  const idToName = new Map<string, string>()
  let pendingToolParts: object[] = []

  const flushToolParts = () => {
    if (pendingToolParts.length > 0) {
      contents.push({ role: "function", parts: pendingToolParts })
      pendingToolParts = []
    }
  }

  for (const m of messages) {
    if (m.role === "system") {
      systemText = (m as { content: string }).content
      continue
    }
    if (m.role === "user") {
      flushToolParts()
      const text = (m as { content: string }).content
      contents.push({
        role: "user",
        parts: [{ text: systemText ? `${systemText}\n\n---\n\n${text}` : text }],
      })
      if (systemText) systemText = ""
      continue
    }
    if (m.role === "assistant") {
      flushToolParts()
      const am = m as { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
      if (am.tool_calls && am.tool_calls.length > 0) {
        for (const tc of am.tool_calls) idToName.set(tc.id, tc.function.name)
        const parts = am.tool_calls.map((tc) => ({
          functionCall: {
            name: tc.function.name,
            args: (() => {
              try {
                return JSON.parse(tc.function.arguments || "{}")
              } catch {
                return {}
              }
            })(),
          },
        }))
        contents.push({ role: "model", parts })
      } else if (am.content) {
        contents.push({ role: "model", parts: [{ text: am.content }] })
      }
      continue
    }
    if (m.role === "tool") {
      const tm = m as { tool_call_id: string; content: string }
      const fnName = idToName.get(tm.tool_call_id) ?? "unknown"
      let responseData: unknown
      try {
        responseData = JSON.parse(tm.content || "{}")
      } catch {
        responseData = { result: tm.content }
      }
      const content = typeof responseData === "object" && responseData !== null && !Array.isArray(responseData)
        ? responseData
        : { result: responseData }
      pendingToolParts.push({
        functionResponse: {
          name: fnName,
          response: { name: fnName, content },
        },
      })
    }
  }
  flushToolParts()
  return contents
}

export type GeminiCallOptions = {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  max_tokens?: number
  temperature?: number
}

export type GeminiCallResult = {
  content: string | null
  tool_calls?: Array<{ id: string; name: string; arguments: string }>
  model_used: string
  latency_ms: number
}

export async function callGemini(options: GeminiCallOptions): Promise<GeminiCallResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const start = Date.now()
  const contents = messagesToGeminiContents(options.messages)

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.max_tokens ?? 8192,
      temperature: options.temperature ?? 0.4,
    },
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = openRouterToGeminiTools(options.tools)
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    type GeminiResponse = {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string
            functionCall?: { name: string; args: Record<string, unknown> }
          }>
        }
      }>
      error?: { message?: string }
    }
    const data = (await res.json().catch(() => ({}))) as GeminiResponse

    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Gemini]", data.error?.message ?? res.status)
      }
      return null
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    let content: string | null = null
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []

    for (const p of parts) {
      if (p.text) content = (content ?? "") + p.text
      if (p.functionCall) {
        toolCalls.push({
          id: `fc_${toolCalls.length}`,
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args ?? {}),
        })
      }
    }

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      model_used: GEMINI_MODEL,
      latency_ms: Date.now() - start,
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Gemini]", err)
    }
    return null
  }
}
