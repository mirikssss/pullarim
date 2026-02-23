"use client"

import { useMemo } from "react"
import { motion, type Variants } from "framer-motion"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts"
import { formatUZS, formatUZSShort } from "@/lib/formatters"

interface Props {
  fadeUp: Variants
  data: { name: string; value: number; fill: string }[]
}

export function CategoryChart({ fadeUp, data }: Props) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] overflow-hidden"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">По категориям</p>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">{formatUZSShort(total)} всего</span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          Нет данных за месяц
        </div>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 4 }}>
                <XAxis
                  dataKey="name"
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
                  cursor={{ fill: "var(--color-muted)", fillOpacity: 0.15 }}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    boxShadow: "var(--shadow-card)",
                    padding: "12px 14px",
                  }}
                  formatter={(value: number) => [formatUZS(value), "Сумма"]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={32}>
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Список категорий с долей — как на референсе */}
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            {data.slice(0, 5).map((item, i) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.fill }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-xs text-foreground truncate">{item.name}</span>
                      <span className="text-xs font-medium text-foreground shrink-0">
                        {formatUZSShort(item.value)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-secondary overflow-hidden mt-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: item.fill }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
  )
}
