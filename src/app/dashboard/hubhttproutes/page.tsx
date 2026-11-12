"use client"

import { useState } from "react"
import { DataTable } from "@/components/resources/data-table"
import { HttpRouteRules } from "@/components/resources/http-route-details"
import { HostnameList } from "@/components/resources/hostname-list"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourceYamlEditDialog, EditResourceButton } from "@/components/yaml/resource-yaml-edit-dialog"
import { DeleteResourceButton } from "@/components/resources/delete-resource-button"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"
import { type ResourceDescriptor } from "@/lib/api/k8s-client"

interface HubHttpRouteBackendRef {
  name?: string
  namespace?: string
  port?: number
  group?: string
  kind?: string
}

interface HubHttpRouteRule {
  backendRefs?: HubHttpRouteBackendRef[]
  matches?: unknown[]
  filters?: unknown[]
}

interface HubHttpRouteStatusCondition {
  type?: string
  status?: string
  reason?: string
  message?: string
}

interface HubHttpRoute {
  metadata: { name: string; namespace?: string; uid?: string; creationTimestamp?: string }
  spec: {
    hostnames?: string[]
    rules?: HubHttpRouteRule[]
  }
  status?: {
    hostname?: string
    conditions?: HubHttpRouteStatusCondition[]
    observedGeneration?: number
  }
}

const HUBHTTPROUTE_DESC: ResourceDescriptor = {
  group: "gateway.kubehub.io",
  version: "v1alpha1",
  resource: "hubhttproutes",
}

export default function HubHttpRoutesPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const namespace = useClusterStore((s) => s.activeNamespace)
  const setNamespace = useClusterStore((s) => s.setActiveNamespace)

  const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
  const { data, isLoading, error } = useK8sClusterResources<HubHttpRoute>(
    HUBHTTPROUTE_DESC,
    "hubhttproutes",
  )

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
      key: "status.hostname",
      label: "Hostname",
      render: (_v: unknown, item: Record<string, unknown>) => {
        const r = item as unknown as HubHttpRoute
        return <HostnameList names={r.status?.hostname ?? r.spec?.hostnames} />
      },
    },
    {
      key: "spec.rules",
      label: "Backend",
      render: (_v: unknown, item: Record<string, unknown>) => <HttpRouteRules route={item} />,
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <ResourcePageHeader
        title="HubHttpRoutes"
        subtitle={activeCluster ? `${activeCluster.metadata.name} / hubhttproutes` : "No active cluster"}
        docsHref="https://docs.kubehub.io/use_hubhttproute/"
      />
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
              <EditResourceButton
                onClick={() => setEditTarget({ name: meta.name, namespace: meta.namespace })}
              />
              <DeleteResourceButton
                cluster={activeCluster}
                desc={HUBHTTPROUTE_DESC}
                name={meta.name}
                namespace={meta.namespace}
                kind="HubHttpRoute"
                queryKey="hubhttproutes"
              />
            </div>
          )
        }}
      />

      <ResourceYamlEditDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        cluster={activeCluster}
        desc={HUBHTTPROUTE_DESC}
        name={editTarget?.name ?? ""}
        namespace={editTarget?.namespace}
        queryKey="hubhttproutes"
        title="Edit HubHttpRoute"
      />
    </div>
  )
}
