"use client"

import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState } from "react"
import { ResourceYamlEditDialog, EditResourceButton } from "@/components/yaml/resource-yaml-edit-dialog"
import { type ResourceDescriptor } from "@/lib/api/k8s-client"

const CONFIGMAP_DESC: ResourceDescriptor = { version: "v1", resource: "configmaps" }

export default function ConfigMapsPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const clusterDns = activeCluster?.status.publicDns
  const [namespace, setNamespace] = useState("__all")
  const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
  const { data, isLoading, error } = useK8sClusterResources({ version: "v1", resource: "configmaps" }, "configmaps")
  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }

  const [editTarget, setEditTarget] = useState<{ name: string; namespace?: string } | null>(null)

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    {
      key: "data",
      label: "Data Keys",
      render: (v: unknown) => {
        const data = v as Record<string, string> | undefined
        return <span className="text-xs">{data ? Object.keys(data).join(", ") : "-"}</span>
      },
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ConfigMaps</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / configmaps` : "No active cluster"}
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
        actions={(item) => (
          <EditResourceButton
            onClick={() =>
              setEditTarget({
                name: (item.metadata as Record<string, string>).name,
                namespace: (item.metadata as Record<string, string>).namespace,
              })
            }
          />
        )}
      />

      <ResourceYamlEditDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        clusterDns={clusterDns ?? ""}
        desc={CONFIGMAP_DESC}
        name={editTarget?.name ?? ""}
        namespace={editTarget?.namespace}
        queryKey="configmaps"
        title="Edit ConfigMap"
      />
    </div>
  )
}
