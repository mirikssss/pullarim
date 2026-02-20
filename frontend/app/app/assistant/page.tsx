"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import imageCompression from "browser-image-compression"
import { Send, Paperclip, Bot, Loader2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { SUGGESTION_CHIPS, formatUZS } from "@/lib/formatters"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  toolCard?: { type: "expense_added" | "query_result"; data: Record<string, string | number> }
}

type OcrPreviewItem = {
  amount: number
  date: string
  merchant: string
  category_id: string
  category_label: string
  note?: string
  confidence: number
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [ocrPhase, setOcrPhase] = useState<"idle" | "uploading" | "recognizing" | "parsing" | "done" | "error">("idle")
  const [ocrPreview, setOcrPreview] = useState<OcrPreviewItem[]>([])
  const [ocrAdded, setOcrAdded] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/assistant/history")
      .then((res) => (res.ok ? res.json() : { messages: [] }))
        .then((data) => {
        const msgs = (data.messages ?? []).map((m: { id?: string; role: "user" | "assistant"; content: string }, i: number) => ({
          id: m.id ?? `hist-${i}`,
          role: m.role,
          content: m.content,
        }))
        setMessages(msgs)
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, ocrPreview])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      const responseText = await res.text()
      let data: { assistant_message?: string; error?: { message?: string } }
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        console.error("[assistant] Invalid JSON:", responseText?.slice(0, 200))
        throw new Error("Ошибка сервера: неверный формат ответа")
      }

      if (!res.ok) {
        throw new Error(data.error?.message ?? "Ошибка")
      }

      const content = typeof data.assistant_message === "string" ? data.assistant_message : (data.assistant_message ? String(data.assistant_message) : "Не удалось получить ответ.")
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Не удалось получить ответ. Попробуйте ещё раз.",
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setOcrPhase("uploading")
    setUploadProgress(0)

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        onProgress: (p) => setUploadProgress(Math.round(p)),
      })

      const formData = new FormData()
      formData.append("file", compressed)

      const uploadRes = await fetch("/api/assistant/upload-image", {
        method: "POST",
        body: formData,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error?.message ?? "Upload failed")

      setOcrPhase("recognizing")
      const ocrRes = await fetch("/api/assistant/ocr-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_path: uploadData.path }),
      })
      const ocrData = await ocrRes.json()
      if (!ocrRes.ok) throw new Error(ocrData.error?.message ?? "OCR failed")

      setOcrPhase("parsing")
      const parseRes = await fetch("/api/assistant/ocr-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted_text: ocrData.extracted_text }),
      })
      const parseData = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseData.error?.message ?? "Parse failed")

      setOcrPreview(parseData.preview ?? [])
      setOcrAdded(new Set())
      setOcrPhase("done")
    } catch (err) {
      setOcrPhase("error")
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: err instanceof Error ? err.message : "Ошибка при обработке изображения",
        },
      ])
    }
  }

  const handleAddOcrItem = async (idx: number) => {
    const item = ocrPreview[idx]
    if (!item || ocrAdded.has(idx)) return

    try {
      const res = await fetch("/api/assistant/ocr-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ amount: item.amount, date: item.date, merchant: item.merchant, category_id: item.category_id, note: item.note }],
        }),
      })
      if (!res.ok) throw new Error("Commit failed")
      setOcrAdded((prev) => new Set(prev).add(idx))
    } catch {
      // silent
    }
  }

  const handleAddAllOcr = async () => {
    const toAdd = ocrPreview.filter((_, i) => !ocrAdded.has(i))
    if (toAdd.length === 0) return

    try {
      const res = await fetch("/api/assistant/ocr-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toAdd.map((i) => ({ amount: i.amount, date: i.date, merchant: i.merchant, category_id: i.category_id, note: i.note })),
        }),
      })
      if (!res.ok) throw new Error("Commit failed")
      const data = await res.json()
      setOcrAdded((prev) => {
        const next = new Set(prev)
        ocrPreview.forEach((_, i) => next.add(i))
        return next
      })
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `Добавлено ${data.inserted_count} расходов.`,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: "Не удалось добавить расходы." },
      ])
    }
  }

  const handleClearOcr = () => {
    setOcrPreview([])
    setOcrAdded(new Set())
    setOcrPhase("idle")
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100dvh-4rem)] md:h-dvh">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Ассистент</h1>
            <p className="text-[10px] text-muted-foreground">Финансы, расходы, зарплата</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {historyLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!historyLoading && messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border text-foreground rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="[&_strong]:font-semibold [&_em]:italic [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      h1: ({ children }) => <div className="text-base font-semibold mt-2 first:mt-0">{children}</div>,
                      h2: ({ children }) => <div className="text-sm font-semibold mt-2 first:mt-0">{children}</div>,
                      h3: ({ children }) => <div className="text-sm font-medium mt-1.5 first:mt-0">{children}</div>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5">{children}</ol>,
                    }}
                  >
                    {typeof msg.content === "string" ? msg.content : ""}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{typeof msg.content === "string" ? msg.content : ""}</p>
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-card border border-border flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Думаю...</span>
            </div>
          </motion.div>
        )}

        {(ocrPhase === "uploading" || ocrPhase === "recognizing" || ocrPhase === "parsing") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-card border border-border">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm">
                  {ocrPhase === "uploading" && `Загружаю... ${uploadProgress}%`}
                  {ocrPhase === "recognizing" && "Распознаю текст..."}
                  {ocrPhase === "parsing" && "Разбираю транзакции..."}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {ocrPhase === "done" && ocrPreview.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Распознано {ocrPreview.length} транзакций</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleAddAllOcr} disabled={ocrPreview.every((_, i) => ocrAdded.has(i))}>
                    Добавить всё
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleClearOcr}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {ocrPreview.map((item, idx) => (
                  <motion.div
                    key={idx}
                    layout
                    className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{item.merchant}</p>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                      <span className="font-semibold text-foreground shrink-0">{formatUZS(item.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {item.category_label}
                      </Badge>
                      {ocrAdded.has(idx) ? (
                        <span className="text-xs text-primary flex items-center gap-1">
                          <Check className="w-3 h-3" /> Добавлено
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleAddOcrItem(idx)}>
                          Добавить
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setInput(chip)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-card/80 backdrop-blur-lg p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageSelect}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-10 w-10 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Прикрепить изображение"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Спросите что-нибудь или прикрепите скриншот..."
            className="flex-1 bg-secondary border-border h-10 min-h-[40px]"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
