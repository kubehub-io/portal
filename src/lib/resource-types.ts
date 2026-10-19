import type { APIDiscoveryResult } from "@/lib/api/k8s-client"

/** A resource *type* served by the cluster API server — not an instance. */
export interface ResourceTypeEntry {
  /** Stable identity: `core/v1/Pod`, `apps/v1/Deployment`, ... */
  key: string
  group: string
  version: string
  kind: string
  plural: string
  namespaced: boolean
}

export const CORE_GROUP = "core"

export function resourceTypeKey(group: string, version: string, kind: string): string {
  return `${group || CORE_GROUP}/${version}/${kind}`
}

export function resourceTypeGroupLabel(group: string): string {
  return group || CORE_GROUP
}

export function parseResourceTypeKey(key: string): {
  group: string
  version: string
  kind: string
} | null {
  const parts = key.split("/")
  if (parts.length !== 3 || parts.some((p) => !p)) return null
  const [group, version, kind] = parts
  return { group: group === CORE_GROUP ? "" : group, version, kind }
}

export function buildResourceTypes(discovery?: APIDiscoveryResult): ResourceTypeEntry[] {
  if (!discovery) return []
  const types: ResourceTypeEntry[] = []
  const seen = new Set<string>()

  for (const group of discovery.groups) {
    if (!group.resources) continue
    const version = group.preferredVersion?.version ?? group.versions?.[0]?.version
    if (!version) continue

    for (const resource of group.resources) {
      // Subresources (pods/log, deployments/scale) are not browsable on their own.
      if (!resource.name || resource.name.includes("/")) continue
      const key = resourceTypeKey(group.name, version, resource.kind)
      if (seen.has(key)) continue
      seen.add(key)
      types.push({
        key,
        group: group.name,
        version,
        kind: resource.kind,
        plural: resource.name,
        namespaced: resource.namespaced,
      })
    }
  }

  types.sort((a, b) => a.key.localeCompare(b.key))
  return types
}

export function matchesResourceTypeQuery(entry: ResourceTypeEntry, query: string): boolean {
  if (!query) return true
  return (
    entry.kind.toLowerCase().includes(query) ||
    entry.plural.toLowerCase().includes(query) ||
    entry.group.toLowerCase().includes(query) ||
    entry.key.toLowerCase().includes(query)
  )
}