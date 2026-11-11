"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useAPIDiscovery, resolveResourceInfo } from "@/hooks/use-api-discovery"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"

export default function NamespacesPage() {
  const { data: discovery } = useAPIDiscovery()
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const resolved = resolveResourceInfo("namespaces", discovery)

  const { data, isLoading, error } = useK8sClusterResources(
    resolved ?? { version: "v1", resource: "namespaces" },
    "namespaces",
  )

  const columns = [
    { key: "metadata.name", label: "Name" },
    {
      key: "status.phase",
      label: "Status",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Unknown")} />,
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  const items = (data?.items ?? []) as unknown as Record<string, unknown>[]

  return (
    <div className="space-y-6">
      <ResourcePageHeader title="Namespaces" subtitle={activeCluster ? `${activeCluster.metadata.name} / namespaces` : "No active cluster"} />
      <DataTable columns={columns} data={items} isLoading={isLoading} error={error} />
    </div>
  )
}
