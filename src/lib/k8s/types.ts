export type K8sResourceKind =
  | "Node" | "Namespace" | "Event"
  | "Pod" | "Deployment" | "DaemonSet" | "StatefulSet" | "ReplicaSet" | "Job"
  | "Service" | "EndpointSlice"
  | "PersistentVolume" | "PersistentVolumeClaim"
  | "ConfigMap" | "Secret"

export interface ResourceColumn {
  key: string
  label: string
  width?: string
  sortable?: boolean
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode
}

export const RESOURCE_COLUMNS: Record<K8sResourceKind, ResourceColumn[]> = {
  Node: [
    { key: "metadata.name", label: "Name" },
    { key: "status.nodeInfo.osImage", label: "OS" },
    { key: "status.nodeInfo.architecture", label: "Arch" },
    { key: "status.capacity.cpu", label: "CPU" },
    { key: "status.capacity.memory", label: "Memory" },
    { key: "status.nodeInfo.kubeletVersion", label: "Kubelet" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Namespace: [
    { key: "metadata.name", label: "Name" },
    { key: "status.phase", label: "Status" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Event: [
    { key: "metadata.name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "reason", label: "Reason" },
    { key: "message", label: "Message" },
    { key: "source.component", label: "Source" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Pod: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "status.phase", label: "Status" },
    { key: "spec.nodeName", label: "Node" },
    { key: "status.podIP", label: "Pod IP" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Deployment: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  DaemonSet: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "status.desiredNumberScheduled", label: "Desired" },
    { key: "status.currentNumberScheduled", label: "Current" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  StatefulSet: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  ReplicaSet: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Job: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.completions", label: "Completions" },
    { key: "spec.parallelism", label: "Parallelism" },
    { key: "status.succeeded", label: "Succeeded" },
    { key: "status.failed", label: "Failed" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Service: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.type", label: "Type" },
    { key: "spec.clusterIP", label: "Cluster IP" },
    { key: "spec.ports", label: "Ports" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  EndpointSlice: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "addressType", label: "Address Type" },
    { key: "endpoints", label: "Endpoints" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  PersistentVolume: [
    { key: "metadata.name", label: "Name" },
    { key: "spec.capacity.storage", label: "Capacity" },
    { key: "spec.accessModes", label: "Access Modes" },
    { key: "spec.storageClassName", label: "Storage Class" },
    { key: "status.phase", label: "Status" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  PersistentVolumeClaim: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.storageClassName", label: "Storage Class" },
    { key: "status.phase", label: "Status" },
    { key: "spec.resources.requests.storage", label: "Capacity" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  ConfigMap: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "data", label: "Data Keys" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  Secret: [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "type", label: "Type" },
    { key: "data", label: "Keys" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
}
