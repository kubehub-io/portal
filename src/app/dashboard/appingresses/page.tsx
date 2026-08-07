"use client"

import { useState, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { DataTable } from "@/components/resources/data-table"
import { useClusterStore } from "@/stores/cluster-store"
import {
  listAppIngresses,
  createAppIngress,
  updateAppIngress,
  deleteAppIngress,
  type AppIngress,
} from "@/lib/api/control-plane"
import { listClusterScopedResources } from "@/lib/api/k8s-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, Loader2, ChevronDown, ChevronRight, CheckCircle } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

interface K8sServiceItem {
  metadata: { name: string; namespace: string }
  spec: {
    type: string
    clusterIP?: string
    ports?: Array<{ name?: string; port: number; protocol: string }>
  }
}

export default function AppIngressesPage() {
  const qc = useQueryClient()
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const isOffline = activeCluster?.status?.state?.toLowerCase() === "stopped"
  const managedIngress = activeCluster?.spec?.managedIngressProfile?.enabled !== false
  const clusterDns = activeCluster?.status.publicDns

  const query = useQuery({
    queryKey: ["app-ingresses", activeCluster?.metadata.name],
    queryFn: () => listAppIngresses(activeCluster!.metadata.name),
    enabled: !!activeCluster,
  })

  const etagMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of query.data ?? []) {
      if (app.metadata.etag) {
        map.set(app.metadata.name, app.metadata.etag)
      }
    }
    return map
  }, [query.data])

  const servicesQuery = useQuery({
    queryKey: ["services-all", clusterDns],
    queryFn: () =>
      listClusterScopedResources<K8sServiceItem>(clusterDns!, { version: "v1", resource: "services" }),
    enabled: false,
    staleTime: 30_000,
  })

  const excluded = new Set([
    "default/kubernetes",
    "kube-system/metrics-server",
    "kube-system/kube-dns",
    "cert-manager/cert-manager",
    "cert-manager/cert-manager-cainjector",
    "cert-manager/cert-manager-webhook",
    "cert-manager/certmgr-webhook-kubehub",
    "longhorn-system/longhorn-admission-webhook",
    "longhorn-system/longhorn-backend",
    "longhorn-system/longhorn-frontend",
    "longhorn-system/longhorn-recovery-backend",
    "kube-system/cilium-enovy",
    "kube-system/cilium-gateway-default",
  ])

  const services = useMemo(() => {
    if (!servicesQuery.data?.items) return []
    return servicesQuery.data.items
      .filter((s) => s.spec.ports && s.spec.ports.length > 0 && !excluded.has(`${s.metadata.namespace}/${s.metadata.name}`))
      .sort((a, b) => {
        const nsCmp = a.metadata.namespace.localeCompare(b.metadata.namespace)
        return nsCmp !== 0 ? nsCmp : a.metadata.name.localeCompare(b.metadata.name)
      })
  }, [servicesQuery.data])

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AppIngress | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [formError, setFormError] = useState("")
  const [deleteError, setDeleteError] = useState("")

  const [formName, setFormName] = useState("")
  const [formServiceId, setFormServiceId] = useState("")
  const [formPort, setFormPort] = useState("")
  const [formExposePublic, setFormExposePublic] = useState(false)
  const [formExposeLocal] = useState(true)
  const [formProtocol, setFormProtocol] = useState("HTTP")
  const [formRoutes, setFormRoutes] = useState<Record<string, { serviceName: string; namespace: string; port: number }>>({})
  const [newRoutePrefix, setNewRoutePrefix] = useState("")
  const [newRouteServiceId, setNewRouteServiceId] = useState("")
  const [newRoutePort, setNewRoutePort] = useState("")
  const [routesExpanded, setRoutesExpanded] = useState(false)

  const openCreate = useCallback(() => {
    setFormName("")
    setFormServiceId("")
    setFormPort("")
    setFormProtocol("HTTP")
    setFormExposePublic(true)
    setFormRoutes({})
    setNewRoutePrefix("")
    setNewRouteServiceId("")
    setNewRoutePort("")
    setEditTarget(null)
    if (clusterDns) servicesQuery.refetch()
    setCreateOpen(true)
  }, [clusterDns, servicesQuery])

  const openEdit = useCallback((app: AppIngress) => {
    setEditTarget(app)
    setFormName(app.metadata.name)
    setFormProtocol(app.spec.protocol ?? "HTTP")
    setFormExposePublic(app.spec.exposeToPublic ?? false)
    setFormRoutes(app.spec.routesByPrefix ?? {})
    setNewRoutePrefix("")
    setNewRouteServiceId("")
    setNewRoutePort("")
    if (app.spec.serviceBackend) {
      const svcId = `${app.spec.serviceBackend.namespace}/${app.spec.serviceBackend.serviceName}`
      setFormServiceId(svcId)
      setFormPort(String(app.spec.serviceBackend.port))
    } else {
      setFormServiceId("")
      setFormPort("")
    }
    if (clusterDns) servicesQuery.refetch()
    setCreateOpen(true)
  }, [clusterDns, servicesQuery])

  const selectedService = useMemo(() => {
    return services.find((s) => `${s.metadata.namespace}/${s.metadata.name}` === formServiceId)
  }, [services, formServiceId])

  const availablePorts = useMemo(() => {
    return selectedService?.spec.ports ?? []
  }, [selectedService])

  const NAME_PRIORITY = ["https", "http", "tls"]
  const PORT_PRIORITY = [443, 80, 8443, 8080, 3000, 8000]

  function pickDefaultPort(ports: K8sServiceItem["spec"]["ports"]): string {
    if (!ports || ports.length === 0) return ""
    if (ports.length === 1) return String(ports[0].port)
    for (const name of NAME_PRIORITY) {
      const match = ports.find((p) => p.name?.toLowerCase() === name)
      if (match) return String(match.port)
    }
    for (const preferred of PORT_PRIORITY) {
      if (ports.some((p) => p.port === preferred)) return String(preferred)
    }
    return String(ports[0].port)
  }

  const newRouteSelectedService = useMemo(() => {
    return services.find((s) => `${s.metadata.namespace}/${s.metadata.name}` === newRouteServiceId)
  }, [services, newRouteServiceId])

  const newRouteAvailablePorts = useMemo(() => {
    return newRouteSelectedService?.spec.ports ?? []
  }, [newRouteSelectedService])

  const createMutation = useMutation({
    mutationFn: (spec: AppIngress["spec"]) => {
      if (!activeCluster) throw new Error("No active cluster")
      return createAppIngress(activeCluster.metadata.name, formName, spec)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-ingresses"] }),
  })

  const updateMutation = useMutation({
    mutationFn: (spec: AppIngress["spec"]) => {
      if (!activeCluster || !editTarget) throw new Error("No active cluster or edit target")
      const etag = etagMap.get(editTarget.metadata.name)
      if (!etag) throw new Error("Missing eTag for update")
      return updateAppIngress(activeCluster.metadata.name, editTarget.metadata.name, spec, etag)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-ingresses"] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!activeCluster || !deleteTarget) throw new Error("No active cluster or delete target")
      const etag = etagMap.get(deleteTarget)
      return deleteAppIngress(activeCluster.metadata.name, deleteTarget, etag)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-ingresses"] })
      setDeleteTarget(null)
    },
  })

  const buildSpec = useCallback((): AppIngress["spec"] => {
    const spec: AppIngress["spec"] = {
      exposeToPublic: formExposePublic,
      exposeToLocal: formExposeLocal,
      protocol: formProtocol,
      routesByPrefix: formRoutes,
    }
    if (selectedService) {
      spec.serviceBackend = {
        serviceName: selectedService.metadata.name,
        namespace: selectedService.metadata.namespace,
        port: parseInt(formPort, 10),
      }
    }
    return spec
  }, [formExposePublic, formExposeLocal, formProtocol, formRoutes, selectedService, formPort])

  const handleSave = async () => {
    setFormError("")
    const spec = buildSpec()
    try {
      if (editTarget) {
        await updateMutation.mutateAsync(spec)
      } else {
        await createMutation.mutateAsync(spec)
      }
      setCreateOpen(false)
      setEditTarget(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save app ingress")
    }
  }

  const columns = [
    {
      key: "metadata.name",
      label: "Name",
      render: (value: unknown) => <span className="text-xs font-medium">{String(value ?? "-")}</span>,
    },
    {
      key: "spec.serviceBackend.serviceName",
      label: "Service",
    },
    {
      key: "spec.serviceBackend.namespace",
      label: "Namespace",
    },
    {
      key: "spec.serviceBackend.port",
      label: "Port",
    },
    {
      key: "spec.exposeToPublic",
      label: "Public",
      render: (value: unknown) =>
        value ? <Badge variant="success">True</Badge> : <span className="text-xs text-muted-foreground">False</span>,
    },
    {
      key: "status.publicDns",
      label: "Public DNS",
      render: (value: unknown, item: Record<string, unknown>) => {
        if (!(item.spec as Record<string, unknown>)?.exposeToPublic || !value) return "-"
        const status = (item.status as Record<string, unknown>) as { programStatus?: { publicDNS?: { programed?: boolean; message?: string } } } | undefined
        const programmed = status?.programStatus?.publicDNS?.programed
        if (programmed) {
          return (
            <a href={`https://${value}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-mono underline underline-offset-2 hover:text-primary">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              {String(value)}
            </a>
          )
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  {String(value)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{status?.programStatus?.publicDNS?.message ?? "Not yet programmed"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      key: "status.localDNS",
      label: "Local DNS",
      render: (value: unknown, item: Record<string, unknown>) => {
        if (!value) return "-"
        const status = (item.status as Record<string, unknown>) as { programStatus?: { localDNS?: { programed?: boolean; message?: string } } } | undefined
        const programmed = status?.programStatus?.localDNS?.programed
        if (programmed) {
          return (
            <a href={`https://${value}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-mono underline underline-offset-2 hover:text-primary">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              {String(value)}
            </a>
          )
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  {String(value)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{status?.programStatus?.localDNS?.message ?? "Not yet programmed"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      key: "actions",
      label: "",
      render: (_value: unknown, item: Record<string, unknown>) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", isOffline && "pointer-events-none opacity-50")}
            onClick={() => openEdit(item as unknown as AppIngress)}
            disabled={isOffline}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-destructive hover:text-destructive", isOffline && "pointer-events-none opacity-50")}
            onClick={() => setDeleteTarget((item.metadata as Record<string, unknown>)?.name as string)}
            disabled={isOffline}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">App Ingresses</h2>
          <p className="text-muted-foreground flex items-center gap-2">
            {activeCluster ? `${activeCluster.metadata.name} / app ingresses` : "No active cluster"}
            {isOffline && <Badge variant="warning">Offline</Badge>}
          </p>
        </div>
        {activeCluster && !isOffline && (
          <Button onClick={openCreate} disabled={!managedIngress}>
            <Plus className="h-4 w-4 mr-2" />
            Create App Ingress
          </Button>
        )}
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          <Info className="h-4 w-4 shrink-0" />
          Cluster is offline — app ingresses are not available
        </div>
      )}
      {!isOffline && !managedIngress && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <Info className="h-4 w-4 shrink-0" />
          Managed ingress is disabled for this cluster — app ingresses cannot be created.
        </div>
      )}

      <DataTable
        columns={columns}
        data={(query.data ?? []) as unknown as Record<string, unknown>[]}
        isLoading={query.isLoading}
        error={query.error}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit App Ingress" : "Create App Ingress"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the app ingress configuration."
                : "Create a new app ingress targeting a service."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service">Service</Label>
              {servicesQuery.isFetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading services...
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services found in the cluster.</p>
              ) : (
                <Select value={formServiceId} onValueChange={(v) => {
                  setFormServiceId(v)
                  const svc = services.find((s) => `${s.metadata.namespace}/${s.metadata.name}` === v)
                  setFormPort(pickDefaultPort(svc?.spec.ports))
                  if (!editTarget) setFormName(v.split("/")[1])
                }}>
                  <SelectTrigger id="service">
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={`${s.metadata.namespace}/${s.metadata.name}`} value={`${s.metadata.namespace}/${s.metadata.name}`}>
                        {s.metadata.namespace}/{s.metadata.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedService && availablePorts.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Select value={formPort} onValueChange={setFormPort}>
                  <SelectTrigger id="port">
                    <SelectValue placeholder="Select a port" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePorts.map((p) => (
                      <SelectItem key={p.port} value={String(p.port)}>
                        {p.port}{p.name ? ` (${p.name})` : ""}/{p.protocol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="my-app"
                disabled={!!editTarget}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exposePublic"
                  checked={formExposePublic}
                  onCheckedChange={(v) => setFormExposePublic(v === true)}
                />
                <Label htmlFor="exposePublic" className="cursor-pointer">Expose to Public</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exposeLocal"
                  checked={true}
                  disabled
                />
                <Label htmlFor="exposeLocal" className="text-muted-foreground">Expose Locally</Label>
              </div>
            </div>

            {(formExposePublic || formExposeLocal) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                <p className="font-medium">Security Notice</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Domain/TLS is handled by Kubehub (trusted in browser).</li>
                  <li>Authentication &amp; Authorization are your responsibility. If your app has its own auth, great. If not, you must protect your content.</li>
                  {formExposeLocal && !formExposePublic && (
                    <li>Content will be visible to your local LAN.</li>
                  )}
                  {formExposePublic && (
                    <li>Content will be visible globally.</li>
                  )}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="protocol">Protocol</Label>
              <Select value={formProtocol} onValueChange={setFormProtocol}>
                <SelectTrigger id="protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HTTP">HTTP</SelectItem>
                  <SelectItem value="TLS" disabled>TLS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setRoutesExpanded(!routesExpanded)}
                className="flex items-center gap-2 text-sm font-semibold cursor-pointer"
              >
                {routesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Routes by Prefix
              </button>
              {!routesExpanded && (
                <p className="text-xs text-muted-foreground mt-1">
                  Optional path-prefix based routing to different backends.
                </p>
              )}

              {routesExpanded && (<>
              {Object.entries(formRoutes).map(([prefix, backend]) => (
                <div key={prefix} className="flex items-center justify-between rounded-md border px-3 py-2 mb-1 mt-1">
                  <div className="text-xs">
                    <span className="font-mono">{prefix}</span>
                    <span className="text-muted-foreground"> → </span>
                    {backend.namespace}/{backend.serviceName}:{backend.port}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => {
                      const { [prefix]: _, ...rest } = formRoutes
                      setFormRoutes(rest)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {formProtocol === "TLS" && (
                <p className="text-xs text-muted-foreground">Routes by prefix are not available for TLS protocol.</p>
              )}

              <div className={formProtocol === "TLS" ? "pointer-events-none opacity-50" : ""}>
              <div className="space-y-2 mt-2 rounded-md border p-3">
                <div className="text-xs font-medium">Add Route</div>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="routePrefix" className="text-xs">Path Prefix</Label>
                    <Input
                      id="routePrefix"
                      value={newRoutePrefix}
                      onChange={(e) => setNewRoutePrefix(e.target.value)}
                      placeholder="/api/v1"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="routeService" className="text-xs">Service</Label>
                    <Select value={newRouteServiceId} onValueChange={(v) => { setNewRouteServiceId(v); setNewRoutePort("") }}>
                      <SelectTrigger id="routeService" className="h-8 text-xs">
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={`${s.metadata.namespace}/${s.metadata.name}`} value={`${s.metadata.namespace}/${s.metadata.name}`}>
                            {s.metadata.namespace}/{s.metadata.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newRouteSelectedService && newRouteAvailablePorts.length > 0 && (
                    <div>
                      <Label htmlFor="routePort" className="text-xs">Port</Label>
                      <Select value={newRoutePort} onValueChange={setNewRoutePort}>
                        <SelectTrigger id="routePort" className="h-8 text-xs">
                          <SelectValue placeholder="Select a port" />
                        </SelectTrigger>
                        <SelectContent>
                          {newRouteAvailablePorts.map((p) => (
                            <SelectItem key={p.port} value={String(p.port)}>
                              {p.port}{p.name ? ` (${p.name})` : ""}/{p.protocol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full"
                  disabled={!newRoutePrefix || !newRouteServiceId || !newRoutePort}
                  onClick={() => {
                    if (!newRouteSelectedService) return
                    setFormRoutes((prev) => ({
                      ...prev,
                      [newRoutePrefix]: {
                        serviceName: newRouteSelectedService.metadata.name,
                        namespace: newRouteSelectedService.metadata.namespace,
                        port: parseInt(newRoutePort, 10),
                      },
                    }))
                    setNewRoutePrefix("")
                    setNewRouteServiceId("")
                    setNewRoutePort("")
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Route
                </Button>
              </div>
              </div>
              </>)}
            </div>
          </div>
          {formError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={
                !formName ||
                (editTarget ? false : !selectedService || !formPort) ||
                (!formExposePublic && !formExposeLocal) ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editTarget
                  ? "Save"
                  : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete App Ingress</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium">{deleteTarget}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{deleteError}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setDeleteError("")
                try {
                  await deleteMutation.mutateAsync()
                } catch (e) {
                  setDeleteError(e instanceof Error ? e.message : "Failed to delete app ingress")
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
