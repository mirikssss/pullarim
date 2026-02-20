"use client"

import { useState } from "react"
import useSWR from "swr"
import { motion } from "framer-motion"
import { Download, Trash2, LogOut, ChevronRight, Pencil, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { fetcher, profileKey } from "@/lib/api"
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
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/auth"
  }

  const openEdit = () => {
    setEditName(profile?.full_name ?? "")
    setEditOpen(true)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editName.trim() || "Пользователь" }),
      })
      if (!res.ok) throw new Error(await res.text())
      mutate()
      setEditOpen(false)
    } catch {
      // TODO: toast
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
    } catch {
      // TODO: toast
    } finally {
      setExporting(false)
    }
  }

  const fullName = profile?.full_name ?? "Пользователь"
  const initials = fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  const email = (profile as { email?: string })?.email ?? ""

  return (
    <div className="max-w-2xl mx-auto">
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
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
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

        {/* Preferences - only real options */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
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

        {/* Data Section */}
        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
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
