"use client"

import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState } from "react"

function makeWorkloadPage(label: string, resource: string, group: string, columns: { key: string; label: string }[]) {
  return function WorkloadPage() {
    const activeCluster = useClusterStore((s) => s.activeCluster)
    const [namespace, setNamespace] = useState("__all")
    const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
    const { data, isLoading, error } = useK8sClusterResources({ group, version: "v1", resource }, resource)
    const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
    let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
    if (namespace && namespace !== "__all") {
      items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
    }
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{label}</h2>
          <p className="text-muted-foreground">
            {activeCluster ? `${activeCluster.metadata.name} / ${resource}` : "No active cluster"}
          </p>
        </div>
        <DataTable columns={columns} data={items} isLoading={isLoading} error={error} namespace={namespace} onNamespaceChange={setNamespace} namespaces={namespaces} />
      </div>
    )
  }
}

export default makeWorkloadPage("CronJobs", "cronjobs", "batch", [
  { key: "metadata.name", label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.schedule", label: "Schedule" },
  { key: "spec.suspend", label: "Suspended" },
  { key: "status.lastScheduleTime", label: "Last Schedule" },
  { key: "metadata.creationTimestamp", label: "Age" },
])
