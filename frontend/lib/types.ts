// Shared types for Pullarim (matches DB schema + API responses)

export interface Category {
  id: string
  label: string
  color: string
  user_id?: string | null
  is_default?: boolean
}

export interface Expense {
  id: string
  merchant: string
  category_id: string
  category?: Category
  amount: number
  date: string
  note?: string | null
  exclude_from_budget?: boolean
  source_type?: string | null
  payment_method?: "card" | "cash" | null
  created_at?: string
}

export interface Account {
  id: string
  type: "card" | "cash"
  name: string
  opening_balance: number
  computed_balance: number
  created_at?: string
}

export interface LedgerEntry {
  id: string
  account_id: string
  account_type: string | null
  account_name: string | null
  direction: "in" | "out"
  amount: number
  occurred_on: string
  source_type: string
  source_label: string
  merchant: string | null
  note: string | null
  created_at: string
}

export interface Transfer {
  id: string
  from_account_id: string
  to_account_id: string
  amount: number
  date: string
  note: string | null
  created_at: string
}

export interface SalaryMode {
  id: string
  label: string
  amount: number
  start_date: string
  end_date?: string | null
  active: boolean
  user_id?: string
}

export interface WorkException {
  id: string
  user_id: string
  date: string
}

export interface Payment {
  id: string
  user_id?: string
  period: string
  pay_date: string
  amount: number
  received: boolean
}

export interface Profile {
  id: string
  full_name: string
  avatar_url?: string | null
  currency: string
  created_at?: string
}

export interface SalaryForecast {
  month: string
  N: number
  period1DaysWorked: number
  period2DaysWorked: number
  payout_20th: number
  payout_5th_next: number
  breakdown_20th?: { mode_id: string; label: string; amount: number; days: number }[]
  breakdown_5th_next?: { mode_id: string; label: string; amount: number; days: number }[]
  exceptions_count: number
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCard?: {
    type: "expense_added" | "query_result"
    data: Record<string, string | number>
  }
}
