"use client"

import { Suspense, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAPIDiscovery } from "@/hooks/use-api-discovery"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { DataTable, type ColumnDef } from "@/components/resources/data-table"
import { ResourceTypeStar } from "@/components/resources/resource-type-star"
import {
  ResourceYamlEditDialog,
  EditResourceButton,
} from "@/components/yaml/resource-yaml-edit-dialog"
import {
  listClusterScopedResources,
  listNamespaceScopedResources,
  deleteK8sResource,
  type ResourceDescriptor,
  type K8sResource,
} from "@/lib/api/k8s-client"
import {
  buildResourceTypes,
  resourceTypeGroupLabel,
  type ResourceTypeEntry,
} from "@/lib/resource-types"
import { CUSTOM_RESOURCES_TYPE_PARAM } from "@/lib/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, ChevronsUpDown, Loader2, Trash2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

interface PrinterColumn {
  name: string
  type: string
  jsonPath: string
  description?: string
  priority?: number
}

interface CRDResource extends K8sResource {
  spec: {
    group: string
    names: {
      kind: string
      plural: string
      singular: string
    }
    scope: "Cluster" | "Namespaced"
    versions: {
      name: string
      served: boolean
      storage: boolean
      additionalPrinterColumns?: PrinterColumn[]
    }[]
  }
}

function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return "-"
  const d = new Date(timestamp)
  const diff = Date.now() - d.getTime()
  const totalSec = Math.max(0, Math.floor(diff / 1000))
  const m = Math.floor(totalSec / 60)
  const h = Math.floor(m / 60)
  const d2 = Math.floor(h / 24)
  const s = totalSec % 60
  if (d2 > 0) return `${d2}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s}s`
  return `${totalSec}s`
}

function ResourceTypeCombobox({
  types,
  value,
  onSelect,
}: {
  types: ResourceTypeEntry[]
  value: string
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const groupedTypes = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = types.filter((t) => {
      if (!q) return true
      return (
        t.kind.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.plural.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q)
      )
    })

    const groups: Record<string, ResourceTypeEntry[]> = {}
    for (const t of filtered) {
      const group = resourceTypeGroupLabel(t.group)
      if (!groups[group]) groups[group] = []
      groups[group].push(t)
    }

    const sorted: [string, ResourceTypeEntry[]][] = Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    return sorted
  }, [types, search])

  const selected = types.find((t) => t.key === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {selected ? (
            <span className="truncate">
              <span className="text-muted-foreground">
                {resourceTypeGroupLabel(selected.group)}/{selected.version}/
              </span>
              {selected.kind}
            </span>
          ) : (
            "Select a resource type"
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="border-b p-2">
          <Input
            placeholder="Search resource types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {groupedTypes.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No matching resources</div>
          ) : (
            groupedTypes.map(([group, resources]) => (
              <div key={group}>
                <div className="sticky top-0 bg-background px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                  {group}
                </div>
                {resources.map((t) => (
                  <button
                    key={t.key}
                    className={cn(
                      "flex w-full items-center px-2 py-1.5 text-sm hover:bg-accent",
                      value === t.key && "bg-accent",
                    )}
                    onClick={() => {
                      onSelect(t.key)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === t.key ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{t.kind}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t.version}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CustomResourcesContent() {
  const searchParams = useSearchParams()
  const requestedType = searchParams.get(CUSTOM_RESOURCES_TYPE_PARAM)
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const namespace = useClusterStore((s) => s.activeNamespace)
  const setNamespace = useClusterStore((s) => s.setActiveNamespace)

  const { data: discovery, isLoading: discoveryLoading } = useAPIDiscovery()

  const { data: crdData } = useK8sClusterResources<CRDResource>(
    { group: "apiextensions.k8s.io", version: "v1", resource: "customresourcedefinitions" },
    "crds",
  )

  const { data: nsData } = useK8sClusterResources(
    { version: "v1", resource: "namespaces" },
    "namespaces",
  )

  const namespaces = useMemo(
    () =>
      (nsData?.items ?? [])
        .map((ns: { metadata: { name: string } }) => ns.metadata.name)
        .sort(),
    [nsData],
  )

  const resourceTypes = useMemo(() => buildResourceTypes(discovery), [discovery])

  // Deep links (All Resources, a pinned tab) preselect the requested type once
  // discovery resolves. An explicit pick always wins over the query param, and an
  // unknown key — e.g. after switching clusters — falls back to no selection.
  const [pickedTypeKey, setPickedTypeKey] = useState<string | null>(null)

  const selectedTypeKey = useMemo(() => {
    const exists = (key: string | null): key is string =>
      !!key && resourceTypes.some((t) => t.key === key)
    if (exists(pickedTypeKey)) return pickedTypeKey
    if (exists(requestedType)) return requestedType
    return ""
  }, [pickedTypeKey, requestedType, resourceTypes])

  const selectedType = useMemo(
    () => resourceTypes.find((t) => t.key === selectedTypeKey) ?? null,
    [resourceTypes, selectedTypeKey],
  )

  const crdColumnMap = useMemo(() => {
    const map: Record<string, PrinterColumn[]> = {}
    if (!crdData?.items) return map
    for (const crd of crdData.items) {
      const kind = crd.spec.names.kind
      const version = crd.spec.versions.find((v) => v.storage) ?? crd.spec.versions[0]
      if (version?.additionalPrinterColumns) {
        map[kind] = version.additionalPrinterColumns
      }
    }
    return map
  }, [crdData])

  const [currentPage, setCurrentPage] = useState(1)
  const [paginationScope, setPaginationScope] = useState({ typeKey: selectedTypeKey, namespace })
  if (paginationScope.typeKey !== selectedTypeKey || paginationScope.namespace !== namespace) {
    setPaginationScope({ typeKey: selectedTypeKey, namespace })
    setCurrentPage(1)
  }

  const desc: ResourceDescriptor | null = selectedType
    ? {
        group: selectedType.group || undefined,
        version: selectedType.version,
        resource: selectedType.plural,
      }
    : null

  const {
    data: resourceData,
    isLoading: resourcesLoading,
    error: resourcesError,
  } = useQuery({
    queryKey: [
      "custom-resources",
      activeCluster?.metadata.name,
      desc?.group,
      desc?.version,
      desc?.resource,
      namespace,
    ],
    queryFn: async () => {
      if (!activeCluster || !desc) return null
      if (selectedType?.namespaced && namespace && namespace !== "__all") {
        return listNamespaceScopedResources(activeCluster, namespace, desc)
      }
      return listClusterScopedResources(activeCluster, desc)
    },
    enabled: !!activeCluster && !!desc,
    refetchInterval: 10_000,
  })

  const columns: ColumnDef[] = useMemo(() => {
    if (!selectedType) return []

    const cols: ColumnDef[] = []

    cols.push({ key: "metadata.name", label: "Name" })

    if (selectedType.namespaced) {
      cols.push({ key: "metadata.namespace", label: "Namespace" })
    }

    const printerColumns = crdColumnMap[selectedType.kind]
    if (printerColumns) {
      for (const col of printerColumns) {
        const cleanPath = col.jsonPath.replace(/^\./, "")
        if (cleanPath === "metadata.name" || cleanPath === "metadata.namespace") continue

        cols.push({
          key: cleanPath,
          label: col.name,
          render: (value: unknown) => {
            if (col.type === "date") {
              return <span className="text-xs">{formatAge(String(value))}</span>
            }
            if (value === null || value === undefined) return <span className="text-xs">-</span>
            return <span className="text-xs">{String(value)}</span>
          },
        })
      }
    }

    cols.push({
      key: "metadata.labels",
      label: "Labels",
      render: (value: unknown) => {
        const labels = value as Record<string, string> | undefined
        if (!labels || Object.keys(labels).length === 0)
          return <span className="text-xs">-</span>
        const entries = Object.entries(labels).slice(0, 3)
        return (
          <div className="flex flex-wrap gap-1">
            {entries.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium"
              >
                {k}: {v}
              </span>
            ))}
            {Object.keys(labels).length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{Object.keys(labels).length - 3}
              </span>
            )}
          </div>
        )
      },
    })

    cols.push({ key: "metadata.creationTimestamp", label: "Age" })

    return cols
  }, [selectedType, crdColumnMap])

  const items = useMemo(
    () => (resourceData?.items ?? []) as unknown as Record<string, unknown>[],
    [resourceData],
  )

  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const paginatedItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const [editTarget, setEditTarget] = useState<{ name: string; namespace?: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; namespace?: string } | null>(
    null,
  )
  const [deleteError, setDeleteError] = useState("")
  const queryClient = useQueryClient()
  const queryKey = "custom-resources"

  const deleteMutation = useMutation({
    mutationFn: ({ name, namespace: ns }: { name: string; namespace?: string }) =>
      deleteK8sResource(activeCluster!, ns ?? null, desc!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-resources"] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Custom Resources</h2>
          <p className="text-muted-foreground">
            {activeCluster
              ? `${activeCluster.metadata.name} / custom resources`
              : "No active cluster"}
          </p>
        </div>
        {selectedType && <ResourceTypeStar entry={selectedType} size="sm" />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Resource Type</label>
          {discoveryLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading API discovery...
            </div>
          ) : (
            <ResourceTypeCombobox
              types={resourceTypes}
              value={selectedTypeKey}
              onSelect={setPickedTypeKey}
            />
          )}
        </div>

        {selectedType?.namespaced && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Namespace</label>
            <Select value={namespace ?? "__all"} onValueChange={setNamespace}>
              <SelectTrigger>
                <SelectValue placeholder="All namespaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All namespaces</SelectItem>
                {namespaces.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {selectedType && (
        <DataTable
          columns={columns}
          data={paginatedItems}
          isLoading={resourcesLoading}
          error={resourcesError}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          actions={(item) => {
            const meta = item.metadata as Record<string, string>
            const deleting = deleteMutation.isPending && deleteMutation.variables?.name === meta.name
            return (
              <div className="flex items-center gap-1">
                <EditResourceButton
                  onClick={() =>
                    setEditTarget({
                      name: meta.name,
                      namespace: meta.namespace,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={deleting}
                  onClick={() => setDeleteTarget({ name: meta.name, namespace: meta.namespace })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            )
          }}
        />
      )}

      {!selectedType && !discoveryLoading && (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Select a resource type above to view its resources
        </div>
      )}

      {selectedType && (
        <ResourceYamlEditDialog
          open={!!editTarget}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null)
          }}
          cluster={activeCluster}
          desc={desc!}
          name={editTarget?.name ?? ""}
          namespace={editTarget?.namespace}
          queryKey={queryKey}
          title={`Edit ${selectedType.kind}`}
        />
      )}

      {selectedType && (
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteTarget(null)
              setDeleteError("")
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete {selectedType.kind}
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong>
                {deleteTarget?.namespace ? (
                  <>
                    {" "}
                    in namespace <strong>{deleteTarget.namespace}</strong>
                  </>
                ) : null}
                ?
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteError("")
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={async () => {
                  if (!deleteTarget) return
                  setDeleteError("")
                  try {
                    await deleteMutation.mutateAsync(deleteTarget)
                    setDeleteTarget(null)
                  } catch (e) {
                    setDeleteError(
                      e instanceof Error ? e.message : `Failed to delete ${selectedType.kind}`,
                    )
                  }
                }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default function CustomResourcesPage() {
  return (
    <Suspense fallback={null}>
      <CustomResourcesContent />
    </Suspense>
  )
}
