"use client"

import { useMemo } from "react"
import { useClusterStore } from "@/stores/cluster-store"
import { NAV_ITEMS, type NavItem } from "@/lib/navigation"

export interface NavAvailability {
  /** False when a cluster feature the tab depends on is turned off. */
  available: boolean
  /** True when the cluster itself is stopped — the tab is shown but not clickable. */
  unreachable: boolean
  reason?: string
}

const AVAILABLE: NavAvailability = { available: true, unreachable: false }

export type NavAvailabilityMap = Map<string, NavAvailability>

/**
 * Resolves which resource tabs the active cluster can actually serve.
 *
 * A tab gated by a disabled cluster feature (e.g. AppIngress with managed ingress
 * turned off) is unavailable and hidden unless the user has favorited it. Tabs that
 * need a running cluster are reported as `unreachable` so callers can keep showing
 * them greyed out rather than emptying the sidebar.
 */
export function useNavAvailability(): NavAvailabilityMap {
  const activeCluster = useClusterStore((s) => s.activeCluster)

  return useMemo(() => {
    const managedIngressEnabled = activeCluster?.spec?.managedIngressProfile?.enabled !== false
    const isStopped = activeCluster?.status?.state?.toLowerCase() === "stopped"

    const map: NavAvailabilityMap = new Map()
    for (const item of NAV_ITEMS) {
      map.set(item.id, resolve(item, managedIngressEnabled, isStopped))
    }
    return map
  }, [activeCluster])
}

function resolve(
  item: NavItem,
  managedIngressEnabled: boolean,
  isStopped: boolean,
): NavAvailability {
  if (item.requires === "managedIngress" && !managedIngressEnabled) {
    return {
      available: false,
      unreachable: isStopped,
      reason: "Managed ingress is disabled for this cluster",
    }
  }
  if (isStopped && !item.availableWhenStopped) {
    return { available: true, unreachable: true, reason: "Cluster is stopped" }
  }
  return AVAILABLE
}