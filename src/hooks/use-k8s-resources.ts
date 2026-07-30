"use client"

import { useQuery } from "@tanstack/react-query"
import { useClusterStore } from "@/stores/cluster-store"
import { useAuthStore } from "@/stores/auth-store"
import {
  listClusterScopedResources,
  listNamespaceScopedResources,
  listEvents,
  type ResourceDescriptor,
  type K8sResourceList,
  type K8sResource,
} from "@/lib/api/k8s-client"

export function useK8sClusterResources<T = K8sResource>(
  desc: ResourceDescriptor,
  queryKey: string,
) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery<K8sResourceList<T>>({
    queryKey: [queryKey, activeCluster?.metadata.name, activeCluster?.status.publicDns, desc.group, desc.version],
    queryFn: () =>
      listClusterScopedResources<T>(activeCluster!.status.publicDns, desc),
    enabled: !!activeCluster && isAuthenticated,
    refetchInterval: 10_000,
  })
}

export function useK8sNamespaceResources<T = K8sResource>(
  namespace: string,
  desc: ResourceDescriptor,
  queryKey: string,
) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery<K8sResourceList<T>>({
    queryKey: [queryKey, activeCluster?.metadata.name, activeCluster?.status.publicDns, namespace, desc.group, desc.version],
    queryFn: () =>
      listNamespaceScopedResources<T>(activeCluster!.status.publicDns, namespace, desc),
    enabled: !!activeCluster && isAuthenticated && !!namespace,
    refetchInterval: 10_000,
  })
}

export function useK8sEvents(namespace?: string, refreshKey?: number) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery<K8sResourceList>({
    queryKey: ["events", activeCluster?.metadata.name, activeCluster?.status.publicDns, namespace, refreshKey],
    queryFn: () => listEvents(activeCluster!.status.publicDns, namespace),
    enabled: !!activeCluster && isAuthenticated,
    refetchInterval: 15_000,
  })
}
