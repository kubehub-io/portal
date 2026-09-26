"use client"

import { useEffect, useState } from "react"

/**
 * A timestamp that ticks on an interval, so relative labels ("for 5m", "updated 12s
 * ago") stay honest without calling impure functions during render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(0)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
