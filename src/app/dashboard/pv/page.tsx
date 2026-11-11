"use client"

import { DataTable, StatusBadge } from "@/components/resources/data-table"
import { DeleteResourceButton } from "@/components/resources/delete-resource-button"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"
import {
  getPvClaimRef,
  getPvMounts,
  getPvMountState,
} from "@/lib/persistent-volumes"

const PV_DESC = { version: "v1", resource: "persistentvolumes" }

function PvDeletionWarning() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">This may permanently delete data</p>
        <p>
          Deleting this PersistentVolume can destroy its underlying disk. The data may be
          lost and cannot be recovered. Confirm only if you are sure.
        </p>
      </div>
    </div>
  )
}

export default function PVPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const { data, isLoading, error } = useK8sClusterResources(PV_DESC, "persistentvolumes")
  const { data: podData } = useK8sClusterResources({ version: "v1", resource: "pods" }, "pods")
  const { data: pvcData } = useK8sClusterResources(
    { version: "v1", resource: "persistentvolumeclaims" },
    "persistentvolumeclaims",
  )

  const items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  const pods = (podData?.items ?? []) as unknown as Record<string, unknown>[]
  const claims = (pvcData?.items ?? []) as unknown as Record<string, unknown>[]

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "spec.capacity.storage", label: "Capacity" },
    { key: "spec.accessModes", label: "Access Modes" },
    { key: "spec.storageClassName", label: "Storage Class" },
    {
      key: "spec.claimRef",
      label: "Claim",
      render: (_v: unknown, item: Record<string, unknown>) => {
        const claim = getPvClaimRef(item)
        if (!claim?.name) return <span className="text-xs text-muted-foreground">-</span>
        return (
          <span className="text-xs font-mono">
            {claim.namespace ? `${claim.namespace}/${claim.name}` : claim.name}
          </span>
        )
      },
    },
    {
      key: "__mounted",
      label: "Mounted",
      width: "7rem",
      render: (_v: unknown, item: Record<string, unknown>) => {
        const state = getPvMountState(item, pods)
        if (state === "mounted") return <Badge variant="success">Mounted</Badge>
        if (state === "unbound") return <Badge variant="outline">Unbound</Badge>
        return <Badge variant="secondary">Not mounted</Badge>
      },
    },
    {
      key: "__mounts",
      label: "Node / Pod",
      width: "22rem",
      render: (_v: unknown, item: Record<string, unknown>) => {
        const mounts = getPvMounts(item, pods)
        if (mounts.length === 0) {
          return <span className="text-xs text-muted-foreground">-</span>
        }
        return (
          <div className="space-y-0.5">
            {mounts.map((mount) => (
              <div key={`${mount.namespace}/${mount.pod}`} className="text-xs">
                <span className="font-mono">{mount.node ?? "unscheduled"}</span>
                <span className="text-muted-foreground">
                  {" / "}
                  {mount.namespace}/{mount.pod}
                </span>
              </div>
            ))}
          </div>
        )
      },
    },
    {
      key: "spec.persistentVolumeReclaimPolicy",
      label: "Reclaim",
      render: (v: unknown) => <span className="text-xs">{String(v ?? "-")}</span>,
    },
    {
      key: "status.phase",
      label: "Status",
      render: (v: unknown) => <StatusBadge status={String(v ?? "Unknown")} />,
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <ResourcePageHeader
        title="PersistentVolumes"
        subtitle={
          activeCluster
            ? `${activeCluster.metadata.name} / persistentvolumes`
            : "No active cluster"
        }
      />
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        error={error}
        actions={(item) => {
          const name = String((item.metadata as Record<string, unknown>)?.name ?? "")
          const claim = getPvClaimRef(item)
          const claimStillExists = Boolean(
            claim?.name &&
              claim?.namespace &&
              claims.some((pvc) => {
                const metadata = pvc.metadata as Record<string, unknown> | undefined
                return metadata?.name === claim.name && metadata?.namespace === claim.namespace
              }),
          )
          return (
            <div className="flex items-center gap-2">
              <DeleteResourceButton
                cluster={activeCluster}
                desc={PV_DESC}
                name={name}
                kind="PersistentVolume"
                queryKey="persistentvolumes"
                warning={<PvDeletionWarning />}
                disabled={claimStillExists}
                disabledReason="Claimed by PVC"
              />
              {claimStillExists && (
                <span className="text-[10px] text-muted-foreground">Claimed by PVC</span>
              )}
            </div>
          )
        }}
      />
    </div>
  )
}
