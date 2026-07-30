"use client"

import { ClusterShell } from "@/components/resources/cluster-shell"
import { Badge } from "@/components/ui/badge"
import { useClusterStore } from "@/stores/cluster-store"
import { Terminal } from "lucide-react"

export default function ShellPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isOffline = activeCluster?.status?.state?.toLowerCase() === "stopped"

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <h2 className="text-2xl font-bold tracking-tight">Cluster Shell</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            {activeCluster ? `${activeCluster.metadata.name} / shell` : "No active cluster"}
            {isOffline && (
              <Badge variant="warning" className="ml-2">Offline</Badge>
            )}
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ClusterShell />
      </div>
    </div>
  )
}
