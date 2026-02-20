"use client"

import { motion, type Variants } from "framer-motion"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"
import { formatUZSShort } from "@/lib/formatters"

interface Props {
  fadeUp: Variants
  data: { name: string; value: number; fill: string }[]
}

export function CategoryChart({ fadeUp, data }: Props) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <p className="text-sm font-medium text-foreground mb-4">По категориям</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => formatUZSShort(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                color: "var(--color-foreground)",
                fontSize: "12px",
              }}
              formatter={(value: number) => [formatUZSShort(value), "Сумма"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}
