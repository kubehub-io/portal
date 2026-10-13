"use client"

import { useState } from "react"
import { DataTable, type ColumnDef } from "@/components/resources/data-table"
import { DeleteResourceButton } from "@/components/resources/delete-resource-button"
import { ResourceYamlEditDialog, EditResourceButton } from "@/components/yaml/resource-yaml-edit-dialog"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { type ResourceDescriptor } from "@/lib/api/k8s-client"

export interface WorkloadPageOptions {
  desc: ResourceDescriptor
  /** Offer the YAML editor alongside delete. Off for controller-owned kinds. */
  editable?: boolean
}

export function makeWorkloadPage(
  label: string,
  resource: string,
  columns: ColumnDef[],
  options: WorkloadPageOptions,
) {
  const kind = label.replace(/s$/, "")

  return function WorkloadPage() {
    const activeCluster = useClusterStore((s) => s.activeCluster)
    const namespace = useClusterStore((s) => s.activeNamespace)
    const setNamespace = useClusterStore((s) => s.setActiveNamespace)
    const { data: nsData } = useK8sClusterResources(
      { version: "v1", resource: "namespaces" },
      "namespaces",
    )

    const { data, isLoading, error } = useK8sClusterResources(options.desc, resource)

    const [editTarget, setEditTarget] = useState<{ name: string; namespace?: string } | null>(null)

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
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          error={error}
          namespace={namespace}
          onNamespaceChange={setNamespace}
          namespaces={namespaces}
          actions={(item) => {
            const meta = item.metadata as Record<string, string>
            return (
              <div className="flex items-center gap-1">
                {options.editable && (
                  <EditResourceButton
                    onClick={() =>
                      setEditTarget({ name: meta.name, namespace: meta.namespace })
                    }
                  />
                )}
                <DeleteResourceButton
                  cluster={activeCluster}
                  desc={options.desc}
                  name={meta.name}
                  namespace={meta.namespace}
                  kind={kind}
                  queryKey={resource}
                />
              </div>
            )
          }}
        />

        {options.editable && (
          <ResourceYamlEditDialog
            open={!!editTarget}
            onOpenChange={(o) => { if (!o) setEditTarget(null) }}
            cluster={activeCluster}
            desc={options.desc}
            name={editTarget?.name ?? ""}
            namespace={editTarget?.namespace}
            queryKey={resource}
            title={`Edit ${kind}`}
          />
        )}
      </div>
    )
  }
}
