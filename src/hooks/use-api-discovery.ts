"use client"

import { useQuery } from "@tanstack/react-query"
import { useClusterStore } from "@/stores/cluster-store"
import { discoverAPI, type APIDiscoveryResult } from "@/lib/api/k8s-client"
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
    queryFn: () => discoverAPI(activeCluster!),
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

export function resolveResourceFromDiscovery(
  apiVersion: string,
  kind: string,
  discovery?: APIDiscoveryResult,
): ResourceInfo | null {
  const slashIdx = apiVersion.indexOf("/")

  if (slashIdx === -1) {
    // Core API group (e.g. "v1")
    if (!discovery) {
      const key = kind.toLowerCase().replace(/[^a-z]/g, "")
      return RESOURCE_VERSION_MAP[key] ?? { version: apiVersion, resource: `${kind.toLowerCase()}s` }
    }
    // Core resources aren't fetched in bulk; fall back to naive pluralization
    return { version: apiVersion, resource: `${kind.toLowerCase()}s` }
  }

  const group = apiVersion.slice(0, slashIdx)
  const version = apiVersion.slice(slashIdx + 1)

  if (!discovery) {
    return { group, version, resource: `${kind.toLowerCase()}s` }
  }

  const apiGroup = discovery.groups.find((g: { name: string }) => g.name === group)
  if (apiGroup?.resources) {
    const resource = apiGroup.resources.find(
      (r: { kind: string; name: string }) => r.kind.toLowerCase() === kind.toLowerCase(),
    )
    if (resource) {
      return { group, version, resource: resource.name }
    }
  }

  // Fallback to naive pluralization
  return { group, version, resource: `${kind.toLowerCase()}s` }
}
