"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCreateCluster } from "@/hooks/use-clusters"
import { getMetadata, getClusterETag, updateCluster, listAppIngresses } from "@/lib/api/control-plane"
import type { Cluster } from "@/stores/cluster-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"

interface ClusterDialogProps {
  mode: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  cluster?: Cluster
  appIngressCount?: number
}

export function ClusterDialog({ mode, open, onOpenChange, cluster, appIngressCount = 0 }: ClusterDialogProps) {
  const createCluster = useCreateCluster()
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [region, setRegion] = useState("us-east-1")
  const [ingressEnabled, setIngressEnabled] = useState(mode === "edit" && cluster ? cluster.spec.managedIngressProfile?.enabled !== false : true)
  const [ingressEmail, setIngressEmail] = useState(mode === "edit" && cluster ? cluster.spec.managedIngressProfile?.email ?? "" : "")
  const [storageProfile, setStorageProfile] = useState(mode === "edit" && cluster ? cluster.spec.storageProfile?.backend ?? "none" : "none")
  const [monitoringEnabled, setMonitoringEnabled] = useState(mode === "edit" && cluster ? cluster.spec.monitoringProfile?.enabled === true : false)
  const [error, setError] = useState("")

  const { data: metadata } = useQuery({
    queryKey: ["metadata"],
    queryFn: getMetadata,
    enabled: open && mode === "create",
    staleTime: 5 * 60 * 1000,
  })

  const handleSubmit = async () => {
    setError("")
    try {
      if (mode === "create") {
        await createCluster.mutateAsync({
          metadata: { name },
          spec: {
            region,
            managedIngressProfile: { enabled: ingressEnabled, email: ingressEmail },
            storageProfile: { backend: storageProfile === "none" ? "" : storageProfile },
          },
        })
        onOpenChange(false)
      } else if (cluster) {
        const { cluster: current, etag } = await getClusterETag(cluster.metadata.name)
        await updateCluster(cluster.metadata.name, {
          metadata: { name: cluster.metadata.name },
          spec: {
            ...current.spec,
            managedIngressProfile: { enabled: ingressEnabled, email: ingressEmail },
            storageProfile: { backend: storageProfile === "none" ? "" : storageProfile },
            monitoringProfile: { enabled: monitoringEnabled },
          },
        }, etag)
        queryClient.invalidateQueries({ queryKey: ["clusters"] })
        onOpenChange(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : mode === "create" ? "Failed to create cluster" : "Failed to update cluster")
    }
  }

  const isIngressDisabled = mode === "edit" && appIngressCount > 0
  const isSubmitDisabled = mode === "create" ? createCluster.isPending || !name : false
  const isSubmitPending = mode === "create" ? createCluster.isPending : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create Cluster" : `Cluster Settings — ${cluster?.metadata.name}`}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general" className="mt-2">
          <TabsList className={`grid w-full ${mode === "edit" ? "grid-cols-5" : "grid-cols-3"}`}>
            <TabsTrigger value="general">General</TabsTrigger>
            {mode === "edit" && <TabsTrigger value="network">Network</TabsTrigger>}
            <TabsTrigger value="ingress">AppIngress</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            {mode === "edit" && <TabsTrigger value="monitoring">Monitoring</TabsTrigger>}
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-cluster" />
              </div>
            )}
            {mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="region">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {metadata?.regions.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Region</Label>
                <div className="rounded-md bg-muted px-3 py-2 text-sm">{cluster?.spec.region ?? "-"}</div>
              </div>
            )}
          </TabsContent>

          {mode === "edit" && (
            <TabsContent value="network" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">Network settings cannot be modified after cluster creation.</p>
              <div className="space-y-2">
                <Label>Node Physical CIDR</Label>
                <div className="rounded-md bg-muted px-3 py-2 text-sm">{cluster?.spec.network?.nodePhysicalCIDR ?? "-"}</div>
              </div>
              <div className="space-y-2">
                <Label>Pod CIDR</Label>
                <div className="rounded-md bg-muted px-3 py-2 text-sm">{cluster?.spec.network?.podCIDR ?? "-"}</div>
              </div>
              <div className="space-y-2">
                <Label>Service CIDR</Label>
                <div className="rounded-md bg-muted px-3 py-2 text-sm">{cluster?.spec.network?.serviceCIDR ?? "-"}</div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="ingress" className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ingressEnabled"
                checked={ingressEnabled}
                onCheckedChange={(v) => setIngressEnabled(v === true)}
                disabled={isIngressDisabled}
              />
              <Label htmlFor="ingressEnabled" className={`cursor-pointer text-sm ${isIngressDisabled ? "text-muted-foreground" : ""}`}>
                Enable managed ingress
              </Label>
            </div>
            {mode === "edit" && appIngressCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Cannot disable managed ingress while {appIngressCount} app ingress{appIngressCount !== 1 ? "es" : ""} exist.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="ingressEmail">{mode === "create" ? "LetsEncrypt Notification email" : "Notification email"}</Label>
              <Input
                id="ingressEmail"
                value={ingressEmail}
                onChange={(e) => setIngressEmail(e.target.value)}
                placeholder="email from login will be used"
                type="email"
              />
            </div>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="storageProfile">Storage provider</Label>
              <Select value={storageProfile} onValueChange={setStorageProfile}>
                <SelectTrigger id="storageProfile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="longhorn">Longhorn</SelectItem>
                  <SelectItem value="none">None (self-managed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {storageProfile === "longhorn" && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">
                  <a href="https://longhorn.io" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                    Longhorn
                  </a>{" "}strongly suggested
                </p>
                <p className="mt-1">Your stateful pod can travel free across nodes, longhorn can handle your pod storage smoothly.</p>
                <p className="mt-1">When you have multiple node and want to migrate a node, just few click on the longhorn UI, you PersistentVolumes get moved, compare to manual copy files.</p>
              </div>
            )}
            {storageProfile === "none" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">You need to manage your own Storage provider</p>
                <p className="mt-1">If no Storage provider is configured, pods that require PersistentVolumes will not work, lots of server software in kubernetes ecosystem rely on PersistentVolumes.</p>
              </div>
            )}
          </TabsContent>

          {mode === "edit" && (
            <TabsContent value="monitoring" className="space-y-4 pt-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="monitoringEnabled"
                  checked={monitoringEnabled}
                  onCheckedChange={(v) => setMonitoringEnabled(v === true)}
                />
                <Label htmlFor="monitoringEnabled" className="cursor-pointer text-sm">Enable monitoring</Label>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        {mode === "edit" ? (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Save</Button>
          </DialogFooter>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitDisabled} className="w-full">
            {isSubmitPending ? "Creating..." : "Create"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

export async function fetchAppIngressCount(clusterName: string): Promise<number> {
  try {
    const apps = await listAppIngresses(clusterName)
    return apps.length
  } catch {
    return 0
  }
}
