/** A container restarted within this window is flagged red in the pod list. */
export const RECENT_RESTART_WINDOW_MS = 5 * 60 * 1000
export type ContainerTone = "completed" | "healthy" | "unhealthy" | "restarted"
export type ContainerRole = "init" | "container"

export interface ContainerStatusSummary {
  name: string
  role: ContainerRole
  tone: ContainerTone
  stateLabel: string
  reason?: string
  message?: string
  restartCount: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function summariseContainer(
  container: Record<string, unknown>,
  now: number,
  role: ContainerRole,
): ContainerStatusSummary {
  const name = asString(container.name) ?? "container"
  const restartCount = Math.max(0, asNumber(container.restartCount) ?? 0)
  const state = asRecord(container.state) ?? {}
  const waiting = asRecord(state.waiting)
  const terminated = asRecord(state.terminated)
  const running = asRecord(state.running)

  if (terminated) {
    const exitCode = asNumber(terminated.exitCode)
    const reason = asString(terminated.reason)
    const completed = exitCode === 0 || reason === "Completed"
    return {
      name, role, restartCount, reason, message: asString(terminated.message),
      tone: completed ? "completed" : "restarted",
      stateLabel: completed ? "Completed" : reason ? `Terminated: ${reason}` : `Exited with code ${exitCode ?? "unknown"}`,
    }
  }
  if (waiting) {
    const reason = asString(waiting.reason)
    const crashLooping = reason === "CrashLoopBackOff" || reason === "Error"
    return {
      name, role, restartCount, reason, message: asString(waiting.message),
      tone: crashLooping ? "restarted" : "unhealthy",
      stateLabel: reason ? `Waiting: ${reason}` : "Waiting",
    }
  }
  if (running) {
    const lastState = asRecord(asRecord(container.lastState)?.terminated)
    const startedAt = asString(asRecord(state.running)?.startedAt)
    const finishedAt = asString(lastState?.finishedAt)
    const restartAt = [startedAt, finishedAt]
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter(Number.isFinite)
      .reduce<number | undefined>((latest, value) => latest === undefined ? value : Math.max(latest, value), undefined)
    const recentlyRestarted = restartCount > 0 && restartAt !== undefined && now - restartAt >= 0 && now - restartAt <= RECENT_RESTART_WINDOW_MS
    if (recentlyRestarted) return { name, role, restartCount, tone: "restarted", stateLabel: `Restarted ${formatAgo(restartAt, now)}` }
    if (container.ready === false) return { name, role, restartCount, tone: "unhealthy", stateLabel: "Running (not ready)" }
    return { name, role, restartCount, tone: "healthy", stateLabel: "Running" }
  }
  return { name, role, restartCount, tone: "unhealthy", stateLabel: "Unknown" }
}

function statusesByName(values: unknown[]): Map<string, Record<string, unknown>> {
  return new Map(
    values.map(asRecord)
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .map((value) => [asString(value.name) ?? "", value]),
  )
}

function buildSummaries(
  specs: unknown[],
  statuses: Map<string, Record<string, unknown>>,
  role: ContainerRole,
  now: number,
): ContainerStatusSummary[] {
  return specs.map(asRecord)
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((spec) => {
      const name = asString(spec.name) ?? "container"
      const status = statuses.get(name)
      return status
        ? summariseContainer({ ...spec, ...status, restartPolicy: spec.restartPolicy }, now, role)
        : { name, role, tone: "unhealthy" as const, restartCount: 0, reason: "Pending", stateLabel: "Waiting for container status" }
    })
}

/** Returns init-container squares first, then regular containers. */
export function getContainerStatusSummaries(pod: Record<string, unknown>, now = Date.now()): ContainerStatusSummary[] {
  const status = asRecord(pod.status)
  const spec = asRecord(pod.spec)
  const initSpecs = Array.isArray(spec?.initContainers) ? spec.initContainers : []
  const regularSpecs = Array.isArray(spec?.containers) ? spec.containers : []
  const initStatuses = Array.isArray(status?.initContainerStatuses) ? status.initContainerStatuses : []
  const regularStatuses = Array.isArray(status?.containerStatuses) ? status.containerStatuses : []
  const init = buildSummaries(initSpecs, statusesByName(initStatuses), "init", now)
  const regular = buildSummaries(regularSpecs, statusesByName(regularStatuses), "container", now)

  // Preserve status entries when the pod response is incomplete during startup.
  if (init.length === 0) init.push(...initStatuses.map(asRecord).filter((v): v is Record<string, unknown> => Boolean(v)).map((v) => summariseContainer(v, now, "init")))
  if (regular.length === 0) regular.push(...regularStatuses.map(asRecord).filter((v): v is Record<string, unknown> => Boolean(v)).map((v) => summariseContainer(v, now, "container")))
  return [...init, ...regular]
}
