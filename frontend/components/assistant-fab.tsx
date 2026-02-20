"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessageCircle } from "lucide-react"
import { motion } from "framer-motion"

export function AssistantFAB() {
  const pathname = usePathname()

  if (pathname === "/app/assistant") return null

  return (
    <Link href="/app/assistant" aria-label="Ассистент">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25"
      >
        <MessageCircle className="w-5 h-5" />
      </motion.div>
    </Link>
  )
}
