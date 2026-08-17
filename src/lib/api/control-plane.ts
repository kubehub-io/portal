import { useAuthStore } from "@/stores/auth-store"
import { getConfig } from "@/lib/config"
import { getMockTokenResponse, isMockModeEnabled } from "@/lib/auth/pkce"
import type { Cluster } from "@/stores/cluster-store"

function loadControlPlaneMockData() {
  return require("./control-plane.mockdata.ts") as typeof import("./control-plane.mockdata.ts")
}

function getMockControlPlaneState() {
  const { MOCK_CLUSTERS, MOCK_NODES, MOCK_APP_INGRESSES } = loadControlPlaneMockData()
  return {
    clusters: [...MOCK_CLUSTERS] as Cluster[],
    nodes: [...MOCK_NODES] as Node[],
    appIngresses: [...MOCK_APP_INGRESSES] as AppIngress[],
  }
}

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null


function ensureMockSession() {
  const state = useAuthStore.getState()
  if (!state.accessToken) {
    const tokens = getMockTokenResponse()
    state.setTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in,
    })
  }
}

function asMockJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function mockControlPlaneResponse(path: string, options: RequestInit = {}): Response {
  const method = (options.method ?? "GET").toUpperCase()
  if (method === "DELETE") {
    return new Response(null, { status: 204 })
  }

  const clusterMatch = path.match(/\/apis\/v202607\/clusters\/([^/?]+)/)
  const nodeMatch = path.match(/\/apis\/v202607\/clusters\/[^/?]+\/nodes(?:\/([^/?]+))?$/)
  const ingressMatch = path.match(/\/apis\/v202607\/clusters\/[^/?]+\/appIngresses(?:\/([^/?]+))?$/)

  const { MOCK_METADATA_REGIONS } = loadControlPlaneMockData()

  if (path === "/apis/v202607/metadata") {
    return asMockJsonResponse({ regions: MOCK_METADATA_REGIONS })
  }

  const mockState = getMockControlPlaneState()

  if (path === "/apis/v202607/clusters") {
    if (method === "POST") {
      const body = options.body ? JSON.parse(String(options.body)) : {}
      const name = body?.metadata?.name ?? `demo-cluster-${mockState.clusters.length + 1}`
      const cluster: Cluster = {
        apiVersion: "v202607",
        kind: "Cluster",
        metadata: { name, etag: `mock-etag-${Date.now()}` },
        spec: body?.spec ?? {
          region: "us-east",
          network: { podCIDR: "10.50.0.0/16", serviceCIDR: "10.120.0.0/12" },
        },
        status: { publicDns: `${name}.kubehub.local`, state: "Creating" },
      }
      mockState.clusters.push(cluster)
      return asMockJsonResponse(cluster)
    }
    return asMockJsonResponse(mockState.clusters)
  }

  if (clusterMatch && !path.includes("/nodes") && !path.includes("/appIngresses") && !path.includes("/downloadkubeconfig")) {
    const name = clusterMatch[1]
    const cluster = mockState.clusters.find((item) => item.metadata.name === decodeURIComponent(name)) ?? mockState.clusters[0]
    if (method === "PUT") {
      const body = options.body ? JSON.parse(String(options.body)) : {}
      const patched = {
        ...cluster,
        metadata: { ...cluster.metadata, name: body?.metadata?.name ?? cluster.metadata.name },
        spec: body?.spec ?? cluster.spec,
      }
      return asMockJsonResponse(patched)
    }
    return asMockJsonResponse(cluster)
  }

  if (path.includes("/downloadkubeconfig")) {
    return asMockJsonResponse({
      kubeconfig: `apiVersion: v1\nclusters:\n- cluster:\n    server: https://demo-cluster.kubehub.local:6443\n  name: demo-cluster\ncontexts:\n- context:\n    cluster: demo-cluster\n    user: demo-user\n  name: demo-cluster\ncurrent-context: demo-cluster\nkind: Config\nusers:\n- name: demo-user\n  user:\n    token: mock-access-token\n`,
    })
  }

  if (nodeMatch) {
    if (method === "POST") {
      const body = options.body ? JSON.parse(String(options.body)) : {}
      const node: Node = {
        apiVersion: "v1",
        kind: "Node",
        metadata: { name: body?.metadata?.name ?? `node-${Date.now()}` },
        spec: body?.spec ?? { meta: { ipv4: "10.0.0.99" } },
        status: { ready: true },
      }
      mockState.nodes.push(node)
      return asMockJsonResponse(node)
    }
    return asMockJsonResponse(mockState.nodes)
  }

  if (ingressMatch) {
    if (method === "POST") {
      const body = options.body ? JSON.parse(String(options.body)) : {}
      const ingress: AppIngress = {
        apiVersion: "v202607",
        kind: "AppIngress",
        metadata: { name: body?.metadata?.name ?? "mock-ingress" },
        spec: body?.spec ?? { protocol: "HTTPS" },
        status: {
          publicDns: `${body?.metadata?.name ?? "mock-ingress"}.kubehub.local`,
          state: "Pending",
        },
      }
      mockState.appIngresses.push(ingress)
      return asMockJsonResponse(ingress)
    }
    return asMockJsonResponse(mockState.appIngresses)
  }

  return asMockJsonResponse({ ok: true })
}

async function refreshAccessTokenOnce(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }
  isRefreshing = true
  const state = useAuthStore.getState()
  refreshPromise = state.doRefreshToken()
  try {
    return await refreshPromise
  } finally {
    isRefreshing = false
    refreshPromise = null
  }
}

async function authFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  if (isMockModeEnabled()) {
    ensureMockSession()
    return mockControlPlaneResponse(path, options)
  }

  const { accessToken, clearTokens } = useAuthStore.getState()
  if (!accessToken) {
    clearTokens()
    throw new Error("Not authenticated")
  }
  const { apiUrl } = await getConfig()
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshAccessTokenOnce()
    if (refreshed) {
      return authFetch(path, options, true)
    }
    clearTokens()
    throw new Error("Session expired")
  }
  if (!res.ok) {
    const body = await res.text()
    let message: string
    try {
      const parsed = JSON.parse(body)
      message = parsed?.error?.message || parsed?.message || body
    } catch {
      message = body || res.statusText
    }
    throw new Error(message)
  }
  return res
}

// ── Metadata ──────────────────────────────────────────────

export interface MetadataResponse {
  regions: string[]
}

export async function getMetadata(): Promise<MetadataResponse> {
  const res = await authFetch("/apis/v202607/metadata")
  return res.json()
}

// ── Clusters ──────────────────────────────────────────────

export async function listClusters(): Promise<Cluster[]> {
  const res = await authFetch("/apis/v202607/clusters")
  return res.json()
}

export async function getCluster(name: string): Promise<Cluster> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(name)}`)
  return res.json()
}

export async function getClusterETag(name: string): Promise<{ cluster: Cluster; etag?: string }> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(name)}`)
  const cluster: Cluster = await res.json()
  const etag = cluster.metadata.etag
  return { cluster, etag }
}

interface ManagedIngressProfile {
  enabled?: boolean
  email?: string
}

interface CreateClusterRequest {
  metadata?: { name: string }
  spec?: {
    region: string
    network?: {
      podCIDR?: string
      serviceCIDR?: string
      kubeDNSServiceIP?: string
    }
    managedIngressProfile?: ManagedIngressProfile
    storageProfile?: { backend?: string }
  }
}

export async function createCluster(req: CreateClusterRequest): Promise<Cluster> {
  const res = await authFetch("/apis/v202607/clusters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  return res.json()
}

export async function updateCluster(name: string, req: CreateClusterRequest, etag?: string): Promise<Cluster> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (etag) headers["If-Match"] = etag
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(req),
  })
  return res.json()
}

export async function deleteCluster(name: string, etag?: string, force?: boolean): Promise<void> {
  const headers: Record<string, string> = {}
  if (etag) {
    headers["If-Match"] = etag
  } else {
    const { etag: fetchedEtag } = await getClusterETag(name)
    if (fetchedEtag) headers["If-Match"] = fetchedEtag
  }
  let url = `/apis/v202607/clusters/${encodeURIComponent(name)}`
  if (force) {
    url += `?forceDelete=true`
  }
  await authFetch(url, {
    method: "DELETE",
    headers,
  })
}

export async function startCluster(name: string): Promise<Cluster> {
  const { cluster, etag } = await getClusterETag(name)
  return updateCluster(name, { metadata: { name: cluster.metadata.name }, spec: { ...cluster.spec } }, etag)
}

export async function reconcileCluster(name: string): Promise<Cluster> {
  const { cluster, etag } = await getClusterETag(name)
  return updateCluster(name, { metadata: { name: cluster.metadata.name }, spec: { ...cluster.spec } }, etag)
}

export async function downloadKubeconfig(name: string, certbased = false): Promise<string> {
  const res = await authFetch(
    `/apis/v202607/clusters/${encodeURIComponent(name)}/downloadkubeconfig?certbased=${certbased}`,
    { method: "POST" },
  )
  const data = await res.json()
  return data.kubeconfig
}

// ── Operations (shared by Cluster, Node, AppIngress) ─────

export interface OperationError {
  code?: string
  message?: string
}

export interface OperationStatus {
  operationName?: string
  stepName?: string
  startedOn?: string
  finishedAt?: string
  operation?: string
  state?: "RUNNING" | "COMPLETED" | "FAILED"
  error?: OperationError
}

// ── Nodes ────────────────────────────────────────────────

export interface NodeMetadata {
  name: string
  etag?: string
}

export interface NodeInfo {
  ipv4?: string
  labels?: Record<string, string>
}

export interface CPU {
  model?: string
  cores?: number
}

export interface Memory {
  total_in_mb?: number
}

export interface HardwareInfo {
  cpus?: CPU[]
  memory?: Memory
}

export interface NodeSpec {
  os?: string
  arch?: string
  meta?: NodeInfo
  hardware?: HardwareInfo
  annotations?: Record<string, string>
  taints?: Array<{ key?: string; value?: string; effect?: string }>
}

export interface NodeStatus {
  ready?: boolean
  lastOperation?: OperationStatus
}

export interface Node {
  apiVersion?: string
  kind?: string
  metadata: NodeMetadata
  spec: NodeSpec
  status: NodeStatus
}

export type ControlPlaneNode = Node

export async function listControlPlaneNodes(clusterName: string): Promise<Node[]> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes`)
  return res.json()
}

export async function registerNode(clusterName: string, name: string, ip: string): Promise<Node> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata: { name },
      spec: { meta: { ipv4: ip } },
    }),
  })
  return res.json()
}

export async function getNode(clusterName: string, nodeName: string): Promise<Node> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes/${encodeURIComponent(nodeName)}`)
  return res.json()
}

export async function updateNode(clusterName: string, nodeName: string, spec: NodeSpec, etag: string): Promise<Node> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes/${encodeURIComponent(nodeName)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({ spec }),
  })
  return res.json()
}

export async function deleteNode(clusterName: string, nodeName: string, etag?: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (etag) headers["If-Match"] = etag
  await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes/${encodeURIComponent(nodeName)}`, {
    method: "DELETE",
    headers,
  })
}

// ── Bootstrap Secret ─────────────────────────────────────

export interface CertPair {
  "tls.crt"?: string
  "tls.key"?: string
}

export interface CertPairCollection {
  kubelet?: CertPair
  controllerManager?: CertPair
  scheduler?: CertPair
}

export interface BootstrapSecretResponse {
  name?: string
  ip?: string
  clusterDNS?: string
  caCert?: string
  certPairs?: CertPairCollection
}

export async function bootstrapNode(clusterName: string, nodeName: string): Promise<BootstrapSecretResponse> {
  const res = await authFetch(
    `/apis/v202607/clusters/${encodeURIComponent(clusterName)}/nodes/${encodeURIComponent(nodeName)}/bootstrapSecret`,
    { method: "POST" },
  )
  return res.json()
}

// ── App Ingresses ────────────────────────────────────────

export interface AppIngress {
  apiVersion: string
  kind: string
  metadata: { name: string; etag?: string }
  spec: {
    serviceBackend?: {
      serviceName: string
      namespace: string
      port: number
    }
    exposeToPublic?: boolean
    exposeToLocal?: boolean
    routesByPrefix?: Record<string, { serviceName: string; namespace: string; port: number }>
    protocol?: string
  }
  status: {
    publicDns?: string
    localDNS?: string
    programStatus?: {
      publicDNS?: { programed?: boolean; message?: string }
      localDNS?: { certProvisioned?: boolean; programed?: boolean; message?: string }
    }
    state?: string
    lastOperation?: OperationStatus
  }
}

export async function listAppIngresses(clusterName: string): Promise<AppIngress[]> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/appIngresses`)
  return res.json()
}

export async function getAppIngress(clusterName: string, appName: string): Promise<AppIngress> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/appIngresses/${encodeURIComponent(appName)}`)
  return res.json()
}

export async function createAppIngress(clusterName: string, appName: string, spec: AppIngress["spec"]): Promise<AppIngress> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/appIngresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata: { name: appName }, spec }),
  })
  return res.json()
}

export async function updateAppIngress(
  clusterName: string,
  appName: string,
  spec: AppIngress["spec"],
  etag: string,
): Promise<AppIngress> {
  const res = await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/appIngresses/${encodeURIComponent(appName)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify({ spec }),
  })
  return res.json()
}

export async function deleteAppIngress(clusterName: string, appName: string, etag?: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (etag) headers["If-Match"] = etag
  await authFetch(`/apis/v202607/clusters/${encodeURIComponent(clusterName)}/appIngresses/${encodeURIComponent(appName)}`, {
    method: "DELETE",
    headers,
  })
}

// ── API Error ────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string
    message: string
  }
}
