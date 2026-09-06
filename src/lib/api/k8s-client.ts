import { useAuthStore } from "@/stores/auth-store"
import type { Cluster } from "@/stores/cluster-store"

export function getK8sApiBase(cluster: Cluster): string {
  return `https://${cluster.status.publicDns}:8443`
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

export async function discoverAPI(cluster: Cluster): Promise<APIDiscoveryResult> {
  const clusterDns = cluster.status.publicDns
  const accessToken = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Host: clusterDns,
  }
  const host = getK8sApiBase(cluster)

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

async function extractErrorDetail(res: Response): Promise<string> {
  const statusText = res.statusText || `HTTP ${res.status}`
  try {
    const text = await res.text()
    if (!text) return statusText
    try {
      const json = JSON.parse(text) as { message?: string }
      if (json && typeof json.message === "string" && json.message) {
        return json.message
      }
    } catch {
      // response is not JSON, fall back to raw text
    }
    return text
  } catch {
    return statusText
  }
}

async function k8sFetch(
  cluster: Cluster,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const clusterDns = cluster.status.publicDns
  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) throw new Error("Not authenticated")
  const host = getK8sApiBase(cluster)
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
  cluster: Cluster,
  desc: ResourceDescriptor,
): Promise<K8sResourceList<T>> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const res = await k8sFetch(cluster, `${prefix}/${desc.resource}`)
  if (!res.ok) throw new Error(`Failed to list ${desc.resource}: ${res.statusText}`)
  return res.json()
}

export async function listNamespaceScopedResources<T = K8sResource>(
  cluster: Cluster,
  namespace: string,
  desc: ResourceDescriptor,
): Promise<K8sResourceList<T>> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const res = await k8sFetch(cluster, `${prefix}/namespaces/${namespace}/${desc.resource}`)
  if (!res.ok) throw new Error(`Failed to list ${desc.resource}: ${res.statusText}`)
  return res.json()
}

export async function getK8sResource<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
): Promise<T> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}/${name}`)
  if (!res.ok) throw new Error(`Failed to get ${desc.resource}/${name}: ${res.statusText}`)
  return res.json()
}

export async function streamPodLogs(
  cluster: Cluster,
  namespace: string,
  podName: string,
  containerName?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const clusterDns = cluster.status.publicDns
  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) throw new Error("Not authenticated")
  const host = getK8sApiBase(cluster)

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
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
): Promise<void> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}/${name}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(`Failed to delete ${desc.resource}/${name}: ${res.statusText}`)
}

export async function createK8sResource<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  body: unknown,
): Promise<T> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await extractErrorDetail(res)
    throw new Error(`Failed to create ${desc.resource}: ${detail}`)
  }
  return res.json()
}

export async function updateK8sResource<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
  body: unknown,
): Promise<T> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await extractErrorDetail(res)
    throw new Error(`Failed to update ${desc.resource}/${name}: ${detail}`)
  }
  return res.json()
}

export async function listEvents(
  cluster: Cluster,
  namespace?: string,
): Promise<K8sResourceList> {
  const prefix = "/api/v1"
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/events`)
  if (!res.ok) throw new Error(`Failed to list events: ${res.statusText}`)
  return res.json()
}