"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { useK8sEvents } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState, useMemo, useCallback } from "react"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAGE_SIZE = 200

export default function EventsPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const [namespace, setNamespace] = useState("__all")
  const [reason, setReason] = useState("__all")
  const [type, setType] = useState("__all")
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)

  const { data: nsData } = useK8sClusterResources(
    { version: "v1", resource: "namespaces" },
    "namespaces",
  )

  const { data, isLoading, error } = useK8sEvents(
    namespace && namespace !== "__all" ? namespace : undefined,
    refreshKey,
  )

  const rawItems = useMemo(
    () => (data?.items ?? []) as unknown as Record<string, unknown>[],
    [data?.items],
  )

  const allReasons = useMemo(() => {
    const s = new Set<string>()
    rawItems.forEach((item) => {
      const r = item.reason as string | undefined
      if (r) s.add(r)
    })
    return Array.from(s).sort()
  }, [rawItems])

  const allTypes = useMemo(() => {
    const s = new Set<string>()
    rawItems.forEach((item) => {
      const t = item.type as string | undefined
      if (t) s.add(t)
    })
    return Array.from(s).sort()
  }, [rawItems])

  const filtered = useMemo(() => {
    let list = rawItems
    if (namespace !== "__all") {
      list = list.filter((item) => (item.metadata as Record<string, unknown>)?.namespace === namespace)
    }
    if (reason !== "__all") {
      list = list.filter((item) => (item.reason as string) === reason)
    }
    if (type !== "__all") {
      list = list.filter((item) => (item.type as string) === type)
    }
    return list
  }, [rawItems, namespace, reason, type])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = (a.metadata as Record<string, unknown>)?.creationTimestamp as string ?? ""
      const tb = (b.metadata as Record<string, unknown>)?.creationTimestamp as string ?? ""
      return tb.localeCompare(ta)
    })
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()

  const handleNamespaceChange = useCallback((v: string) => {
    setNamespace(v)
    setPage(1)
    setRefreshKey((k) => k + 1)
  }, [])

  const handleReasonChange = useCallback((v: string) => {
    setReason(v)
    setPage(1)
    setRefreshKey((k) => k + 1)
  }, [])

  const handleTypeChange = useCallback((v: string) => {
    setType(v)
    setPage(1)
    setRefreshKey((k) => k + 1)
  }, [])

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => (
        <StatusBadge status={String(v ?? "Unknown")} />
      ),
    },
    { key: "reason", label: "Reason" },
    { key: "message", label: "Message" },
    { key: "source.component", label: "Source" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Events</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / events` : "No active cluster"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Namespace:</span>
          <Select value={namespace} onValueChange={handleNamespaceChange}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All namespaces</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Reason:</span>
          <Select value={reason} onValueChange={handleReasonChange}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All reasons</SelectItem>
              {allReasons.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {allTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={paged}
        isLoading={isLoading}
        error={error}
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  )
}
