"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { motion, type Variants } from "framer-motion"
import { Plus, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { formatUZS } from "@/lib/formatters"
import { fetcher, categoriesKey, parseErrorResponse } from "@/lib/api"
import type { Category } from "@/lib/types"

interface Props {
  fadeUp: Variants
  onSuccess?: () => void
}

export function QuickAdd({ fadeUp, onSuccess }: Props) {
  const [mounted, setMounted] = useState(false)
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState("")
  const [loading, setLoading] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [duplicateExisting, setDuplicateExisting] = useState<{ merchant: string; date: string; amount: number; created_at?: string } | null>(null)
  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  useEffect(() => setMounted(true), [])

  const payload = () => ({
    merchant: "Быстрый расход",
    category_id: category,
    amount: Number(amount),
    date: new Date().toISOString().slice(0, 10),
  })

  const handleAdd = async (forceDuplicate?: boolean) => {
    if (!amount || !category) return
    setLoading(true)
    setDuplicateExisting(null)
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), ...(forceDuplicate && { force_duplicate: true }) }),
      })
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        if (data.duplicate && data.existing) {
          setDuplicateExisting(data.existing)
          setShowDuplicate(true)
        } else {
          toast.warning("Похожий расход уже есть (та же дата, сумма и время). Добавьте через «Новый расход», если нужно.")
        }
        return
      }
      if (!res.ok) {
        const { message } = await parseErrorResponse(res)
        toast.error(message)
        return
      }
      setShowDuplicate(false)
      setDuplicateExisting(null)
      toast.success("Расход добавлен")
      setAmount("")
      setCategory("")
      onSuccess?.()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <p className="text-sm font-medium text-foreground mb-3">Быстрый расход</p>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 bg-secondary border-border h-10"
        />
        {mounted ? (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-32 bg-secondary border-border h-10">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="w-32 h-10 rounded-md border border-border bg-secondary flex items-center px-3 text-sm text-muted-foreground">
            Категория
          </div>
        )}
        <Button
          size="icon"
          disabled={!amount || !category || loading}
          onClick={() => handleAdd()}
          className="h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      <Dialog open={showDuplicate} onOpenChange={setShowDuplicate}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Похожий расход уже есть</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Уже есть расход с той же датой, суммой, названием и временем добавления:
            </p>
            {duplicateExisting && (
              <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                <div className="font-medium text-foreground">{duplicateExisting.merchant}</div>
                <div className="text-muted-foreground">
                  {formatUZS(duplicateExisting.amount)} · {new Date(duplicateExisting.date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                  {duplicateExisting.created_at && (
                    <> · добавлен {new Date(duplicateExisting.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Добавить ещё один такой же расход?</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowDuplicate(false); setDuplicateExisting(null) }}
              className="flex-1 border-border text-foreground"
            >
              <X className="w-4 h-4 mr-1.5" />
              Отмена
            </Button>
            <Button
              onClick={() => handleAdd(true)}
              disabled={loading}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" />Добавить всё равно</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
