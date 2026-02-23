"use client"

import { useState, useCallback, useEffect, useMemo, Fragment } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { LayoutGrid, List, ChartBar, ChevronDown, Plus, Search, X, Download, Upload, Pencil, Trash2, Loader2, CheckSquare, Square, Banknote } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatUZS, formatUZSShort } from "@/lib/formatters"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { fetcher, expensesKey, categoriesKey } from "@/lib/api"
import type { Expense, Category } from "@/lib/types"
import Link from "next/link"

type ViewMode = "cards" | "table" | "charts"
type QuickRange = "today" | "7d" | "15d" | "month" | "custom"

const RANGES: { key: QuickRange; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "7d", label: "7 дней" },
  { key: "15d", label: "15 дней" },
  { key: "month", label: "Месяц" },
  { key: "custom", label: "Свой период" },
]

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
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

function canConvertToWithdrawal(expense: Expense): boolean {
  const isUzcash = /uzcash/i.test((expense.merchant ?? "").trim())
  const isTransferExcluded = expense.category_id === "transfers" && expense.exclude_from_budget
  return isUzcash || !!isTransferExcluded
}

/** Group expenses by date for table view */
function groupExpensesByDate(expenses: Expense[]): { date: string; items: Expense[]; dayTotal: number }[] {
  const groups = new Map<string, Expense[]>()
  for (const e of expenses) {
    const list = groups.get(e.date) ?? []
    list.push(e)
    groups.set(e.date, list)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      items,
      dayTotal: items.reduce((s, x) => s + x.amount, 0),
    }))
}

function formatDateLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
}

export default function ExpensesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [range, setRange] = useState<QuickRange>("month")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const [customDateFrom, setCustomDateFrom] = useState(firstDayOfMonth)
  const [customDateTo, setCustomDateTo] = useState(todayStr)

  const baseExpensesUrl =
    range === "custom"
      ? `${expensesKey("month")}&date_from=${customDateFrom}&date_to=${customDateTo}`
      : expensesKey(range)
  const expensesUrl =
    baseExpensesUrl +
    (searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : "") +
    (categoryFilter !== "all" ? `&category_id=${categoryFilter}` : "")
  const { data: expenses = [], mutate } = useSWR<Expense[]>(expensesUrl, fetcher)
  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  const periodTotal = expenses.reduce((s, e) => s + e.amount, 0)

  const chartData = useMemo(() => {
    const byDay: Record<string, number> = {}
    const byCategory: Record<string, { name: string; value: number; fill: string }> = {}
    const byMerchant: Record<string, number> = {}
    const byPaymentMethod: Record<string, number> = { card: 0, cash: 0, other: 0 }
    const byDayByCategory: Record<string, Record<string, number>> = {}
    expenses.forEach((e) => {
      byDay[e.date] = (byDay[e.date] ?? 0) + e.amount
      const catLabel = getCategoryLabel(categories, e.category_id)
      if (!byCategory[e.category_id]) {
        byCategory[e.category_id] = {
          name: catLabel,
          value: 0,
          fill: CHART_COLORS[Object.keys(byCategory).length % CHART_COLORS.length],
        }
      }
      byCategory[e.category_id].value += e.amount
      const pm = e.payment_method === "cash" ? "cash" : e.payment_method === "card" ? "card" : "other"
      byPaymentMethod[pm] += e.amount
      if (!byDayByCategory[e.date]) byDayByCategory[e.date] = {}
      byDayByCategory[e.date][catLabel] = (byDayByCategory[e.date][catLabel] ?? 0) + e.amount
      const m = (e.merchant || "").trim() || "Без названия"
      byMerchant[m] = (byMerchant[m] ?? 0) + e.amount
    })
    const spendingByDay = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        day: new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        date,
        amount,
      }))
    const categoryBreakdown = Object.values(byCategory).filter((c) => c.value > 0)
    const paymentBreakdown = [
      { name: "Карта", value: byPaymentMethod.card, fill: "var(--color-chart-1)" },
      { name: "Наличные", value: byPaymentMethod.cash, fill: "var(--color-chart-2)" },
      ...(byPaymentMethod.other > 0 ? [{ name: "Не указан", value: byPaymentMethod.other, fill: "var(--color-muted-foreground)" }] : []),
    ].filter((x) => x.value > 0)
    const catNames = categoryBreakdown.map((c) => c.name)
    const dailyByCategory = spendingByDay.map(({ day, date }) => {
      const row: Record<string, string | number> = { day, date }
      catNames.forEach((name) => {
        row[name] = byDayByCategory[date]?.[name] ?? 0
      })
      return row
    })
    const topMerchants = Object.entries(byMerchant)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    return {
      spendingByDay,
      categoryBreakdown,
      topMerchants,
      paymentBreakdown,
      dailyByCategory,
      catNames,
      categoryColors: Object.fromEntries(categoryBreakdown.map((c, i) => [c.name, c.fill])),
    }
  }, [expenses, categories])
  const isSelectionMode = selectionMode

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === expenses.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(expenses.map((e) => e.id)))
    }
  }, [expenses, selectedIds.size])

  const handleSaveEdit = useCallback(async (payload: { merchant: string; category_id: string; amount: number; date: string; note: string | null; exclude_from_budget?: boolean; payment_method?: "card" | "cash" }) => {
    if (!editExpense) return
    setSaving(true)
    try {
      const res = await fetch(`/api/expenses/${editExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditExpense(null)
      mutate()
    } catch {
      // TODO: toast
    } finally {
      setSaving(false)
    }
  }, [editExpense, mutate])

  const handleDeleteOne = useCallback(async () => {
    if (!deleteExpense) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/expenses/${deleteExpense.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await res.text())
      setDeleteExpense(null)
      mutate()
    } catch {
      // TODO: toast
    } finally {
      setDeleting(false)
    }
  }, [deleteExpense, mutate])

  const [convertingId, setConvertingId] = useState<string | null>(null)
  const handleConvertToWithdrawal = useCallback(
    async (expense: Expense) => {
      if (!canConvertToWithdrawal(expense)) return
      setConvertingId(expense.id)
      try {
        const res = await fetch(`/api/expenses/${expense.id}/convert-to-withdrawal`, { method: "POST" })
        if (!res.ok) throw new Error(await res.text())
        setEditExpense(null)
        setDetailExpense(null)
        mutate()
      } catch {
        // TODO: toast
      } finally {
        setConvertingId(null)
      }
    },
    [mutate]
  )

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setDeleting(true)
    try {
      const res = await fetch("/api/expenses/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSelectedIds(new Set())
      setSelectionMode(false)
      setBulkDeleteOpen(false)
      mutate()
    } catch {
      // TODO: toast
    } finally {
      setDeleting(false)
    }
  }, [selectedIds, mutate])

  const handleExport = () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    let from = today
    if (range === "7d") from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    else if (range === "15d") from = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    else if (range === "month") from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    const params = new URLSearchParams()
    params.set("from", from)
    params.set("to", today)
    if (categoryFilter !== "all") params.set("category_id", categoryFilter)
    if (searchQuery) params.set("q", searchQuery)
    window.open(`/api/export/expenses.xlsx?${params.toString()}`, "_blank")
  }

  return (
    <div className="max-w-4xl mx-auto">
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
              <button
                onClick={() => setViewMode("charts")}
                className={`p-1.5 rounded-sm transition-colors ${
                  viewMode === "charts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                aria-label="Графики"
              >
                <ChartBar className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 flex flex-col gap-4">
        {/* Quick Range Filters */}
        <div className="flex flex-col gap-2">
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
          {range === "custom" && (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-secondary border border-border">
              <Label className="text-xs text-muted-foreground shrink-0">С</Label>
              <Input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="h-8 w-[140px] bg-card border-border text-sm"
              />
              <Label className="text-xs text-muted-foreground shrink-0">по</Label>
              <Input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="h-8 w-[140px] bg-card border-border text-sm"
              />
            </div>
          )}
        </div>

        {/* Period Total — mobile: stack, desktop: row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Итого за период</p>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-foreground">
              <AnimatedNumber value={periodTotal} format={formatUZS} duration={800} />
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{expenses.length} расходов</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!selectionMode ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectionMode(true)}
                className="h-8 border-border"
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                Выбрать
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 border-border gap-1.5">
                  Файл
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="w-4 h-4" />
                  Экспорт
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/app/import">
                    <Upload className="w-4 h-4" />
                    Импорт
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Selection bar */}
        <AnimatePresence>
          {isSelectionMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-secondary border border-border"
            >
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                {selectedIds.size === expenses.length ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
                <span>{selectedIds.size === expenses.length ? "Снять все" : "Выбрать все"}</span>
              </button>
              <span className="text-sm text-muted-foreground">{selectedIds.size} выбрано</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                className="h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Удалить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedIds(new Set())
                  setSelectionMode(false)
                }}
                className="h-8"
              >
                Отмена
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Charts view */}
        {viewMode === "charts" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-6"
          >
            {/* Сводка за период */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Итого за период</p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums text-foreground">
                  <AnimatedNumber value={periodTotal} format={formatUZS} duration={700} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">В среднем в день</p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums text-foreground">
                  {chartData.spendingByDay.length > 0 ? (
                    <AnimatedNumber
                      value={Math.round(periodTotal / chartData.spendingByDay.length)}
                      format={formatUZS}
                      duration={700}
                      delay={80}
                    />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Операций</p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums text-foreground">
                  <AnimatedNumber value={expenses.length} integer duration={600} delay={120} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Дней с расходами</p>
                <p className="text-xl sm:text-2xl font-extrabold tabular-nums text-foreground">
                  <AnimatedNumber value={chartData.spendingByDay.length} integer duration={600} delay={160} />
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-medium text-foreground mb-4">Расходы по дням</p>
              <div className="h-56">
                {chartData.spendingByDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.spendingByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 600 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 13, fontWeight: 600 }}
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
                        formatter={(value: number) => [formatUZSShort(value), "Расход"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={{ fill: "var(--color-primary)", r: 3 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Нет данных за период</p>
                )}
              </div>
            </div>

            {/* По дням и категориям (stacked) */}
            {chartData.dailyByCategory.length > 0 && chartData.catNames.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm font-medium text-foreground mb-4">По дням по категориям</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.dailyByCategory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 600 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 13, fontWeight: 600 }}
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
                        formatter={(value: number) => [formatUZSShort(Number(value)), ""]}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0)
                          return (
                            <div className="rounded-lg border border-border bg-card p-3 shadow-sm text-sm">
                              <p className="font-medium text-foreground mb-1">{label}</p>
                              {payload.filter((p) => Number(p.value) > 0).map((p) => (
                                <p key={p.name} className="text-muted-foreground">
                                  {p.name}: {formatUZSShort(Number(p.value))}
                                </p>
                              ))}
                              <p className="text-foreground font-medium mt-1">Итого: {formatUZSShort(total)}</p>
                            </div>
                          )
                        }}
                      />
                      {chartData.catNames.map((name) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          stackId="day"
                          fill={chartData.categoryColors[name] ?? "var(--color-muted)"}
                          radius={[0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm font-medium text-foreground mb-4">По категориям</p>
                <div className="h-64">
                  {chartData.categoryBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.categoryBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {chartData.categoryBreakdown.map((_, index) => (
                            <Cell key={index} fill={chartData.categoryBreakdown[index].fill} />
                          ))}
                        </Pie>
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
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">Нет данных за период</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm font-medium text-foreground mb-4">По способу оплаты</p>
                <div className="h-64">
                  {chartData.paymentBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.paymentBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {chartData.paymentBreakdown.map((_, index) => (
                            <Cell key={index} fill={chartData.paymentBreakdown[index].fill} />
                          ))}
                        </Pie>
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
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">Нет данных за период</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-medium text-foreground mb-4">Топ-10 мерчантов</p>
              <div className="h-72 min-h-[220px]">
                {chartData.topMerchants.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData.topMerchants}
                      layout="vertical"
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 13, fontWeight: 600 }}
                        tickFormatter={(v) => formatUZSShort(v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 600 }}
                        tickFormatter={(v) => (v.length > 14 ? v.slice(0, 12) + "…" : v)}
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
                      <Bar dataKey="value" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Нет данных за период</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* List (cards or table) */}
        {viewMode !== "charts" && (
        <AnimatePresence mode="wait">
          {viewMode === "cards" ? (
            <motion.div
              key="cards"
              variants={stagger}
              initial="hidden"
              animate="show"
              className="flex flex-col rounded-xl border border-border bg-card overflow-hidden px-4"
            >
              {expenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  categories={categories}
                  fadeUp={fadeUp}
                  selected={selectedIds.has(expense.id)}
                  onToggleSelect={toggleSelect}
                  onDetailClick={() => setDetailExpense(expense)}
                  onEdit={() => setEditExpense(expense)}
                  onDelete={() => setDeleteExpense(expense)}
                  showActions
                  showCheckbox={selectionMode}
                />
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
              className="rounded-xl border border-border bg-card overflow-hidden w-full"
            >
              {/* Mobile: list with grid (no table) */}
              <ul className="md:hidden divide-y divide-border">
                {groupExpensesByDate(expenses).map((group) => (
                  <Fragment key={group.date}>
                    <li className="px-4 py-2 bg-secondary/30 text-xs font-medium text-muted-foreground flex justify-between items-center">
                      <span>{formatDateLabel(group.date)}</span>
                      <span>{formatUZS(group.dayTotal)}</span>
                    </li>
                    {group.items.map((expense) => (
                      <li
                        key={expense.id}
                        className={`grid gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer items-start ${selectionMode ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]"}`}
                        style={{ gridTemplateColumns: selectionMode ? "auto 1fr auto" : "1fr auto" }}
                        onClick={() => setDetailExpense(expense)}
                      >
                        {selectionMode && (
                          <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleSelect(expense.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {selectedIds.has(expense.id) ? (
                                <CheckSquare className="w-5 h-5 text-primary" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-1">{expense.merchant}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {getCategoryLabel(categories, expense.category_id)} · {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{formatUZS(expense.amount)}</span>
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            {canConvertToWithdrawal(expense) && (
                              <button
                                onClick={() => handleConvertToWithdrawal(expense)}
                                disabled={convertingId === expense.id}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                aria-label="Преобразовать в снятие наличных"
                                title="Снятие наличных"
                              >
                                {convertingId === expense.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Banknote className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => setEditExpense(expense)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-secondary active:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Редактировать"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteExpense(expense)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-destructive/10 active:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                              aria-label="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </Fragment>
                ))}
                {expenses.length === 0 && (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    Нет расходов за выбранный период
                  </li>
                )}
              </ul>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto w-full">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {selectionMode && (
                        <th className="w-10 px-2 py-3 text-center">
                          <button
                            onClick={toggleSelectAll}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Выбрать все"
                          >
                            {selectedIds.size === expenses.length && expenses.length > 0 ? (
                              <CheckSquare className="w-4 h-4 text-primary mx-auto" />
                            ) : (
                              <Square className="w-4 h-4 mx-auto" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Название</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-muted-foreground">Категория</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-muted-foreground">Дата</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Сумма</th>
                      <th className="w-20 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {groupExpensesByDate(expenses).map((group) => (
                      <Fragment key={group.date}>
                        <tr className="border-t-2 border-border bg-secondary/30">
                          <td colSpan={selectionMode ? 4 : 3} className="px-4 py-2 text-xs font-medium text-muted-foreground">
                            {formatDateLabel(group.date)}
                          </td>
                          <td colSpan={2} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                            {formatUZS(group.dayTotal)}
                          </td>
                        </tr>
                        {group.items.map((expense) => (
                          <tr
                            key={expense.id}
                            className="border-b border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                            onClick={() => setDetailExpense(expense)}
                          >
                            {selectionMode && (
                              <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => toggleSelect(expense.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  {selectedIds.has(expense.id) ? (
                                    <CheckSquare className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                            )}
                            <td className="px-4 py-3 text-foreground">{expense.merchant}</td>
                            <td className="px-2 py-3">
                              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                                {getCategoryLabel(categories, expense.category_id)}
                              </Badge>
                            </td>
                            <td className="px-2 py-3 text-muted-foreground text-xs">
                              {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">{formatUZS(expense.amount)}</td>
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5">
                                {canConvertToWithdrawal(expense) && (
                                  <button
                                    onClick={() => handleConvertToWithdrawal(expense)}
                                    disabled={convertingId === expense.id}
                                    className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    aria-label="Преобразовать в снятие наличных"
                                    title="Снятие наличных"
                                  >
                                    {convertingId === expense.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Banknote className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditExpense(expense)}
                                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                                  aria-label="Редактировать"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteExpense(expense)}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  aria-label="Удалить"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan={selectionMode ? 6 : 5} className="text-center py-8 text-sm text-muted-foreground">
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
        )}
      </div>

      {/* Detail popup (mobile / row click) */}
      <Dialog open={!!detailExpense} onOpenChange={(o) => !o && setDetailExpense(null)}>
        <DialogContent className="bg-card border-border !max-w-[min(400px,calc(100vw-3rem))]">
          <DialogHeader>
            <DialogTitle className="text-foreground">Расход</DialogTitle>
          </DialogHeader>
          {detailExpense && (
            <div className="flex flex-col gap-4 py-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Название</p>
                <p className="text-base font-medium text-foreground">{detailExpense.merchant}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Категория</p>
                <p className="text-base font-medium text-foreground">
                  {getCategoryLabel(categories, detailExpense.category_id)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Дата</p>
                <p className="text-base font-medium text-foreground">
                  {new Date(detailExpense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Сумма</p>
                <p className="text-xl font-bold text-foreground">{formatUZS(detailExpense.amount)}</p>
              </div>
              {detailExpense.note && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Заметка</p>
                  <p className="text-sm text-foreground">{detailExpense.note}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-border"
                  onClick={() => {
                    setEditExpense(detailExpense)
                    setDetailExpense(null)
                  }}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Изменить
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setDeleteExpense(detailExpense)
                    setDetailExpense(null)
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Удалить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <ExpenseEditDialog
        expense={editExpense}
        categories={categories}
        onClose={() => setEditExpense(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleteExpense} onOpenChange={(open) => !open && setDeleteExpense(null)}>
        <AlertDialogContent className="bg-card border-border max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Удалить расход?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {deleteExpense && (
                <>«{deleteExpense.merchant}» — {formatUZS(deleteExpense.amount)}. Действие нельзя отменить.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                handleDeleteOne()
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="bg-card border-border max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Удалить выбранные расходы?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Будет удалено {selectedIds.size} расходов. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                handleBulkDelete()
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ExpenseCard({
  expense,
  categories,
  fadeUp,
  selected,
  onToggleSelect,
  onDetailClick,
  onEdit,
  onDelete,
  showActions,
  showCheckbox,
}: {
  expense: Expense
  categories: Category[]
  fadeUp: typeof fadeUp
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onDetailClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  showActions?: boolean
  showCheckbox?: boolean
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`flex items-center gap-3 py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors ${
        selected ? "ring-2 ring-primary/50 ring-inset" : ""
      }`}
    >
      {showCheckbox && onToggleSelect && (
        <button
          onClick={() => onToggleSelect(expense.id)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
        </button>
      )}
      <div className={`w-2 h-10 rounded-full shrink-0 ${getCategoryColor(categories, expense.category_id)}`} />
      <button
        onClick={onDetailClick}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-sm font-medium text-foreground truncate">{expense.merchant}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground px-1.5 py-0">
            {getCategoryLabel(categories, expense.category_id)}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </span>
        </div>
      </button>
      <p className="text-sm font-semibold text-foreground whitespace-nowrap shrink-0">{formatUZS(expense.amount)}</p>
      {showActions && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.() }}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="Редактировать"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.() }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            aria-label="Удалить"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

function ExpenseEditDialog({
  expense,
  categories,
  onClose,
  onSave,
  saving,
}: {
  expense: Expense | null
  categories: Category[]
  onClose: () => void
  onSave: (p: { merchant: string; category_id: string; amount: number; date: string; note: string | null; exclude_from_budget?: boolean; payment_method?: "card" | "cash" }) => void
  saving: boolean
}) {
  const [merchant, setMerchant] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [note, setNote] = useState("")
  const [includeInBudget, setIncludeInBudget] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const open = !!expense
  useEffect(() => {
    if (expense) {
      setMerchant(expense.merchant)
      setCategoryId(expense.category_id)
      setAmount(String(expense.amount))
      setDate(expense.date)
      setNote(expense.note ?? "")
      setIncludeInBudget(!expense.exclude_from_budget)
      setPaymentMethod(expense.payment_method === "cash" ? "cash" : "card")
    } else {
      setMerchant("")
      setCategoryId("")
      setAmount("")
      setDate("")
      setNote("")
      setIncludeInBudget(true)
      setPaymentMethod("card")
    }
  }, [expense])

  const reset = () => {
    setMerchant("")
    setCategoryId("")
    setAmount("")
    setDate("")
    setNote("")
    setIncludeInBudget(true)
    setPaymentMethod("card")
    setConfirmOpen(false)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      reset()
      onClose()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !categoryId) return
    setConfirmOpen(true)
  }

  const handleConfirmSave = () => {
    const amt = Number(amount)
    if (!amount || !categoryId || isNaN(amt) || amt <= 0) return
    onSave({
      merchant: merchant.trim() || "Без названия",
      category_id: categoryId,
      amount: amt,
      date: date || new Date().toISOString().slice(0, 10),
      note: note.trim() || null,
      exclude_from_budget: !includeInBudget,
      payment_method: paymentMethod,
    })
    reset()
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Редактировать расход</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-merchant" className="text-sm text-muted-foreground">Название</Label>
              <Input
                id="edit-merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm text-muted-foreground">Способ оплаты</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                    paymentMethod === "card" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  Карта
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                    paymentMethod === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  Наличные
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm text-muted-foreground">Учитывать в бюджете</Label>
              <button
                type="button"
                role="switch"
                aria-checked={includeInBudget}
                onClick={() => setIncludeInBudget((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${includeInBudget ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform ${includeInBudget ? "translate-x-5" : "translate-x-1"}`} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm text-muted-foreground">Категория</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-amount" className="text-sm text-muted-foreground">Сумма</Label>
              <Input
                id="edit-amount"
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-date" className="text-sm text-muted-foreground">Дата</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-note" className="text-sm text-muted-foreground">Заметка</Label>
              <Textarea
                id="edit-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="bg-secondary border-border min-h-[60px] resize-none"
                placeholder="Необязательно"
              />
            </div>
            <DialogFooter className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} className="border-border text-foreground">
                Отмена
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border-border max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Сохранить изменения?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Изменения будут применены к расходу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConfirmSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
