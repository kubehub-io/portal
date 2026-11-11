"use client"

import { AlertTriangle, HardDrive } from "lucide-react"
import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { DeleteResourceButton } from "@/components/resources/delete-resource-button"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"
import {
  getPvcDeletionImpact,
  type PvcDeletionImpact,
} from "@/lib/persistent-volumes"
import { cn } from "@/lib/utils"

const PVC_DESC = { version: "v1", resource: "persistentvolumeclaims" }

function PvcDeletionWarning({ impact }: { impact: PvcDeletionImpact }) {
  if (impact.action === "unbound") {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="font-medium">No disk is attached to this claim</p>
          <p className="text-muted-foreground">Deleting it will not delete any disk.</p>
        </div>
      </div>
    )
  }

  const destructive = impact.action === "delete"
  const retaining = impact.action === "retain"

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        destructive &&
          "border-destructive/40 bg-destructive/5 text-destructive",
        retaining &&
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
        !destructive &&
          !retaining &&
          "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        {destructive && (
          <>
            <p className="font-medium">The underlying disk will be deleted</p>
            <p>
              Reclaim policy <strong>Delete</strong> on{" "}
              <strong>{impact.volumeName ?? "the PersistentVolume"}</strong>. This cannot be
              undone.
            </p>
          </>
        )}
        {retaining && (
          <>
            <p className="font-medium">The underlying disk is left behind</p>
            <p>
              Reclaim policy <strong>Retain</strong> on{" "}
              <strong>{impact.volumeName ?? "the PersistentVolume"}</strong>. The disk and
              PersistentVolume must be cleaned up manually.
            </p>
          </>
        )}
        {!destructive && !retaining && (
          <>
            <p className="font-medium">Could not determine the disk reclaim policy</p>
            <p>
              {impact.policy
                ? `Unexpected reclaim policy ${impact.policy} on ${impact.volumeName ?? "the PersistentVolume"}. The disk may be left behind or deleted.`
                : `${impact.volumeName ?? "The bound PersistentVolume"} was not found. Check the cluster before deleting.`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function PVCPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const namespace = useClusterStore((s) => s.activeNamespace)
  const setNamespace = useClusterStore((s) => s.setActiveNamespace)
  const { data: nsData } = useK8sClusterResources(
    { version: "v1", resource: "namespaces" },
    "namespaces",
  )
  const { data, isLoading, error } = useK8sClusterResources(PVC_DESC, "persistentvolumeclaims")
  const { data: pvData } = useK8sClusterResources(
    { version: "v1", resource: "persistentvolumes" },
    "persistentvolumes",
  )
  const namespaces = (nsData?.items ?? [])
    .map((ns: { metadata: { name: string } }) => ns.metadata.name)
    .sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }
  const volumes = (pvData?.items ?? []) as unknown as Record<string, unknown>[]

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.volumeName", label: "Volume" },
    { key: "spec.storageClassName", label: "Storage Class" },
    {
      key: "status.phase",
      label: "Status",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Unknown")} />,
    },
    { key: "spec.resources.requests.storage", label: "Requested" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <ResourcePageHeader
        title="PersistentVolumeClaims"
        subtitle={
          activeCluster
            ? `${activeCluster.metadata.name} / persistentvolumeclaims`
            : "No active cluster"
        }
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
          const impact = getPvcDeletionImpact(item, volumes)
          return (
            <DeleteResourceButton
              cluster={activeCluster}
              desc={PVC_DESC}
              name={meta.name}
              namespace={meta.namespace}
              kind="PersistentVolumeClaim"
              queryKey="persistentvolumeclaims"
              warning={<PvcDeletionWarning impact={impact} />}
            />
          )
        }}
      />
    </div>
  )
}
