"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { PodLogsDialog } from "@/components/resources/pod-logs-dialog"
import { PodExecDialog } from "@/components/resources/pod-exec-dialog"
import { Button } from "@/components/ui/button"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { deleteK8sResource } from "@/lib/api/k8s-client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Terminal, Monitor, Trash2 } from "lucide-react"

export default function PodsPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const queryClient = useQueryClient()
  const [namespace, setNamespace] = useState("__all")
  const [logPod, setLogPod] = useState<{ namespace: string; name: string } | null>(null)
  const [execPod, setExecPod] = useState<{ namespace: string; name: string } | null>(null)
  const { data: nsData } = useK8sClusterResources(
    { version: "v1", resource: "namespaces" },
    "namespaces",
  )

  const { data, isLoading, error } = useK8sClusterResources(
    { version: "v1", resource: "pods" },
    "pods",
  )

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      deleteK8sResource(
        activeCluster!.status.publicDns,
        ns,
        { version: "v1", resource: "pods" },
        name,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pods"] })
    },
  })

  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    {
      key: "status.phase",
      label: "Status",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Unknown")} />,
    },
    { key: "spec.nodeName", label: "Node" },
    { key: "status.podIP", label: "Pod IP" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pods</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / pods` : "No active cluster"}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        error={error}
        namespace={namespace}
        onNamespaceChange={setNamespace}
        namespaces={namespaces}
        actions={(item) => {
          const meta = item.metadata as Record<string, unknown> | undefined
          const name = meta?.name as string
          const ns = meta?.namespace as string
          const deleting = deleteMutation.variables?.name === name && deleteMutation.isPending
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogPod({ namespace: ns, name })}
              >
                <Terminal className="h-3.5 w-3.5" />
                Logs
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExecPod({ namespace: ns, name })}
              >
                <Monitor className="h-3.5 w-3.5" />
                Exec
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={() => {
                  if (window.confirm(`Delete pod "${name}" in namespace "${ns}"?`)) {
                    deleteMutation.mutate({ ns, name })
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                {deleting ? "..." : "Delete"}
              </Button>
            </div>
          )
        }}
      />
      {logPod && (
        <PodLogsDialog
          open
          onOpenChange={(v) => { if (!v) setLogPod(null) }}
          namespace={logPod.namespace}
          podName={logPod.name}
        />
      )}
      {execPod && (
        <PodExecDialog
          open
          onOpenChange={(v) => { if (!v) setExecPod(null) }}
          namespace={execPod.namespace}
          podName={execPod.name}
        />
      )}
    </div>
  )
}
