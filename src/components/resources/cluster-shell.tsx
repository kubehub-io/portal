"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useClusterShell } from "@/hooks/use-cluster-shell"
import { usePodExec } from "@/hooks/use-pod-exec"
import { listClusterScopedResources } from "@/lib/api/k8s-client"
import type { K8sResource } from "@/lib/api/k8s-client"
import { useClusterStore } from "@/stores/cluster-store"
import { useAuthStore } from "@/stores/auth-store"
import { Terminal as Xterm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Terminal, RefreshCw, PlugZap } from "lucide-react"

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  checking: "Checking for existing shell pod...",
  recreating: "Pod spec outdated, recreating...",
  creating: "Creating shell pod...",
  waiting: "Waiting for pod to be Running...",
  "writing-token": "Injecting credentials into pod...",
  ready: "Connected",
  error: "Error",
}

export function ClusterShell() {
  const [selectedNode, setSelectedNode] = useState<string>("__auto")
  const { phase, error, podName, namespace, podNodeName, start, retry } = useClusterShell(selectedNode === "__auto" ? undefined : selectedNode)
  const startedRef = useRef(false)
  const [sessionKey, setSessionKey] = useState(0)

  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const { data: nodes } = useQuery({
    queryKey: ["shell-nodes", activeCluster?.status.publicDns],
    queryFn: async () => {
      const list = await listClusterScopedResources<K8sResource>(activeCluster!.status.publicDns, {
        version: "v1",
        resource: "nodes",
      })
      return list.items ?? []
    },
    enabled: !!activeCluster?.status.publicDns && isAuthenticated,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start()
    }
  }, [start])

  const handleReconnect = useCallback(() => {
    setSessionKey((k) => k + 1)
  }, [])

  // Update shell pod token when token is refreshed and shell is active
  useEffect(() => {
    if (phase !== "ready" || !activeCluster?.status.publicDns || !podName || !namespace) return

    const unsubscribe = useAuthStore.getState().subscribeTokenRefreshed((newToken) => {
      import("@/hooks/use-cluster-shell").then(({ updateShellPodToken }) => {
        updateShellPodToken(activeCluster.status.publicDns, namespace, podName, newToken).catch(() => {})
      })
    })

    return unsubscribe
  }, [phase, activeCluster?.status.publicDns, podName, namespace])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-2 shrink-0">
        <span className="text-xs text-muted-foreground shrink-0">Target node:</span>
        <Select value={selectedNode} onValueChange={setSelectedNode}>
          <SelectTrigger className="h-7 text-xs w-56">
            <SelectValue placeholder="Auto (any node)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto">Auto (any node)</SelectItem>
            {nodes?.map((n) => (
              <SelectItem key={n.metadata.name} value={n.metadata.name}>
                {n.metadata.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {phase === "ready" && podNodeName && (
          <span className="text-xs text-muted-foreground">
            → on <span className="font-mono">{podNodeName}</span>
          </span>
        )}
      </div>

      <div className="border-b bg-muted/40 px-6 py-2 shrink-0">
        <p className="text-xs text-muted-foreground">
          Requires at least one node onboarded to the cluster to use this shell. Anything stored here lives
          in a temporary shell pod and will be lost when the pod restarts — don&apos;t store important data in the shell.
        </p>
      </div>

      {phase === "ready" ? (
        <ShellTerminal
          key={sessionKey}
          podName={podName}
          namespace={namespace}
          onDisconnected={handleReconnect}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 p-12 flex-1">
          {phase === "error" ? (
            <>
              <div className="text-destructive font-medium">Failed to start shell</div>
              <div className="text-sm text-muted-foreground max-w-md text-center">{error}</div>
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-sm text-muted-foreground">{PHASE_LABELS[phase] ?? phase}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const SHELL_COMMAND = ["/bin/bash"]

function ShellTerminal({
  podName,
  namespace,
  onDisconnected,
}: {
  podName: string
  namespace: string
  onDisconnected: () => void
}) {
  const { connected, onOutputRef, getSession } = usePodExec({ namespace, podName, command: SHELL_COMMAND })
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Xterm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const hadConnectionRef = useRef(false)
  const [disconnected, setDisconnected] = useState(false)

  useEffect(() => {
    if (connected) {
      hadConnectionRef.current = true
    } else if (hadConnectionRef.current) {
      setDisconnected(true)
    }
  }, [connected])

  const doFit = useCallback(() => {
    const fit = fitRef.current
    if (!fit) return
    try {
      fit.fit()
      const dims = fit.proposeDimensions()
      if (dims) {
        const sess = getSession()
        if (sess) sess.resize(dims.cols, dims.rows)
      }
    } catch {
      // ignore
    }
  }, [getSession])

  useEffect(() => {
    if (connected) doFit()
  }, [connected, doFit])

  const termInitRef = useRef(false)

  useEffect(() => {
    if (!terminalRef.current || termInitRef.current) return
    termInitRef.current = true

    const term = new Xterm({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: { background: "#000000", foreground: "#00ff00", cursor: "#00ff00" },
      allowProposedApi: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(terminalRef.current)
    termRef.current = term
    fitRef.current = fit
    onOutputRef.current = (text) => term.write(text)

    const sess = getSession()
    if (sess) {
      term.onData((data) => sess.send(data))
    }

    const ro = new ResizeObserver(() => doFit())
    ro.observe(terminalRef.current)

    requestAnimationFrame(() => doFit())

    return () => {
      termInitRef.current = false
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      onOutputRef.current = null
    }
  }, [getSession, onOutputRef, doFit])

  useEffect(() => {
    const el = terminalRef.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "w":
          case "l":
          case "a":
          case "k":
          case "u":
            e.preventDefault()
            break
        }
      }
    }

    el.addEventListener("keydown", handleKeyDown)
    return () => el.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    if (!disconnected || !termRef.current) return
    termRef.current.write("\r\n\x1b[31mSession ended\x1b[0m\r\n")
  }, [disconnected])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Cluster Shell — {podName}</span>
          {connected && (
            <span className="inline-flex items-center gap-1 text-xs text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              connected
            </span>
          )}
          {disconnected && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              disconnected
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {namespace}/{podName}
        </span>
      </div>
      <div className="relative flex flex-col flex-1 min-h-0">
        <div ref={terminalRef} className="flex-1 overflow-hidden rounded" />
        {disconnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">Session disconnected</p>
              <Button variant="outline" size="sm" onClick={onDisconnected}>
                <PlugZap className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
