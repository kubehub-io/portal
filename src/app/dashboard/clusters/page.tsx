"use client"

import { useState } from "react"
import { useClusters, useDeleteCluster, useDownloadKubeconfig, useReconcileCluster } from "@/hooks/use-clusters"
import { startCluster as doStartCluster, listControlPlaneNodes } from "@/lib/api/control-plane"
import { ClusterDialog, fetchAppIngressCount } from "@/components/cluster-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Download, Loader2, AlertTriangle, ExternalLink, Play, RefreshCw, Settings } from "lucide-react"

function clusterState(cluster: { status?: { state?: string } }): string {
  return cluster.status?.state || "Provisioning"
}

const RECONCILE_STUCK_THRESHOLD_MS = 20 * 60 * 1000

function isReconcileStuck(cluster: { status?: { lastOperation?: { operationName?: string; startedOn?: string } } }): boolean {
  const { lastOperation } = cluster.status ?? {}
  if (lastOperation?.operationName !== "reconcile" || !lastOperation.startedOn) return false
  const started = Date.parse(lastOperation.startedOn)
  if (Number.isNaN(started)) return false
  return Date.now() - started > RECONCILE_STUCK_THRESHOLD_MS
}

export default function ClustersPage() {
  const { clusters, isLoading, error } = useClusters()
  const deleteCluster = useDeleteCluster()
  const downloadKubeconfig = useDownloadKubeconfig()
  const [createOpen, setCreateOpen] = useState(false)
  const [editCluster, setEditCluster] = useState<string | null>(null)
  const [editAppIngressCount, setEditAppIngressCount] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleteForce, setDeleteForce] = useState(false)
  const [deleteNodesCount, setDeleteNodesCount] = useState(0)
  const [deleteAppIngressCount, setDeleteAppIngressCount] = useState(0)
  const [deleteChecking, setDeleteChecking] = useState(false)
  const [kubeconfigTarget, setKubeconfigTarget] = useState<string | null>(null)
  const [certBased, setCertBased] = useState(false)
  const [startTarget, setStartTarget] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const reconcileCluster = useReconcileCluster()

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleteError("")
    try {
      await deleteCluster.mutateAsync({ name: deleteTarget, force: deleteForce })
      setDeleteTarget(null)
      setDeleteForce(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete cluster")
    }
  }

  const handleStartConfirm = async () => {
    if (!startTarget) return
    setStarting(true)
    setStartError("")
    try {
      await doStartCluster(startTarget)
      setStartTarget(null)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Failed to start cluster")
    }
    setStarting(false)
  }

  const handleReconcile = (name: string) => {
    reconcileCluster.mutate(name)
  }

  const handleDownloadKubeconfig = async () => {
    if (!kubeconfigTarget) return
    try {
      const b64 = await downloadKubeconfig.mutateAsync({ name: kubeconfigTarget, certbased: certBased })
      const decoded = atob(b64)
      const blob = new Blob([decoded], { type: "application/yaml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${kubeconfigTarget}-kubeconfig.yaml`
      a.click()
      URL.revokeObjectURL(url)
      setKubeconfigTarget(null)
      setCertBased(false)
    } catch { }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <div className="text-destructive">Error: {error.message}</div>
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clusters</h2>
          <p className="text-muted-foreground">Manage your Kubernetes clusters</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Cluster
        </Button>
        <ClusterDialog key={createOpen ? "create-open" : "create-closed"} mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      </div>

      <div className="space-y-3">
        {clusters.map((cluster) => {
          const state = clusterState(cluster)
          return (
            <Card key={cluster.metadata.name} className="border-muted/80">
              <CardHeader className="px-4 py-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{cluster.metadata.name}</CardTitle>
                    <CardDescription className="mt-0.5">{cluster.spec.region}</CardDescription>
                  </div>
                  <div className="flex gap-1 self-end md:self-auto">
                    {state === "Stopped" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setStartTarget(cluster.metadata.name)}>
                            <Play className="h-4 w-4 text-green-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Start</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => { setKubeconfigTarget(cluster.metadata.name); setCertBased(false) }}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download kubeconfig</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => handleReconcile(cluster.metadata.name)} disabled={reconcileCluster.isPending || (state === "Reconciling" && !isReconcileStuck(cluster))}>
                          <RefreshCw className={`h-4 w-4 ${reconcileCluster.isPending ? "animate-spin" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reconcile</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={state === "Reconciling"} onClick={async () => {
                          setEditCluster(cluster.metadata.name)
                          setEditAppIngressCount(await fetchAppIngressCount(cluster.metadata.name))
                        }}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Settings</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={async () => {
                          setDeleteTarget(cluster.metadata.name)
                          setDeleteForce(false)
                          setDeleteError("")
                          setDeleteChecking(true)
                          try {
                            const [nodes, ingressCount] = await Promise.all([
                              listControlPlaneNodes(cluster.metadata.name),
                              fetchAppIngressCount(cluster.metadata.name),
                            ])
                            setDeleteNodesCount(nodes.length)
                            setDeleteAppIngressCount(ingressCount)
                          } catch {
                            setDeleteNodesCount(0)
                            setDeleteAppIngressCount(0)
                          }
                          setDeleteChecking(false)
                        }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center justify-between gap-3 sm:gap-8">
                    <span className="text-muted-foreground">Status</span>
                    {state === "Failed" && cluster.status?.lastOperation?.error ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive">{state}</Badge>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs space-y-1">
                          {cluster.status.lastOperation.error.code && (
                            <p className="text-xs font-mono text-muted-foreground">{cluster.status.lastOperation.error.code}</p>
                          )}
                          <p className="text-xs">{cluster.status.lastOperation.error.message}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant={
                        state === "Running" ? "success" :
                        state === "Stopped" ? "warning" :
                        state === "Deleted" || state === "Deleting" ? "destructive" : "secondary"
                      }>
                        {state}
                      </Badge>
                    )}
                  </div>
                  {cluster.status?.publicDns && (
                    <div className="flex items-center justify-between gap-3 sm:gap-8">
                      <span className="text-muted-foreground">Endpoint</span>
                      <span className="text-xs font-mono">{cluster.status.publicDns}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {clusters.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No clusters found. Create one to get started.
          </div>
        )}
      </div>

      {editCluster && (
        <ClusterDialog
          key={`edit-${editCluster}`}
          mode="edit"
          open={!!editCluster}
          onOpenChange={(o) => { if (!o) setEditCluster(null) }}
          cluster={clusters.find((c) => c.metadata.name === editCluster)}
          appIngressCount={editAppIngressCount}
        />
      )}

      <Dialog open={!!kubeconfigTarget} onOpenChange={(o) => { if (!o) { setKubeconfigTarget(null); setCertBased(false) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Download Kubeconfig</DialogTitle>
            <DialogDescription>
              Your kubeconfig uses OIDC authentication. Install{" "}
              <a href="https://github.com/int128/kubelogin#setup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                kubelogin <ExternalLink className="h-3 w-3" />
              </a>{" "}
              to authenticate:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">{`# Homebrew (macOS and Linux)
brew install kubelogin

# Krew (macOS, Linux, Windows and ARM)
kubectl krew install oidc-login

# Chocolatey (Windows)
choco install kubelogin`}</pre>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={certBased} onChange={(e) => setCertBased(e.target.checked)} className="mt-0.5" />
              <span>Download cert-based kubeconfig (bypasses OIDC login prompt)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setKubeconfigTarget(null); setCertBased(false) }}>Cancel</Button>
            <Button onClick={handleDownloadKubeconfig} disabled={downloadKubeconfig.isPending}>
              {downloadKubeconfig.isPending ? "Downloading..." : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!startTarget} onOpenChange={(o) => { if (!o) { setStartTarget(null); setStarting(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Cluster</DialogTitle>
            <DialogDescription>
              Are you sure you want to start <strong>{startTarget}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            If your node is not connected, the cluster will be shut down again within 30 minutes.
          </div>
          {startError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{startError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStartTarget(null); setStarting(false) }}>Cancel</Button>
            <Button onClick={handleStartConfirm} disabled={starting}>
              {starting ? "Starting..." : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteForce(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Cluster
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteChecking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking for existing resources...
            </div>
          ) : (
            <>
              {(deleteNodesCount > 0 || deleteAppIngressCount > 0) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1">
                  <p className="font-medium">This cluster has existing resources:</p>
                  {deleteNodesCount > 0 && <p>&bull; {deleteNodesCount} node{deleteNodesCount !== 1 ? "s" : ""}</p>}
                  {deleteAppIngressCount > 0 && <p>&bull; {deleteAppIngressCount} app ingress{deleteAppIngressCount !== 1 ? "es" : ""}</p>}
                  <p className="mt-1">Delete will fail unless you force delete.</p>
                </div>
              )}
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={deleteForce}
                  onCheckedChange={(v) => setDeleteForce(v === true)}
                />
                <span className="leading-tight">Force delete — bypass the resource existence check</span>
              </label>
            </>
          )}
          {deleteError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{deleteError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteForce(false) }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteCluster.isPending || deleteChecking || ((deleteNodesCount > 0 || deleteAppIngressCount > 0) && !deleteForce)}>
              {deleteCluster.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}
