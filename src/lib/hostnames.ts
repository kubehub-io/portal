const GATEWAY_API_GROUP = "gateway.networking.k8s.io"
const KUBEHUB_GATEWAY_GROUP = "gateway.kubehub.io"

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const DNS_TLD = /^[a-z]{2,63}$/i

/**
 * Normalizes a hostname list from a Kubernetes object. Accepts arrays as well as
 * a single string and removes blanks/duplicates while preserving order.
 */
export function normaliseHostnames(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: string[] = []

  for (const candidate of values) {
    if (typeof candidate !== "string") continue
    const name = candidate.trim().replace(/\.$/, "")
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }

  return result
}

export function isWildcardHostname(name: string): boolean {
  return name.trim().startsWith("*.")
}

/**
 * Only concrete DNS names get an https link. Wildcards (`*.example.com`) and IP
 * addresses are shown as plain text.
 */
export function isLinkableHostname(name: string): boolean {
  const value = name.trim().replace(/\.$/, "").toLowerCase()
  if (!value || isWildcardHostname(value)) return false

  const labels = value.split(".")
  if (labels.length < 2) return false
  if (!DNS_TLD.test(labels[labels.length - 1])) return false
  return labels.every((label) => DNS_LABEL.test(label))
}

function readListenerHostnames(item: Record<string, unknown>): string[] {
  const listeners = (item.spec as { listeners?: Array<{ hostname?: unknown }> } | undefined)?.listeners
  if (!Array.isArray(listeners)) return []
  return normaliseHostnames(listeners.map((listener) => listener?.hostname))
}

export interface HostnameColumn {
  /** Matches the printer-column JSONPath when one exists, so it is not duplicated. */
  key: string
  label: string
  width: string
  read: (item: Record<string, unknown>) => string[]
}

/**
 * Resource kinds that expose user-facing hostnames/DNS names in a field the CRD
 * printer columns do not render as links.
 */
export function hostnameColumnFor(group: string, kind: string): HostnameColumn | null {
  if (group === KUBEHUB_GATEWAY_GROUP && kind === "HubGatewayProfile") {
    return {
      key: "status.dnsNames",
      label: "DNS Names",
      width: "18rem",
      read: (item) =>
        normaliseHostnames((item.status as { dnsNames?: unknown } | undefined)?.dnsNames),
    }
  }

  if (group !== GATEWAY_API_GROUP) return null

  if (kind === "Gateway" || kind === "ListenerSet") {
    return {
      key: "__listenerHostnames",
      label: "Hostnames",
      width: "18rem",
      read: readListenerHostnames,
    }
  }

  if (kind === "HttpRoute") {
    return {
      key: "spec.hostnames",
      label: "Hostnames",
      width: "22rem",
      read: (item) =>
        normaliseHostnames((item.spec as { hostnames?: unknown } | undefined)?.hostnames),
    }
  }

  return null
}
