"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import {
  LayoutDashboard,
  Banknote,
  Wallet,
  PlusCircle,
  Receipt,
  MessageCircle,
  Settings,
  FileUp,
} from "lucide-react"
import { motion } from "framer-motion"
import { fetcher, profileKey } from "@/lib/api"

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/app/balance", label: "Балансы", icon: Wallet },
  { href: "/app/salary", label: "Зарплата", icon: Banknote },
  { href: "/app/add", label: "Добавить", icon: PlusCircle },
  { href: "/app/expenses", label: "Расходы", icon: Receipt },
  { href: "/app/import", label: "Импорт", icon: FileUp },
  { href: "/app/assistant", label: "Ассистент", icon: MessageCircle },
  { href: "/app/settings", label: "Настройки", icon: Settings },
]

export function DesktopSidebar() {
  const pathname = usePathname()
  const { data: profile } = useSWR(profileKey(), fetcher)

  const fullName = profile?.full_name ?? "Пользователь"
  const initials = fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  const email = (profile as { email?: string })?.email ?? ""

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card h-dvh sticky top-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
        <span className="font-serif text-xl font-black text-foreground tracking-tight">Pullarim</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative"
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-accent border border-border"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
              <div
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span>{item.label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      <Link href="/app/settings" className="p-3 border-t border-border hover:bg-secondary/50 transition-colors">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fullName}</p>
            <p className="text-xs text-muted-foreground truncate">{email || "—"}</p>
          </div>
        </div>
      </Link>
    </aside>
  )
}
