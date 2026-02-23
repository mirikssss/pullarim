"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Wallet, Banknote, Plus, Receipt, Settings } from "lucide-react"
import { motion } from "framer-motion"

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/app/balance", label: "Баланс", icon: Wallet },
  { href: "/app/add", label: "Добавить", icon: Plus, isCenter: true },
  { href: "/app/expenses", label: "Расходы", icon: Receipt },
  { href: "/app/salary", label: "Зарплата", icon: Banknote },
  { href: "/app/settings", label: "Ещё", icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg md:hidden safe-area-bottom">
      <div className="flex items-center justify-around px-2 h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          if (item.isCenter) {
            return (
              <Link key={item.href} href={item.href} aria-label={item.label}>
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
              </Link>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label={item.label}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
