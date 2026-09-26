export interface MockK8sObject {
  apiVersion?: string
  kind?: string
  metadata?: {
    name?: string
    etag?: string
    namespace?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface MockCluster extends MockK8sObject {
  spec?: {
    region?: string
    network?: {
      podCIDR?: string
      serviceCIDR?: string
      kubeDNSServiceIP?: string
      managedIngress?: boolean
    }
    managedIngressProfile?: { enabled?: boolean; email?: string }
    storageProfile?: { backend?: string }
    monitoringProfile?: { enabled?: boolean }
    [key: string]: unknown
  }
  status?: {
    publicDns?: string
    localDnsDomain?: string
    state?: string
    controlPlaneComponents?: Record<string, { id?: string; version?: string }>
    addonComponents?: Record<string, { id?: string; version?: string; dependencies?: string[] }>
    lastOperation?: { operationName?: string; startedOn?: string; finishedAt?: string; stepName?: string }
    [key: string]: unknown
  }
}

export const MOCK_METADATA_REGIONS = ["us-east", "us-west", "eu-central", "ap-southeast"]

export const MOCK_K8S_API_URL = "https://localhost:8443"

export const MOCK_CLUSTERS: MockCluster[] = [
  {
    apiVersion: "v202607",
    kind: "Cluster",
    metadata: { name: "demo-cluster", etag: "mock-etag-1" },
    spec: {
      region: "us-east",
      network: {
        podCIDR: "10.42.0.0/16",
        serviceCIDR: "10.96.0.0/12",
        kubeDNSServiceIP: "10.96.0.10",
        managedIngress: true,
      },
      managedIngressProfile: { enabled: true, email: "admin@kubehub.local" },
      storageProfile: { backend: "longhorn" },
      monitoringProfile: { enabled: true },
    },
    status: {
      publicDns: "localhost",
      localDnsDomain: "demo-cluster.local.kubehub.dev",
      state: "Ready",
      controlPlaneComponents: {
        konnectivity: { id: "konnectivity", version: "v0.34.0" },
        kubeApiserver: { id: "kubeApiserver", version: "v1.35.4" },
      },
      addonComponents: {
        "cert-manager": { id: "cert-manager", version: "1.20.2" },
        cilium: { id: "cilium", version: "1.19.6" },
        coredns: { id: "coredns", version: "1.13.1" },
        grafana: { id: "grafana", version: "13.0.1" },
        longhorn: { id: "longhorn", version: "1.12.0" },
        "managed-appingress": { id: "managed-appingress", dependencies: ["cilium", "cert-manager"] },
        "metrics-server": { id: "metrics-server", version: "3.13.1" },
      },
      lastOperation: {
        operationName: "Provisioning",
        startedOn: "2026-08-01T00:00:00.000Z",
        finishedAt: "2026-08-01T00:01:00.000Z",
      },
    },
  },
  {
    apiVersion: "v202607",
    kind: "Cluster",
    metadata: { name: "staging-cluster", etag: "mock-etag-2" },
    spec: {
      region: "eu-central",
      network: {
        podCIDR: "10.48.0.0/16",
        serviceCIDR: "10.112.0.0/12",
        kubeDNSServiceIP: "10.112.0.10",
        managedIngress: false,
      },
      managedIngressProfile: { enabled: false },
      storageProfile: { backend: "longhorn" },
      monitoringProfile: { enabled: true },
    },
    status: {
      publicDns: "localhost",
      localDnsDomain: "staging-cluster.local.kubehub.dev",
      state: "Running",
      controlPlaneComponents: {
        konnectivity: { id: "konnectivity", version: "v0.34.0" },
        kubeApiserver: { id: "kubeApiserver", version: "v1.35.4" },
      },
      addonComponents: {
        "cert-manager": { id: "cert-manager", version: "1.20.2" },
        cilium: { id: "cilium", version: "1.19.6" },
        coredns: { id: "coredns", version: "1.13.1" },
        "managed-appingress": { id: "managed-appingress", dependencies: ["cilium", "cert-manager"] },
        "metrics-server": { id: "metrics-server", version: "3.13.1" },
      },
      lastOperation: {
        operationName: "reconcile",
        startedOn: "2026-09-03T19:56:24.049519172Z",
        finishedAt: "2026-09-03T19:56:40.900417516Z",
      },
    },
  },
]

export const MOCK_NODES = [
  {
    apiVersion: "v1",
    kind: "Node",
    metadata: { name: "node-01", etag: "mock-node-etag-1" },
    spec: {
      os: "Ubuntu",
      arch: "amd64",
      meta: { ipv4: "10.0.0.11", ciliumIp: "10.42.0.11", labels: { role: "worker" } },
      hardware: { cpus: [{ model: "Intel Xeon", cores: 8 }], memory: { total_in_mb: 32768 } },
    },
    status: {
      ready: true,
      lastOperation: { operationName: "NodeReady", state: "COMPLETED" },
    },
  },
  {
    apiVersion: "v1",
    kind: "Node",
    metadata: { name: "node-02", etag: "mock-node-etag-2" },
    spec: {
      os: "Ubuntu",
      arch: "amd64",
      meta: { ipv4: "10.0.0.12", ciliumIp: "10.42.0.12", labels: { role: "worker" } },
      hardware: { cpus: [{ model: "Intel Xeon", cores: 8 }], memory: { total_in_mb: 65536 } },
    },
    status: {
      ready: true,
      lastOperation: { operationName: "NodeReady", state: "COMPLETED" },
    },
  },
]

export const MOCK_APP_INGRESSES = [
  {
    apiVersion: "v202607",
    kind: "AppIngress",
    metadata: { name: "dashboard", etag: "mock-app-ingress-1" },
    spec: {
      serviceBackend: { serviceName: "dashboard", namespace: "default", port: 3000 },
      exposeToPublic: true,
      exposeToLocal: true,
      protocol: "HTTPS",
    },
    status: {
      publicDns: "dashboard.kubehub.local",
      localDNS: "dashboard.default.svc.cluster.local",
      state: "Ready",
      programStatus: {
        publicDNS: { programed: true, message: "DNS entry is live" },
        localDNS: { certProvisioned: true, programed: true, message: "TLS provisioned" },
      },
    },
  },
  {
    apiVersion: "v202607",
    kind: "AppIngress",
    metadata: { name: "api", etag: "mock-app-ingress-2" },
    spec: {
      serviceBackend: { serviceName: "api", namespace: "default", port: 8080 },
      exposeToPublic: false,
      exposeToLocal: true,
      protocol: "HTTP",
    },
    status: {
      localDNS: "api.default.svc.cluster.local",
      state: "Ready",
      programStatus: {
        publicDNS: { programed: false, message: "Not exposed publicly" },
        localDNS: { certProvisioned: false, programed: true, message: "Internal routing active" },
      },
    },
  },
]

export const MOCK_RESOURCE_MAP: Record<string, MockK8sObject[]> = {
  namespaces: [
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "default", creationTimestamp: "2024-01-01T00:00:00Z" }, status: { phase: "Active" } },
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "kube-system", creationTimestamp: "2024-01-01T00:00:00Z" }, status: { phase: "Active" } },
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "monitoring", creationTimestamp: "2024-01-02T00:00:00Z" }, status: { phase: "Active" } },
  ],
  nodes: [
    { apiVersion: "v1", kind: "Node", metadata: { name: "node-01", creationTimestamp: "2024-01-03T00:00:00Z" }, spec: { podCIDR: "10.42.0.0/24", podCIDRs: ["10.42.0.0/24"] }, status: { nodeInfo: { osImage: "Ubuntu 22.04.4 LTS", architecture: "amd64", kubeletVersion: "v1.32.0", containerRuntimeVersion: "containerd://1.7.27", kernelVersion: "5.15.0-105-generic" }, capacity: { cpu: "8", memory: "32768Mi", "ephemeral-storage": "104845108Ki" }, addresses: [{ type: "InternalIP", address: "192.168.1.11" }, { type: "CiliumInternalIP", address: "10.42.0.11" }, { type: "Hostname", address: "node-01" }], conditions: [{ type: "Ready", status: "True", lastHeartbeatTime: "2024-01-17T12:00:00Z", lastTransitionTime: "2024-01-03T00:00:00Z", reason: "KubeletReady", message: "kubelet is posting ready status" }] } },
    { apiVersion: "v1", kind: "Node", metadata: { name: "node-02", creationTimestamp: "2024-01-04T00:00:00Z" }, spec: { podCIDR: "10.42.1.0/24", podCIDRs: ["10.42.1.0/24"] }, status: { nodeInfo: { osImage: "Ubuntu 22.04.4 LTS", architecture: "amd64", kubeletVersion: "v1.32.0", containerRuntimeVersion: "containerd://1.7.27", kernelVersion: "5.15.0-105-generic" }, capacity: { cpu: "8", memory: "65536Mi", "ephemeral-storage": "209690216Ki" }, addresses: [{ type: "InternalIP", address: "192.168.1.12" }, { type: "CiliumInternalIP", address: "10.42.0.12" }, { type: "Hostname", address: "node-02" }], conditions: [{ type: "Ready", status: "True", lastHeartbeatTime: "2024-01-17T12:00:00Z", lastTransitionTime: "2024-01-04T00:00:00Z", reason: "KubeletReady", message: "kubelet is posting ready status" }] } },
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

export const MOCK_TOKEN_PAYLOAD = {
  sub: "local-user",
  name: "Local Demo User",
  email: "demo@kubehub.local",
  preferred_username: "local-user",
}

/** Mirrors the Alertmanager v2 payload that GET /alerts forwards. */
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
const ahead = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

export const MOCK_ALERTS = [
  {
    labels: {
      alertname: "NodeDown",
      severity: "critical",
      cluster: "alerted",
      node: "ubuntu-alerted",
    },
    annotations: {
      summary: "Node ubuntu-alerted is down",
      description: "Kubelet metrics scrape is down on node ubuntu-alerted",
    },
    status: { state: "active", silencedBy: [], inhibitedBy: [], mutedBy: [] },
    startsAt: ago(6 * 3600),
    endsAt: ahead(3600),
    updatedAt: ago(300),
    generatorURL: "/graph?g0.expr=up%20%7B%20job%3D%22node%22%20%7D%20%3D%3D%200",
    fingerprint: "88ff9373df885b48",
    receivers: [{ name: "tgbot-kubehub" }],
    region: "us-east",
  },
  {
    labels: {
      alertname: "KubePodCrashLooping",
      severity: "warning",
      cluster: "alerted",
      namespace: "payments",
      pod: "checkout-5f7d-9c1b",
    },
    annotations: {
      summary: "Pod checkout-5f7d-9c1b is restarting repeatedly",
      description: "Back-off restarting failed container checkout",
    },
    status: { state: "active", silencedBy: [], inhibitedBy: [], mutedBy: [] },
    startsAt: ago(45 * 60),
    endsAt: ahead(3600),
    updatedAt: ago(120),
    fingerprint: "3b1c9f0a44d21e77",
    receivers: [{ name: "tgbot-kubehub" }],
    region: "us-east",
  },
  {
    labels: {
      alertname: "NodeMemoryPressure",
      severity: "warning",
      cluster: "alerted",
      node: "worker-2",
    },
    annotations: {
      summary: "Node worker-2 is under memory pressure",
      description: "Node allocatable memory is below the 15% threshold",
    },
    status: { state: "active", silencedBy: [], inhibitedBy: [], mutedBy: [] },
    startsAt: ago(12 * 60),
    endsAt: ahead(3600),
    updatedAt: ago(60),
    fingerprint: "c7d41e9b2a0f6b13",
    receivers: [{ name: "tgbot-kubehub" }],
    region: "eu-central",
  },
  {
    labels: {
      alertname: "EtcdLeaderChange",
      severity: "info",
      cluster: "alerted",
    },
    annotations: { summary: "Etcd leadership changed" },
    status: { state: "active", silencedBy: [], inhibitedBy: [], mutedBy: [] },
    startsAt: ago(90),
    endsAt: ahead(3600),
    updatedAt: ago(90),
    fingerprint: "5e2f7a0c9b3d1846",
    receivers: [{ name: "tgbot-kubehub" }],
    region: "eu-central",
  },
  {
    labels: { alertname: "Watchdog", severity: "none", cluster: "alerted" },
    annotations: {},
    status: { state: "suppressed", silencedBy: ["weekend"], inhibitedBy: [], mutedBy: [] },
    startsAt: ago(24 * 3600),
    endsAt: ahead(3600),
    updatedAt: ago(600),
    fingerprint: "9a10bc7d3e5f4821",
    receivers: [{ name: "tgbot-kubehub" }],
    region: "us-west",
  },
]

export const MOCK_RULE_NAMESPACES: Record<string, unknown> = {
  platform: {
    name: "platform",
    groups: [
      {
        name: "cluster-availability",
        interval: "30s",
        rules: [
          {
            alert: "TargetDown",
            expr: 'up{job=~".+"} == 0',
            for: "5m",
            labels: { severity: "critical" },
            annotations: { summary: "Target {{ $labels.instance }} is down" },
          },
          {
            alert: "NodeNotReady",
            expr: 'kube_node_status_condition{condition="Ready",status="true"} == 0',
            for: "10m",
            labels: { severity: "warning" },
            annotations: { summary: "Node {{ $labels.instance }} has been unready for 10m" },
          },
        ],
      },
      {
        name: "workload-health",
        interval: "1m",
        rules: [
          {
            alert: "KubePodCrashLooping",
            expr: 'rate(kube_pod_container_status_restarts_total[10m]) * 600 > 3',
            for: "5m",
            labels: { severity: "warning" },
            annotations: { summary: "Pod {{ $labels.pod }} is restarting repeatedly" },
          },
          {
            expr: 'sum by (namespace) (kube_pod_status_phase{phase="Pending"})',
            labels: { kind: "recording" },
          },
        ],
      },
    ],
  },
  payments: {
    name: "payments",
    groups: [
      {
        name: "latency",
        interval: "30s",
        rules: [
          {
            alert: "CheckoutLatencyHigh",
            expr: 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 1.5',
            for: "10m",
            labels: { severity: "critical", team: "payments" },
            annotations: { summary: "Checkout p99 latency above 1.5s" },
          },
        ],
      },
    ],
  },
}

export const MOCK_ALERTMANAGER_CONFIG = {
  route: {
    receiver: "teams-oncall",
    group_by: ["alertname", "cluster"],
    group_wait: "30s",
    group_interval: "5m",
    repeat_interval: "4h",
    routes: [{ receiver: "telegram-digest", matchers: ['severity="info"'], continue: true }],
  },
  receivers: [
    {
      name: "teams-oncall",
      msteams_configs: [
        {
          webhook_url: "https://outlook.office.com/webhook/mock-teams-oncall",
          send_resolved: true,
        },
      ],
    },
    {
      name: "telegram-digest",
      telegram_configs: [
        {
          bot_token: "123456789:AAmocktokenmocktokenmocktoken",
          chat_id: -1001234567890,
          disable_notifications: false,
          send_resolved: true,
        },
      ],
    },
  ],
}