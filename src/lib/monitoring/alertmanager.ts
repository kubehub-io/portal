import type {
  AlertmanagerConfig,
  AlertmanagerReceiver,
  AlertmanagerRoute,
} from "@/lib/api/monitoring"
import { isDuration } from "@/lib/monitoring/duration"

export type ReceiverType = "msteams" | "telegram" | "email" | "webhook"

export const RECEIVER_TYPES: { id: ReceiverType; label: string; description: string }[] = [
  {
    id: "msteams",
    label: "MS Teams",
    description: "Post alerts into a Microsoft Teams channel through an incoming webhook",
  },
  {
    id: "telegram",
    label: "Telegram",
    description: "Send alerts to a Telegram chat through a bot",
  },
  {
    id: "email",
    label: "Email",
    description: "Send alerts by email",
  },
  {
    id: "webhook",
    label: "Webhook",
    description: "Post alerts to an arbitrary HTTP endpoint",
  },
]

export type ReceiverConfigKey =
  | "msteams_configs"
  | "telegram_configs"
  | "email_configs"
  | "webhook_configs"

export const RECEIVER_CONFIG_KEY: Record<ReceiverType, ReceiverConfigKey> = {
  msteams: "msteams_configs",
  telegram: "telegram_configs",
  email: "email_configs",
  webhook: "webhook_configs",
}

export function receiverTypeLabel(type: ReceiverType): string {
  return RECEIVER_TYPES.find((t) => t.id === type)?.label ?? type
}

export function isReceiverType(value: unknown): value is ReceiverType {
  return RECEIVER_TYPES.some((t) => t.id === value)
}

/** Every receiver type that is actually configured on this receiver. */
export function receiverTypes(receiver: AlertmanagerReceiver): ReceiverType[] {
  return RECEIVER_TYPES.filter((t) => (receiver[RECEIVER_CONFIG_KEY[t.id]]?.length ?? 0) > 0).map((t) => t.id)
}

export function primaryReceiverType(receiver: AlertmanagerReceiver): ReceiverType | undefined {
  return receiverTypes(receiver)[0]
}

export function getReceiverConfigs<T>(receiver: AlertmanagerReceiver, type: ReceiverType): T[] {
  return (receiver[RECEIVER_CONFIG_KEY[type]] as T[] | undefined) ?? []
}

export function withReceiverConfigs<T>(
  receiver: AlertmanagerReceiver,
  type: ReceiverType,
  configs: T[],
): AlertmanagerReceiver {
  return { ...receiver, [RECEIVER_CONFIG_KEY[type]]: configs }
}

/** A receiver holding a single, empty config of the given type. */
export function emptyReceiver(type: ReceiverType, name: string): AlertmanagerReceiver {
  return withReceiverConfigs({ name }, type, [{}])
}

export function uniqueReceiverName(receivers: AlertmanagerReceiver[]): string {
  const taken = new Set(receivers.map((r) => r.name))
  let n = receivers.length + 1
  let candidate = `receiver-${n}`
  while (taken.has(candidate)) {
    n += 1
    candidate = `receiver-${n}`
  }
  return candidate
}

export function parseGroupBy(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
}

export function formatGroupBy(groupBy?: string[]): string {
  return (groupBy ?? []).join(", ")
}

export const DEFAULT_ROUTE: AlertmanagerRoute = {
  receiver: "",
  group_by: ["alertname"],
  group_wait: "30s",
  group_interval: "5m",
  repeat_interval: "4h",
}

export function normalizeRoute(route?: AlertmanagerRoute): AlertmanagerRoute {
  return { ...DEFAULT_ROUTE, ...(route ?? {}) }
}

export function normalizeConfig(config?: AlertmanagerConfig): AlertmanagerConfig {
  const receivers = (config?.receivers ?? []).map((r) => ({ ...r }))
  const route = normalizeRoute(config?.route)
  // A route pointing at a receiver that no longer exists would be rejected by the
  // API, so fall back to the first receiver when it dangles.
  if (route.receiver && !receivers.some((r) => r.name === route.receiver) && receivers.length > 0) {
    route.receiver = receivers[0].name
  }
  return { route, receivers }
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}

function compact<T extends Record<string, unknown>>(config: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (isEmptyValue(value)) continue
    if (key === "max_alerts" && typeof value === "number" && Number.isNaN(value)) continue
    out[key] = value
  }
  return out as T
}

/** Strip empty fields and empty receivers so the PUT payload matches the schema. */
export function sanitizeConfig(config: AlertmanagerConfig): AlertmanagerConfig {
  const receivers = (config.receivers ?? [])
    .map((receiver) => {
      const next: AlertmanagerReceiver = { ...receiver }
      for (const type of RECEIVER_TYPES) {
        const key = RECEIVER_CONFIG_KEY[type.id]
        const configs = getReceiverConfigs<Record<string, unknown>>(receiver, type.id)
        if (configs.length > 0) {
          next[key] = configs.map(compact) as never
        } else {
          delete next[key]
        }
      }
      return next
    })
    .filter((receiver) => receiverTypes(receiver).length > 0)
    .map((receiver) => ({ ...receiver, name: receiver.name?.trim() }))

  const route = normalizeRoute(config.route)
  if (typeof route.receiver === "string") route.receiver = route.receiver.trim()
  if (isEmptyValue(route.receiver)) delete route.receiver
  if (!route.group_by || route.group_by.length === 0) delete route.group_by

  return { route, receivers }
}

export type ConfigErrors = Record<string, string>

export function validateConfig(config: AlertmanagerConfig): ConfigErrors {
  const errors: ConfigErrors = {}
  const receivers = config.receivers ?? []

  const names = new Set<string>()
  receivers.forEach((receiver, index) => {
    const key = `receivers.${index}.name`
    const name = receiver.name?.trim() ?? ""
    if (!name) {
      errors[key] = "Name is required"
    } else if (names.has(name)) {
      errors[key] = "Name must be unique"
    } else {
      names.add(name)
    }

    const types = receiverTypes(receiver)
    if (types.length === 0) {
      errors[`receivers.${index}.type`] = "Configure at least one receiver type"
    }

    types.forEach((type) => {
      getReceiverConfigs<Record<string, unknown>>(receiver, type).forEach((entry, entryIndex) => {
        const base = `receivers.${index}.${type}.${entryIndex}`
        switch (type) {
          case "msteams":
            if (!isHttpUrl(entry.webhook_url as string)) {
              errors[`${base}.webhook_url`] = "A valid https webhook URL is required"
            }
            break
          case "telegram":
            if (!entry.bot_token) {
              errors[`${base}.bot_token`] = "Bot token is required"
            }
            if (typeof entry.chat_id !== "number" || !Number.isInteger(entry.chat_id)) {
              errors[`${base}.chat_id`] = "Chat ID is required"
            }
            break
          case "email": {
            const to = (entry.to as string) ?? ""
            if (!isEmail(to)) {
              errors[`${base}.to`] = "A valid email address is required"
            }
            break
          }
          case "webhook":
            if (!isHttpUrl(entry.url as string)) {
              errors[`${base}.url`] = "A valid http(s) URL is required"
            }
            if (typeof entry.max_alerts === "number" && entry.max_alerts < 0) {
              errors[`${base}.max_alerts`] = "Must be 0 or greater"
            }
            break
        }
      })
    })
  })

  if (receivers.length === 0) {
    errors.receivers = "Add at least one receiver"
  }

  const routeReceiver = config.route?.receiver
  if (routeReceiver && !receivers.some((r) => r.name === routeReceiver)) {
    errors["route.receiver"] = "Route must point at an existing receiver"
  }

  for (const [field, value] of [
    ["group_wait", config.route?.group_wait],
    ["group_interval", config.route?.group_interval],
    ["repeat_interval", config.route?.repeat_interval],
  ] as const) {
    if (value && !isDuration(value)) {
      errors[`route.${field}`] = "Use a duration such as 30s, 5m or 1h30m"
    }
  }

  return errors
}

export function isHttpUrl(value?: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
