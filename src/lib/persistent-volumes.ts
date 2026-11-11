export type PvcDeletionAction = "delete" | "retain" | "unbound" | "unknown"

export interface PvcDeletionImpact {
  /** What happens to the underlying disk when the claim is deleted. */
  action: PvcDeletionAction
  policy?: string
  volumeName?: string
}

export interface PvcClaimRef {
  namespace?: string
  name?: string
}

export interface PvMount {
  namespace: string
  pod: string
  node?: string
  phase?: string
}

export type PvMountState = "mounted" | "not-mounted" | "unbound"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function resourceName(item: Record<string, unknown>): string | undefined {
  return asString(asRecord(item.metadata)?.name)
}

export function getPvcVolumeName(claim: Record<string, unknown>): string | undefined {
  return asString(asRecord(claim.spec)?.volumeName)
}

export function getPvReclaimPolicy(volume: Record<string, unknown>): string | undefined {
  return asString(asRecord(volume.spec)?.persistentVolumeReclaimPolicy)
}

export function getPvClaimRef(volume: Record<string, unknown>): PvcClaimRef | undefined {
  const claimRef = asRecord(asRecord(volume.spec)?.claimRef)
  if (!claimRef) return undefined

  const namespace = asString(claimRef.namespace)
  const name = asString(claimRef.name)
  if (!namespace && !name) return undefined
  return { namespace, name }
}

/** Finds the PersistentVolume backing a claim, by volumeName then claimRef. */
export function findPvForPvc(
  claim: Record<string, unknown>,
  volumes: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  const volumeName = getPvcVolumeName(claim)
  if (volumeName) {
    const byName = volumes.find((volume) => resourceName(volume) === volumeName)
    if (byName) return byName
  }

  const meta = asRecord(claim.metadata)
  const namespace = asString(meta?.namespace)
  const name = asString(meta?.name)
  if (!name) return undefined

  return volumes.find((volume) => {
    const claimRef = getPvClaimRef(volume)
    return claimRef?.name === name && claimRef.namespace === namespace
  })
}

function podUsesClaim(pod: Record<string, unknown>, namespace: string, claimName: string): boolean {
  const meta = asRecord(pod.metadata)
  if (asString(meta?.namespace) !== namespace) return false

  const volumes = asRecord(pod.spec)?.volumes
  if (!Array.isArray(volumes)) return false

  return volumes.some((volume) => {
    const claim = asRecord(asRecord(volume)?.persistentVolumeClaim)
    return asString(claim?.claimName) === claimName
  })
}

/**
 * Pods actively mounting the volume behind a PV. Terminal pods are ignored so a
 * finished Job does not make the disk look mounted.
 */
export function getPvMounts(
  volume: Record<string, unknown>,
  pods: Record<string, unknown>[],
): PvMount[] {
  const claimRef = getPvClaimRef(volume)
  if (!claimRef?.name || !claimRef.namespace) return []

  const mounts: PvMount[] = []

  for (const pod of pods) {
    if (!podUsesClaim(pod, claimRef.namespace, claimRef.name)) continue

    const phase = asString(asRecord(pod.status)?.phase)
    if (phase === "Succeeded" || phase === "Failed") continue

    const meta = asRecord(pod.metadata)
    const name = asString(meta?.name)
    if (!name) continue

    mounts.push({
      namespace: claimRef.namespace,
      pod: name,
      node: asString(asRecord(pod.spec)?.nodeName),
      phase,
    })
  }

  return mounts
}

export function getPvMountState(
  volume: Record<string, unknown>,
  pods: Record<string, unknown>[],
): PvMountState {
  if (!getPvClaimRef(volume)?.name) return "unbound"
  return getPvMounts(volume, pods).length > 0 ? "mounted" : "not-mounted"
}

export function getPvcDeletionImpact(
  claim: Record<string, unknown>,
  volumes: Record<string, unknown>[],
): PvcDeletionImpact {
  const volumeName = getPvcVolumeName(claim)
  const volume = findPvForPvc(claim, volumes)

  if (!volume) {
    return volumeName ? { action: "unknown", volumeName } : { action: "unbound" }
  }

  const policy = getPvReclaimPolicy(volume)
  const boundVolumeName = resourceName(volume) ?? volumeName
  const normalized = policy?.toLowerCase()

  if (normalized === "delete") {
    return { action: "delete", policy, volumeName: boundVolumeName }
  }
  if (normalized === "retain") {
    return { action: "retain", policy, volumeName: boundVolumeName }
  }
  return { action: "unknown", policy, volumeName: boundVolumeName }
}
