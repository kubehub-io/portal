"use client"

import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useAPIDiscovery, resolveResourceInfo } from "@/hooks/use-api-discovery"
import { useClusterStore } from "@/stores/cluster-store"

const RESOURCE_COLUMNS: Record<string, { key: string; label: string; width?: string }[]> = {
  nodes: [
    { key: "metadata.name", label: "Name" },
    { key: "status.nodeInfo.osImage", label: "OS" },
    { key: "status.nodeInfo.architecture", label: "Arch" },
    { key: "status.capacity.cpu", label: "CPU" },
    { key: "status.capacity.memory", label: "Memory" },
    { key: "status.nodeInfo.kubeletVersion", label: "Kubelet" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  namespaces: [
    { key: "metadata.name", label: "Name" },
    { key: "status.phase", label: "Status" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  pods: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "status.phase", label: "Status" },
    { key: "spec.nodeName", label: "Node" },
    { key: "status.podIP", label: "Pod IP" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  deployments: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  daemonsets: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "status.desiredNumberScheduled", label: "Desired" },
    { key: "status.currentNumberScheduled", label: "Current" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  statefulsets: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  replicasets: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Desired" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  cronjobs: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.schedule", label: "Schedule" },
    { key: "spec.suspend", label: "Suspended" },
    { key: "status.lastScheduleTime", label: "Last Schedule" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  jobs: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.completions", label: "Completions" },
    { key: "spec.parallelism", label: "Parallelism" },
    { key: "status.succeeded", label: "Succeeded" },
    { key: "status.failed", label: "Failed" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  services: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.type", label: "Type" },
    { key: "spec.clusterIP", label: "Cluster IP" },
    { key: "spec.ports", label: "Ports" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  endpointslices: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "addressType", label: "Address Type" },
    { key: "endpoints", label: "Endpoints" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  persistentvolumes: [
    { key: "metadata.name", label: "Name" },
    { key: "spec.capacity.storage", label: "Capacity" },
    { key: "spec.accessModes", label: "Access Modes" },
    { key: "spec.storageClassName", label: "Storage Class" },
    { key: "status.phase", label: "Status" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  persistentvolumeclaims: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.storageClassName", label: "Storage Class" },
    { key: "status.phase", label: "Status" },
    { key: "spec.resources.requests.storage", label: "Requested" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  configmaps: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "data", label: "Data Keys" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  secrets: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "type", label: "Type" },
    { key: "data", label: "Keys" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
}

export function createResourcePage(
  resourceKey: string,
  label: string,
) {
  return function ResourcePage() {
    const { data: discovery } = useAPIDiscovery()
    const activeCluster = useClusterStore((s) => s.activeCluster)
    const resolved = resolveResourceInfo(resourceKey, discovery)

    const { data, isLoading, error } = useK8sClusterResources(
      resolved ?? { version: "v1", resource: resourceKey },
      resourceKey,
    )

    const columns = RESOURCE_COLUMNS[resourceKey] ?? []
    const items = (data?.items ?? []) as unknown as Record<string, unknown>[]

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{label}</h2>
          <p className="text-muted-foreground">
            {activeCluster ? `${activeCluster.metadata.name} / ${label.toLowerCase()}` : "No active cluster"}
          </p>
        </div>
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          error={error}
        />
      </div>
    )
  }
}
