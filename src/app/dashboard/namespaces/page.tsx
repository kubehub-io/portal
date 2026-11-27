"use client"

import { StatusBadge } from "@/components/resources/data-table"
import { ResourceList } from "@/components/resources/resource-list"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useAPIDiscovery, resolveResourceInfo } from "@/hooks/use-api-discovery"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"
import { ResourceYamlEditDialog, InspectResourceButton } from "@/components/yaml/resource-yaml-edit-dialog"
import { useState } from "react"

export default function NamespacesPage() {
  const { data: discovery } = useAPIDiscovery()
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const resolved = resolveResourceInfo("namespaces", discovery)
  const desc = resolved ?? { version: "v1", resource: "namespaces" }

  const { data, isLoading, error } = useK8sClusterResources(
    desc,
    "namespaces",
  )

  const [inspectTarget, setInspectTarget] = useState<string | null>(null)

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
      <ResourceList
        columns={columns}
        data={items}
        isLoading={isLoading}
        error={error}
        scopeKey="namespaces"
        filterPlaceholder="Filter Namespaces..."
        actions={(item) => {
          const meta = item.metadata as Record<string, string>
          return (
            <InspectResourceButton onClick={() => setInspectTarget(meta.name)} />
          )
        }}
      />

      <ResourceYamlEditDialog
        open={!!inspectTarget}
        onOpenChange={(o) => { if (!o) setInspectTarget(null) }}
        cluster={activeCluster}
        desc={desc}
        name={inspectTarget ?? ""}
        queryKey="namespaces"
        title="Inspect Namespace YAML"
        readOnly
      />
    </div>
  )
}
