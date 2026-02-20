"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Send, Receipt, BarChart3, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SUGGESTION_CHIPS, formatUZS } from "@/lib/formatters"
import type { ChatMessage } from "@/lib/types"

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")

    // Simulated assistant response
    setTimeout(() => {
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Обрабатываю ваш запрос. Одну секунду...",
      }
      setMessages((prev) => [...prev, botMsg])
    }, 800)
  }

  const handleChipClick = (chip: string) => {
    setInput(chip)
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100dvh-4rem)] md:h-dvh">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Ассистент</h1>
            <p className="text-[10px] text-muted-foreground">Всегда на связи</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border text-foreground rounded-bl-md"
              }`}
            >
              <p>{msg.content}</p>

              {/* Tool Cards */}
              {msg.toolCard && (
                <div className="mt-2 rounded-lg bg-secondary border border-border p-3">
                  {msg.toolCard.type === "query_result" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BarChart3 className="w-3 h-3" />
                        <span>Результат запроса</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Категория</span>
                        <span className="text-foreground">{msg.toolCard.data.category as string}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Итого</span>
                        <span className="font-semibold text-primary">{formatUZS(msg.toolCard.data.total as number)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Транзакций</span>
                        <span className="text-foreground">{msg.toolCard.data.count as number}</span>
                      </div>
                    </div>
                  )}
                  {msg.toolCard.type === "expense_added" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Receipt className="w-3 h-3" />
                        <span>Расход добавлен</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Место</span>
                        <span className="text-foreground">{msg.toolCard.data.merchant as string}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Сумма</span>
                        <span className="font-semibold text-primary">{formatUZS(msg.toolCard.data.amount as number)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Категория</span>
                        <span className="text-foreground">{msg.toolCard.data.category as string}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Suggestion Chips */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className="border-t border-border bg-card/80 backdrop-blur-lg p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Спросите что-нибудь..."
            className="flex-1 bg-secondary border-border h-10"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            className="h-10 w-10 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
