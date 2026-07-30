"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"

export default function PVPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const { data, isLoading, error } = useK8sClusterResources({ version: "v1", resource: "persistentvolumes" }, "persistentvolumes")
  const items = (data?.items ?? []) as unknown as Record<string, unknown>[]

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "spec.capacity.storage", label: "Capacity" },
    { key: "spec.accessModes", label: "Access Modes" },
    { key: "spec.storageClassName", label: "Storage Class" },
    {
      key: "status.phase",
      label: "Status",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Unknown")} />,
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">PersistentVolumes</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / persistentvolumes` : "No active cluster"}
        </p>
      </div>
      <DataTable columns={columns} data={items} isLoading={isLoading} error={error} />
    </div>
  )
}
