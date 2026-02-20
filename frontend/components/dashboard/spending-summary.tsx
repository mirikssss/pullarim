"use client"

import { useState, useMemo } from "react"
import { motion, type Variants } from "framer-motion"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import { formatUZS } from "@/lib/formatters"
import { fetcher, expensesKey } from "@/lib/api"
import type { Expense } from "@/lib/types"

interface Props {
  fadeUp: Variants
  expenses: Expense[]
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

export function SpendingSummary({ fadeUp, expenses }: Props) {
  const [range, setRange] = useState<Range>("today")
  const filtered = useMemo(() => {
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
    })
  }, [expenses, range])
  const spent = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])
  const sparkline = useMemo(() => getSparklineData(expenses, range), [expenses, range])
  const budget = 5_000_000

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      {/* Segmented Control */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`relative flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              range === r.key ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {range === r.key && (
              <motion.div
                layoutId="spending-range"
                className="absolute inset-0 rounded-md bg-card border border-border shadow-[var(--shadow-card)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <span className="relative z-10">{r.label}</span>
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Потрачено</p>
          <motion.p
            key={range}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-foreground"
          >
            {formatUZS(spent)}
          </motion.p>
        </div>
        {range === "month" && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Бюджет</p>
            <p className="text-sm font-medium text-foreground">{formatUZS(budget)}</p>
          </div>
        )}
      </div>

      {/* Budget bar for month */}
      {range === "month" && (
        <div className="mb-3">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`h-full rounded-full ${spent > budget ? "bg-destructive" : "bg-primary"}`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Осталось: {formatUZS(Math.max(0, budget - spent))}
          </p>
        </div>
      )}

      {/* Sparkline */}
      {sparkline.length > 1 && (
        <div className="h-12 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="spark-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                fill="url(#spark-gradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
