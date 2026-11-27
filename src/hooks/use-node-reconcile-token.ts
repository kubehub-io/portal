"use client"

import { useMemo } from "react"
import { issueNodeReconcileToken } from "@/lib/api/control-plane"
import { useShortLivedToken } from "@/hooks/use-short-lived-token"

export function useNodeReconcileToken(
  clusterName: string | undefined,
  nodeName: string | undefined,
  enabled: boolean,
) {
  const queryKey = useMemo(
    () => ["node-reconcile-token", clusterName, nodeName],
    [clusterName, nodeName],
  )

  return useShortLivedToken(
    queryKey,
    enabled && !!clusterName && !!nodeName,
    () => issueNodeReconcileToken(clusterName!, nodeName!),
  )
}
