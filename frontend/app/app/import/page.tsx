"use client"

import { useState, useCallback, useEffect } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, FileSpreadsheet, CheckCircle, Loader2, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetcher, categoriesKey } from "@/lib/api"
import type { Category } from "@/lib/types"
import { formatUZS } from "@/lib/formatters"
import Link from "next/link"

type Step = "upload" | "preview" | "result"

type PaymePreviewRow = {
  date: string
  time?: string
  type?: string
  merchant: string
  amount: number
  paymeCategory?: string
  resolvedCategory?: string
  resolvedSource?: "memory" | "mapping" | "rule" | "ai" | "default"
  note?: string
  external_id?: string
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PaymePreviewRow[]>([])
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("")
  const [result, setResult] = useState<{
    count_inserted: number
    count_skipped_duplicates: number
    total: number
  } | null>(null)
  const [importOnlySpisanie, setImportOnlySpisanie] = useState(true)
  const [previewTotal, setPreviewTotal] = useState(0)
  const [previewTotalSpend, setPreviewTotalSpend] = useState(0)
  const [uniquePaymeCategories, setUniquePaymeCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reprocessLoading, setReprocessLoading] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<{ total_in_other: number; updated: number } | null>(null)

  const { data: categories = [] } = useSWR<Category[]>(categoriesKey(), fetcher)

  useEffect(() => {
    if (step === "preview" && categories.length > 0 && !defaultCategoryId) {
      setDefaultCategoryId(categories[0].id)
    }
  }, [step, categories, defaultCategoryId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }

  const handleUpload = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("default_category_id", defaultCategoryId || categories[0]?.id || "")
      formData.append("category_mapping", JSON.stringify({}))
      const res = await fetch("/api/import/payme/preview", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? "Ошибка загрузки")
      }
      const data = await res.json()
      setPreviewRows(data.rows ?? [])
      setPreviewTotal(data.total ?? 0)
      setPreviewTotalSpend(data.totalSpend ?? 0)
      setUniquePaymeCategories(data.uniquePaymeCategories ?? [])
      setDefaultCategoryId((defaultCategoryId || categories[0]?.id) ?? "")
      setStep("preview")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setLoading(false)
    }
  }, [file, categories, defaultCategoryId])

  const handleCommit = useCallback(async () => {
    if (!file || !defaultCategoryId) {
      setError("Выберите категорию по умолчанию")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("default_category_id", defaultCategoryId)
      formData.append("importOnlySpisanie", String(importOnlySpisanie))
      formData.append("category_mapping", JSON.stringify({}))
      const res = await fetch("/api/import/payme/commit", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? "Ошибка импорта")
      }
      const data = await res.json()
      setResult(data)
      setStep("result")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setLoading(false)
    }
  }, [file, defaultCategoryId, importOnlySpisanie])

  const handleReprocess = useCallback(async () => {
    setReprocessLoading(true)
    setReprocessResult(null)
    setError(null)
    try {
      const res = await fetch("/api/import/payme/reprocess", { method: "POST" })
      if (!res.ok) throw new Error("Ошибка перекатегоризации")
      const data = await res.json()
      setReprocessResult({ total_in_other: data.total_in_other, updated: data.updated })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setReprocessLoading(false)
    }
  }, [])

  const totalAmount = previewTotalSpend > 0 ? previewTotalSpend : previewRows.reduce((s, r) => s + r.amount, 0)

  const renderStep = () => {
    if (step === "upload") {
      return (
        <motion.div
          key="upload"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex flex-col gap-4"
        >
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors"
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">
              {file ? file.name : "Выберите файл XLSX"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Выписка Payme или совместимый формат
            </p>
          </div>
          <Button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Загрузить и превью"}
          </Button>
        </motion.div>
      )
    }
    if (step === "preview") {
      return (
        <motion.div
          key="preview"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="spisanie"
                checked={importOnlySpisanie}
                onChange={(e) => setImportOnlySpisanie(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="spisanie" className="text-sm text-muted-foreground">
                Импортировать только «Списание»
              </label>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {previewTotal || previewRows.length} записей, итого {formatUZS(totalAmount)}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">По умолчанию:</label>
                <select
                  value={defaultCategoryId}
                  onChange={(e) => setDefaultCategoryId(e.target.value)}
                  className="rounded-md border border-border bg-secondary px-2 py-1 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {uniquePaymeCategories.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Категории Payme ({uniquePaymeCategories.join(", ")}) определяются автоматически
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Дата</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Название</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Payme</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">→ Категория</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Источник</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-2 truncate max-w-[120px]">{r.merchant}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[70px]">{r.paymeCategory || "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium">{r.resolvedCategory || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <span title={r.resolvedSource} className="capitalize">{r.resolvedSource === "memory" && "память"}
                        {r.resolvedSource === "mapping" && "маппинг"}
                        {r.resolvedSource === "rule" && "правило"}
                        {r.resolvedSource === "ai" && "AI"}
                        {r.resolvedSource === "default" && "по умолч."}
                        {!r.resolvedSource && "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatUZS(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(previewTotal || previewRows.length) > 30 && (
              <p className="text-xs text-muted-foreground p-2 text-center">
                Показаны первые 30 из {previewTotal || previewRows.length} записей
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Назад
            </Button>
            <Button onClick={handleCommit} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Импортировать"}
            </Button>
          </div>
        </motion.div>
      )
    }
    if (step === "result" && result) {
      return (
        <motion.div
          key="result"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 items-center py-8"
        >
          <CheckCircle className="w-16 h-16 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Импорт завершён</h2>
          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p>Добавлено: <span className="font-medium text-foreground">{result.count_inserted}</span></p>
            <p>Пропущено (дубликаты): <span className="font-medium text-foreground">{result.count_skipped_duplicates}</span></p>
            <p>Всего обработано: <span className="font-medium text-foreground">{result.total}</span></p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload")
                setFile(null)
                setPreviewRows([])
                setResult(null)
              }}
            >
              Импортировать ещё
            </Button>
            <Link href="/app/expenses">
              <Button>К расходам</Button>
            </Link>
          </div>
        </motion.div>
      )
    }
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Импорт Payme</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocess}
              disabled={reprocessLoading}
            >
              {reprocessLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Перекатегоризовать 30 дней
            </Button>
            <Link href="/app/expenses">
              <Button variant="ghost" size="sm">Назад</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 py-4 px-4">
        {(["upload", "preview", "result"] as const).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                step === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {s === "upload" && <Upload className="w-3 h-3" />}
              {s === "preview" && <FileSpreadsheet className="w-3 h-3" />}
              {s === "result" && <CheckCircle className="w-3 h-3" />}
              {s === "upload" && "Загрузка"}
              {s === "preview" && "Превью"}
              {s === "result" && "Результат"}
            </div>
            {i < 2 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        {reprocessResult && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 text-primary text-sm">
            Перекатегоризовано: {reprocessResult.updated} из {reprocessResult.total_in_other} в «Прочее»
          </div>
        )}

        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>
    </div>
  )
}
