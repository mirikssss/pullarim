"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import Link from "next/link"
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MONTHS_RU, formatUZS } from "@/lib/formatters"
import { fetcher, expensesKey, salaryForecastKey, profileKey, salaryIncomeSummaryKey } from "@/lib/api"
import { DashboardCards } from "@/components/dashboard/dashboard-cards"
import { SpendingSummary } from "@/components/dashboard/spending-summary"
import { SpendingChart } from "@/components/dashboard/spending-chart"
import { CategoryChart } from "@/components/dashboard/category-chart"
import { QuickAdd } from "@/components/dashboard/quick-add"
import type { Expense } from "@/lib/types"

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
  "var(--color-muted-foreground)",
]

function computeCharts(expenses: Expense[]) {
  const byDay: Record<string, number> = {}
  const byCategory: Record<string, { name: string; value: number; fill: string }> = {}

  expenses.forEach((e) => {
    const day = new Date(e.date).getDate().toString()
    byDay[day] = (byDay[day] ?? 0) + e.amount
  })

  const spendingByDay = Array.from({ length: 31 }, (_, i) => {
    const d = (i + 1).toString()
    return { day: d, amount: byDay[d] ?? 0 }
  })

  expenses.forEach((e) => {
    const cat = e.category ?? { id: e.category_id, label: e.category_id, color: "" }
    const label = typeof cat === "object" ? cat.label : e.category_id
    if (!byCategory[e.category_id]) {
      byCategory[e.category_id] = {
        name: label,
        value: 0,
        fill: CHART_COLORS[Object.keys(byCategory).length % CHART_COLORS.length],
      }
    }
    byCategory[e.category_id].value += e.amount
  })

  const categoryBreakdown = Object.values(byCategory).filter((c) => c.value > 0)
  return { spendingByDay, categoryBreakdown }
}

export default function DashboardPage() {
  const now = new Date()
  const [monthIndex, setMonthIndex] = useState(now.getMonth())
  const year = now.getFullYear()
  const monthStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}`
  const startOfMonth = `${monthStr}-01`
  const endOfMonth = `${monthStr}-${new Date(year, monthIndex + 1, 0).getDate()}`
  const expensesUrl = `${expensesKey("month")}&date_from=${startOfMonth}&date_to=${endOfMonth}`
  const { data: expenses = [], mutate: mutateExpenses } = useSWR<Expense[]>(
    expensesUrl,
    fetcher
  )
  const { data: forecast, mutate: mutateForecast } = useSWR(
    salaryForecastKey(monthStr),
    fetcher
  )
  const { data: profile } = useSWR(profileKey(), fetcher)
  const { data: incomeSummary } = useSWR(
    salaryIncomeSummaryKey("2026-01-05", new Date().toISOString().slice(0, 10)),
    fetcher
  )

  const { spendingByDay, categoryBreakdown } = useMemo(
    () => computeCharts(expenses),
    [expenses]
  )

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground"
              onClick={() => setMonthIndex(Math.max(0, monthIndex - 1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground min-w-[90px] text-center">
              {MONTHS_RU[monthIndex]} {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground"
              onClick={() => setMonthIndex(Math.min(11, monthIndex + 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Link
            href="/app/settings"
            className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            {(profile?.full_name ?? "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "?"}
          </Link>
        </div>
      </div>

      {/* Content */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 p-4"
      >
        <SpendingSummary fadeUp={fadeUp} expenses={expenses} />
        {incomeSummary && (
          <motion.div
            variants={fadeUp}
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Получено в 2026 (с 5 янв)</p>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatUZS((incomeSummary as { total_received?: number }).total_received ?? 0)}
            </p>
            <Link href="/app/salary" className="text-xs text-primary hover:underline mt-1 inline-block">
              Подробнее →
            </Link>
          </motion.div>
        )}
        <DashboardCards fadeUp={fadeUp} forecast={forecast} />
        <QuickAdd fadeUp={fadeUp} onSuccess={() => { mutateExpenses(); mutateForecast?.(); }} />
        <SpendingChart fadeUp={fadeUp} data={spendingByDay} />
        <CategoryChart fadeUp={fadeUp} data={categoryBreakdown} />
      </motion.div>
    </div>
  )
}
