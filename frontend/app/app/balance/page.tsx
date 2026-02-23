"use client"

import { useState, useMemo, Suspense, Fragment } from "react"
import useSWR from "swr"
import { useSearchParams } from "next/navigation"
import { CreditCard, Banknote, Wallet, ArrowDownRight, ArrowUpRight } from "lucide-react"
import { formatUZS } from "@/lib/formatters"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { fetcher, accountsKey, ledgerKey, balanceSummaryKey } from "@/lib/api"
import type { Account, LedgerEntry } from "@/lib/types"

/** Движения на странице балансов показываем начиная с этой даты. */
const LEDGER_FROM = "2026-02-20"

const TABS = [
  { key: "card" as const, label: "Карта", icon: CreditCard },
  { key: "cash" as const, label: "Наличные", icon: Banknote },
  { key: "all" as const, label: "Всё", icon: Wallet },
]

const RANGES = [
  { key: "7d" as const, label: "7 д" },
  { key: "15d" as const, label: "15 д" },
  { key: "30d" as const, label: "30 д" },
]

function BalancePageContent() {
  const searchParams = useSearchParams()
  const accountParam = searchParams.get("account") ?? "all"
  const tabKey = accountParam === "cash" ? "cash" : accountParam === "card" ? "card" : "all"

  const [range, setRange] = useState<"7d" | "15d" | "30d">("7d")
  const dateTo = new Date().toISOString().slice(0, 10)

  const { data: accountsData } = useSWR<{ accounts: Account[]; total: number }>(accountsKey(), fetcher)
  const ledgerUrl = ledgerKey(
    tabKey === "all" ? undefined : tabKey,
    LEDGER_FROM,
    dateTo
  )
  const { data: ledgerData } = useSWR<{ entries: LedgerEntry[] }>(ledgerUrl, fetcher)
  const summaryUrl = balanceSummaryKey(range)
  const { data: summary } = useSWR(summaryUrl, fetcher)

  const accounts = accountsData?.accounts ?? []
  const entries = ledgerData?.entries ?? []
  const card = accounts.find((a) => a.type === "card")
  const cash = accounts.find((a) => a.type === "cash")
  const total = accountsData?.total ?? 0

  const summaryData = summary as {
    card_out_total?: number
    cash_out_total?: number
    top_merchants_card?: { merchant: string; amount: number }[]
    top_merchants_cash?: { merchant: string; amount: number }[]
    by_category_card?: { category_id: string; amount: number }[]
    by_category_cash?: { category_id: string; amount: number }[]
  } | null

  const topMerchants =
    tabKey === "card"
      ? summaryData?.top_merchants_card ?? []
      : tabKey === "cash"
        ? summaryData?.top_merchants_cash ?? []
        : [
            ...(summaryData?.top_merchants_card ?? []).map((m) => ({ ...m, _type: "card" as const })),
            ...(summaryData?.top_merchants_cash ?? []).map((m) => ({ ...m, _type: "cash" as const })),
          ].sort((a, b) => (b as { amount: number }).amount - (a as { amount: number }).amount).slice(0, 5)

  const byCategory =
    tabKey === "card"
      ? summaryData?.by_category_card ?? []
      : tabKey === "cash"
        ? summaryData?.by_category_cash ?? []
        : []

  const entriesByDay = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>()
    for (const e of entries) {
      const day = e.occurred_on
      const list = map.get(day) ?? []
      list.push(e)
      map.set(day, list)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({ date, items }))
  }, [entries])

  function formatDayLabel(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Балансы</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-secondary">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = tabKey === t.key
            return (
              <a
                key={t.key}
                href={t.key === "all" ? "/app/balance" : `/app/balance?account=${t.key}`}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-card border border-border shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </a>
            )
          })}
        </div>

        {/* Balances: на мобилке одна карточка (как в референсе), на md+ — три */}
        <div className="md:hidden">
          <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted-foreground mb-1">
              {tabKey === "card" ? "Карта" : tabKey === "cash" ? "Наличные" : "Всего"}
            </p>
            <p className="text-2xl font-extrabold tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
              <AnimatedNumber
                value={tabKey === "card" ? (card?.computed_balance ?? 0) : tabKey === "cash" ? (cash?.computed_balance ?? 0) : total}
                format={formatUZS}
                duration={800}
              />
            </p>
          </div>
        </div>
        <div className="hidden md:grid md:grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Карта</p>
            <p className="text-xl font-extrabold tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
              <AnimatedNumber value={card?.computed_balance ?? 0} format={formatUZS} duration={800} />
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Наличные</p>
            <p className="text-xl font-extrabold tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
              <AnimatedNumber value={cash?.computed_balance ?? 0} format={formatUZS} duration={800} />
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Всего</p>
            <p className="text-xl font-extrabold tabular-nums text-foreground whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
              <AnimatedNumber value={total} format={formatUZS} duration={800} delay={100} />
            </p>
          </div>
        </div>

        {/* Куда ушло */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Куда ушло</p>
          <div className="flex gap-1 mb-3">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  range === r.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {topMerchants.length > 0 && (
            <div className="space-y-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Топ мерчанты</p>
              {topMerchants.slice(0, 5).map((m: { merchant: string; amount: number }, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-foreground truncate pr-2">{m.merchant}</span>
                  <span className="text-foreground font-semibold tabular-nums shrink-0">
                    <AnimatedNumber value={m.amount} format={formatUZS} duration={600} delay={i * 50} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {byCategory.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">По категориям</p>
              {byCategory.slice(0, 5).map((c: { category_id: string; amount: number }, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-foreground">{c.category_id}</span>
                  <span className="text-foreground font-semibold tabular-nums">
                    <AnimatedNumber value={c.amount} format={formatUZS} duration={600} delay={i * 50} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Движения: на мобилке — список карточек (как в референсе), на md+ — таблица */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <p className="text-sm font-semibold text-foreground p-4 pb-2">Движения (с 20 февраля)</p>

          {/* Мобильный список — карточки по одной транзакции */}
          <div className="md:hidden space-y-3 px-4 pb-4">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Нет движений с 20 февраля</p>
            ) : (
              entriesByDay.map(({ date, items }) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{formatDayLabel(date)}</p>
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          e.direction === "in"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.direction === "in" ? (
                          <ArrowUpRight className="w-5 h-5" />
                        ) : (
                          <ArrowDownRight className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.merchant || e.note || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.source_label}
                          {e.account_type === "card" ? " · Карта" : e.account_type === "cash" ? " · Наличные" : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm tabular-nums font-semibold ${
                          e.direction === "in" ? "text-green-600 dark:text-green-400" : "text-foreground"
                        }`}
                      >
                        {e.direction === "in" ? "+" : "−"} {formatUZS(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Десктоп: таблица */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Тип</th>
                  <th className="px-4 py-2 font-medium">Описание</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                  <th className="px-4 py-2 font-medium w-16">Счёт</th>
                </tr>
              </thead>
              <tbody>
                {entriesByDay.map(({ date, items }) => (
                  <Fragment key={date}>
                    <tr className="bg-secondary/50 border-b border-border/50">
                      <td colSpan={4} className="px-4 py-2 text-xs font-medium text-muted-foreground">
                        {formatDayLabel(date)}
                      </td>
                    </tr>
                    {items.map((e) => (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="px-4 py-2 text-muted-foreground">{e.source_label}</td>
                        <td className="px-4 py-2 text-foreground truncate max-w-[140px]">
                          {e.merchant || e.note || "—"}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <span className={`tabular-nums font-semibold ${e.direction === "in" ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                            {e.direction === "in" ? "+" : "−"} {formatUZS(e.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {e.account_type === "card" ? "Карта" : e.account_type === "cash" ? "Нал" : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length === 0 && (
            <p className="hidden md:block text-sm text-muted-foreground text-center py-8">Нет движений с 20 февраля</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BalancePage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-4"><div className="h-14" /><div className="animate-pulse rounded-xl bg-secondary h-32 mb-4" /><div className="animate-pulse rounded-xl bg-secondary h-64" /></div>}>
      <BalancePageContent />
    </Suspense>
  )
}
