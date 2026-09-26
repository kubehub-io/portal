import { authFetch, readETag } from "@/lib/api/http"

/** Server URL declared by swagger/monitoring-v202608.yaml. */
const API_BASE = "/apis/monitoring-v202609"

// ── Alerts ───────────────────────────────────────────────

/**
 * An alert as returned by `GET /alerts`. The spec leaves the item schema open
 * (`additionalProperties: true`), so this mirrors the Alertmanager v2 payload
 * the API forwards, plus the merged-in `region` of the monitoring underlay.
 * The legacy `state`/`activeAt` fields are kept as fallbacks.
 */
export interface Alert {
  labels?: Record<string, string>
  annotations?: Record<string, string>
  status?: {
    /** active | suppressed | unprocessed */
    state?: string
    silencedBy?: string[]
    inhibitedBy?: string[]
    mutedBy?: string[]
  }
  startsAt?: string
  endsAt?: string
  updatedAt?: string
  generatorURL?: string
  fingerprint?: string
  receivers?: { name?: string }[]
  /** legacy top-level state, used when status.state is absent */
  state?: string
  /** legacy start timestamp, used when startsAt is absent */
  activeAt?: string
  value?: string
  /** monitoring underlay region this alert came from */
  region?: string
  [key: string]: unknown
}

export type AlertSeverity = "critical" | "warning" | "info" | "none"

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  none: 0,
  info: 1,
  warning: 2,
  critical: 3,
}

export const ALERT_SEVERITIES: AlertSeverity[] = ["critical", "warning", "info", "none"]

export function getAlertSeverity(alert: Alert): AlertSeverity {
  const raw = (alert.labels?.severity ?? "none").trim().toLowerCase()
  if (raw in SEVERITY_ORDER) return raw as AlertSeverity
  // Treat page/p1 style severities as critical, everything informational as info.
  if (raw.startsWith("page") || raw.startsWith("p1")) return "critical"
  if (raw.startsWith("p2") || raw.startsWith("p3")) return "warning"
  return "none"
}

export function highestSeverity(alerts: Alert[]): AlertSeverity {
  return alerts.reduce<AlertSeverity>(
    (highest, alert) => {
      const severity = getAlertSeverity(alert)
      return SEVERITY_ORDER[severity] > SEVERITY_ORDER[highest] ? severity : highest
    },
    "none",
  )
}

export function alertName(alert: Alert): string {
  return alert.labels?.alertname ?? alert.annotations?.summary ?? "Unknown alert"
}

export function countBySeverity(alerts: Alert[]): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = { critical: 0, warning: 0, info: 0, none: 0 }
  for (const alert of alerts) counts[getAlertSeverity(alert)] += 1
  return counts
}

/** Raw lifecycle state, preferring `status.state` over the legacy top-level field. */
export function alertState(alert: Alert): string {
  return (alert.status?.state ?? alert.state ?? "").trim().toLowerCase()
}

/** When the alert started firing. */
export function alertStartsAt(alert: Alert): string | undefined {
  return alert.startsAt ?? alert.activeAt
}

/** When the alert stopped firing, if it already resolved. */
export function alertEndsAt(alert: Alert): string | undefined {
  if (!alert.endsAt) return undefined
  return alert.endsAt
}

/**
 * Whether the alert is still firing: not suppressed/unprocessed and not already
 * past its end time.
 */
export function isAlertActive(alert: Alert, now = Date.now()): boolean {
  const state = alertState(alert)
  if (state && state !== "active") return false
  const endsAt = alertEndsAt(alert)
  if (endsAt) {
    const ended = new Date(endsAt).getTime()
    if (!Number.isNaN(ended) && ended <= now) return false
  }
  return true
}

/** The most specific entity label available for an alert. */
export function alertEntity(alert: Alert): string | undefined {
  const labels = alert.labels
  if (!labels) return undefined
  return labels.instance ?? labels.pod ?? labels.node ?? labels.container ?? labels.job
}

/** How long the alert has been firing, as a human readable string. */
export function formatAlertAge(alert: Alert, now = Date.now()): string {
  const startsAt = alertStartsAt(alert)
  if (!startsAt) return "-"
  const started = new Date(startsAt).getTime()
  if (Number.isNaN(started)) return startsAt
  const ms = now - started
  if (ms < 0) return "just now"
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export interface AlertsQuery {
  /** forwarded verbatim to every monitoring underlay */
  filter?: string[]
  receiver?: string[]
  silenced?: boolean
  active?: boolean
  inhibited?: boolean
  unprocessed?: boolean
  matcher?: string[]
  skipError?: boolean
}

function buildAlertQuery(params?: AlertsQuery): string {
  if (!params) return ""
  const search = new URLSearchParams()
  for (const filter of params.filter ?? []) search.append("filter", filter)
  for (const receiver of params.receiver ?? []) search.append("receiver", receiver)
  for (const matcher of params.matcher ?? []) search.append("matcher[]", matcher)
  if (params.silenced !== undefined) search.set("silenced", String(params.silenced))
  if (params.active !== undefined) search.set("active", String(params.active))
  if (params.inhibited !== undefined) search.set("inhibited", String(params.inhibited))
  if (params.unprocessed !== undefined) search.set("unprocessed", String(params.unprocessed))
  if (params.skipError !== undefined) search.set("skipError", String(params.skipError))
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export async function listAlerts(params?: AlertsQuery): Promise<Alert[]> {
  const res = await authFetch(`${API_BASE}/alerts${buildAlertQuery(params)}`)
  const data = (await res.json()) as Alert[] | { alerts?: Alert[] }
  return Array.isArray(data) ? data : (data.alerts ?? [])
}

// ── Rules ────────────────────────────────────────────────

export interface MonitoringRule {
  /** alert name; recording rules leave this empty and only carry an expr */
  alert?: string
  expr?: string
  /** pending duration, Prometheus duration syntax (e.g. "5m") */
  for?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface RuleGroup {
  name?: string
  /** evaluation interval, Prometheus duration syntax (e.g. "30s") */
  interval?: string
  rules?: MonitoringRule[]
}

export interface CreateRuleRequest {
  name?: string
  groups?: RuleGroup[]
}

export interface NamespaceRules {
  namespace: string
  groups: RuleGroup[]
}

export interface EtagResult<T> {
  data: T
  etag?: string
}

export async function listRuleNamespaces(): Promise<EtagResult<NamespaceRules[]>> {
  const res = await authFetch(`${API_BASE}/rules`)
  const data = (await res.json()) as NamespaceRules[] | { items?: NamespaceRules[] }
  return {
    data: Array.isArray(data) ? data : (data.items ?? []),
    etag: readETag(res),
  }
}

export async function getRules(namespace: string): Promise<EtagResult<CreateRuleRequest>> {
  const res = await authFetch(`${API_BASE}/rules/${encodeURIComponent(namespace)}`)
  return { data: (await res.json()) as CreateRuleRequest, etag: readETag(res) }
}

export async function putRules(
  namespace: string,
  req: CreateRuleRequest,
  etag?: string,
): Promise<EtagResult<{ message?: string }>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (etag) headers["If-Match"] = etag
  const res = await authFetch(`${API_BASE}/rules/${encodeURIComponent(namespace)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(req),
  })
  const text = await res.text()
  let body: { message?: string } = {}
  try {
    body = text ? (JSON.parse(text) as { message?: string }) : {}
  } catch {
    body = {}
  }
  return { data: body, etag: readETag(res) }
}

export async function deleteRules(namespace: string, etag?: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (etag) headers["If-Match"] = etag
  await authFetch(`${API_BASE}/rules/${encodeURIComponent(namespace)}`, {
    method: "DELETE",
    headers,
  })
}

// ── Alertmanager configuration ───────────────────────────

/**
 * The API models alertmanager configurations as a collection but only exposes the
 * single well-known `default` configuration, so that is all the UI can list.
 */
export const ALERTMANAGER_CONFIG_NAMES = ["default"] as const
export type AlertmanagerConfigName = (typeof ALERTMANAGER_CONFIG_NAMES)[number]
export const DEFAULT_ALERTMANAGER_CONFIG: AlertmanagerConfigName = "default"

export interface TelegramConfig {
  bot_token?: string
  chat_id?: number
  disable_notifications?: boolean
  send_resolved?: boolean
}

export interface EmailConfig {
  to?: string
  require_tls?: boolean
  send_resolved?: boolean
}

export interface MSTeamsConfig {
  webhook_url?: string
  send_resolved?: boolean
}

export interface WebhookConfig {
  url?: string
  max_alerts?: number
  send_resolved?: boolean
}

export interface AlertmanagerRoute {
  receiver?: string
  group_by?: string[]
  group_wait?: string
  group_interval?: string
  repeat_interval?: string
  routes?: AlertmanagerRoute[]
}

export interface AlertmanagerReceiver {
  name?: string
  telegram_configs?: TelegramConfig[]
  email_configs?: EmailConfig[]
  msteams_configs?: MSTeamsConfig[]
  webhook_configs?: WebhookConfig[]
}

export interface AlertmanagerConfig {
  route: AlertmanagerRoute
  receivers?: AlertmanagerReceiver[]
}

export function listAlertmanagerConfigNames(): AlertmanagerConfigName[] {
  return [...ALERTMANAGER_CONFIG_NAMES]
}

export async function getAlertmanagerConfig(name: string): Promise<EtagResult<AlertmanagerConfig>> {
  const res = await authFetch(`${API_BASE}/alertconfig/${encodeURIComponent(name)}`)
  return { data: (await res.json()) as AlertmanagerConfig, etag: readETag(res) }
}

export async function putAlertmanagerConfig(
  name: string,
  config: AlertmanagerConfig,
  etag?: string,
): Promise<EtagResult<{ message?: string }>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (etag) headers["If-Match"] = etag
  const res = await authFetch(`${API_BASE}/alertconfig/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(config),
  })
  const text = await res.text()
  let body: { message?: string } = {}
  try {
    body = text ? (JSON.parse(text) as { message?: string }) : {}
  } catch {
    body = {}
  }
  return { data: body, etag: readETag(res) }
}
