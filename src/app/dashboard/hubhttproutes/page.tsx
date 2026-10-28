"use client"

import { useState } from "react"
import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourceYamlEditDialog, EditResourceButton } from "@/components/yaml/resource-yaml-edit-dialog"
import { DeleteResourceButton } from "@/components/resources/delete-resource-button"
import { type ResourceDescriptor } from "@/lib/api/k8s-client"
import { CheckCircle, XCircle, BookOpen } from "lucide-react"

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
        const hostname = r.status?.hostname ?? r.spec?.hostnames?.[0] ?? "-"
        const ready = (r.status?.conditions ?? []).some(
          (c) => c.type === "DNSReady" && c.status === "True",
        )
        return (
          <span className="flex items-center gap-1.5 text-xs">
            {ready ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-600" />
            )}
            {ready && hostname !== "-" ? (
              <a
                href={`https://${hostname}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {hostname}
              </a>
            ) : (
              hostname
            )}
          </span>
        )
      },
    },
    {
      key: "spec.rules",
      label: "Backend",
      render: (_v: unknown, item: Record<string, unknown>) => {
        const r = item as unknown as HubHttpRoute
        const lines: string[] = []
        for (const rule of r.spec?.rules ?? []) {
          const matches = rule.matches && rule.matches.length > 0 ? rule.matches : [{}]
          const backends = rule.backendRefs && rule.backendRefs.length > 0 ? rule.backendRefs : []
          for (const match of matches) {
            const m = match as { path?: { value?: string } }
            const path = m?.path?.value ?? "/"
            if (backends.length === 0) {
              lines.push(`${path} => -`)
            } else {
              for (const ref of backends) {
                lines.push(`${path} => ${ref.name ?? "-"}${ref.port ? `:${ref.port}` : ""}`)
              }
            }
          }
        }
        if (lines.length === 0) return <span className="text-xs text-muted-foreground">-</span>
        return (
          <div className="space-y-0.5">
            {lines.map((line, i) => (
              <div key={i} className="text-xs font-mono">{line}</div>
            ))}
          </div>
        )
      },
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">HubHttpRoutes</h2>
          <p className="text-muted-foreground">
            {activeCluster ? `${activeCluster.metadata.name} / hubhttproutes` : "No active cluster"}
          </p>
        </div>
        <a
          href="https://docs.kubehub.io/use_hubhttproute/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
        >
          <BookOpen className="h-4 w-4" />
          Docs
        </a>
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
