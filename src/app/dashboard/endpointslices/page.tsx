"use client"

import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState } from "react"

export default function EndpointSlicesPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const [namespace, setNamespace] = useState("__all")
  const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
  const { data, isLoading, error } = useK8sClusterResources(
    { group: "discovery.k8s.io", version: "v1", resource: "endpointslices" },
    "endpointslices",
  )
  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "addressType", label: "Address Type" },
    { key: "endpoints", label: "Endpoints" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">EndpointSlices</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / endpointslices` : "No active cluster"}
        </p>
      </div>
      <DataTable columns={columns} data={items} isLoading={isLoading} error={error} namespace={namespace} onNamespaceChange={setNamespace} namespaces={namespaces} />
    </div>
  )
}
