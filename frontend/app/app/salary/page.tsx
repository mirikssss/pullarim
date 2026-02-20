"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import {
  CalendarDays,
  Check,
  Clock,
  Banknote,
  ChevronRight,
  AlertCircle,
  Settings2,
  ChevronLeft,
  TrendingUp,
  Plus,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { formatUZS } from "@/lib/formatters"
import {
  fetcher,
  salaryModesKey,
  salaryExceptionsKey,
  salaryForecastKey,
  salaryPaymentsKey,
  salaryIncomeSummaryKey,
} from "@/lib/api"
import type { SalaryMode, Payment } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const YTD_FROM = "2026-01-05"

function getMonthDays(year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: lastDay }, (_, i) => {
    const date = new Date(year, month, i + 1)
    const dow = date.getDay()
    return {
      day: i + 1,
      isWeekday: dow >= 1 && dow <= 5,
      dow,
    }
  })
}

export default function SalaryPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [yearFilter, setYearFilter] = useState<string>(String(now.getFullYear()))
  const [markReceivedOpen, setMarkReceivedOpen] = useState(false)
  const [markReceivedData, setMarkReceivedData] = useState<{
    period: string
    expectedAmount: number
    periodLabel: string
  } | null>(null)
  const [payDate, setPayDate] = useState("")
  const [payAmount, setPayAmount] = useState("")
  const [saving, setSaving] = useState(false)
  const [addModeOpen, setAddModeOpen] = useState(false)
  const [newModeLabel, setNewModeLabel] = useState("")
  const [newModeAmount, setNewModeAmount] = useState("")
  const [newModeStartDate, setNewModeStartDate] = useState("")
  const [newModeEndDate, setNewModeEndDate] = useState("")
  const [newModeActive, setNewModeActive] = useState(true)
  const [savingMode, setSavingMode] = useState(false)
  const [editModeOpen, setEditModeOpen] = useState(false)
  const [editMode, setEditMode] = useState<SalaryMode | null>(null)
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`

  const { data: modes = [], mutate: mutateModes } = useSWR<SalaryMode[]>(salaryModesKey(), fetcher)
  const { data: exceptionsList = [], mutate: mutateExceptions } = useSWR(
    salaryExceptionsKey(monthStr),
    fetcher
  )
  const { data: forecast, mutate: mutateForecast } = useSWR(salaryForecastKey(monthStr), fetcher)
  const { data: payments = [], mutate: mutatePayments } = useSWR<Payment[]>(
    salaryPaymentsKey(yearFilter),
    fetcher
  )
  const { data: paymentsForReceived = [], mutate: mutatePaymentsForReceived } = useSWR<Payment[]>(
    salaryPaymentsKey(String(year)),
    fetcher
  )
  const { data: incomeSummary, mutate: mutateIncome } = useSWR(
    salaryIncomeSummaryKey(YTD_FROM, now.toISOString().slice(0, 10)),
    fetcher
  )

  const exceptionDates = useMemo(
    () => new Set((exceptionsList as { date: string }[]).map((e) => e.date)),
    [exceptionsList]
  )

  const activeMode = modes.find((m) => m.active) || modes[0]
  const monthDays = useMemo(() => getMonthDays(year, month), [year, month])
  const totalWeekdays = monthDays.filter((d) => d.isWeekday).length

  const goPrevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const goNextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const toggleDay = async (dayNum: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
    const isException = exceptionDates.has(dateStr)
    try {
      if (isException) {
        await fetch(`/api/salary/exceptions?date=${dateStr}`, { method: "DELETE" })
      } else {
        await fetch("/api/salary/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr }),
        })
      }
      mutateExceptions()
      mutateForecast()
    } catch {
      // TODO: toast
    }
  }

  const isWorked = (d: { day: number; isWeekday: boolean }) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
    const isException = exceptionDates.has(dateStr)
    return d.isWeekday ? !isException : isException
  }

  const period1Days = monthDays.filter((d) => d.day <= 15)
  const period2Days = monthDays.filter((d) => d.day >= 16)
  const worked1 = period1Days.filter(isWorked).length
  const worked2 = period2Days.filter(isWorked).length

  const forecast1 = forecast?.payout_20th ?? 0
  const forecast2 = forecast?.payout_5th_next ?? 0
  const N = forecast?.N ?? totalWeekdays

  const openMarkReceived = (periodLabel: string, period: string, expectedAmount: number) => {
    setMarkReceivedData({ period, expectedAmount, periodLabel })
    setPayAmount(String(expectedAmount))
    setPayDate(now.toISOString().slice(0, 10))
    setMarkReceivedOpen(true)
  }

  const saveNewMode = async () => {
    if (!newModeLabel || !newModeAmount || !newModeStartDate) return
    if (!newModeActive && !newModeEndDate) return
    setSavingMode(true)
    try {
      await fetch("/api/salary/modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newModeLabel,
          amount: Number(newModeAmount),
          start_date: newModeStartDate.slice(0, 10),
          end_date: newModeEndDate ? newModeEndDate.slice(0, 10) : undefined,
          active: newModeActive,
        }),
      })
      mutateModes()
      mutateForecast()
      setAddModeOpen(false)
      setNewModeLabel("")
      setNewModeAmount("")
      setNewModeStartDate("")
      setNewModeEndDate("")
      setNewModeActive(true)
    } catch {
      // TODO: toast
    } finally {
      setSavingMode(false)
    }
  }

  const handleAddMode = () => {
    setNewModeStartDate(new Date().toISOString().slice(0, 10))
    setNewModeEndDate("")
    setAddModeOpen(true)
  }

  const openEditMode = (mode: SalaryMode) => {
    setEditMode(mode)
    setEditStartDate(mode.start_date.slice(0, 10))
    setEditEndDate(mode.end_date?.slice(0, 10) ?? "")
    setEditModeOpen(true)
  }

  const saveEditMode = async () => {
    if (!editMode) return
    setSavingEdit(true)
    try {
      await fetch("/api/salary/modes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editMode.id,
          start_date: editStartDate.slice(0, 10),
          end_date: editEndDate || null,
        }),
      })
      mutateModes()
      mutateForecast()
      setEditModeOpen(false)
      setEditMode(null)
    } catch {
      // TODO: toast
    } finally {
      setSavingEdit(false)
    }
  }

  const saveMarkReceived = async () => {
    if (!markReceivedData) return
    setSaving(true)
    try {
      await fetch("/api/salary/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: markReceivedData.period,
          pay_date: payDate,
          amount: Number(payAmount) || markReceivedData.expectedAmount,
          received: true,
        }),
      })
      mutatePayments()
      mutatePaymentsForReceived()
      mutateIncome()
      setMarkReceivedOpen(false)
      setMarkReceivedData(null)
    } catch {
      // TODO: toast
    } finally {
      setSaving(false)
    }
  }

  const lastDay = new Date(year, month + 1, 0).getDate()
  const period1Str = `1–15 ${new Date(year, month).toLocaleDateString("ru-RU", { month: "short" })}`
  const period2Str = `16–${lastDay} ${new Date(year, month).toLocaleDateString("ru-RU", { month: "short" })}`

  const incomeData = incomeSummary as { total_received?: number; payments?: Payment[] } | undefined
  const totalReceived = incomeData?.total_received ?? 0
  const lastPayments = (incomeData?.payments ?? []).slice(0, 3)

  const firstDayDow = new Date(year, month, 1).getDay()
  const startOffset = firstDayDow === 0 ? 6 : firstDayDow - 1

  const breakdown20th = (forecast as { breakdown_20th?: { label: string; amount: number; days: number }[] })?.breakdown_20th ?? []
  const breakdown5th = (forecast as { breakdown_5th_next?: { label: string; amount: number; days: number }[] })?.breakdown_5th_next ?? []

  const period1Key = `${year}-${String(month + 1).padStart(2, "0")}-01..${year}-${String(month + 1).padStart(2, "0")}-15`
  const period2Key = `${year}-${String(month + 1).padStart(2, "0")}-16..${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  const period1Received = paymentsForReceived.some((p) => p.period === period1Key && p.received)
  const period2Received = paymentsForReceived.some((p) => p.period === period2Key && p.received)

  const cardShadow = "shadow-[var(--shadow-card)]"

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with month navigation */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Зарплата</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={goPrevMonth}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs min-w-[120px] justify-center">
              {new Date(year, month).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={goNextMonth}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 p-4"
      >
        {/* Warning: days before first mode */}
        {(forecast as { has_days_before_first_mode?: boolean })?.has_days_before_first_mode && (
          <motion.div
            variants={fadeUp}
            className={`rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 ${cardShadow}`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Нет режима для части месяца
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                  В выбранном месяце есть дни до {(forecast as { earliest_mode_date?: string })?.earliest_mode_date}. Для них прогноз = 0. Добавьте режим с более ранней датой начала.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* YTD Income Card */}
        <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Получено в 2026 (с 5 янв)</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-3">{formatUZS(totalReceived)}</p>
          {lastPayments.length > 0 && (
            <div className="space-y-1.5">
              {lastPayments.map((p) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {new Date(p.pay_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — {p.period}
                  </span>
                  <span className="font-medium text-foreground">{formatUZS(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Active Mode Badge */}
        <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{activeMode?.label ?? "—"}</p>
                <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5 py-0">Активный</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{activeMode ? formatUZS(activeMode.amount) : "—"} / мес (на руки)</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </motion.div>

        {/* Calendar Grid */}
        <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Рабочие дни</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {worked1 + worked2}/{totalWeekdays} (N={N})
            </span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="border-border text-muted-foreground text-[10px] px-1.5 py-0">
              Авто: Пн-Пт
            </Badge>
            {exceptionDates.size > 0 && (
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-1.5 py-0">
                <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                Исключения: {exceptionDates.size}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {monthDays.map((d) => {
              const worked = isWorked(d)
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
              const isToday = d.day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
              const isException = exceptionDates.has(dateStr)

              return (
                <button
                  key={d.day}
                  onClick={() => toggleDay(d.day)}
                  className={`relative flex items-center justify-center h-9 rounded-lg text-xs font-medium transition-all ${
                    worked
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : d.isWeekday && isException
                        ? "bg-destructive/8 text-destructive/70 border border-destructive/15"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80 border border-transparent"
                  } ${isToday ? "ring-2 ring-primary/30 ring-offset-1 ring-offset-card" : ""}`}
                  aria-label={`${d.day} ${new Date(year, month).toLocaleDateString("ru-RU", { month: "long" })}${worked ? " (рабочий)" : " (выходной)"}${isException ? " (исключение)" : ""}`}
                >
                  {d.day}
                  {isException && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Нажмите на день, чтобы отметить исключение
          </p>
        </motion.div>

        {/* Two Forecast Cards with breakdown and Mark received */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Выплата 20-го</p>
            </div>
            <p className="text-xs text-muted-foreground mb-1">за {period1Str}</p>
            <p className="text-xl font-bold text-foreground mb-2">{formatUZS(forecast1)}</p>
            <div className="text-xs text-muted-foreground mb-2">
              Отработано: {worked1} дн. (N={N})
            </div>
            {breakdown20th.length > 0 && (
              <div className="text-[10px] text-muted-foreground space-y-0.5 mb-2">
                {breakdown20th.map((b) => (
                  <div key={b.label}>
                    {b.label}: {formatUZS(b.amount)} ({b.days} дн.)
                  </div>
                ))}
              </div>
            )}
            {period1Received ? (
              <div className="flex items-center justify-center gap-2 w-full h-8 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                Получено
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs border-dashed"
                onClick={() =>
                  openMarkReceived(
                    period1Str,
                    period1Key,
                    forecast1
                  )
                }
              >
                <Plus className="w-3 h-3 mr-1" />
                Отметить получено
              </Button>
            )}
          </motion.div>

          <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Выплата 5-го</p>
            </div>
            <p className="text-xs text-muted-foreground mb-1">за {period2Str}</p>
            <p className="text-xl font-bold text-foreground mb-2">{formatUZS(forecast2)}</p>
            <div className="text-xs text-muted-foreground mb-2">
              Отработано: {worked2} дн. (N={N})
            </div>
            {breakdown5th.length > 0 && (
              <div className="text-[10px] text-muted-foreground space-y-0.5 mb-2">
                {breakdown5th.map((b) => (
                  <div key={b.label}>
                    {b.label}: {formatUZS(b.amount)} ({b.days} дн.)
                  </div>
                ))}
              </div>
            )}
            {period2Received ? (
              <div className="flex items-center justify-center gap-2 w-full h-8 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                Получено
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs border-dashed"
                onClick={() =>
                  openMarkReceived(
                    period2Str,
                    period2Key,
                    forecast2
                  )
                }
              >
                <Plus className="w-3 h-3 mr-1" />
                Отметить получено
              </Button>
            )}
          </motion.div>
        </div>

        {/* Salary Modes */}
        <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Режим / Ставка</p>
          </div>
          <div className="flex flex-col gap-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => openEditMode(mode)}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left w-full ${
                  mode.active
                    ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                    : "bg-secondary border-border hover:bg-secondary/80"
                }`}
              >
                <div className={`w-1 h-10 rounded-full ${mode.active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{mode.label}</p>
                    {mode.active && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatUZS(mode.amount)} &middot; с {new Date(mode.start_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                    {mode.end_date && (
                      <> до {new Date(mode.end_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</>
                    )}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={handleAddMode}
            className="w-full mt-3 h-9 border-dashed border-border text-muted-foreground hover:text-foreground text-xs"
          >
            + Добавить режим
          </Button>
        </motion.div>

        {/* All payments history with year filter */}
        <motion.div variants={fadeUp} className={`rounded-xl border border-border bg-card p-4 ${cardShadow}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Все выплаты</p>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
            >
              {[2026, 2025, 2024].map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            {payments.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
              >
                <div>
                  <p className="text-sm text-foreground">{item.period}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.pay_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{formatUZS(item.amount)}</span>
                  {item.received && (
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет выплат за выбранный год</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Edit Mode dialog */}
      <Dialog open={editModeOpen} onOpenChange={(o) => !o && setEditMode(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Редактировать период</DialogTitle>
          </DialogHeader>
          {editMode && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-muted-foreground">{editMode.label}</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-start" className="text-sm">Дата начала (включительно)</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-end" className="text-sm">Дата окончания (включительно, пусто = без конца)</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  placeholder="Не указано"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModeOpen(false)} className="border-border">
              Отмена
            </Button>
            <Button
              onClick={saveEditMode}
              disabled={savingEdit || !editMode}
              className="bg-primary text-primary-foreground"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Mode dialog */}
      <Dialog open={addModeOpen} onOpenChange={setAddModeOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Добавить режим зарплаты</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode-label" className="text-sm">Название</Label>
              <Input
                id="mode-label"
                placeholder="Full-time / Part-time"
                value={newModeLabel}
                onChange={(e) => setNewModeLabel(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode-amount" className="text-sm">Сумма в месяц (сум, на руки)</Label>
              <Input
                id="mode-amount"
                type="number"
                placeholder="10000000"
                value={newModeAmount}
                onChange={(e) => setNewModeAmount(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode-start" className="text-sm">Дата начала (включительно)</Label>
              <Input
                id="mode-start"
                type="date"
                value={newModeStartDate}
                onChange={(e) => setNewModeStartDate(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            {!newModeActive && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="mode-end" className="text-sm">Дата окончания (включительно)</Label>
                <Input
                  id="mode-end"
                  type="date"
                  value={newModeEndDate}
                  onChange={(e) => setNewModeEndDate(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="mode-active"
                checked={newModeActive}
                onCheckedChange={(v) => setNewModeActive(v === true)}
              />
              <Label htmlFor="mode-active" className="text-sm text-muted-foreground cursor-pointer">Сделать активным</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModeOpen(false)} className="border-border">
              Отмена
            </Button>
            <Button
              onClick={saveNewMode}
              disabled={
                savingMode ||
                !newModeLabel ||
                !newModeAmount ||
                !newModeStartDate ||
                (!newModeActive && !newModeEndDate)
              }
              className="bg-primary text-primary-foreground"
            >
              {savingMode ? <Loader2 className="w-4 h-4 animate-spin" /> : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark received dialog */}
      <Dialog open={markReceivedOpen} onOpenChange={(open) => !open && setMarkReceivedData(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Отметить получено</DialogTitle>
          </DialogHeader>
          {markReceivedData && (
            <>
              <p className="text-sm text-muted-foreground">Период: {markReceivedData.periodLabel}</p>
              <p className="text-xs text-muted-foreground">Ожидалось: {formatUZS(markReceivedData.expectedAmount)}</p>
              <div className="flex flex-col gap-3 py-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pay-date" className="text-sm">Дата получения</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pay-amount" className="text-sm">Сумма (сум)</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="bg-secondary border-border"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMarkReceivedOpen(false)} className="border-border">
                  Отмена
                </Button>
                <Button onClick={saveMarkReceived} disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
