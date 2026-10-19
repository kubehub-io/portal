import { useAuthStore } from "@/stores/auth-store"
import type { Cluster } from "@/stores/cluster-store"

export function getK8sApiBase(cluster: Cluster): string {
  return `https://${cluster.status.publicDns}:8443`
}

export interface APIGroup {
  name: string
  versions: { groupVersion: string; version: string }[]
  preferredVersion: { groupVersion: string; version: string }
  resources?: { name: string; singularName: string; kind: string; namespaced: boolean }[]
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

  const coreGroup = await discoverCoreGroup(cluster, headers)

  const groupsWithResources = await Promise.all(
    apisData.groups.map(async (group) => {
      try {
        const version = group.preferredVersion?.version ?? group.versions?.[0]?.version
        if (!version) return group
        const res = await fetch(`${host}/apis/${group.name}/${version}`, { headers })
        if (!res.ok) return group
        const data = await res.json() as { resources?: APIGroup["resources"] }
        return { ...group, resources: data.resources }
      } catch {
        return group
      }
    }),
  )

  return {
    coreVersions: coreData.versions,
    groups: coreGroup ? [coreGroup, ...groupsWithResources] : groupsWithResources,
  }
}

/**
 * The core API group is served from /api rather than /apis, so it has to be
 * discovered separately. It is returned as a group with an empty name.
 */
async function discoverCoreGroup(
  cluster: Cluster,
  headers: Record<string, string>,
): Promise<APIGroup | null> {
  const version = "v1"
  try {
    const res = await fetch(`${getK8sApiBase(cluster)}/api/${version}`, { headers })
    if (!res.ok) return null
    const data = await res.json() as { resources?: APIGroup["resources"] }
    const groupVersion = version
    return {
      name: "",
      versions: [{ groupVersion, version }],
      preferredVersion: { groupVersion, version },
      resources: data.resources,
    }
  } catch {
    return null
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

export interface K8sAPIError extends Error {
  status?: number
}

async function k8sRequestError(action: string, res: Response): Promise<K8sAPIError> {
  const detail = await extractErrorDetail(res)
  const err = new Error(`${action}: ${detail}`) as K8sAPIError
  err.status = res.status
  return err
}

function isConflict(e: unknown): boolean {
  return e instanceof Error && (e as K8sAPIError).status === 409
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
  if (!res.ok) throw await k8sRequestError(`Failed to delete ${desc.resource}/${name}`, res)
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
  if (!res.ok) throw await k8sRequestError(`Failed to create ${desc.resource}`, res)
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
  if (!res.ok) throw await k8sRequestError(`Failed to update ${desc.resource}/${name}`, res)
  return res.json()
}

/**
 * Metadata the apiserver owns. Sending any of it in an apply request either
 * fails validation or makes the applier take ownership of a field it can never
 * set, so manifests are stripped of it before they go out.
 */
const SERVER_OWNED_METADATA = [
  "resourceVersion",
  "uid",
  "managedFields",
  "creationTimestamp",
  "generation",
  "selfLink",
  "deletionTimestamp",
  "deletionGracePeriodSeconds",
]

export function sanitizeForApply(doc: unknown): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
  const meta = clone.metadata
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>
    for (const key of SERVER_OWNED_METADATA) delete m[key]
  }
  return clone
}

export interface ApplyOptions {
  fieldManager?: string
}

const DEFAULT_FIELD_MANAGER = "kubehub-portal"

/**
 * Create-or-update a resource, the way `kubectl apply` does it.
 *
 * A PATCH with `application/apply-patch+yaml` lets the apiserver own
 * resourceVersion and merge the manifest into the live object, so a manifest
 * that has never seen the resource and one exported earlier both apply, and
 * re-applying the same manifest is a no-op instead of a conflict.
 */
export async function applyK8sResource<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
  body: unknown,
  options: ApplyOptions = {},
): Promise<T> {
  const fieldManager = options.fieldManager ?? DEFAULT_FIELD_MANAGER
  const sanitized = sanitizeForApply(body)
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const params = new URLSearchParams({ fieldManager, force: "true" })

  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}/${name}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/apply-patch+yaml" },
    body: JSON.stringify(sanitized),
  })

  if (res.ok) return res.json()

  // Aggregated API servers may not implement server-side apply. Fall back to a
  // read-modify-write so applying still works against them.
  if (res.status === 405 || res.status === 415 || res.status === 501) {
    return applyViaReplace<T>(cluster, namespace, desc, name, sanitized)
  }
  throw await k8sRequestError(`Failed to apply ${desc.resource}/${name}`, res)
}

/** GET that reports absence as null instead of throwing. */
async function findK8sResource<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
): Promise<T | null> {
  const prefix = desc.group ? `/apis/${desc.group}/${desc.version}` : `/api/${desc.version}`
  const nsPath = namespace ? `/namespaces/${namespace}` : ""
  const res = await k8sFetch(cluster, `${prefix}${nsPath}/${desc.resource}/${name}`)
  if (res.status === 404) return null
  if (!res.ok) throw await k8sRequestError(`Failed to get ${desc.resource}/${name}`, res)
  return res.json()
}

async function applyViaReplace<T = K8sResource>(
  cluster: Cluster,
  namespace: string | null,
  desc: ResourceDescriptor,
  name: string,
  doc: Record<string, unknown>,
): Promise<T> {
  const live = await findK8sResource<K8sResource>(cluster, namespace, desc, name)
  if (!live) return createK8sResource<T>(cluster, namespace, desc, doc)

  // An update must carry metadata.resourceVersion, which a manifest written by
  // hand does not have — without it the apiserver rejects the whole request
  // with "must be specified for an update". Take it from the live object.
  try {
    return await updateK8sResource<T>(cluster, namespace, desc, name, withLiveMeta(doc, live))
  } catch (e) {
    if (!isConflict(e)) throw e
  }

  // Another writer got there first; redo the update against what they left.
  const latest = await findK8sResource<K8sResource>(cluster, namespace, desc, name)
  if (!latest) return createK8sResource<T>(cluster, namespace, desc, doc)
  return updateK8sResource<T>(cluster, namespace, desc, name, withLiveMeta(doc, latest))
}

function withLiveMeta(doc: Record<string, unknown>, live: K8sResource): Record<string, unknown> {
  const meta = { ...((doc.metadata as Record<string, unknown>) ?? {}) }
  meta.resourceVersion = live.metadata?.resourceVersion
  if (live.metadata?.uid) meta.uid = live.metadata.uid
  return { ...doc, metadata: meta }
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

export interface CoreAPIResource {
  name: string
  singularName: string
  kind: string
  namespaced: boolean
  verbs: string[]
  shortNames?: string[]
  categories?: string[]
}

export async function listCoreAPIResources(
  cluster: Cluster,
): Promise<{ kind: string; apiVersion: string; groupVersion: string; resources: CoreAPIResource[] }> {
  const res = await k8sFetch(cluster, "/api/v1")
  if (!res.ok) throw new Error("Failed to list core API resources")
  return res.json()
}