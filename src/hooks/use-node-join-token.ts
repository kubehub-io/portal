"use client"

import { useMemo } from "react"
import { issueNodeJoinToken } from "@/lib/api/control-plane"
import { useShortLivedToken } from "@/hooks/use-short-lived-token"

export function useNodeJoinToken(clusterName: string | undefined, enabled: boolean) {
  const queryKey = useMemo(() => ["node-join-token", clusterName], [clusterName])
  return useShortLivedToken(
    queryKey,
    enabled && !!clusterName,
    () => issueNodeJoinToken(clusterName!),
  )
}
