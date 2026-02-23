"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import { Download, Trash2, LogOut, ChevronRight, Pencil, Loader2, Wallet, Lock } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { fetcher, profileKey, accountsKey, parseErrorResponse } from "@/lib/api"
import { formatUZS } from "@/lib/formatters"
import type { Account } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { data: profile, mutate } = useSWR(profileKey(), fetcher)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editBudget, setEditBudget] = useState("")
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deletingExpenses, setDeletingExpenses] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [balancePassword, setBalancePassword] = useState("")
  const [balanceCard, setBalanceCard] = useState("")
  const [balanceCash, setBalanceCash] = useState("")
  const [balanceSaving, setBalanceSaving] = useState(false)
  const [balanceError, setBalanceError] = useState("")
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string[]>>({})
  const { data: accountsData, mutate: mutateAccounts } = useSWR<{ accounts: Account[] }>(accountsKey(), fetcher)
  const accounts = accountsData?.accounts ?? []
  const cardAccount = accounts.find((a) => a.type === "card")
  const cashAccount = accounts.find((a) => a.type === "cash")

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/auth"
  }

  const openEdit = () => {
    setEditName(profile?.full_name ?? "")
    const mb = (profile as { monthly_budget?: number | null })?.monthly_budget
    setEditBudget(mb != null && mb > 0 ? String(mb) : "")
    setEditOpen(true)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const monthly_budget = editBudget.trim() ? Math.max(0, parseInt(editBudget, 10) || 0) : null
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editName.trim() || "Пользователь",
          ...(monthly_budget !== null && { monthly_budget }),
        }),
      })
      if (!res.ok) {
        const { message, fieldErrors: errFields } = await parseErrorResponse(res)
        setProfileFieldErrors(errFields ?? {})
        toast.error(message)
        return
      }
      setProfileFieldErrors({})
      toast.success("Профиль сохранён")
      mutate()
      setEditOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/export?format=csv")
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `pullarim-export-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Экспорт скачан")
    } catch {
      toast.error("Ошибка экспорта")
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAllExpenses = async () => {
    setDeletingExpenses(true)
    try {
      const res = await fetch("/api/expenses/dev/delete-all", { method: "DELETE" })
      if (!res.ok) throw new Error(await res.text())
      setDeleteAllDialogOpen(false)
      toast.success("Расходы удалены")
      router.refresh()
      window.location.reload()
    } catch {
      toast.error("Ошибка удаления")
    } finally {
      setDeletingExpenses(false)
    }
  }

  const openBalanceDialog = () => {
    setBalanceError("")
    setBalancePassword("")
    setBalanceCard(cardAccount != null ? String(cardAccount.computed_balance) : "0")
    setBalanceCash(cashAccount != null ? String(cashAccount.computed_balance) : "0")
    setBalanceDialogOpen(true)
  }

  const saveBalance = async () => {
    setBalanceError("")
    if (!balancePassword.trim()) {
      setBalanceError("Введите пароль")
      return
    }
    const cardNum = parseInt(balanceCard, 10)
    const cashNum = parseInt(balanceCash, 10)
    if (Number.isNaN(cardNum) || Number.isNaN(cashNum)) {
      setBalanceError("Введите числа")
      return
    }
    setBalanceSaving(true)
    try {
      const res = await fetch("/api/accounts/update-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: balancePassword,
          opening_balance_card: cardNum,
          opening_balance_cash: cashNum,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBalanceError(data?.error ?? "Ошибка")
        return
      }
      mutateAccounts()
      setBalanceDialogOpen(false)
    } catch {
      setBalanceError("Ошибка сети")
    } finally {
      setBalanceSaving(false)
    }
  }

  const openPasswordDialog = () => {
    setPasswordError("")
    setCurrentPassword("")
    setNewPassword("")
    setNewPasswordConfirm("")
    setPasswordDialogOpen(true)
  }

  const changePassword = async () => {
    setPasswordError("")
    if (!currentPassword.trim()) {
      setPasswordError("Введите текущий пароль")
      return
    }
    if (!newPassword.trim()) {
      setPasswordError("Введите новый пароль")
      return
    }
    if (newPassword.length < 6) {
      setPasswordError("Новый пароль не менее 6 символов")
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("Новый пароль и подтверждение не совпадают")
      return
    }
    const userEmail = (profile as { email?: string })?.email
    if (!userEmail) {
      setPasswordError("Email не найден")
      return
    }
    setPasswordSaving(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      })
      if (signInError) {
        setPasswordError("Неверный текущий пароль")
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setPasswordError(updateError.message ?? "Не удалось изменить пароль")
        return
      }
      setPasswordDialogOpen(false)
    } catch {
      setPasswordError("Ошибка сети")
    } finally {
      setPasswordSaving(false)
    }
  }

  const isDev = process.env.NODE_ENV === "development"
  const fullName = profile?.full_name ?? "Пользователь"
  const initials = fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  const email = (profile as { email?: string })?.email ?? ""

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center px-4 h-14">
          <h1 className="text-lg font-semibold text-foreground">Настройки</h1>
        </div>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 p-4"
      >
        {/* Profile Card - editable */}
        <motion.div
          variants={fadeUp}
          className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
        >
          <button
            onClick={openEdit}
            className="flex items-center gap-4 w-full text-left hover:opacity-90 transition-opacity"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{fullName}</p>
              <p className="text-sm text-muted-foreground truncate">{email || "—"}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Pencil className="w-3.5 h-3.5" />
              <span>Изменить</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </motion.div>

        {/* Balance */}
        {accounts.length > 0 && (
          <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">Начальный баланс</p>
            </div>
            <button
              onClick={openBalanceDialog}
              className="flex items-center gap-3 w-full px-4 py-3.5 border-b border-border hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">Изменить баланс</p>
                <p className="text-xs text-muted-foreground">
                  Карта: {formatUZS(cardAccount?.computed_balance ?? 0)} · Наличные: {formatUZS(cashAccount?.computed_balance ?? 0)}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </motion.div>
        )}

        {/* Preferences - only real options */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Настройки</p>
          </div>

          {/* Currency */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <span className="text-xs font-bold text-muted-foreground">UZS</span>
              </div>
              <div>
                <p className="text-sm text-foreground">Валюта</p>
                <p className="text-xs text-muted-foreground">Узбекский сум</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">Фиксировано</span>
          </div>
        </motion.div>

        {/* Security - change password */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Безопасность</p>
          </div>
          <button
            onClick={openPasswordDialog}
            className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-secondary/50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
              <Lock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">Изменить пароль</p>
              <p className="text-xs text-muted-foreground">Установите новый пароль для входа</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </motion.div>

        {/* Data Section */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-card)]">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Данные</p>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-3 w-full px-4 py-3.5 border-b border-border hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Download className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground">Экспорт данных</p>
              <p className="text-xs text-muted-foreground">Скачать расходы в CSV</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {isDev && (
            <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-3 w-full px-4 py-3.5 border-b border-border hover:bg-destructive/5 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-destructive">Удалить все расходы</p>
                    <p className="text-xs text-muted-foreground">Только для разработки</p>
                  </div>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border max-w-sm">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Удалить все расходы?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    Все расходы будут удалены без возможности восстановления.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border text-foreground" disabled={deletingExpenses}>Отмена</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAllExpenses}
                    disabled={deletingExpenses}
                  >
                    {deletingExpenses ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-destructive/5 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-destructive">Удалить аккаунт</p>
                  <p className="text-xs text-muted-foreground">Необратимое действие</p>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Удалить аккаунт?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Все ваши данные будут удалены без возможности восстановления. Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border text-foreground">Отмена</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>

        {/* Logout */}
        <motion.div variants={fadeUp}>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full h-11 border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Выйти из аккаунта
          </Button>
        </motion.div>
      </motion.div>

      {/* Edit Balance Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Изменить баланс</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Укажите текущий баланс по карте и наличным — он будет сохранён как есть. Для смены введите пароль от аккаунта.
          </p>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="balance-password" className="text-sm text-muted-foreground">Пароль</Label>
              <Input
                id="balance-password"
                type="password"
                value={balancePassword}
                onChange={(e) => setBalancePassword(e.target.value)}
                placeholder="Пароль от аккаунта"
                className="bg-secondary border-border"
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="balance-card" className="text-sm text-muted-foreground">Карта (текущий баланс)</Label>
              <Input
                id="balance-card"
                type="number"
                inputMode="numeric"
                value={balanceCard}
                onChange={(e) => setBalanceCard(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="balance-cash" className="text-sm text-muted-foreground">Наличные (текущий баланс)</Label>
              <Input
                id="balance-cash"
                type="number"
                inputMode="numeric"
                value={balanceCash}
                onChange={(e) => setBalanceCash(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            {balanceError && (
              <p className="text-sm text-destructive">{balanceError}</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setBalanceDialogOpen(false)}
              className="border-border text-foreground"
            >
              Отмена
            </Button>
            <Button
              onClick={saveBalance}
              disabled={balanceSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {balanceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Изменить пароль</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Введите текущий пароль и новый пароль (не менее 6 символов).
          </p>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="current-password" className="text-sm text-muted-foreground">Текущий пароль</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-secondary border-border"
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password" className="text-sm text-muted-foreground">Новый пароль</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-secondary border-border"
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password-confirm" className="text-sm text-muted-foreground">Подтвердите новый пароль</Label>
              <Input
                id="new-password-confirm"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                className="bg-secondary border-border"
                autoComplete="new-password"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPasswordDialogOpen(false)}
              className="border-border text-foreground"
            >
              Отмена
            </Button>
            <Button
              onClick={changePassword}
              disabled={passwordSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Редактировать профиль</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-name" className="text-sm text-muted-foreground">Имя</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ваше имя"
                className="bg-secondary border-border"
              />
              {profileFieldErrors.full_name?.[0] && <p className="text-sm text-destructive">{profileFieldErrors.full_name[0]}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-budget" className="text-sm text-muted-foreground">Бюджет на месяц (сум)</Label>
              <Input
                id="edit-budget"
                type="number"
                inputMode="numeric"
                min={0}
                value={editBudget}
                onChange={(e) => setEditBudget(e.target.value)}
                placeholder="5 000 000"
                className="bg-secondary border-border"
              />
              {profileFieldErrors.monthly_budget?.[0] && <p className="text-sm text-destructive">{profileFieldErrors.monthly_budget[0]}</p>}
              <p className="text-xs text-muted-foreground">Используется на дашборде для сравнения с расходами за месяц</p>
            </div>
            <p className="text-xs text-muted-foreground">Email изменить нельзя</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              className="border-border text-foreground"
            >
              Отмена
            </Button>
            <Button
              onClick={saveProfile}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
