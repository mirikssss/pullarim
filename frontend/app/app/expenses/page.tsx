"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { LayoutGrid, List, ChevronDown, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatUZS } from "@/lib/formatters"
import { fetcher, expensesKey, categoriesKey } from "@/lib/api"
import type { Expense, Category } from "@/lib/types"
import Link from "next/link"

type ViewMode = "cards" | "table"
type QuickRange = "today" | "7d" | "15d" | "month"

const RANGES = [
  { key: "today" as const, label: "Сегодня" },
  { key: "7d" as const, label: "7 дней" },
  { key: "15d" as const, label: "15 дней" },
  { key: "month" as const, label: "Месяц" },
]

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

function getCategoryLabel(categories: Category[], id: string) {
  return categories.find((c) => c.id === id)?.label ?? id
}

function getCategoryColor(categories: Category[], id: string) {
  return categories.find((c) => c.id === id)?.color ?? "bg-muted"
}

export default function ExpensesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [range, setRange] = useState<QuickRange>("month")

  const expensesUrl = expensesKey(range) + (searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : "") + (categoryFilter !== "all" ? `&category_id=${categoryFilter}` : "")
  const { data: expenses = [], mutate } = useSWR<Expense[]>(expensesUrl, fetcher)
  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  const periodTotal = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Расходы</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 p-0.5 rounded-md bg-secondary">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-1.5 rounded-sm transition-colors ${
                  viewMode === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                aria-label="Вид карточками"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-sm transition-colors ${
                  viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                aria-label="Вид таблицей"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-4">
        {/* Quick Range Filters */}
        <div className="flex gap-1 p-1 rounded-lg bg-secondary">
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
                  layoutId="expense-range"
                  className="absolute inset-0 rounded-md bg-card border border-border shadow-sm"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{r.label}</span>
            </button>
          ))}
        </div>

        {/* Period Total */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Итого за период</p>
            <p className="text-xl font-bold text-foreground">{formatUZS(periodTotal)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{expenses.length} расходов</span>
            <Link href="/app/add">
              <Button size="sm" className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Добавить
              </Button>
            </Link>
          </div>
        </div>

        {/* Advanced Filters (Collapsible) */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          Фильтры
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по названию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-secondary border-border h-9"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-secondary border-border h-9">
                    <SelectValue placeholder="Категория" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">Все категории</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        <AnimatePresence mode="wait">
          {viewMode === "cards" ? (
            <motion.div
              key="cards"
              variants={stagger}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-2"
            >
              {expenses.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} categories={categories} fadeUp={fadeUp} />
              ))}
              {expenses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Нет расходов за выбранный период</p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Название</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Категория</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Дата</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                        <td className="px-4 py-3 text-foreground">{expense.merchant}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                            {getCategoryLabel(categories, expense.category_id)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{formatUZS(expense.amount)}</td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                          Нет расходов за выбранный период
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ExpenseCard({ expense, categories, fadeUp }: { expense: Expense; categories: Category[]; fadeUp: typeof fadeUp }) {
  return (
    <motion.div
      variants={fadeUp}
      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-card/90 transition-colors shadow-[var(--shadow-card)]"
    >
      <div className={`w-2 h-10 rounded-full ${getCategoryColor(categories, expense.category_id)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{expense.merchant}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground px-1.5 py-0">
            {getCategoryLabel(categories, expense.category_id)}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold text-foreground whitespace-nowrap">{formatUZS(expense.amount)}</p>
    </motion.div>
  )
}
