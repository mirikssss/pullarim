"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  duration?: number
  delay?: number
  className?: string
  /** Для целых (операций, дней) — без дробной части при анимации */
  integer?: boolean
}

export function AnimatedNumber({
  value,
  format = (n) => n.toString(),
  duration = 700,
  delay = 0,
  className,
  integer = false,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const prevValueRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  useEffect(() => {
    const target = value
    const start = prevValueRef.current

    if (target === start) {
      setDisplayValue(target)
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = easeOutCubic(t)
      const current = start + (target - start) * eased
      setDisplayValue(integer ? Math.round(current) : current)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevValueRef.current = target
        startTimeRef.current = null
      }
    }

    const startAnimation = () => {
      startTimeRef.current = null
      rafRef.current = requestAnimationFrame(animate)
    }

    if (delay > 0) {
      timeoutId = setTimeout(startAnimation, delay)
    } else {
      startAnimation()
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [value, duration, delay, integer])

  return <span className={cn(className)}>{format(displayValue)}</span>
}
