import { useAuthStore } from "@/stores/auth-store"
import { getMockTokenResponse, isMockModeEnabled } from "@/lib/auth/pkce"

function loadK8sClientMockData() {
  return require("./k8s-client.mockdata.ts") as typeof import("./k8s-client.mockdata.ts")
}

function getK8sHost(clusterDns: string): string {
  return `https://${clusterDns}:8443`
}


export interface APIGroup {
  name: string
  versions: { groupVersion: string; version: string }[]
  preferredVersion: { groupVersion: string; version: string }
}

export interface APIDiscoveryResult {
  coreVersions: string[]
  groups: APIGroup[]
}

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

function mockResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function resolveMockItems(resource: string, namespace?: string): K8sResource[] {
  const { MOCK_RESOURCE_MAP } = loadK8sClientMockData()
  const list = (MOCK_RESOURCE_MAP[resource] ?? []) as K8sResource[]
  if (!namespace) return list
  return list.filter((item) => item.metadata.namespace === namespace)
}

export async function discoverAPI(clusterDns: string): Promise<APIDiscoveryResult> {
  if (isMockModeEnabled()) {
    return {
      coreVersions: ["v1"],
      groups: [
        { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }], preferredVersion: { groupVersion: "apps/v1", version: "v1" } },
        { name: "batch", versions: [{ groupVersion: "batch/v1", version: "v1" }], preferredVersion: { groupVersion: "batch/v1", version: "v1" } },
        { name: "networking.k8s.io", versions: [{ groupVersion: "networking.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "networking.k8s.io/v1", version: "v1" } },
      ],
    }
  }

  const accessToken = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Host: clusterDns,
  }
  const host = getK8sHost(clusterDns)

  const [coreRes, apisRes] = await Promise.all([
    fetch(`${host}/api`, { headers }),
    fetch(`${host}/apis`, { headers }),
  ])

  const coreData = await coreRes.json() as { versions: string[] }
  const apisData = await apisRes.json() as { groups: APIGroup[] }

  return {
    coreVersions: coreData.versions,
    groups: apisData.groups,
  }
}

export interface K8sResource {
  apiVersion?: string
  kind?: string
  metadata: {
    name: string
    namespace?: string
    uid?: string
    resourceVersion?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  [key: string]: unknown
}

export interface K8sResourceList<T = K8sResource> {
  apiVersion: string
  kind: string
  metadata?: { resourceVersion?: string; continue?: string }
  items: T[]
}

export interface ResourceDescriptor {
  group?: string
  version: string
  resource: string
}

async function k8sFetch(
  clusterDns: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  if (isMockModeEnabled()) {
    const { MOCK_RESOURCE_MAP } = loadK8sClientMockData()
    ensureMockSession()
    const resourceMatches = path.match(/(?:\/api\/(?:v1|[A-Za-z0-9.-]+)|\/apis\/[^/]+\/[^/]+)\/(.+?)(?:\/|\?|$)/)
    const resourceName = resourceMatches?.[1] ?? "pods"
    const method = (options.method ?? "GET").toUpperCase()

    if (method === "DELETE") {
      return new Response(null, { status: 204 })
    }

    if (path === "/api/v1" || path === "/apis") {
      return mockResponse({ versions: ["v1"] })
    }

    if (resourceName === "events") {
      return mockResponse({ apiVersion: "v1", kind: "EventList", items: resolveMockItems("events") })
    }

    const normalized = resourceName.replace(/\/namespaces\/[^/]+/, "")
    const resourceKey = normalized.split("/")[0]
    const namespace = path.match(/\/namespaces\/([^/]+)/)?.[1]
    const items = resolveMockItems(resourceKey, namespace)

    if (path.includes("/log")) {
      return new Response("2024-01-17T02:00:00Z demo log line\n2024-01-17T02:01:00Z mock pod data\n", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }

    if (path.includes("/pods/") && !path.includes("/log")) {
      const name = path.split("/").pop() ?? "demo-pod"
      const pod = resolveMockItems("pods").find((item) => item.metadata.name === name) ?? resolveMockItems("pods")[0]
      return mockResponse(pod)
    }

    return mockResponse({ apiVersion: "v1", kind: "List", items })
  }

  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) throw new Error("Not authenticated")
  const host = getK8sHost(clusterDns)
  return fetch(`${host}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      Host: clusterDns,
    },
  })
}

export async function listClusterScopedResources<T = K8sResource>(
  clusterDns: string,
  desc: ResourceDescriptor,
): Promise<K8sResourceList<T>> {
  if (isMockModeEnabled()) {
    return {
      apiVersion: "v1",
      kind: "List",
      items: resolveMockItems(desc.resource) as T[],
    }
  }

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const res = await k8sFetch(clusterDns, `${prefix}/${desc.resource}`)
  if (!res.ok) throw new Error(`Failed to list ${desc.resource}: ${res.statusText}`)
  return res.json()
}

export async function listNamespaceScopedResources<T = K8sResource>(
  clusterDns: string,
  namespace: string,
  desc: ResourceDescriptor,
): Promise<K8sResourceList<T>> {
  if (isMockModeEnabled()) {
    return {
      apiVersion: "v1",
      kind: "List",
      items: resolveMockItems(desc.resource, namespace) as T[],
    }
  }

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const res = await k8sFetch(clusterDns, `${prefix}/namespaces/${namespace}/${desc.resource}`)
  if (!res.ok) throw new Error(`Failed to list ${desc.resource}: ${res.statusText}`)
  return res.json()
}

export async function getK8sResource<T = K8sResource>(
  clusterDns: string,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
): Promise<T> {
  if (isMockModeEnabled()) {
    const list = resolveMockItems(desc.resource, namespace ?? undefined)
    return (list.find((item) => item.metadata.name === name) ?? list[0]) as T
  }

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/${desc.resource}/${name}`)
  if (!res.ok) throw new Error(`Failed to get ${desc.resource}/${name}: ${res.statusText}`)
  return res.json()
}

export function streamPodLogs(
  clusterDns: string,
  namespace: string,
  podName: string,
  containerName?: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (isMockModeEnabled()) {
    return Promise.resolve(new Response("2024-01-17T02:00:00Z mock log line\n2024-01-17T02:01:00Z pod ready\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }))
  }

  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) throw new Error("Not authenticated")
  const host = getK8sHost(clusterDns)

  const params = new URLSearchParams({
    follow: "true",
    timestamps: "true",
  })

  if (containerName) {
    params.set("container", containerName)
  }

  return fetch(`${host}/api/v1/namespaces/${namespace}/pods/${podName}/log?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Host: clusterDns,
    },
    signal,
  })
}

export async function deleteK8sResource(
  clusterDns: string,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
): Promise<void> {
  if (isMockModeEnabled()) return

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/${desc.resource}/${name}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(`Failed to delete ${desc.resource}/${name}: ${res.statusText}`)
}

export async function createK8sResource<T = K8sResource>(
  clusterDns: string,
  namespace: string | null,
  desc: ResourceDescriptor,
  body: unknown,
): Promise<T> {
  if (isMockModeEnabled()) {
    const resource = body as { metadata?: { name?: string } }
    return {
      apiVersion: desc.version,
      kind: desc.resource.replace(/s$/, "").replace(/^./, (s) => s.toUpperCase()),
      metadata: {
        name: resource?.metadata?.name ?? `${desc.resource}-mock`,
        namespace: namespace ?? undefined,
      },
      ...(body as Record<string, unknown>),
    } as T
  }

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/${desc.resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to create ${desc.resource}: ${res.statusText}`)
  return res.json()
}

export async function updateK8sResource<T = K8sResource>(
  clusterDns: string,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
  body: unknown,
): Promise<T> {
  if (isMockModeEnabled()) {
    return {
      apiVersion: desc.version,
      kind: desc.resource.replace(/s$/, "").replace(/^./, (s) => s.toUpperCase()),
      metadata: { name, namespace: namespace ?? undefined },
      ...(body as Record<string, unknown>),
    } as T
  }

  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/${desc.resource}/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to update ${desc.resource}/${name}: ${res.statusText}`)
  return res.json()
}

export async function listEvents(
  clusterDns: string,
  namespace?: string,
): Promise<K8sResourceList> {
  if (isMockModeEnabled()) {
    return {
      apiVersion: "v1",
      kind: "EventList",
      items: resolveMockItems("events", namespace),
    }
  }

  const prefix = "/api/v1"
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/events`)
  if (!res.ok) throw new Error(`Failed to list events: ${res.statusText}`)
  return res.json()
}
