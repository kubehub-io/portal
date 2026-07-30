"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as controlPlane from "@/lib/api/control-plane"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterStore } from "@/stores/cluster-store"
import { useEffect } from "react"

export function useClusters() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { clusters, setClusters, setActiveCluster, activeCluster } = useClusterStore()

  const query = useQuery({
    queryKey: ["clusters"],
    queryFn: controlPlane.listClusters,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (query.data) {
      setClusters(query.data)
    }
  }, [query.data, setClusters])

  return { clusters, activeCluster, setActiveCluster, ...query }
}

export function useCreateCluster() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: controlPlane.createCluster,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  })
}

export function useDeleteCluster() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, force }: { name: string; force?: boolean }) => controlPlane.deleteCluster(name, undefined, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  })
}

export function useDownloadKubeconfig() {
  return useMutation({
    mutationFn: ({ name, certbased }: { name: string; certbased?: boolean }) =>
      controlPlane.downloadKubeconfig(name, certbased),
  })
}

export function useReconcileCluster() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => controlPlane.reconcileCluster(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clusters"] }),
  })
}
