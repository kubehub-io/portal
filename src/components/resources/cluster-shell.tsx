"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { useClusterShell } from "@/hooks/use-cluster-shell"
import { usePodExec } from "@/hooks/use-pod-exec"
import { Terminal as Xterm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { Button } from "@/components/ui/button"
import { Loader2, Terminal, RefreshCw, PlugZap } from "lucide-react"

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  checking: "Checking for existing shell pod...",
  creating: "Creating shell pod...",
  waiting: "Waiting for pod to be Running...",
  disabled: "Agent Sandbox is not enabled",
  ready: "Connected",
  error: "Error",
}

export function ClusterShell() {
  const { phase, error, podName, namespace, start, retry } = useClusterShell()
  const startedRef = useRef(false)
  const [sessionKey, setSessionKey] = useState(0)

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start()
    }
  }, [start])

  const handleReconnect = useCallback(() => {
    setSessionKey((k) => k + 1)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs shrink-0">
        <span className="shrink-0 text-muted-foreground">Agent Sandbox shell</span>
        <span className="text-[11px] text-muted-foreground">
          The same sandbox pod is reused while this browser tab remains open; after the tab closes it expires automatically within 5 minutes.
        </span>
        {phase === "ready" && error && (
          <p className="min-w-[16rem] flex-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            {error}
          </p>
        )}
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
          {phase === "disabled" ? (
            <>
              <div className="text-center font-medium">Agent Sandbox is not enabled</div>
              <div className="max-w-md text-center text-sm text-muted-foreground">
                Enable the <strong>agent-sandbox</strong> managed controller in Cluster Settings before using the shell.
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/dashboard/clusters">Open Cluster Settings</a>
              </Button>
            </>
          ) : phase === "error" ? (
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

const SHELL_COMMAND = [
  "/bin/bash",
  "--noprofile",
  "--norc",
  "-c",
  "export PS1='sandbox@\\h:\\w\\$ '; exec /bin/bash --norc -i",
]

function ShellTerminal({
  podName,
  namespace,
  onDisconnected,
}: {
  podName: string
  namespace: string
  onDisconnected: () => void
}) {
  const { connected, onOutputRef, getSession } = usePodExec({
    namespace,
    podName,
    command: SHELL_COMMAND,
    containerName: "sandboxd",
  })
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
    if (!disconnected || !termRef.current) return
    termRef.current.write("\r\n\x1b[31mSession ended\x1b[0m\r\n")
  }, [disconnected])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
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
        <div ref={terminalRef} className="flex-1 overflow-hidden rounded-sm" />
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
