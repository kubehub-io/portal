export const MOCK_METADATA_REGIONS = ["us-east", "us-west", "eu-central", "ap-southeast"]

export const MOCK_CLUSTERS = [
  {
    apiVersion: "v202607",
    kind: "Cluster",
    metadata: { name: "demo-cluster", etag: "mock-etag-1" },
    spec: {
      region: "us-east",
      network: {
        podCIDR: "10.42.0.0/16",
        serviceCIDR: "10.96.0.0/12",
      },
      managedIngressProfile: { enabled: true, email: "admin@kubehub.local" },
      storageProfile: { backend: "ceph-rbd" },
    },
    status: {
      publicDns: "demo-cluster.kubehub.local",
      state: "Ready",
      controlPlaneComponents: {
        kubernetes: { id: "v1.32.0", version: "v1.32.0" },
        calico: { id: "v3.28.1", version: "v3.28.1" },
      },
      lastOperation: {
        operationName: "Provisioning",
        stepName: "Completed",
        startedOn: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        state: "COMPLETED",
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
      },
      managedIngressProfile: { enabled: false },
      storageProfile: { backend: "longhorn" },
    },
    status: {
      publicDns: "staging-cluster.kubehub.local",
      state: "Running",
      controlPlaneComponents: {
        kubernetes: { id: "v1.31.7", version: "v1.31.7" },
      },
      lastOperation: {
        operationName: "Upgrade",
        stepName: "Node validation",
        startedOn: new Date(Date.now() - 60_000).toISOString(),
        finishedAt: new Date(Date.now() - 30_000).toISOString(),
        state: "COMPLETED",
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
] as const
