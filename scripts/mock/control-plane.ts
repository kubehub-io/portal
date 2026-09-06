import type { IncomingMessage } from "node:http"
import {
  MOCK_APP_INGRESSES,
  MOCK_CLUSTERS,
  MOCK_METADATA_REGIONS,
  MOCK_NODES,
  type MockCluster,
  type MockK8sObject,
} from "./data.ts"
import { readBody, sendJson, sendText, type Handler } from "./util.ts"

const API_BASE = "/apis/v202607"

interface MockState {
  clusters: MockCluster[]
  nodes: MockK8sObject[]
  appIngresses: MockK8sObject[]
}

function createState(): MockState {
  return {
    clusters: JSON.parse(JSON.stringify(MOCK_CLUSTERS)),
    nodes: JSON.parse(JSON.stringify(MOCK_NODES)),
    appIngresses: JSON.parse(JSON.stringify(MOCK_APP_INGRESSES)),
  }
}

type UpdateResult = MockCluster | { conflict: string } | null

function updateCollectionItem(state: MockState, name: string, body: MockCluster, req: IncomingMessage): UpdateResult {
  const index = state.clusters.findIndex((c) => c.metadata?.name === name)
  if (index === -1) return null

  const current = state.clusters[index]
  const etag = req.headers["if-match"]
  if (!etag || current.metadata?.etag !== etag) {
    return { conflict: "Optimistic concurrency conflict: current etag differs from If-Match" }
  }

  const item: MockCluster = {
    ...body,
    metadata: { ...(body.metadata ?? {}), name, etag },
  }
  const lastOperation = item.status?.lastOperation
  if (lastOperation) {
    item.status = {
      ...item.status,
      lastOperation: {
        ...lastOperation,
        startedOn: new Date().toISOString(),
        finishedAt: undefined,
      },
    }
  }
  state.clusters[index] = item
  return item
}

const KUBECONFIG_TEMPLATE = (dns: string, user: string): string => `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://${dns}:8443
  name: mock-cluster
contexts:
- context:
    cluster: mock-cluster
    user: ${user}
  name: mock-context
current-context: mock-context
users:
- name: ${user}
  user:
    token: mock-kubeconfig-token`

export function controlPlaneHandler(): Handler {
  const state = createState()

  return async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase()
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname

    if (path === `${API_BASE}/clusters` && method === "GET") {
      return sendJson(res, 200, { apiVersion: "v202607", kind: "ClusterList", items: state.clusters })
    }

    if (path === `${API_BASE}/clusters` && method === "POST") {
      const cluster = JSON.parse((await readBody(req)).toString("utf8")) as MockCluster
      cluster.metadata = { ...(cluster.metadata ?? {}), etag: "etag-0" }
      cluster.status = {
        ...(cluster.status ?? {}),
        publicDns: cluster.status?.publicDns ?? "localhost",
        localDnsDomain: cluster.status?.localDnsDomain ?? `${cluster.metadata?.name}.local.kubehub.dev`,
        state: "Running",
        lastOperation: {
          operationName: "Provisioning",
          startedOn: new Date().toISOString(),
        },
        controlPlaneComponents: {},
      }
      state.clusters.push(cluster)
      return sendJson(res, 200, cluster)
    }

    const clusterMatch = path.match(new RegExp(`^${API_BASE}/clusters/([^/]+)$`))
    if (clusterMatch) {
      const name = decodeURIComponent(clusterMatch[1])

      if (method === "DELETE") {
        state.clusters = state.clusters.filter((c) => c.metadata?.name !== name)
        res.writeHead(204)
        return res.end()
      }

      if (method === "PUT") {
        const body = JSON.parse((await readBody(req)).toString("utf8")) as MockCluster
        const updated = updateCollectionItem(state, name, body, req)
        if (!updated) return sendJson(res, 404, { message: `Cluster ${name} not found` })
        if ("conflict" in updated) return sendJson(res, 409, { message: updated.conflict })
        return sendJson(res, 200, updated)
      }

      if (method === "GET") {
        const cluster = state.clusters.find((c) => c.metadata?.name === name)
        if (!cluster) return sendJson(res, 404, { message: `Cluster ${name} not found` })
        return sendJson(res, 200, cluster)
      }
    }

    const kubeconfigMatch = path.match(new RegExp(`^${API_BASE}/clusters/([^/]+)/downloadkubeconfig$`))
    if (kubeconfigMatch && (method === "GET" || method === "POST")) {
      const name = decodeURIComponent(kubeconfigMatch[1])
      const cluster = state.clusters.find((c) => c.metadata?.name === name)
      if (!cluster) return sendJson(res, 404, { message: `Cluster ${name} not found` })
      return sendText(res, 200, KUBECONFIG_TEMPLATE(cluster.status?.publicDns ?? "mock.local", "mock-user"), "text/yaml; charset=utf-8")
    }

    if (path === `${API_BASE}/metadata` && method === "GET") {
      return sendJson(res, 200, { regions: MOCK_METADATA_REGIONS })
    }

    const collectionMatch = path.match(new RegExp(`^${API_BASE}/clusters/[^/]+/(nodes|appIngresses)(?:/([^/]+))?(?:/bootstrapSecret)?$`))
    if (collectionMatch) {
      const resourceKind = collectionMatch[1]
      const itemName = collectionMatch[2]
      const collection = resourceKind === "nodes" ? state.nodes : state.appIngresses
      const kind = resourceKind === "nodes" ? "NodeList" : "AppIngressList"

      if (path.endsWith("/bootstrapSecret")) {
        if (method === "POST") {
          return sendJson(res, 200, {
            name: itemName,
            ip: "10.0.0.99",
            clusterDNS: "10.45.0.10",
            caCert: "-----BEGIN CERTIFICATE-----\nMOCKCA\n-----END CERTIFICATE-----",
            certPairs: {
              kubelet: { "tls.crt": "MOCKCERT", "tls.key": "MOCKKEY" },
              controllerManager: { "tls.crt": "MOCKCERT", "tls.key": "MOCKKEY" },
              scheduler: { "tls.crt": "MOCKCERT", "tls.key": "MOCKKEY" },
            },
          })
        }
        return sendJson(res, 404, { message: "Not found" })
      }

      if (!itemName) {
        if (method === "GET") {
          return sendJson(res, 200, { apiVersion: "v202607", kind, items: collection })
        }
        if (method === "POST") {
          const body = JSON.parse((await readBody(req)).toString("utf8")) as MockK8sObject
          body.metadata = { ...(body.metadata ?? {}), etag: `etag-${Date.now()}` }
          body.status = { ...(body.status ?? {}), ready: true }
          collection.push(body)
          return sendJson(res, 200, body)
        }
      }

      const index = collection.findIndex((item) => item.metadata?.name === itemName)
      if (index === -1) {
        return sendJson(res, 404, { message: `${resourceKind} ${itemName} not found` })
      }

      if (method === "GET") {
        return sendJson(res, 200, collection[index])
      }

      if (method === "PUT") {
        const body = JSON.parse((await readBody(req)).toString("utf8")) as MockK8sObject
        const etag = req.headers["if-match"]
        if (!etag || collection[index].metadata?.etag !== etag) {
          return sendJson(res, 409, { message: "Optimistic concurrency conflict: current etag differs from If-Match" })
        }
        collection[index] = {
          ...collection[index],
          ...body,
          metadata: { ...(collection[index].metadata ?? {}), name: itemName, etag },
        }
        return sendJson(res, 200, collection[index])
      }

      if (method === "DELETE") {
        collection.splice(index, 1)
        res.writeHead(204)
        return res.end()
      }
    }

    return sendJson(res, 200, { ok: true, path, method })
  }
}