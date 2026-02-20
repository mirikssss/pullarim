/**
 * AI fallback for merchant category classification.
 * Uses OpenRouter: primary openai/gpt-oss-120b, fallback qwen/qwen3-30b.
 * Returns category_slug from allowed list only.
 */

const CLASSIFY_MODELS = [
  "openai/gpt-oss-120b:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "openrouter/free",
  "arcee-ai/trinity-mini:free",
]

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export type ClassifyInput = {
  merchant: string
  paymeCategory: string
  amount: number
  allowedCategoryIds: string[]
}

export type ClassifyResult = { category_slug: string } | null

export async function classifyCategory(input: ClassifyInput): Promise<ClassifyResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const list = input.allowedCategoryIds.join(", ")
  const prompt = `Classify this expense into exactly one category.

Merchant: ${input.merchant}
Payme category: ${input.paymeCategory || "(empty)"}
Amount: ${input.amount} UZS

Allowed categories (return ONLY one of these slugs): ${list}

Respond with valid JSON only: {"category_slug": "food"}
No explanation.`

  for (const model of CLASSIFY_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 64,
          temperature: 0.1,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: unknown
      }
      if (!res.ok) continue

      const content = data.choices?.[0]?.message?.content?.trim()
      if (!content) continue

      const parsed = parseJsonResponse(content)
      if (parsed && input.allowedCategoryIds.includes(parsed.category_slug)) {
        return parsed
      }
    } catch {
      continue
    }
  }
  return null
}

function parseJsonResponse(content: string): ClassifyResult | null {
  const match = content.match(/\{[\s\S]*"category_slug"[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0]) as { category_slug?: string }
    if (obj?.category_slug && typeof obj.category_slug === "string") {
      return { category_slug: obj.category_slug }
    }
  } catch {
    // ignore
  }
  return null
}
