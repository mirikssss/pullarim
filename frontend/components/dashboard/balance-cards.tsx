"use client"

import useSWR from "swr"
import Link from "next/link"
import { motion, type Variants } from "framer-motion"
import { CreditCard, Banknote, Wallet } from "lucide-react"
import { formatUZS } from "@/lib/formatters"
import { fetcher, accountsKey } from "@/lib/api"
import type { Account } from "@/lib/types"

interface Props {
  fadeUp: Variants
}

export function BalanceCards({ fadeUp }: Props) {
  const { data, error } = useSWR<{ accounts: Account[]; total: number }>(accountsKey(), fetcher)

  if (error || !data?.accounts?.length) {
    return null
  }

  const card = data.accounts.find((a) => a.type === "card")
  const cash = data.accounts.find((a) => a.type === "cash")
  const total = data.total ?? (card?.computed_balance ?? 0) + (cash?.computed_balance ?? 0)

  return (
    <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2">
      <Link href="/app/balance?account=card">
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Карта</span>
          </div>
          <p className="text-base font-bold text-foreground truncate">
            {formatUZS(card?.computed_balance ?? 0)}
          </p>
        </motion.div>
      </Link>
      <Link href="/app/balance?account=cash">
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Наличные</span>
          </div>
          <p className="text-base font-bold text-foreground truncate">
            {formatUZS(cash?.computed_balance ?? 0)}
          </p>
        </motion.div>
      </Link>
      <Link href="/app/balance">
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Всего</span>
          </div>
          <p className="text-base font-bold text-foreground truncate">
            {formatUZS(total)}
          </p>
        </motion.div>
      </Link>
    </motion.div>
  )
}
