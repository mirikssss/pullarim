"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, Check, X, Loader2, CreditCard, Banknote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { formatUZS } from "@/lib/formatters"
import { fetcher, categoriesKey, parseErrorResponse } from "@/lib/api"
import type { Category } from "@/lib/types"

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function AddPage() {
  const [amount, setAmount] = useState("")
  const [merchant, setMerchant] = useState("")
  const [category, setCategory] = useState("")
  const [date, setDate] = useState(() => todayISO())
  const [note, setNote] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card")
  const [isRecording, setIsRecording] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !category) return
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchant || "Без названия",
          category_id: category,
          amount: Number(amount),
          date,
          note: note || null,
          payment_method: paymentMethod,
        }),
      })
      if (!res.ok) {
        const { message, fieldErrors: errFields } = await parseErrorResponse(res)
        setFieldErrors(errFields ?? {})
        toast.error(message)
        return
      }
      setFieldErrors({})
      toast.success("Расход добавлен")
      setShowConfirm(false)
      setAmount("")
      setMerchant("")
      setCategory("")
      setDate(todayISO())
      setNote("")
      setPaymentMethod("card")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Новый расход</h1>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="p-4"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Amount - Large input for one-handed use */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount" className="text-sm text-muted-foreground">Сумма</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-secondary border-border h-16 text-3xl font-bold text-center text-foreground placeholder:text-muted-foreground/40"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">сум</span>
            </div>
            {fieldErrors.amount?.[0] && <p className="text-sm text-destructive">{fieldErrors.amount[0]}</p>}
          </div>

          {/* Merchant */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="merchant" className="text-sm text-muted-foreground">Название</Label>
            <Input
              id="merchant"
              placeholder="Например: Korzinka"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="bg-secondary border-border h-11"
            />
            {fieldErrors.merchant?.[0] && <p className="text-sm text-destructive">{fieldErrors.merchant[0]}</p>}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="date" className="text-sm text-muted-foreground">Дата</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-secondary border-border h-11"
            />
            {fieldErrors.date?.[0] && <p className="text-sm text-destructive">{fieldErrors.date[0]}</p>}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm text-muted-foreground">Категория</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger className="bg-secondary border-border h-11">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.category_id?.[0] && <p className="text-sm text-destructive">{fieldErrors.category_id[0]}</p>}
          </div>

          {/* Payment method */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm text-muted-foreground">Способ оплаты</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  paymentMethod === "card"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground"
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Карта
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  paymentMethod === "cash"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-muted-foreground"
                }`}
              >
                <Banknote className="w-4 h-4" />
                Наличные
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="note" className="text-sm text-muted-foreground">Заметка (необязательно)</Label>
            <Textarea
              id="note"
              placeholder="Добавить заметку..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-secondary border-border min-h-[60px] resize-none"
            />
          </div>

          {/* Voice Input Button */}
          <div className="flex flex-col items-center gap-3 py-4">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsRecording(!isRecording)}
              className={`flex items-center justify-center w-16 h-16 rounded-full transition-colors shadow-sm ${
                isRecording
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
              aria-label={isRecording ? "Остановить запись" : "Голосовой ввод"}
            >
              <Mic className="w-6 h-6" />
            </motion.button>

            {/* Waveform placeholder */}
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0 }}
                  className="flex items-center gap-0.5 h-8"
                >
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: [4, Math.random() * 24 + 4, 4],
                      }}
                      transition={{
                        duration: 0.5 + Math.random() * 0.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.05,
                      }}
                      className="w-1 rounded-full bg-primary"
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <p className="text-xs text-muted-foreground">
              {isRecording ? "Слушаю..." : "Или скажите голосом"}
            </p>
          </div>

          <Button
            type="submit"
            disabled={!amount || !category}
            className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-base"
          >
            Добавить расход
          </Button>
        </form>
      </motion.div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Подтвердите расход</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Сумма</span>
              <span className="font-semibold text-foreground">{formatUZS(Number(amount) || 0)}</span>
            </div>
            {merchant && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Название</span>
                <span className="text-foreground">{merchant}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Дата</span>
              <span className="text-foreground">
                {new Date(date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Категория</span>
              <span className="text-foreground">
                {categories.find((c) => c.id === category)?.label || category}
              </span>
            </div>
            {note && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Заметка</span>
                <span className="text-foreground truncate max-w-[180px]">{note}</span>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              className="flex-1 border-border text-foreground"
            >
              <X className="w-4 h-4 mr-1.5" />
              Отмена
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  Подтвердить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
