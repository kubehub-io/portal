import type { CreateRuleRequest, MonitoringRule, NamespaceRules, RuleGroup } from "@/lib/api/monitoring"
import { isDuration } from "@/lib/monitoring/duration"

const ALERT_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export type KeyValueRow = { key: string; value: string }

export type RulesErrors = Record<string, string>

/**
 * Editing drafts carry a client side id so list items keep their identity (and
 * their local editor state) while rules are added, removed or reordered. The ids
 * are stripped again by draftToRequest before the payload is sent.
 */
export interface DraftRule extends MonitoringRule {
  id: string
}

export interface DraftGroup extends Omit<RuleGroup, "rules"> {
  rules: DraftRule[]
}

export interface DraftRequest {
  name?: string
  groups: DraftGroup[]
}

let idCounter = 0

function nextId(): string {
  idCounter += 1
  return `rule-${idCounter}`
}

export function draftRule(rule: MonitoringRule = {}): DraftRule {
  return {
    ...rule,
    id: nextId(),
    labels: { ...(rule.labels ?? {}) },
    annotations: { ...(rule.annotations ?? {}) },
  }
}

export function draftGroup(group: RuleGroup = {}): DraftGroup {
  return {
    ...group,
    rules: (group.rules ?? []).map((rule) => draftRule(rule)),
  }
}

export function toDraft(req?: CreateRuleRequest): DraftRequest {
  return {
    name: req?.name,
    groups: (req?.groups ?? []).map((group) => draftGroup(group)),
  }
}

/** Drop the client side ids and hand back a payload matching the API schema. */
export function draftToRequest(draft: DraftRequest): CreateRuleRequest {
  return {
    name: draft.name,
    groups: (draft.groups ?? []).map((group) => ({
      ...(group.name ? { name: group.name } : {}),
      ...(group.interval ? { interval: group.interval } : {}),
      rules: (group.rules ?? []).map((rule) => ({
        ...(rule.alert ? { alert: rule.alert } : {}),
        ...(rule.expr ? { expr: rule.expr } : {}),
        ...(rule.for ? { for: rule.for } : {}),
        ...(rule.labels && Object.keys(rule.labels).length > 0 ? { labels: rule.labels } : {}),
        ...(rule.annotations && Object.keys(rule.annotations).length > 0
          ? { annotations: rule.annotations }
          : {}),
      })),
    })),
  }
}

export function emptyDraftRule(): DraftRule {
  return draftRule()
}

export function emptyDraftGroup(index: number): DraftGroup {
  return draftGroup({ name: `group-${index}`, interval: "30s", rules: [emptyDraftRule()] })
}

export function toRows(record?: Record<string, string>): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

export function fromRows(rows: KeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    out[key] = row.value
  }
  return out
}

export function countRules(groups?: RuleGroup[]): number {
  return (groups ?? []).reduce((total, group) => total + (group.rules?.length ?? 0), 0)
}

export function alertNames(groups?: RuleGroup[]): string[] {
  const names = new Set<string>()
  for (const group of groups ?? []) {
    for (const rule of group.rules ?? []) {
      if (rule.alert?.trim()) names.add(rule.alert.trim())
    }
  }
  return Array.from(names).sort()
}

export function namespaceSummary(entry: NamespaceRules): { groups: number; rules: number; alerts: string[] } {
  return {
    groups: entry.groups?.length ?? 0,
    rules: countRules(entry.groups),
    alerts: alertNames(entry.groups),
  }
}

const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9_.]*[a-z0-9])?$/

export function isValidNamespace(name: string): boolean {
  return name.length > 0 && name.length <= 253 && NAMESPACE_RE.test(name)
}

export function sanitizeRequest(req: CreateRuleRequest, namespace: string): CreateRuleRequest {
  const groups = (req.groups ?? [])
    .map((group) => ({
      ...(group.name?.trim() ? { name: group.name.trim() } : {}),
      ...(group.interval?.trim() ? { interval: group.interval.trim() } : {}),
      rules: (group.rules ?? [])
        .map((rule) => {
          const alert = rule.alert?.trim()
          const expr = rule.expr?.trim() ?? ""
          return {
            ...(alert ? { alert } : {}),
            ...(expr ? { expr } : {}),
            ...(rule.for?.trim() ? { for: rule.for.trim() } : {}),
            ...(Object.keys(rule.labels ?? {}).length ? { labels: trimRecord(rule.labels ?? {}) } : {}),
            ...(Object.keys(rule.annotations ?? {}).length
              ? { annotations: trimRecord(rule.annotations ?? {}) }
              : {}),
          } as MonitoringRule
        })
        // A rule without an expression can never fire, so drop it rather than
        // letting the API reject the whole namespace.
        .filter((rule) => rule.expr),
    }))
    .filter((group) => group.rules.length > 0)

  return { name: namespace, groups }
}

function trimRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    const trimmed = key.trim()
    if (trimmed) out[trimmed] = value
  }
  return out
}

export function validateRequest(req: CreateRuleRequest): RulesErrors {
  const errors: RulesErrors = {}
  const groups = req.groups ?? []

  if (groups.length === 0) {
    errors.groups = "Add at least one rule group with a rule"
  }

  const alertNamesSeen = new Map<string, string>()

  groups.forEach((group, gi) => {
    const name = group.name?.trim() ?? ""
    if (!name) {
      errors[`groups.${gi}.name`] = "Group name is required"
    }
    if (group.interval?.trim() && !isDuration(group.interval.trim())) {
      errors[`groups.${gi}.interval`] = "Use a duration such as 30s, 5m or 1h30m"
    }
    if ((group.rules?.length ?? 0) === 0) {
      errors[`groups.${gi}.rules`] = "Add at least one rule"
    }

    ;(group.rules ?? []).forEach((rule, ri) => {
      const base = `groups.${gi}.rules.${ri}`
      const alert = rule.alert?.trim() ?? ""
      const expr = rule.expr?.trim() ?? ""

      if (!expr) {
        errors[`${base}.expr`] = "A PromQL expression is required"
      }
      if (alert) {
        if (!ALERT_NAME_RE.test(alert)) {
          errors[`${base}.alert`] = "Use letters, digits and underscores, not starting with a digit"
        } else if (alertNamesSeen.has(alert)) {
          errors[`${base}.alert`] = `Duplicate of ${alertNamesSeen.get(alert)}`
        } else {
          alertNamesSeen.set(alert, `${gi + 1}.${ri + 1}`)
        }
      }
      if (rule.for?.trim() && !isDuration(rule.for.trim())) {
        errors[`${base}.for`] = "Use a duration such as 30s, 5m or 1h30m"
      }

      for (const field of ["labels", "annotations"] as const) {
        const record = rule[field] ?? {}
        const seen = new Set<string>()
        for (const key of Object.keys(record)) {
          const trimmed = key.trim()
          if (!trimmed) {
            errors[`${base}.${field}`] = "Label and annotation names cannot be empty"
            continue
          }
          if (field === "labels" && !LABEL_NAME_RE.test(trimmed)) {
            errors[`${base}.${field}`] = `"${trimmed}" is not a valid label name`
          }
          if (seen.has(trimmed)) {
            errors[`${base}.${field}`] = `Duplicate key "${trimmed}"`
          }
          seen.add(trimmed)
        }
      }
    })
  })

  return errors
}
