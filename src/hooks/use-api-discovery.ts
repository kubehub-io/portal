"use client"

import { useQuery } from "@tanstack/react-query"
import { useClusterStore } from "@/stores/cluster-store"
import { discoverAPI } from "@/lib/api/k8s-client"
import { useAuthStore } from "@/stores/auth-store"

const RESOURCE_VERSION_MAP: Record<string, { group?: string; version: string; resource: string }> = {
  nodes: { version: "v1", resource: "nodes" },
  namespaces: { version: "v1", resource: "namespaces" },
  events: { version: "v1", resource: "events" },
  pods: { version: "v1", resource: "pods" },
  services: { version: "v1", resource: "services" },
  persistentvolumes: { version: "v1", resource: "persistentvolumes" },
  persistentvolumeclaims: { version: "v1", resource: "persistentvolumeclaims" },
  configmaps: { version: "v1", resource: "configmaps" },
  secrets: { version: "v1", resource: "secrets" },
  deployments: { group: "apps", version: "v1", resource: "deployments" },
  daemonsets: { group: "apps", version: "v1", resource: "daemonsets" },
  statefulsets: { group: "apps", version: "v1", resource: "statefulsets" },
  replicasets: { group: "apps", version: "v1", resource: "replicasets" },
  cronjobs: { group: "batch", version: "v1", resource: "cronjobs" },
  jobs: { group: "batch", version: "v1", resource: "jobs" },
  endpointslices: { group: "discovery.k8s.io", version: "v1", resource: "endpointslices" },
}

export interface ResourceInfo {
  group?: string
  version: string
  resource: string
}

export function useAPIDiscovery() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ["api-discovery", activeCluster?.metadata.name, activeCluster?.status.publicDns],
    queryFn: () => discoverAPI(activeCluster!.status.publicDns),
    enabled: !!activeCluster && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  })
}

export function resolveResourceInfo(kind: string, discovery?: { coreVersions: string[]; groups: { name: string; preferredVersion: { groupVersion: string; version: string }; versions: { version: string }[] }[] }): ResourceInfo | null {
  const key = kind.toLowerCase().replace(/[^a-z]/g, "")
  const fallback = RESOURCE_VERSION_MAP[key]
  if (!fallback) return null

  if (!discovery) return fallback

  if (fallback.group) {
    const group = discovery.groups.find((g) => g.name === fallback.group)
    if (group) {
      return { ...fallback, version: group.preferredVersion.version }
    }
  }

  return fallback
}
