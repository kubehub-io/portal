"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePodExec } from "@/hooks/use-pod-exec"
import { AlertTriangle, Terminal } from "lucide-react"
import { Terminal as Xterm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"

interface PodExecDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  podName: string
}

export function PodExecDialog({ open, onOpenChange, namespace, podName }: PodExecDialogProps) {
  const { connected, execError, onOutputRef, getSession } = usePodExec({
    namespace,
    podName,
  })

  const termRef = useRef<Xterm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const initRef = useRef(false)

  const [terminalNode, setTerminalNode] = useState<HTMLDivElement | null>(null)

  const terminalRef = useCallback((node: HTMLDivElement | null) => {
    setTerminalNode(node)
  }, [])

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
    if (open && connected) doFit()
  }, [open, connected, doFit])

  useEffect(() => {
    if (!terminalNode || initRef.current) return
    initRef.current = true

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
    term.open(terminalNode)
    termRef.current = term
    fitRef.current = fit

    onOutputRef.current = (text) => term.write(text)

    const sess = getSession()
    if (sess) {
      term.onData((data) => sess.send(data))
    }

    const ro = new ResizeObserver(() => doFit())
    ro.observe(terminalNode)

    requestAnimationFrame(() => doFit())

    return () => {
      initRef.current = false
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      onOutputRef.current = null
    }
  }, [terminalNode, getSession, onOutputRef, doFit])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(v) }}>
      <DialogContent
        className="flex flex-col gap-0 p-0 max-w-4xl h-[80vh] overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        resizable
      >
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Exec: {podName}
            </DialogTitle>
            <DialogDescription>
               {namespace} / {podName}
               {connected && (
                 <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-500">
                   <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                   connected
                 </span>
               )}
             </DialogDescription>
           </div>
         </div>

         <div className="flex items-start gap-2 px-6 py-2 text-xs text-amber-500 bg-amber-500/10 shrink-0">
           <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
           <span>
             Exec is not available for all pods. Distroless and some
             minimal images may not have a shell installed.
           </span>
         </div>

         <div className="flex flex-col flex-1 min-h-0">
          <div ref={terminalRef} className="flex-1 overflow-hidden rounded" />
        </div>

        <div className="flex items-center justify-between border-t px-6 py-3 shrink-0">
          <span className="text-xs text-destructive">
            {execError ? `Exec failed: ${execError}` : connected ? "Connected" : "Connecting..."}
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
