export const MOCK_RESOURCE_MAP = {
  namespaces: [
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "default", creationTimestamp: "2024-01-01T00:00:00Z" }, status: { phase: "Active" } },
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "kube-system", creationTimestamp: "2024-01-01T00:00:00Z" }, status: { phase: "Active" } },
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "monitoring", creationTimestamp: "2024-01-02T00:00:00Z" }, status: { phase: "Active" } },
  ],
  nodes: [
    { apiVersion: "v1", kind: "Node", metadata: { name: "node-01", creationTimestamp: "2024-01-03T00:00:00Z" }, status: { nodeInfo: { osImage: "Ubuntu 22.04", architecture: "amd64", kubeletVersion: "v1.32.0" }, capacity: { cpu: "8", memory: "32768Mi" } } },
    { apiVersion: "v1", kind: "Node", metadata: { name: "node-02", creationTimestamp: "2024-01-04T00:00:00Z" }, status: { nodeInfo: { osImage: "Ubuntu 22.04", architecture: "amd64", kubeletVersion: "v1.32.0" }, capacity: { cpu: "8", memory: "65536Mi" } } },
  ],
  pods: [
    { apiVersion: "v1", kind: "Pod", metadata: { name: "dashboard-7d987dd46d-9n4kp", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, status: { phase: "Running", podIP: "10.42.0.10" }, spec: { nodeName: "node-01" } },
    { apiVersion: "v1", kind: "Pod", metadata: { name: "nginx-5b7d498d89-pxv7w", namespace: "default", creationTimestamp: "2024-01-06T00:00:00Z" }, status: { phase: "Running", podIP: "10.42.0.11" }, spec: { nodeName: "node-02" } },
    { apiVersion: "v1", kind: "Pod", metadata: { name: "metrics-server-5bb4f78667-j5dr7", namespace: "kube-system", creationTimestamp: "2024-01-07T00:00:00Z" }, status: { phase: "Running", podIP: "10.42.0.12" }, spec: { nodeName: "node-01" } },
  ],
  deployments: [
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "dashboard", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, spec: { replicas: 2 }, status: { readyReplicas: 2 } },
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "nginx", namespace: "default", creationTimestamp: "2024-01-06T00:00:00Z" }, spec: { replicas: 1 }, status: { readyReplicas: 1 } },
  ],
  daemonsets: [
    { apiVersion: "apps/v1", kind: "DaemonSet", metadata: { name: "node-exporter", namespace: "monitoring", creationTimestamp: "2024-01-05T00:00:00Z" }, status: { desiredNumberScheduled: 2, currentNumberScheduled: 2 } },
  ],
  statefulsets: [
    { apiVersion: "apps/v1", kind: "StatefulSet", metadata: { name: "redis", namespace: "default", creationTimestamp: "2024-01-03T00:00:00Z" }, spec: { replicas: 3 }, status: { readyReplicas: 3 } },
  ],
  replicasets: [
    { apiVersion: "apps/v1", kind: "ReplicaSet", metadata: { name: "dashboard-7d987dd46d", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, spec: { replicas: 2 }, status: { readyReplicas: 2 } },
  ],
  cronjobs: [
    { apiVersion: "batch/v1", kind: "CronJob", metadata: { name: "backup", namespace: "default", creationTimestamp: "2024-01-02T00:00:00Z" }, spec: { schedule: "0 2 * * *", suspend: false }, status: { lastScheduleTime: "2024-01-17T02:00:00Z" } },
  ],
  jobs: [
    { apiVersion: "batch/v1", kind: "Job", metadata: { name: "backup-1716109200", namespace: "default", creationTimestamp: "2024-01-17T02:00:00Z" }, spec: { completions: 1, parallelism: 1 }, status: { succeeded: 1, failed: 0 } },
  ],
  services: [
    { apiVersion: "v1", kind: "Service", metadata: { name: "dashboard", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, spec: { type: "ClusterIP", clusterIP: "10.96.10.10", ports: [{ port: 3000, targetPort: 3000 }] } },
    { apiVersion: "v1", kind: "Service", metadata: { name: "nginx", namespace: "default", creationTimestamp: "2024-01-06T00:00:00Z" }, spec: { type: "LoadBalancer", clusterIP: "10.96.10.11", ports: [{ port: 80, targetPort: 80 }] } },
  ],
  endpointslices: [
    { apiVersion: "discovery.k8s.io/v1", kind: "EndpointSlice", metadata: { name: "dashboard-abcde", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, addressType: "IPv4", endpoints: [{ addresses: ["10.42.0.10"], conditions: { ready: true } }] },
  ],
  persistentvolumes: [
    { apiVersion: "v1", kind: "PersistentVolume", metadata: { name: "pv-data-01", creationTimestamp: "2024-01-01T00:00:00Z" }, spec: { capacity: { storage: "50Gi" }, accessModes: ["ReadWriteOnce"], storageClassName: "local-path" }, status: { phase: "Bound" } },
  ],
  persistentvolumeclaims: [
    { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "data-dashboard", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, spec: { storageClassName: "local-path", resources: { requests: { storage: "10Gi" } }, accessModes: ["ReadWriteOnce"] }, status: { phase: "Bound" } },
  ],
  configmaps: [
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "portal-config", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, data: { APP_MODE: "demo", LOG_LEVEL: "info" } },
  ],
  secrets: [
    { apiVersion: "v1", kind: "Secret", metadata: { name: "portal-credentials", namespace: "default", creationTimestamp: "2024-01-05T00:00:00Z" }, type: "Opaque", data: { username: "cG9ydGFs", password: "ZGVtb0Q=" } },
  ],
  events: [
    { apiVersion: "v1", kind: "Event", metadata: { name: "dashboard-abcde", namespace: "default", creationTimestamp: "2024-01-17T02:00:00Z" }, reason: "Pulled", message: "Container image was successfully pulled", type: "Normal" },
  ],
}
