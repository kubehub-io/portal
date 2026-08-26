"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { DataTable, StatusBadge, type ColumnDef } from "@/components/resources/data-table"
import { useClusterStore } from "@/stores/cluster-store"
import { listControlPlaneNodes, deleteNode } from "@/lib/api/control-plane"
import { listClusterScopedResources, deleteK8sResource } from "@/lib/api/k8s-client"
import type { K8sResource } from "@/lib/api/k8s-client"
import type { ControlPlaneNode } from "@/lib/api/control-plane"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Info, Loader2, Trash2, AlertTriangle } from "lucide-react"

interface MergedNode {
  name: string
  annotations: string[]
  k8s?: K8sResource
  cp?: ControlPlaneNode
}

function formatMemory(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "-")
  const match = value.match(/^(\d+)(\w*)$/)
  if (!match) return value
  const num = parseInt(match[1], 10)
  const unit = match[2]
  if (unit === "Ki") return `${Math.round(num / 1024)} MiB`
  if (unit === "Mi") return `${num} MiB`
  if (unit === "Gi") return `${num * 1024} MiB`
  if (unit === "K" || unit === "k") return `${Math.round(num / 1024 / 1024)} MiB`
  return `${num} ${unit}`
}

function formatCores(cpus: unknown): string {
  if (!Array.isArray(cpus) || cpus.length === 0) return "-"
  let total = 0
  for (const c of cpus) {
    const cores = (c as { cores?: number })?.cores ?? 0
    total += cores
  }
  return String(total)
}

interface NodeAddress {
  type: string
  address: string
}

interface NodeCondition {
  type: string
  status: string
  lastHeartbeatTime?: string
  lastTransitionTime?: string
  reason?: string
  message?: string
}

interface NodeInfo {
  osImage?: string
  architecture?: string
  containerRuntimeVersion?: string
  kernelVersion?: string
  kubeletVersion?: string
}

interface NodeResource {
  cpu?: string
  memory?: string
  disk?: string
}

function getStatusField(node: MergedNode): Record<string, unknown> | undefined {
  return (node.k8s?.status as Record<string, unknown>) ?? undefined
}

function getSpecField(node: MergedNode): Record<string, unknown> | undefined {
  return (node.k8s?.spec as Record<string, unknown>) ?? undefined
}

function getAddresses(node: MergedNode): NodeAddress[] {
  const addresses = getStatusField(node)?.addresses as NodeAddress[] | undefined
  return addresses ?? []
}

function getPhysicalIp(node: MergedNode): string {
  const internal = getAddresses(node).find((a) => a.type === "InternalIP")
  if (internal) return internal.address
  return node.cp?.spec?.meta?.ipv4 ?? "-"
}

function getCiliumCidr(node: MergedNode): string {
  const podCIDR = getSpecField(node)?.podCIDR as string | undefined
  if (podCIDR) return podCIDR
  const podCIDRs = getSpecField(node)?.podCIDRs as string[] | undefined
  if (podCIDRs && podCIDRs.length > 0) return podCIDRs.join(", ")
  return "-"
}

function getNodeInfo(node: MergedNode): NodeInfo {
  const info = getStatusField(node)?.nodeInfo as NodeInfo | undefined
  if (info) return info
  return { osImage: node.cp?.spec?.os, architecture: node.cp?.spec?.arch }
}

function getResource(node: MergedNode): NodeResource {
  const capacity = getStatusField(node)?.capacity as Record<string, unknown> | undefined
  if (capacity) {
    return {
      cpu: typeof capacity.cpu === "string" ? capacity.cpu : undefined,
      memory: typeof capacity.memory === "string" ? formatMemory(capacity.memory) : undefined,
      disk: typeof capacity["ephemeral-storage"] === "string" ? formatMemory(capacity["ephemeral-storage"]) : undefined,
    }
  }
  const memMb = node.cp?.spec?.hardware?.memory?.total_in_mb
  return {
    cpu: formatCores(node.cp?.spec?.hardware?.cpus),
    memory: memMb ? `${memMb} MiB` : undefined,
  }
}

function getConditions(node: MergedNode): NodeCondition[] {
  const conditions = getStatusField(node)?.conditions as NodeCondition[] | undefined
  return conditions ?? []
}

// Most conditions are healthy when True; pressure/availability conditions are healthy when False.
function isConditionHealthy(cond: NodeCondition): boolean {
  const falseIsHealthy = ["MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"].includes(cond.type)
  return falseIsHealthy ? cond.status === "False" : cond.status === "True"
}

function formatRelativeTime(value?: string): string {
  if (!value) return "-"
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const diff = Date.now() - d.getTime()
  const totalSec = Math.max(0, Math.floor(diff / 1000))
  const m = Math.floor(totalSec / 60)
  const h = Math.floor(m / 60)
  const d2 = Math.floor(h / 24)
  const s = totalSec % 60
  if (d2 > 0) return `${d2}d ${h % 24}h ago`
  if (h > 0) return `${h}h ${m % 60}m ago`
  if (m > 0) return `${m}m ${s}s ago`
  return `${totalSec}s ago`
}

function detailRows(obj: Record<string, unknown>, prefix = ""): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  for (const [key, val] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key
    if (val && typeof val === "object" && !Array.isArray(val)) {
      rows.push(...detailRows(val as Record<string, unknown>, label))
    } else if (Array.isArray(val)) {
      rows.push({ label, value: JSON.stringify(val) })
    } else {
      rows.push({ label, value: String(val ?? "-") })
    }
  }
  return rows
}

export default function NodesPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isOffline = activeCluster?.status?.state?.toLowerCase() === "stopped"
  const clusterDns = activeCluster?.status.publicDns

  const cpQuery = useQuery({
    queryKey: ["cp-nodes", activeCluster?.metadata.name],
    queryFn: () => listControlPlaneNodes(activeCluster!.metadata.name),
    enabled: !!activeCluster,
    retry: false,
  })

  const k8sQuery = useQuery({
    queryKey: ["k8s-nodes", activeCluster?.metadata.name, clusterDns],
    queryFn: async () => {
      const list = await listClusterScopedResources<K8sResource>(clusterDns!, {
        version: "v1",
        resource: "nodes",
      })
      return list.items ?? []
    },
    enabled: !!activeCluster && !!clusterDns,
    retry: false,
    refetchInterval: 10_000,
  })

  const mergedNodes = useMemo(() => {
    const cpNodes: ControlPlaneNode[] = cpQuery.error ? [] : (cpQuery.data ?? [])
    const k8sNodes: K8sResource[] = k8sQuery.error ? [] : (k8sQuery.data ?? [])

    const cpNames = new Set(cpNodes.map((n) => n.metadata.name))
    const k8sNames = new Set(k8sNodes.map((n) => n.metadata.name))

    const merged: MergedNode[] = []

    for (const cpNode of cpNodes) {
      const name = cpNode.metadata.name
      const inK8s = k8sNames.has(name)
      merged.push({
        name,
        annotations: inK8s ? [] : ["disconnected"],
        cp: cpNode,
        k8s: inK8s ? (k8sNodes.find((n) => n.metadata.name === name) ?? undefined) : undefined,
      })
    }

    for (const k8sNode of k8sNodes) {
      const name = k8sNode.metadata.name
      if (!cpNames.has(name)) {
        merged.push({
          name,
          annotations: ["unexpected"],
          k8s: k8sNode,
          cp: undefined,
        })
      }
    }

    return merged
  }, [cpQuery.data, cpQuery.error, k8sQuery.data, k8sQuery.error])

  const [addOpen, setAddOpen] = useState(false)
  const [clusterStoppedOpen, setClusterStoppedOpen] = useState(false)

  const [detailTarget, setDetailTarget] = useState<MergedNode | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MergedNode | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const queryClient = useQueryClient()
  const deleteNodeMutation = useMutation({
    mutationFn: async (node: MergedNode) => {
      if (node.cp) {
        await deleteNode(activeCluster!.metadata.name, node.name)
      }
      if (node.k8s) {
        await deleteK8sResource(clusterDns!, null, { version: "v1", resource: "nodes" }, node.name)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cp-nodes", activeCluster?.metadata.name] })
      queryClient.invalidateQueries({ queryKey: ["k8s-nodes", activeCluster?.metadata.name, clusterDns] })
    },
  })

  const isLoading = cpQuery.isLoading || (!!clusterDns && k8sQuery.isLoading)
  const error = cpQuery.error && k8sQuery.error ? cpQuery.error : null

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (value: unknown, item: Record<string, unknown>) => (
        <button
          className="text-xs font-medium underline underline-offset-2 hover:text-primary cursor-pointer"
          onClick={() => setDetailTarget(item as unknown as MergedNode)}
        >
          {String(value ?? "-")}
        </button>
      ),
    },
    {
      key: "ip",
      label: "Node IP",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        const physical = getPhysicalIp(node)
        const cilium = getCiliumCidr(node)
        return (
          <div className="space-y-1 py-1">
            <div className="text-xs">
              <span className="text-muted-foreground">Physical: </span>
              <span className="font-mono">{physical}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Cilium CIDR: </span>
              <span className="font-mono">{cilium}</span>
            </div>
          </div>
        )
      },
    },
    {
      key: "osarch",
      label: "OS / Arch",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        const info = getNodeInfo(node)
        return (
          <div className="space-y-1 py-1 text-xs">
            <div><span className="text-muted-foreground">OS: </span>{String(info.osImage ?? "-")}</div>
            <div><span className="text-muted-foreground">Arch: </span>{String(info.architecture ?? "-")}</div>
            <div><span className="text-muted-foreground">Runtime: </span>{String(info.containerRuntimeVersion ?? "-")}</div>
            <div><span className="text-muted-foreground">Kernel: </span>{String(info.kernelVersion ?? "-")}</div>
            <div><span className="text-muted-foreground">Kubelet: </span>{String(info.kubeletVersion ?? "-")}</div>
          </div>
        )
      },
    },
    {
      key: "resource",
      label: "Resource",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        const res = getResource(node)
        return (
          <div className="space-y-1 py-1 text-xs">
            <div><span className="text-muted-foreground">CPU: </span>{String(res.cpu ?? "-")}</div>
            <div><span className="text-muted-foreground">Mem: </span>{String(res.memory ?? "-")}</div>
            <div><span className="text-muted-foreground">Disk: </span>{String(res.disk ?? "-")}</div>
          </div>
        )
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        if (node.k8s) {
          const conditions = (node.k8s.status as Record<string, unknown>)?.conditions as
            | Array<{ type: string; status: string; lastHeartbeatTime?: string }>
            | undefined
          const readyCond = conditions?.find((c) => c.type === "Ready")
          if (readyCond?.status === "True") {
            const lastHeartbeat = readyCond.lastHeartbeatTime ? new Date(readyCond.lastHeartbeatTime).getTime() : 0
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
            if (lastHeartbeat < fiveMinutesAgo) {
              return <span className="text-xs text-red-600 font-medium">Offline</span>
            }
            return <span className="text-xs text-green-600 font-medium">Ready</span>
          }
          return readyCond ? <StatusBadge status={readyCond.status} /> : <StatusBadge status="Unknown" />
        }
        if (node.cp?.status?.ready) return <span className="text-xs text-green-600 font-medium">Ready</span>
        return <span className="text-xs text-muted-foreground">Not Connected</span>
      },
    },
    {
      key: "conditions",
      label: "Conditions",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        const conditions = getConditions(node)
        if (conditions.length === 0) return <span className="text-xs text-muted-foreground">-</span>
        return (
          <div className="space-y-1 py-1">
            {conditions.map((c) => {
              const healthy = isConditionHealthy(c)
              const ts = healthy
                ? c.lastHeartbeatTime ?? c.lastTransitionTime
                : c.lastTransitionTime ?? c.lastHeartbeatTime
              return (
                <div key={c.type} className="flex items-center gap-1.5 text-xs">
                  <Badge variant={healthy ? "success" : "destructive"} className="text-[10px]">{c.status}</Badge>
                  <span className="font-medium">{c.type}</span>
                  <span className="text-muted-foreground">({formatRelativeTime(ts)})</span>
                </div>
              )
            })}
          </div>
        )
      },
    },
    {
      key: "annotations",
      label: "",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        return (
          <div className="flex gap-1">
            {node.annotations.includes("unexpected") && (
              <Badge variant="warning" className="text-[10px]">Unexpected</Badge>
            )}
            {node.annotations.includes("disconnected") && (
              <Badge variant="destructive" className="text-[10px]">Disconnected</Badge>
            )}
          </div>
        )
      },
    },
    {
      key: "actions",
      label: "",
      render: (_value: unknown, item: Record<string, unknown>) => {
        const node = item as unknown as MergedNode
        return (
          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(node)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )
      },
    },
  ]

  const tableData = mergedNodes.map((n) => ({
    ...n,
    status: "",
    annotations: "",
  })) as unknown as Record<string, unknown>[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Nodes</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            {activeCluster ? `${activeCluster.metadata.name} / nodes` : "No active cluster"}
            {isOffline && <Badge variant="warning">Offline</Badge>}
          </p>
        </div>
        {activeCluster && (
          <Button onClick={() => isOffline ? setClusterStoppedOpen(true) : setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Node
          </Button>
        )}
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          <Info className="h-4 w-4 shrink-0" />
          Cluster is offline — showing nodes from control plane API
        </div>
      )}

      {!isOffline && k8sQuery.error && !cpQuery.error && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0" />
          Kubernetes API is unreachable — nodes shown from control plane only
        </div>
      )}

      {cpQuery.error && !k8sQuery.error && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0" />
          Control plane API is unreachable — nodes shown from Kubernetes only
        </div>
      )}

      {k8sQuery.isFetching && cpQuery.isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading nodes...
        </div>
      )}

      <NodeTable
        key={activeCluster?.metadata.name ?? "none"}
        columns={columns}
        tableData={tableData}
        isLoading={isLoading && mergedNodes.length === 0}
        error={error}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
            <DialogDescription>
              Follow these steps to add a new node to <span className="font-mono font-medium text-foreground">{activeCluster?.metadata.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <div className="space-y-1.5">
              <h4 className="font-semibold">1. Prepare the node</h4>
              <p className="text-muted-foreground">
                The node must have a Linux OS installed. See{" "}
                <a href="https://docs.kubehub.io/how_to_onboard_node/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  How to onboard node
                </a>{" "}
                for requirements.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold">2. SSH and run the join command</h4>
              <p className="text-muted-foreground">SSH into the new node and run (do SSH to it, so your login experience on step 3 is easier):</p>
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
                <code className="whitespace-pre font-mono">{`ARCH="$(uname -m | sed 's/aarch64/arm64/')"
VERSION="$(curl -fsSL https://api.github.com/repos/kubehub-io/cli/releases/latest | sed -n 's/.*"tag_name": "\\(.*\\)",/\\1/p')"
sudo curl -o /usr/bin/kubehubcli -L https://github.com/kubehub-io/cli/releases/download/\${VERSION}/cli_Linux_\${ARCH}
sudo chmod +x /usr/bin/kubehubcli
sudo kubehubcli node join --cluster ${activeCluster?.metadata.name ?? "<cluster-name>"}`}</code>
              </pre>
              <p className="text-muted-foreground">
                View the CLI source:{" "}
                <a href="https://github.com/kubehub-io/cli" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  github.com/kubehub-io/cli
                </a>
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold">3. Device login</h4>
              <p className="text-muted-foreground">
                The CLI will prompt you to visit a URL and enter a device code to authenticate.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold">4. Follow the prompts</h4>
              <p className="text-muted-foreground">
                Answer the questions to configure and join the node to the cluster.
              </p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-semibold">5. Check node status</h4>
              <p className="text-muted-foreground">
                After the setup completes, refresh this page to see the node appear in the list.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clusterStoppedOpen} onOpenChange={setClusterStoppedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Cluster Stopped
            </DialogTitle>
            <DialogDescription>
              The cluster <span className="font-mono font-medium text-foreground">{activeCluster?.metadata.name}</span> is currently stopped. You need to start the cluster before adding new nodes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setClusterStoppedOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailTarget} onOpenChange={(o) => { if (!o) setDetailTarget(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Node Details — {detailTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {detailTarget && detailTarget.annotations.length > 0 && (
              <div className="flex gap-2">
                {detailTarget.annotations.includes("unexpected") && (
                  <Badge variant="warning">Unexpected — not registered in control plane</Badge>
                )}
                {detailTarget.annotations.includes("disconnected") && (
                  <Badge variant="destructive">Disconnected — not found in Kubernetes</Badge>
                )}
              </div>
            )}
            {detailTarget?.k8s && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Kubernetes Node</h4>
                <div className="space-y-1 text-sm">
                  {detailRows(detailTarget.k8s as unknown as Record<string, unknown>).map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">{row.label}</span>
                      <span className="text-right font-mono text-xs break-all">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailTarget?.cp && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Control Plane Node</h4>
                <div className="space-y-1 text-sm">
                  {detailRows(detailTarget.cp as unknown as Record<string, unknown>).map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">{row.label}</span>
                      <span className="text-right font-mono text-xs break-all">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Node
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.cp && deleteTarget?.k8s && (
                <>Are you sure you want to delete node <strong>{deleteTarget?.name}</strong>? This will remove the control plane node object first, then the Kubernetes node object.</>
              )}
              {deleteTarget?.cp && !deleteTarget?.k8s && (
                <>Are you sure you want to delete the control plane node <strong>{deleteTarget?.name}</strong>?</>
              )}
              {!deleteTarget?.cp && deleteTarget?.k8s && (
                <>Are you sure you want to delete the Kubernetes node <strong>{deleteTarget?.name}</strong>?</>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{deleteError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError("") }}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deleteTarget) return
              setDeleteError("")
              try {
                await deleteNodeMutation.mutateAsync(deleteTarget)
                setDeleteTarget(null)
              } catch (e) {
                setDeleteError(e instanceof Error ? e.message : "Failed to delete node")
              }
            }} disabled={deleteNodeMutation.isPending}>
              {deleteNodeMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const NODES_PER_PAGE = 10

function NodeTable({
  columns,
  tableData,
  isLoading,
  error,
}: {
  columns: ColumnDef[]
  tableData: Record<string, unknown>[]
  isLoading: boolean
  error: Error | null
}) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(tableData.length / NODES_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginatedData = tableData.slice((currentPage - 1) * NODES_PER_PAGE, currentPage * NODES_PER_PAGE)

  return (
    <DataTable
      columns={columns}
      data={paginatedData}
      isLoading={isLoading}
      error={error}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  )
}
