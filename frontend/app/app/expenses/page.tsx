"use client"

import { useState, useCallback, useEffect, Fragment } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { LayoutGrid, List, ChevronDown, Plus, Search, X, Download, Upload, Pencil, Trash2, Loader2, CheckSquare, Square } from "lucide-react"
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
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const expensesUrl = expensesKey(range) + (searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : "") + (categoryFilter !== "all" ? `&category_id=${categoryFilter}` : "")
  const { data: expenses = [], mutate } = useSWR<Expense[]>(expensesUrl, fetcher)
  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  const periodTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const isSelectionMode = selectedIds.size > 0

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

  const handleSaveEdit = useCallback(async (payload: { merchant: string; category_id: string; amount: number; date: string; note: string | null }) => {
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
                onClick={() => setSelectedIds(new Set())}
                className="h-8"
              >
                Отмена
              </Button>
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
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="overflow-x-auto max-w-full">
                <table className="w-full text-sm min-w-0">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-10 px-2 py-3 text-center shrink-0">
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
                      <th className="text-left px-3 md:px-4 py-3 text-xs font-medium text-muted-foreground">Название</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Категория</th>
                      <th className="text-left px-2 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Дата</th>
                      <th className="text-right px-3 md:px-4 py-3 text-xs font-medium text-muted-foreground">Сумма</th>
                      <th className="w-20 px-2 py-3 hidden md:table-cell" />
                    </tr>
                  </thead>
                  <tbody>
                    {groupExpensesByDate(expenses).map((group) => (
                      <Fragment key={group.date}>
                        <tr className="border-t-2 border-border bg-secondary/30">
                          <td colSpan={4} className="px-3 md:px-4 py-2 text-xs font-medium text-muted-foreground">
                            {formatDateLabel(group.date)}
                          </td>
                          <td colSpan={2} className="px-3 md:px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                            {formatUZS(group.dayTotal)}
                          </td>
                        </tr>
                        {group.items.map((expense) => (
                          <tr
                            key={expense.id}
                            className="border-b border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                            onClick={() => setDetailExpense(expense)}
                          >
                            <td className="px-2 py-3 text-center shrink-0" onClick={(e) => e.stopPropagation()}>
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
                            <td className="px-3 md:px-4 py-3 text-foreground truncate max-w-[120px] md:max-w-none">{expense.merchant}</td>
                            <td className="px-2 py-3 hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                                {getCategoryLabel(categories, expense.category_id)}
                              </Badge>
                            </td>
                            <td className="px-2 py-3 text-muted-foreground text-xs hidden md:table-cell">
                              {new Date(expense.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            </td>
                            <td className="px-3 md:px-4 py-3 text-right font-medium text-foreground shrink-0">{formatUZS(expense.amount)}</td>
                            <td className="px-2 py-3 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-0.5">
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
                        <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
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

      {/* Detail popup (mobile / row click) */}
      <Dialog open={!!detailExpense} onOpenChange={(o) => !o && setDetailExpense(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
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
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`flex items-center gap-3 py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors ${
        selected ? "ring-2 ring-primary/50 ring-inset" : ""
      }`}
    >
      {showActions && onToggleSelect && (
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
  onSave: (p: { merchant: string; category_id: string; amount: number; date: string; note: string | null }) => void
  saving: boolean
}) {
  const [merchant, setMerchant] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [note, setNote] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const open = !!expense
  useEffect(() => {
    if (expense) {
      setMerchant(expense.merchant)
      setCategoryId(expense.category_id)
      setAmount(String(expense.amount))
      setDate(expense.date)
      setNote(expense.note ?? "")
    } else {
      setMerchant("")
      setCategoryId("")
      setAmount("")
      setDate("")
      setNote("")
    }
  }, [expense])

  const reset = () => {
    setMerchant("")
    setCategoryId("")
    setAmount("")
    setDate("")
    setNote("")
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
