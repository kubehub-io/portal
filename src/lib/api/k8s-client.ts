import { useAuthStore } from "@/stores/auth-store"

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

export async function discoverAPI(clusterDns: string): Promise<APIDiscoveryResult> {
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
  const prefix = "/api/v1"
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(clusterDns, `${prefix}${nsPath}/events`)
  if (!res.ok) throw new Error(`Failed to list events: ${res.statusText}`)
  return res.json()
}
