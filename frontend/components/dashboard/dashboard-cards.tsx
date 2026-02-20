"use client"

import { motion, type Variants } from "framer-motion"
import { CalendarClock } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { formatUZS } from "@/lib/formatters"
import { MONTHS_RU } from "@/lib/formatters"

interface Props {
  fadeUp: Variants
  forecast?: {
    payout_20th?: number | { amount: number }
    payout_5th_next?: number | { amount: number }
    month?: string
  } | null
}

export function DashboardCards({ fadeUp, forecast }: Props) {
  const now = new Date()
  const day = now.getDate()
  const isFirstHalf = day <= 15
  const payoutRaw = isFirstHalf ? forecast?.payout_20th : forecast?.payout_5th_next
  const payout = typeof payoutRaw === "number" ? payoutRaw : payoutRaw?.amount ?? 0
  const totalDays = isFirstHalf ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - 15
  const daysLeft = isFirstHalf
    ? Math.max(0, 20 - day)
    : Math.max(0, (new Date(now.getFullYear(), now.getMonth() + 1, 5).getTime() - now.getTime()) / 86400000)
  const payoutProgress = totalDays > 0 ? ((totalDays - Math.ceil(daysLeft)) / totalDays) * 100 : 0
  const nextPayDate = isFirstHalf ? "20" : "5"
  const nextPayMonth = isFirstHalf && day > 15 ? now.getMonth() + 2 : now.getMonth() + 1
  const monthName = MONTHS_RU[(nextPayMonth - 1) % 12]

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarClock className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Следующая выплата</p>
          <p className="text-sm font-semibold text-foreground">{nextPayDate} {monthName}</p>
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-3">
        {formatUZS(payout)}
      </p>
      <p className="text-xs text-muted-foreground mb-1.5">К выплате (на руки)</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>До выплаты</span>
          <span>{Math.ceil(daysLeft)} дн.</span>
        </div>
        <Progress value={Math.min(100, payoutProgress)} className="h-1.5 bg-secondary [&>div]:bg-primary" />
      </div>
    </motion.div>
  )
}
