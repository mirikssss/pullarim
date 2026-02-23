"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings } from "lucide-react"
import { BottomNav } from "@/components/bottom-nav"
import { DesktopSidebar } from "@/components/desktop-sidebar"
import { AssistantFAB } from "@/components/assistant-fab"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname === "/app/dashboard"

  return (
    <div className="flex min-h-dvh bg-background">
      <DesktopSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pb-20 md:pb-0 flex flex-col">
        {!isDashboard && (
          <header className="md:hidden flex shrink-0 justify-end items-center h-12 px-4 border-b border-border bg-background/80 backdrop-blur-sm">
            <Link
              href="/app/settings"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Настройки"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </header>
        )}
        <div className="flex-1 min-h-0">{children}</div>
      </main>
      <BottomNav />
      <AssistantFAB />
    </div>
  )
}
