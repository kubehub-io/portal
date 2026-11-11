/** Conditions shown for Gateway API routes, in display order. */
export const HTTP_ROUTE_CONDITION_TYPES = ["Accepted", "ResolvedRefs"] as const

export interface HttpRouteRuleLine {
  match: string
  backend: string
}

export interface HttpRouteCondition {
  type: string
  status: string
  reason?: string
  message?: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** Gateway API uses the all-caps `HTTPRoute` kind. */
export function isHttpRouteKind(kind: string): boolean {
  return kind.toLowerCase() === "httproute"
}

function formatMatch(match: unknown): string {
  const path = asRecord(asRecord(match)?.path)
  return asString(path?.value) ?? "/"
}

function formatBackend(ref: unknown): string {
  const backend = asRecord(ref)
  if (!backend) return "-"
  const name = asString(backend.name) ?? "-"
  const port = backend.port
  return port === undefined || port === null ? name : `${name}:${String(port)}`
}

/**
 * Flattens an HTTPRoute's rules into `path => backend:port` lines, matching the
 * mapping shown on the HubHttpRoute page.
 */
export function getHttpRouteRuleLines(item: Record<string, unknown>): HttpRouteRuleLine[] {
  const rules = asRecord(item.spec)?.rules
  if (!Array.isArray(rules)) return []

  const lines: HttpRouteRuleLine[] = []

  for (const rawRule of rules) {
    const rule = asRecord(rawRule)
    if (!rule) continue

    const matches = Array.isArray(rule.matches) && rule.matches.length > 0 ? rule.matches : [{}]
    const backends = Array.isArray(rule.backendRefs) ? rule.backendRefs : []

    for (const match of matches) {
      const matchLabel = formatMatch(match)
      if (backends.length === 0) {
        lines.push({ match: matchLabel, backend: "-" })
        continue
      }
      for (const backend of backends) {
        lines.push({ match: matchLabel, backend: formatBackend(backend) })
      }
    }
  }

  return lines
}

function collectRouteConditions(item: Record<string, unknown>): Record<string, unknown>[] {
  const status = asRecord(item.status)
  if (!status) return []

  const conditions: Record<string, unknown>[] = []

  // Gateway API HTTPRoute: status.parents[].conditions[]
  if (Array.isArray(status.parents)) {
    for (const parent of status.parents) {
      const parentConditions = asRecord(parent)?.conditions
      if (!Array.isArray(parentConditions)) continue
      for (const condition of parentConditions) {
        const record = asRecord(condition)
        if (record) conditions.push(record)
      }
    }
  }

  // HubHttpRoute: flat status.conditions[]
  if (Array.isArray(status.conditions)) {
    for (const condition of status.conditions) {
      const record = asRecord(condition)
      if (record) conditions.push(record)
    }
  }

  return conditions
}

const STATUS_RANK: Record<string, number> = { False: 0, Unknown: 1, True: 2 }

/**
 * Collects the requested condition types across all route parents. When parents
 * disagree, the worst status wins so a broken parent is never hidden.
 */
export function getHttpRouteConditions(
  item: Record<string, unknown>,
  types: readonly string[] = HTTP_ROUTE_CONDITION_TYPES,
): HttpRouteCondition[] {
  const wanted = new Set(types)
  const byType = new Map<string, HttpRouteCondition>()

  for (const condition of collectRouteConditions(item)) {
    const type = asString(condition.type)
    const status = asString(condition.status)
    if (!type || !status || !wanted.has(type)) continue

    const next: HttpRouteCondition = {
      type,
      status,
      reason: asString(condition.reason),
      message: asString(condition.message),
    }
    const existing = byType.get(type)
    const nextRank = STATUS_RANK[status] ?? STATUS_RANK.Unknown
    const existingRank = existing ? (STATUS_RANK[existing.status] ?? STATUS_RANK.Unknown) : Infinity
    if (!existing || nextRank < existingRank) byType.set(type, next)
  }

  return types.flatMap((type) => {
    const condition = byType.get(type)
    return condition ? [condition] : []
  })
}
