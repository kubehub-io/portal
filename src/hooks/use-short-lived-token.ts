"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useNow } from "@/hooks/use-now"

const REFRESH_THRESHOLD_SECONDS = 120

export function useShortLivedToken<T extends { expires_in: number }>(
  queryKey: QueryKey,
  enabled: boolean,
  issueToken: () => Promise<T>,
) {
  const queryClient = useQueryClient()
  const now = useNow(1000)

  const query = useQuery({
    queryKey,
    queryFn: issueToken,
    enabled,
    staleTime: 0,
    retry: false,
  })

  // Always issue a fresh token when the dialog is closed and reopened.
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
    secondsRemaining,
    isLoading: query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    refresh: refetch,
  }
}
