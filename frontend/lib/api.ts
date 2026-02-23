// API helpers for SWR and fetch

const API = "/api"

/** Извлечь сообщение об ошибке из ответа API. API может вернуть { error: string } или { error: { code, message, fieldErrors? } }. */
export function getErrorMessage(err: unknown, resStatusText: string): string {
  if (err == null || typeof err !== "object") return resStatusText
  const e = err as { error?: unknown }
  const error = e.error
  if (typeof error === "string") return error || resStatusText
  if (error != null && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message
  }
  return resStatusText
}

/** Для форм: разобрать ответ с ошибкой и вернуть { message, fieldErrors }. */
export async function parseErrorResponse(res: Response): Promise<{ message: string; fieldErrors?: Record<string, string[]> }> {
  const body = await res.json().catch(() => ({}))
  const err = body?.error
  const message = getErrorMessage(body, res.statusText)
  const fieldErrors =
    err != null && typeof err === "object" && "fieldErrors" in err && typeof (err as { fieldErrors: unknown }).fieldErrors === "object"
      ? (err as { fieldErrors: Record<string, string[]> }).fieldErrors
      : undefined
  return { message, fieldErrors }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = getErrorMessage(body, res.statusText)
    throw new Error(message)
  }
  return res.json()
}

export function expensesKey(range: string, categoryId?: string, search?: string) {
  const params = new URLSearchParams({ range, includeExcluded: "1" })
  if (categoryId && categoryId !== "all") params.set("category_id", categoryId)
  if (search) params.set("search", search)
  return `${API}/expenses?${params}`
}

export function categoriesKey() {
  return `${API}/categories`
}

export function profileKey() {
  return `${API}/profile`
}

export function salaryModesKey() {
  return `${API}/salary/modes`
}

export function salaryExceptionsKey(month: string) {
  return `${API}/salary/exceptions?month=${month}`
}

export function salaryForecastKey(month: string) {
  return `${API}/salary/forecast?month=${month}`
}

export function salaryPaymentsKey(year?: string, month?: string) {
  const params = new URLSearchParams()
  if (year) params.set("year", year)
  if (month) params.set("month", month)
  const q = params.toString()
  return `${API}/salary/payments${q ? `?${q}` : ""}`
}

export function salaryIncomeSummaryKey(from?: string, to?: string) {
  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const q = params.toString()
  return `${API}/salary/income-summary${q ? `?${q}` : ""}`
}

export function accountsKey() {
  return `${API}/accounts`
}

export function ledgerKey(account?: string, from?: string, to?: string) {
  const params = new URLSearchParams()
  if (account) params.set("account", account)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const q = params.toString()
  return `${API}/ledger${q ? `?${q}` : ""}`
}

export function balanceSummaryKey(range?: string) {
  return `${API}/balance/summary${range ? `?range=${range}` : ""}`
}

export function transfersKey(from?: string, to?: string) {
  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const q = params.toString()
  return `${API}/transfers${q ? `?${q}` : ""}`
}
