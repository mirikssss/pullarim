"use client"

import { useMemo } from "react"
import { motion, type Variants } from "framer-motion"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import { TrendingUp, Calendar, Zap } from "lucide-react"
import { formatUZS, formatUZSShort } from "@/lib/formatters"

interface Props {
  fadeUp: Variants
  data: { day: string; amount: number }[]
}

export function SpendingChart({ fadeUp, data }: Props) {
  const stats = useMemo(() => {
    if (data.length === 0) return { max: 0, avg: 0, total: 0 }
    const values = data.map((d) => d.amount)
    const total = values.reduce((a, b) => a + b, 0)
    return {
      max: Math.max(...values),
      avg: Math.round(total / data.length),
      total,
    }
  }, [data])

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] overflow-hidden"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">Расходы по дням</p>
        <span className="text-xs text-muted-foreground">за месяц</span>
      </div>

      <div className="h-52 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 8, left: -24, bottom: 4 }}>
            <defs>
              <linearGradient id="spending-gradient-modern" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                <stop offset="50%" stopColor="var(--color-primary)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => formatUZSShort(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-card)",
                padding: "12px 14px",
              }}
              formatter={(value: number) => [formatUZS(value), "Расход"]}
              labelFormatter={(label) => `День ${label}`}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              fill="url(#spending-gradient-modern)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Сводка в стиле референса: иконка + метка + значение */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Макс. день</p>
            <p className="text-sm font-semibold text-foreground truncate">{formatUZSShort(stats.max)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-chart-2/20 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-chart-2" style={{ color: "var(--color-chart-2)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">В среднем</p>
            <p className="text-sm font-semibold text-foreground truncate">{formatUZSShort(stats.avg)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-chart-3/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-chart-3" style={{ color: "var(--color-chart-3)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Всего</p>
            <p className="text-sm font-semibold text-foreground truncate">{formatUZSShort(stats.total)}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
