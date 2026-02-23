"use client"

import { useState, useMemo } from "react"
import { motion, type Variants } from "framer-motion"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import { Wallet, Target, TrendingDown } from "lucide-react"
import { formatUZS } from "@/lib/formatters"
import type { Expense } from "@/lib/types"

const DEFAULT_BUDGET = 5_000_000

interface Props {
  fadeUp: Variants
  expenses: Expense[]
  /** Месячный бюджет из настроек (профиль). */
  budget?: number | null
}

const RANGES = [
  { key: "today", label: "Сегодня" },
  { key: "7d", label: "7 дней" },
  { key: "15d", label: "15 дней" },
  { key: "month", label: "Месяц" },
] as const

type Range = (typeof RANGES)[number]["key"]

function getSpentForRange(expenses: Expense[], range: Range): number {
  const now = new Date()
  return expenses.filter((e) => {
    const d = new Date(e.date)
    if (range === "today") return d.toDateString() === now.toDateString()
    if (range === "7d") {
      const diff = (now.getTime() - d.getTime()) / 86400000
      return diff >= 0 && diff < 7
    }
    if (range === "15d") {
      const diff = (now.getTime() - d.getTime()) / 86400000
      return diff >= 0 && diff < 15
    }
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((s, e) => s + e.amount, 0)
}

function getSparklineData(expenses: Expense[], range: Range): { v: number }[] {
  const now = new Date()
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "15d" ? 15 : 20
  const data: { v: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dayTotal = expenses
      .filter((e) => new Date(e.date).toDateString() === d.toDateString())
      .reduce((s, e) => s + e.amount, 0)
    data.push({ v: dayTotal })
  }
  return data
}

export function SpendingSummary({ fadeUp, expenses, budget: budgetProp }: Props) {
  const [range, setRange] = useState<Range>("today")
  const budget = budgetProp ?? DEFAULT_BUDGET
  /** Только расходы в бюджете — для суммы и графика, чтобы не искажать тенденцию. */
  const inBudget = useMemo(() => expenses.filter((e) => !e.exclude_from_budget), [expenses])
  const filtered = useMemo(() => {
    const now = new Date()
    return inBudget.filter((e) => {
      const d = new Date(e.date)
      if (range === "today") return d.toDateString() === now.toDateString()
      if (range === "7d") {
        const diff = (now.getTime() - d.getTime()) / 86400000
        return diff >= 0 && diff < 7
      }
      if (range === "15d") {
        const diff = (now.getTime() - d.getTime()) / 86400000
        return diff >= 0 && diff < 15
      }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
  }, [inBudget, range])
  const spent = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
  const sparkline = useMemo(() => getSparklineData(inBudget, range), [inBudget, range])

  const remaining = Math.max(0, budget - spent)
  const budgetPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] overflow-hidden"
    >
      {/* Segmented: День / Неделя / Месяц — как на референсе */}
      <div className="flex gap-1 p-1.5 rounded-xl bg-secondary mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`relative flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              range === r.key ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {range === r.key && (
              <motion.div
                layoutId="spending-range"
                className="absolute inset-0 rounded-lg bg-card border border-border shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{r.label}</span>
          </button>
        ))}
      </div>

      {/* Крупная сумма + мини-график в одной строке */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Потрачено</p>
          <motion.p
            key={range}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold tabular-nums text-foreground"
          >
            {formatUZS(spent)}
          </motion.p>
        </div>
        {sparkline.length > 1 && (
          <div className="h-10 w-24 shrink-0 rounded-lg bg-secondary/50 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id="spark-gradient-modern" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  fill="url(#spark-gradient-modern)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Сводка в стиле референса: при выборе «Месяц» — Бюджет / Потрачено / Осталось */}
      {range === "month" && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-3 py-1.5">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Потрачено</p>
              <p className="text-sm font-semibold text-foreground">{formatUZS(spent)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <div className="w-9 h-9 rounded-full bg-chart-2/20 flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 text-chart-2" style={{ color: "var(--color-chart-2)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Бюджет</p>
              <p className="text-sm font-semibold text-foreground">{formatUZS(budget)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-1.5">
            <div className="w-9 h-9 rounded-full bg-chart-3/20 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4 text-chart-3" style={{ color: "var(--color-chart-3)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Осталось</p>
              <p className="text-sm font-semibold text-foreground">{formatUZS(remaining)}</p>
            </div>
          </div>
          <div className="pt-2">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${budgetPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`h-full rounded-full ${spent > budget ? "bg-destructive" : "bg-primary"}`}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {spent > budget ? "Превышение бюджета" : "Прогресс по бюджету"}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
