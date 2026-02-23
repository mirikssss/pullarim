"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { motion, type Variants } from "framer-motion"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
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
  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  useEffect(() => setMounted(true), [])

  const handleAdd = async () => {
    if (!amount || !category) return
    setLoading(true)
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: "Быстрый расход",
          category_id: category,
          amount: Number(amount),
          date: new Date().toISOString().slice(0, 10),
        }),
      })
      if (!res.ok) {
        const { message } = await parseErrorResponse(res)
        toast.error(message)
        return
      }
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
          onClick={handleAdd}
          className="h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
    </motion.div>
  )
}
