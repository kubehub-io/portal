"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { issueNodeJoinToken } from "@/lib/api/control-plane"
import { useNow } from "@/hooks/use-now"

const REFRESH_THRESHOLD_SECONDS = 120

export function useNodeJoinToken(clusterName: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ["node-join-token", clusterName], [clusterName])
  const now = useNow(1000)

  const query = useQuery({
    queryKey,
    queryFn: () => issueNodeJoinToken(clusterName!),
    enabled: enabled && !!clusterName,
    staleTime: 0,
    retry: false,
  })

  // Always issue a fresh token when the flyout is opened.
  useEffect(() => {
    if (!enabled) {
      queryClient.removeQueries({ queryKey })
    }
  }, [enabled, queryClient, queryKey])

  const { data, dataUpdatedAt, refetch } = query
  const expiresAt = data ? dataUpdatedAt + data.expires_in * 1000 : null

  // Refresh shortly before the token expires instead of letting it go stale.
  useEffect(() => {
    if (!enabled || expiresAt === null) return
    const delay = Math.max(0, expiresAt - REFRESH_THRESHOLD_SECONDS * 1000 - Date.now())
    const id = window.setTimeout(() => {
      void refetch()
    }, delay)
    return () => window.clearTimeout(id)
  }, [enabled, expiresAt, refetch])

  const secondsRemaining = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))

  return {
    token: data ?? null,
    expiresAt,
    secondsRemaining,
    isLoading: query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    refresh: refetch,
  }
}
