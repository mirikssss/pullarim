/**
 * Unified AI assistant: Gemini 2.0 Flash first, OpenRouter fallback.
 */

import { callGemini } from "./gemini"
import { callOpenRouter } from "./openrouter"
import type { ChatMessage, ToolDefinition } from "./openrouter"

export type CallResult = {
  content: string | null
  tool_calls?: Array<{ id: string; name: string; arguments: string }>
  model_used: string
  latency_ms: number
}

export type CallOptions = {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  tool_choice?: "auto" | "none"
  max_tokens?: number
  temperature?: number
}

export async function callAssistant(options: CallOptions): Promise<CallResult> {
  const geminiResult = await callGemini({
    messages: options.messages,
    tools: options.tools,
    max_tokens: options.max_tokens ?? 8192,
    temperature: options.temperature ?? 0.4,
  })

  if (geminiResult) return geminiResult

  return callOpenRouter({
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.tool_choice ?? "auto",
    max_tokens: options.max_tokens ?? 8192,
    temperature: options.temperature ?? 0.4,
  })
}

export function detectIntent(message: string): "analysis" | "creative" {
  const lower = message.toLowerCase()
  if (/идеи|планы|варианты|придумай|предложи|как можно/i.test(lower)) {
    return "creative"
  }
  return "analysis"
}
