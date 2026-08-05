"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useClusterStore } from "@/stores/cluster-store"
import { useAuthStore } from "@/stores/auth-store"

interface UsePodExecOptions {
  namespace: string
  podName: string
  containerName?: string
  command?: string[]
}

export interface ExecSession {
  send: (input: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

const SHELL_FALLBACKS = ["/bin/sh", "/bin/bash", "/bin/ash", "/bin/dash"]

export function usePodExec({ namespace, podName, containerName, command }: UsePodExecOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const sessRef = useRef<ExecSession | null>(null)
  const [connected, setConnected] = useState(false)
  const [execError, setExecError] = useState<string | null>(null)
  const onOutputRef = useRef<((text: string) => void) | null>(null)
  const fallbackIndexRef = useRef(0)

  const getCommand = useCallback(() => {
    if (command) return command
    const idx = fallbackIndexRef.current
    if (idx >= SHELL_FALLBACKS.length) return null
    return [SHELL_FALLBACKS[idx]]
  }, [command])

  const retryRef = useRef<(() => void) | null>(null)

  const connect = useCallback(() => {
    const cluster = useClusterStore.getState().activeCluster
    const token = useAuthStore.getState().accessToken
    if (!cluster || !token) return null

    const cmds = getCommand()
    if (!cmds) return null

    const host = `https://${cluster.status.publicDns}:8443`
    const url = new URL(`${host}/api/v1/namespaces/${namespace}/pods/${podName}/exec`)

    cmds.forEach((c) => url.searchParams.append("command", c))
    url.searchParams.set("stdin", "true")
    url.searchParams.set("stdout", "true")
    url.searchParams.set("stderr", "true")
    url.searchParams.set("tty", "true")

    if (containerName) {
      url.searchParams.set("container", containerName)
    }

    const wsUrl = url.toString().replace(/^https:/, "wss:").replace(/^http:/, "ws:")

    const ws = new WebSocket(wsUrl, [
      "v5.channel.k8s.io",
      `base64url.bearer.authorization.k8s.io.${btoa(token).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`,
    ])

    ws.binaryType = "arraybuffer"

    ws.onopen = () => {
      console.log("[usePodExec] connected")
      setConnected(true)
      setExecError(null)
    }
    ws.onclose = (e) => {
      console.log("[usePodExec] closed", e.code, e.reason)
      setConnected(false)
      wsRef.current = null
      sessRef.current = null
    }
    ws.onerror = (e) => {
      console.log("[usePodExec] error", e)
    }

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer)
      const channel = data[0]
      const text = new TextDecoder().decode(data.slice(1))
      if (channel === 1 || channel === 2) {
        onOutputRef.current?.(text)
      } else if (channel === 3) {
        console.error("Exec error:", text)
        setExecError(text)
        if (!command) {
          const nextIdx = fallbackIndexRef.current + 1
          fallbackIndexRef.current = nextIdx
          if (nextIdx < SHELL_FALLBACKS.length) {
            ws.close()
            setTimeout(() => retryRef.current?.(), 200)
          }
        }
      }
    }

    wsRef.current = ws

    const sess: ExecSession = {
      send(input: string) {
        if (ws.readyState !== WebSocket.OPEN) return
        const encoder = new TextEncoder()
        const payload = new Uint8Array(1 + encoder.encode(input).length)
        payload[0] = 0
        payload.set(encoder.encode(input), 1)
        ws.send(payload)
      },
      resize(cols: number, rows: number) {
        if (ws.readyState !== WebSocket.OPEN) return
        const msg = JSON.stringify({ Width: cols, Height: rows })
        const encoder = new TextEncoder()
        const payload = new Uint8Array(1 + encoder.encode(msg).length)
        payload[0] = 4
        payload.set(encoder.encode(msg), 1)
        ws.send(payload)
      },
      close() {
        ws.close()
      },
    }

    sessRef.current = sess
    return sess
  }, [namespace, podName, containerName, command, getCommand])

  useEffect(() => {
    retryRef.current = connect
  }, [connect])

  useEffect(() => {
    fallbackIndexRef.current = 0
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
      sessRef.current = null
    }
  }, [connect])

  const getSession = useCallback(() => sessRef.current, [])
  return { getSession, connected, execError, onOutputRef }
}
