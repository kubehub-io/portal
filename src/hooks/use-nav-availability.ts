"use client"

import { useMemo } from "react"
import { useClusterStore } from "@/stores/cluster-store"
import { NAV_ITEMS, type NavItem } from "@/lib/navigation"

export interface NavAvailability {
  /** False when the tab can no longer be used, e.g. retired features. */
  available: boolean
  /** True when the cluster itself is stopped — the tab is shown but not clickable. */
  unreachable: boolean
  reason?: string
}

const AVAILABLE: NavAvailability = { available: true, unreachable: false }

export type NavAvailabilityMap = Map<string, NavAvailability>

/**
 * Resolves which built-in tabs the active cluster can actually serve.
 *
 * Tabs that need a running cluster are reported as `unreachable` so callers can
 * keep showing them greyed out rather than emptying the sidebar.
 */
export function useNavAvailability(): NavAvailabilityMap {
  const activeCluster = useClusterStore((s) => s.activeCluster)

  return useMemo(() => {
    const isStopped = activeCluster?.status?.state?.toLowerCase() === "stopped"

    const map: NavAvailabilityMap = new Map()
    for (const item of NAV_ITEMS) {
      map.set(item.id, resolve(item, isStopped))
    }
    return map
  }, [activeCluster])
}

function resolve(item: NavItem, isStopped: boolean): NavAvailability {
  if (isStopped && !item.availableWhenStopped) {
    return { available: true, unreachable: true, reason: "Cluster is stopped" }
  }
  return AVAILABLE
}
