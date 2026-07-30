"use client"

import { useRef, useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePodLogs } from "@/hooks/use-pod-logs"
import { useClusterStore } from "@/stores/cluster-store"
import { getK8sResource } from "@/lib/api/k8s-client"
import { Loader2, Terminal } from "lucide-react"

interface PodLogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  podName: string
}

export function PodLogsDialog({ open, onOpenChange, namespace, podName }: PodLogsDialogProps) {
  const [containers, setContainers] = useState<string[]>([])
  const [activeContainer, setActiveContainer] = useState<string>("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const { lines, isStreaming, error, start, stop } = usePodLogs({
    namespace,
    podName,
    containerName: activeContainer || undefined,
  })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const cluster = useClusterStore.getState().activeCluster
    if (!cluster) return

    getK8sResource<{ spec: { containers: { name: string }[] } }>(
      cluster.status.publicDns,
      namespace,
      { version: "v1", resource: "pods" },
      podName,
    )
      .then((pod) => {
        if (cancelled) return
        const names = pod.spec.containers.map((c) => c.name)
        setContainers(names)
        if (names.length > 0) {
          setActiveContainer(names[0])
        }
      })
      .catch(() => {
        if (cancelled) return
      })

    return () => {
      cancelled = true
    }
  }, [open, namespace, podName])

  useEffect(() => {
    if (!(open && activeContainer)) return
    start()
    return () => {
      stop()
    }
  }, [open, activeContainer, start, stop])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { stop() }; onOpenChange(v) }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Logs: {podName}
          </DialogTitle>
          <DialogDescription>
            {namespace} / {podName}
          </DialogDescription>
        </DialogHeader>

        {containers.length > 1 && (
          <Tabs value={activeContainer} onValueChange={setActiveContainer}>
            <TabsList>
              {containers.map((name) => (
                <TabsTrigger key={name} value={name}>
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto rounded-md bg-black p-4 font-mono text-xs leading-relaxed text-green-400"
          style={{ maxHeight: "60vh" }}
        >
          {lines.length === 0 && !isStreaming && !error && (
            <span className="text-muted-foreground">No logs</span>
          )}
          {lines.map((line) => (
            <div key={line.index}>{line.text}</div>
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 pt-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming...
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => { stop(); onOpenChange(false) }}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
