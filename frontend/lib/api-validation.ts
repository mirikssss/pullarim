import { z } from "zod"

// --- Validation error response helper ---
export type ValidationErrorResponse = {
  error: {
    code: "VALIDATION_ERROR"
    message: string
    fieldErrors?: Record<string, string[]>
  }
}

export function validationErrorResponse(
  message: string,
  fieldErrors?: Record<string, string[]>
): ValidationErrorResponse {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    },
  }
}

export function zodErrorToFieldErrors(err: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const path = issue.path.join(".")
    if (!fieldErrors[path]) fieldErrors[path] = []
    fieldErrors[path].push(issue.message)
  }
  return fieldErrors
}

// --- Common schemas ---
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD")
const uuid = z.string().uuid("Invalid UUID")

// --- Expenses ---
export const expensesGetQuerySchema = z.object({
  range: z.enum(["today", "7d", "15d", "month"]).optional().default("month"),
  category_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  date_from: dateStr.optional(),
  date_to: dateStr.optional(),
})

export const expensesPostBodySchema = z.object({
  merchant: z.string().min(1, "merchant required").max(120).transform((s) => s.trim() || "Без названия"),
  category_id: z.string().min(1, "category_id required"),
  amount: z.number().int().positive("amount must be > 0"),
  date: dateStr.optional().default(() => new Date().toISOString().slice(0, 10)),
  note: z.string().max(500).nullable().optional(),
})

export const expensesPatchBodySchema = z.object({
  merchant: z.string().min(1).max(120).transform((s) => s.trim()).optional(),
  category_id: z.string().min(1).optional(),
  amount: z.number().int().positive().optional(),
  date: dateStr.optional(),
  note: z.string().max(500).nullable().optional(),
}).refine((data) => Object.keys(data).some((k) => data[k as keyof typeof data] !== undefined), {
  message: "No fields to update",
})

// --- Categories ---
export const categoriesPostBodySchema = z.object({
  id: z.string().min(1, "id required"),
  label: z.string().min(1, "label required"),
  color: z.string().min(1, "color required"),
})

// --- Salary modes ---
export const salaryModesPostBodySchema = z
  .object({
    label: z.string().min(1, "label required"),
    amount: z.number().int().nonnegative("amount required"),
    start_date: dateStr,
    end_date: dateStr.nullable().optional(),
    active: z.boolean().optional().default(false),
  })
  .refine(
    (data) => data.active === true || (data.end_date != null && data.end_date !== ""),
    { message: "end_date required when mode is not active", path: ["end_date"] }
  )
  .refine(
    (data) =>
      !data.end_date ||
      data.end_date === "" ||
      new Date(data.end_date).getTime() >= new Date(data.start_date).getTime(),
    { message: "end_date must be >= start_date", path: ["end_date"] }
  )

export const salaryModesPatchBodySchema = z
  .object({
    id: uuid,
    label: z.string().min(1).optional(),
    amount: z.number().int().nonnegative().optional(),
    start_date: dateStr.optional(),
    end_date: dateStr.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.start_date == null || data.end_date == null || data.end_date === "") return true
      return new Date(data.end_date).getTime() >= new Date(data.start_date).getTime()
    },
    { message: "end_date must be >= start_date", path: ["end_date"] }
  )

// --- Exceptions ---
export const exceptionsGetQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month (YYYY-MM) required"),
})

export const exceptionsPostBodySchema = z.object({
  date: dateStr,
})

export const exceptionsDeleteQuerySchema = z.object({
  date: dateStr,
})

// --- Payments ---
export const paymentsPostBodySchema = z.object({
  period: z.string().min(1, "period required"),
  pay_date: dateStr,
  amount: z.number().int().nonnegative("amount required"),
  received: z.boolean().optional().default(false),
})

export const paymentsPatchBodySchema = z.object({
  id: uuid,
  received: z.boolean().optional(),
  pay_date: dateStr.optional(),
  amount: z.number().int().nonnegative().optional(),
}).refine((data) => data.received !== undefined || data.pay_date !== undefined || data.amount !== undefined, {
  message: "No fields to update",
})

// --- Forecast ---
export const forecastQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

// --- Income summary ---
export const incomeSummaryQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
})

// --- Profile ---
export const profilePatchBodySchema = z.object({
  full_name: z.string().optional(),
  avatar_url: z.string().url().nullable().optional(),
})

// --- Export ---
export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).optional().default("csv"),
  from: dateStr.optional(),
  to: dateStr.optional(),
  category_id: z.string().optional(),
  q: z.string().optional(),
})

// --- Import Payme ---
// --- Domain validation helpers (used in routes with Supabase) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function categoryExists(supabase: any, categoryId: string): Promise<boolean> {
  const { data } = await supabase.from("categories").select("id").eq("id", categoryId).maybeSingle()
  return !!data
}

/** Check if salary mode date ranges overlap for the same user (only for active modes) */
export function salaryModesOverlap(
  modes: { start_date: string; end_date: string | null }[],
  newMode: { start_date: string; end_date: string | null }
): boolean {
  const toMs = (s: string) => new Date(s).getTime()
  const newStart = toMs(newMode.start_date)
  const newEnd = newMode.end_date ? toMs(newMode.end_date) : Infinity

  for (const m of modes) {
    const start = toMs(m.start_date)
    const end = m.end_date ? toMs(m.end_date) : Infinity
    if (newStart <= end && newEnd >= start) return true
  }
  return false
}

export const importPaymeCommitBodySchema = z.object({
  rows: z.array(z.object({
    merchant: z.string(),
    category_id: z.string(),
    amount: z.number().int().nonnegative(),
    date: dateStr,
    note: z.string().optional(),
    external_id: z.string().optional(),
  })),
  default_category_id: z.string().min(1).optional(),
})
