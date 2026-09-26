import type { IncomingMessage } from "node:http"
import { MOCK_ALERTMANAGER_CONFIG, MOCK_ALERTS, MOCK_RULE_NAMESPACES } from "./data.ts"
import { readBody, sendJson, type Handler } from "./util.ts"

const API_BASE = "/apis/monitoring-v202609"

type RuleGroups = Record<string, unknown>
type AlertConfig = Record<string, unknown>

interface MockMonitoringState {
  /** namespace -> { name, groups } */
  rules: RuleGroups
  etags: Map<string, string>
  configs: Map<string, AlertConfig>
  alerts: unknown[]
}

let revision = 0

function nextETag(): string {
  revision += 1
  return `monitoring-etag-${revision}`
}

function createState(): MockMonitoringState {
  const rules: RuleGroups = {}
  for (const [namespace, body] of Object.entries(MOCK_RULE_NAMESPACES)) {
    rules[namespace] = JSON.parse(JSON.stringify(body))
  }
  return {
    rules,
    etags: new Map(),
    configs: new Map([["default", JSON.parse(JSON.stringify(MOCK_ALERTMANAGER_CONFIG))]]),
    alerts: JSON.parse(JSON.stringify(MOCK_ALERTS)),
  }
}

function checkIfMatch(state: MockMonitoringState, key: string, req: IncomingMessage): string | null {
  const current = state.etags.get(key)
  const ifMatch = req.headers["if-match"]
  if (!current) return null
  if (typeof ifMatch !== "string" || ifMatch !== current) {
    return "Precondition Failed: the supplied If-Match value does not match the current resource"
  }
  return null
}

export function monitoringHandler(): Handler {
  const state = createState()

  return async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase()
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname

    if (!path.startsWith(API_BASE)) {
      return sendJson(res, 404, { error: "Not found" })
    }

    const alertsMatch = path.match(new RegExp(`^${API_BASE}/alerts$`))
    if (alertsMatch && method === "GET") {
      return sendJson(res, 200, state.alerts)
    }

    if (path === `${API_BASE}/rules` && method === "GET") {
      const namespaces = Object.entries(state.rules).map(([namespace, body]) => ({
        namespace,
        groups: (body as { groups?: unknown[] }).groups ?? [],
      }))
      return sendJson(res, 200, namespaces)
    }

    const rulesMatch = path.match(new RegExp(`^${API_BASE}/rules/([^/]+)$`))
    if (rulesMatch) {
      const namespace = decodeURIComponent(rulesMatch[1])
      const key = `rules/${namespace}`

      if (method === "GET") {
        const body = state.rules[namespace]
        if (!body) return sendJson(res, 404, { error: `Rules for namespace ${namespace} not found` })
        res.setHeader("ETag", state.etags.get(key) ?? nextETag())
        return sendJson(res, 200, body)
      }

      if (method === "PUT") {
        const conflict = checkIfMatch(state, key, req)
        if (conflict) return sendJson(res, 412, { error: conflict })
        const body = JSON.parse((await readBody(req)).toString("utf8")) as { groups?: unknown[] }
        if (!body || typeof body !== "object") {
          return sendJson(res, 400, { error: "Invalid request body" })
        }
        const created = !state.rules[namespace]
        const stored = { name: namespace, groups: body.groups ?? [] }
        state.rules[namespace] = stored
        const etag = nextETag()
        state.etags.set(key, etag)
        res.setHeader("ETag", etag)
        return sendJson(res, 200, { message: `${created ? "Created" : "Updated"} rules for namespace ${namespace}` })
      }

      if (method === "DELETE") {
        const conflict = checkIfMatch(state, key, req)
        if (conflict) return sendJson(res, 412, { error: conflict })
        if (!state.rules[namespace]) {
          return sendJson(res, 404, { error: `Rules for namespace ${namespace} not found` })
        }
        delete state.rules[namespace]
        state.etags.delete(key)
        res.writeHead(204)
        return res.end()
      }
    }

    const configMatch = path.match(new RegExp(`^${API_BASE}/alertconfig/([^/]+)$`))
    if (configMatch) {
      const name = decodeURIComponent(configMatch[1])
      const key = `alertconfig/${name}`

      if (method === "GET") {
        const config = state.configs.get(name)
        if (!config) return sendJson(res, 404, { error: `Alertmanager config ${name} not found` })
        res.setHeader("ETag", state.etags.get(key) ?? nextETag())
        return sendJson(res, 200, config)
      }

      if (method === "PUT") {
        const conflict = checkIfMatch(state, key, req)
        if (conflict) return sendJson(res, 412, { error: conflict })
        const body = JSON.parse((await readBody(req)).toString("utf8")) as AlertConfig
        if (!body?.route) {
          return sendJson(res, 400, { error: "Invalid request body: route is required" })
        }
        state.configs.set(name, body)
        const etag = nextETag()
        state.etags.set(key, etag)
        res.setHeader("ETag", etag)
        return sendJson(res, 200, { message: `Updated alertmanager config ${name}` })
      }
    }

    return sendJson(res, 404, { error: `No mock route for ${method} ${path}` })
  }
}
