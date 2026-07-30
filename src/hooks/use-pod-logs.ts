"use client"

import { useCallback, useRef, useState } from "react"
import { useClusterStore } from "@/stores/cluster-store"
import { streamPodLogs } from "@/lib/api/k8s-client"

interface UsePodLogsOptions {
  namespace: string
  podName: string
  containerName?: string
}

interface LogLine {
  text: string
  index: number
}

export function usePodLogs({ namespace, podName, containerName }: UsePodLogsOptions) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const indexRef = useRef(0)

  const start = useCallback(async () => {
    const cluster = useClusterStore.getState().activeCluster
    if (!cluster) {
      setError("No active cluster")
      return
    }

    const abort = new AbortController()
    abortRef.current = abort

    setLines([])
    setError(null)
    setIsStreaming(true)
    indexRef.current = 0

    try {
      const resp = await streamPodLogs(
        cluster.status.publicDns,
        namespace,
        podName,
        containerName,
        abort.signal,
      )

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      }

      if (!resp.body) {
        throw new Error("Response body is null")
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n")
        buffer = parts.pop() ?? ""

        for (const text of parts) {
          setLines((prev) => [...prev, { text, index: indexRef.current++ }])
        }
      }

      if (buffer) {
        setLines((prev) => [...prev, { text: buffer, index: indexRef.current++ }])
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError((err as Error).message ?? "Unknown error")
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [namespace, podName, containerName])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  return { lines, isStreaming, error, start, stop }
}
