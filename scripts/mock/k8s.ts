import { MOCK_RESOURCE_MAP, type MockK8sObject } from "./data.ts"
import { sendJson, type Handler } from "./util.ts"

const API_GROUPS = [
  { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }], preferredVersion: { groupVersion: "apps/v1", version: "v1" } },
  { name: "batch", versions: [{ groupVersion: "batch/v1", version: "v1" }], preferredVersion: { groupVersion: "batch/v1", version: "v1" } },
  { name: "discovery.k8s.io", versions: [{ groupVersion: "discovery.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "discovery.k8s.io/v1", version: "v1" } },
  { name: "networking.k8s.io", versions: [{ groupVersion: "networking.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "networking.k8s.io/v1", version: "v1" } },
  { name: "storage.k8s.io", versions: [{ groupVersion: "storage.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "storage.k8s.io/v1", version: "v1" } },
]

const MOCK_LOG = `[2026-09-06T08:00:00.000Z] mock container started
[2026-09-06T08:00:01.000Z] listening on :${"8080"}
[2026-09-06T08:00:02.000Z] health check ok
[2026-09-06T08:00:03.000Z] waiting for requests...`

function resolveMockItems(resourceKey: string): MockK8sObject[] {
  switch (resourceKey) {
    case "":
    case "pods":
      return MOCK_RESOURCE_MAP.pods
    case "namespaces":
      return MOCK_RESOURCE_MAP.namespaces
    case "nodes":
      return MOCK_RESOURCE_MAP.nodes
    case "deployments":
      return MOCK_RESOURCE_MAP.deployments
    case "daemonsets":
      return MOCK_RESOURCE_MAP.daemonsets
    case "statefulsets":
      return MOCK_RESOURCE_MAP.statefulsets
    case "replicasets":
      return MOCK_RESOURCE_MAP.replicasets
    case "cronjobs":
      return MOCK_RESOURCE_MAP.cronjobs
    case "jobs":
      return MOCK_RESOURCE_MAP.jobs
    case "services":
      return MOCK_RESOURCE_MAP.services
    case "endpointslices":
      return MOCK_RESOURCE_MAP.endpointslices
    case "persistentvolumes":
      return MOCK_RESOURCE_MAP.persistentvolumes
    case "persistentvolumeclaims":
      return MOCK_RESOURCE_MAP.persistentvolumeclaims
    case "configmaps":
      return MOCK_RESOURCE_MAP.configmaps
    case "secrets":
      return MOCK_RESOURCE_MAP.secrets
    default:
      return []
  }
}

export function k8sHandler(): Handler {
  return (req, res) => {
    const method = (req.method ?? "GET").toUpperCase()
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    let path = decodeURIComponent(url.pathname)

    while (path.endsWith("/") && path !== "/") {
      path = path.slice(0, -1)
    }

    if (method === "DELETE") {
      res.writeHead(204)
      return res.end()
    }

    if (path === "/api") {
      return sendJson(res, 200, { versions: ["v1"] })
    }

    if (path === "/apis") {
      return sendJson(res, 200, {
        apiVersion: "v1",
        kind: "APIGroupList",
        groups: API_GROUPS,
      })
    }

    const isEvent =
      path === "/api/v1/events" ||
      path.startsWith("/api/v1/events/") ||
      path.includes("/events") ||
      path.endsWith("/events")

    if (isEvent) {
      return sendJson(res, 200, { apiVersion: "v1", kind: "EventList", items: MOCK_RESOURCE_MAP.events })
    }

    if (path.endsWith("/log")) {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Stream-Output": MOCK_LOG.split("\n")[0],
      })
      return res.end(MOCK_LOG)
    }

    const locatorMatch = path.match(/^(?:\/api\/[^/]+|\/apis\/[^/]+\/[^/]+)(?:\/namespaces\/([^/]+))?\/([^/]+)(?:\/([^/]+))?(?:\/(.+))?$/)
    const namespace = locatorMatch?.[1]
    const resourceKey = locatorMatch?.[2] ?? "pods"
    const name = locatorMatch?.[3]

    const items = (resolveMockItems(resourceKey) ?? []).filter(
      (item) => namespace ? item.metadata?.namespace === namespace || !item.metadata?.namespace : true,
    )

    if (name) {
      const single = items.find((item) => item.metadata?.name === name) ?? items[0]
      return sendJson(res, 200, single ?? { apiVersion: "v1", kind: "Status", status: "NotFound" })
    }

    return sendJson(res, 200, { apiVersion: "v1", kind: "List", items })
  }
}