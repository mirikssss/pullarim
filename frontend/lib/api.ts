// API helpers for SWR and fetch

const API = "/api"

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? res.statusText)
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
