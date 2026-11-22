"use client"

import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react"
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

const FONT_SIZE = 13
const FONT_FAMILY = "Menlo, Monaco, 'Courier New', monospace"

/** Approximate the panel's terminal size before the shell starts, so the PTY
 *  is born with the right width instead of the default 80 columns. */
function measurePanel(element: HTMLDivElement): { cols: number; rows: number } {
  const rect = element.getBoundingClientRect()
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  let charWidth = 8
  if (ctx) {
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
    charWidth = ctx.measureText("M").width || charWidth
  }
  // Reserve ~40px for the terminal's own header bar.
  return {
    cols: Math.max(20, Math.floor(rect.width / charWidth)),
    rows: Math.max(10, Math.floor((rect.height - 40) / (FONT_SIZE * 1.2))),
  }
}

export function ClusterShell() {
  const { phase, error, podName, namespace, start, retry } = useClusterShell()
  const startedRef = useRef(false)
  const [sessionKey, setSessionKey] = useState(0)
  const hostRef = useRef<HTMLDivElement>(null)
  const [initialSize, setInitialSize] = useState<{ cols: number; rows: number } | null>(null)

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start()
    }
  }, [start])

  // Measure once when the shell becomes ready. The size is passed into the
  // exec command so `stty` sets the PTY width before bash draws its prompt.
  useLayoutEffect(() => {
    if (phase !== "ready" || initialSize) return
    const frame = requestAnimationFrame(() => {
      if (hostRef.current) setInitialSize(measurePanel(hostRef.current))
    })
    return () => cancelAnimationFrame(frame)
  }, [phase, initialSize])

  const handleReconnect = useCallback(() => {
    setSessionKey((k) => k + 1)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div ref={hostRef} className="min-h-0 flex-1">
        {phase === "ready" && initialSize ? (
          <ShellTerminal
            key={sessionKey}
            podName={podName}
            namespace={namespace}
            initialSize={initialSize}
            onDisconnected={handleReconnect}
          />
        ) : phase === "ready" ? null : (
          <div className="flex flex-col items-center justify-center gap-4 p-12 h-full">
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
    </div>
  )
}

function ShellTerminal({
  podName,
  namespace,
  initialSize,
  onDisconnected,
}: {
  podName: string
  namespace: string
  initialSize: { cols: number; rows: number }
  onDisconnected: () => void
}) {
  // Set the PTY size from inside the shell right at startup. The resize channel
  // cannot be trusted to arrive before bash draws its first prompt, and a PTY
  // stuck at 80 columns makes readline overwrite the line instead of wrapping.
  const command = useMemo(() => [
    "/bin/bash",
    "--noprofile",
    "--norc",
    "-c",
    `stty cols ${initialSize.cols} rows ${initialSize.rows} 2>/dev/null; ` +
      "export PS1='sandbox:\\w\\$ '; exec /bin/bash --norc -i",
  ], [initialSize])

  const { connected, onOutputRef, getSession } = usePodExec({
    namespace,
    podName,
    command,
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
    const term = termRef.current
    const node = terminalRef.current
    const fit = fitRef.current
    if (!term || !node) return

    let dims: { cols: number; rows: number } | undefined
    try {
      fit?.fit()
      dims = fit?.proposeDimensions()
    } catch {
      // Fall back to measuring the panel directly below.
    }
    // FitAddon can return undefined when the render service has no cell size
    // yet; in that case compute the same values from the visible container.
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) {
      const rect = node.getBoundingClientRect()
      const cell = (term as unknown as { _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } } })
        ._core?._renderService?.dimensions?.css?.cell
      const charWidth = cell?.width && cell.width > 0 ? cell.width : 8
      const lineHeight = cell?.height && cell.height > 0 ? cell.height : FONT_SIZE * 1.2
      if (rect.width > 0 && rect.height > 0) {
        dims = {
          cols: Math.max(20, Math.floor(rect.width / charWidth)),
          rows: Math.max(10, Math.floor(rect.height / lineHeight)),
        }
      }
    }
    if (!dims) return
    try {
      if (term.cols !== dims.cols || term.rows !== dims.rows) term.resize(dims.cols, dims.rows)
    } catch {
      // ignore
    }
    getSession()?.resize(dims.cols, dims.rows)
  }, [getSession])

  useEffect(() => {
    if (!connected) return
    doFit()
    // Re-send the size once the shell has started: SIGWINCH makes readline
    // recompute its wrapping, which fixes a prompt captured at the old width.
    const timer = window.setTimeout(doFit, 200)
    return () => window.clearTimeout(timer)
  }, [connected, doFit])

  const termInitRef = useRef(false)

  useEffect(() => {
    if (!terminalRef.current || termInitRef.current) return
    termInitRef.current = true

    const term = new Xterm({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY,
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
