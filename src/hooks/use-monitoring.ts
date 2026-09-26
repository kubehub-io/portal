"use client"

import { useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as monitoring from "@/lib/api/monitoring"
import { useAuthStore } from "@/stores/auth-store"

const ALERTS_REFRESH_MS = 15_000

export function useAlerts(options?: { refetchInterval?: number; enabled?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ["monitoring", "alerts"],
    queryFn: () => monitoring.listAlerts(),
    enabled: (options?.enabled ?? true) && isAuthenticated,
    refetchInterval: options?.refetchInterval ?? ALERTS_REFRESH_MS,
    retry: 1,
  })
}

/** Alerts that are currently firing, i.e. not suppressed and not resolved. */
export function useActiveAlerts(options?: { refetchInterval?: number }) {
  const query = useAlerts(options)
  const alerts = useMemo(
    () => (query.data ?? []).filter((a) => monitoring.isAlertActive(a)),
    [query.data],
  )
  return { ...query, alerts }
}

export function useRuleNamespaces(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ["monitoring", "rules"],
    queryFn: () => monitoring.listRuleNamespaces(),
    enabled: (options?.enabled ?? true) && isAuthenticated,
    retry: 1,
  })
}

export function useRules(namespace: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ["monitoring", "rules", namespace],
    queryFn: () => monitoring.getRules(namespace!),
    enabled: !!namespace && isAuthenticated,
    retry: 1,
  })
}

export function useSaveRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      namespace,
      rules,
      etag,
    }: {
      namespace: string
      rules: monitoring.CreateRuleRequest
      etag?: string
    }) => monitoring.putRules(namespace, rules, etag),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitoring", "rules"] }),
  })
}

export function useDeleteRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ namespace, etag }: { namespace: string; etag?: string }) =>
      monitoring.deleteRules(namespace, etag),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitoring", "rules"] }),
  })
}

export function useAlertmanagerConfig(name: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ["monitoring", "alertconfig", name],
    queryFn: () => monitoring.getAlertmanagerConfig(name!),
    enabled: !!name && isAuthenticated,
    retry: 1,
  })
}

export function useSaveAlertmanagerConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      config,
      etag,
    }: {
      name: string
      config: monitoring.AlertmanagerConfig
      etag?: string
    }) => monitoring.putAlertmanagerConfig(name, config, etag),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ["monitoring", "alertconfig", variables.name] }),
  })
}
