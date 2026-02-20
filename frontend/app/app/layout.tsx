"use client"

import { BottomNav } from "@/components/bottom-nav"
import { DesktopSidebar } from "@/components/desktop-sidebar"
import { AssistantFAB } from "@/components/assistant-fab"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <DesktopSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pb-20 md:pb-0">
        {children}
      </main>
      <BottomNav />
      <AssistantFAB />
    </div>
  )
}
