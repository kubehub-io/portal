"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState } from "react"

export default function SecretsPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const [namespace, setNamespace] = useState("__all")
  const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
  const { data, isLoading, error } = useK8sClusterResources({ version: "v1", resource: "secrets" }, "secrets")
  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    {
      key: "type",
      label: "Type",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Opaque")} />,
    },
    {
      key: "data",
      label: "Keys",
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
        <h2 className="text-2xl font-bold tracking-tight">Secrets</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / secrets` : "No active cluster"}
        </p>
      </div>
      <DataTable columns={columns} data={items} isLoading={isLoading} error={error} namespace={namespace} onNamespaceChange={setNamespace} namespaces={namespaces} />
    </div>
  )
}
