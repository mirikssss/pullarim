"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"

type AuthTab = "login" | "signup"

export default function AuthPage() {
  const [tab, setTab] = useState<AuthTab>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement).value
    const password = (form.elements.namedItem("password") as HTMLInputElement).value
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement | null)?.value

    try {
      if (tab === "signup") {
        if (password !== confirm) {
          setError("Пароли не совпадают")
          setLoading(false)
          return
        }
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        if (data.session) {
          window.location.href = "/app/dashboard"
          return
        }
        setError("Проверьте почту — отправлена ссылка для подтверждения")
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        window.location.href = "/app/dashboard"
        return
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации")
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    setError(null)
    setLoading(true)
    const email = (document.getElementById("email") as HTMLInputElement)?.value
    if (!email) {
      setError("Введите email")
      setLoading(false)
      return
    }
    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({ email })
      if (magicError) throw magicError
      setError(null)
      alert("Проверьте почту — отправлена ссылка для входа")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="noise-bg min-h-dvh flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, oklch(0.35 0.08 160) 0%, oklch(0.22 0.04 155) 50%, oklch(0.15 0.02 155) 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-1 mb-8">
          <h1 className="font-serif text-3xl font-black text-white tracking-tight">Pullarim</h1>
          <p className="text-sm text-white/60">Финансы под контролем</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-6">
          {/* Segmented Control */}
          <div className="flex gap-1 p-1 rounded-lg bg-white/[0.06] mb-6">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === t ? "text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                {tab === t && (
                  <motion.div
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-md bg-white/10 border border-white/10 shadow-sm"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{t === "login" ? "Вход" : "Регистрация"}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={tab}
              initial={{ opacity: 0, x: tab === "login" ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tab === "login" ? 10 : -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="flex flex-col gap-4"
            >
              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm text-white/60">Эл. почта</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10 bg-white/[0.06] border-white/10 h-11 text-white placeholder:text-white/30 focus:border-white/20"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm text-white/60">Пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    className="pl-10 pr-10 bg-white/[0.06] border-white/10 h-11 text-white placeholder:text-white/30 focus:border-white/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {tab === "signup" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2"
                >
                  <Label htmlFor="confirm" className="text-sm text-white/60">Подтвердите пароль</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input
                      id="confirm"
                      name="confirm"
                      type="password"
                      placeholder="********"
                      className="pl-10 bg-white/[0.06] border-white/10 h-11 text-white placeholder:text-white/30 focus:border-white/20"
                      required
                    />
                  </div>
                </motion.div>
              )}

              {tab === "login" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={setRememberMe}
                    />
                    <Label htmlFor="remember" className="text-xs text-white/50 cursor-pointer">
                      Запомнить меня
                    </Label>
                  </div>
                  <button type="button" className="text-xs text-white/50 hover:text-white/70 transition-colors">
                    Забыли пароль?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 bg-white text-foreground hover:bg-white/90 font-medium mt-1"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {tab === "login" ? "Войти" : "Создать аккаунт"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <div className="relative flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/40">или</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleMagicLink}
                disabled={loading}
                className="h-11 border-white/10 text-white hover:bg-white/[0.06] bg-transparent"
              >
                <Mail className="w-4 h-4 mr-2" />
                Войти по magic link
              </Button>
            </motion.form>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
