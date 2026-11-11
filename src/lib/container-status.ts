/** A container restarted within this window is flagged red in the pod list. */
export const RECENT_RESTART_WINDOW_MS = 5 * 60 * 1000

/**
 * - completed: terminated successfully (gray)
 * - healthy: running and ready (green)
 * - unhealthy: running but not ready, or stuck waiting (orange)
 * - restarted: restarted/failed recently or crash looping (red)
 */
export type ContainerTone = "completed" | "healthy" | "unhealthy" | "restarted"

export interface ContainerStatusSummary {
  name: string
  tone: ContainerTone
  stateLabel: string
  reason?: string
  message?: string
  restartCount: number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
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

function latestRestartTime(
  container: Record<string, unknown>,
  state: Record<string, unknown>,
): number | undefined {
  const running = asRecord(state.running)
  const lastTerminated = asRecord(asRecord(container.lastState)?.terminated)

  const timestamps = [
    asString(running?.startedAt),
    asString(lastTerminated?.finishedAt),
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value))

  return timestamps.length > 0 ? Math.max(...timestamps) : undefined
}

function summariseContainer(
  container: Record<string, unknown>,
  now: number,
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
      name,
      restartCount,
      reason,
      message: asString(terminated.message),
      tone: completed ? "completed" : "restarted",
      stateLabel: completed
        ? "Completed"
        : reason
          ? `Terminated: ${reason}`
          : `Exited with code ${exitCode ?? "unknown"}`,
    }
  }

  if (waiting) {
    const reason = asString(waiting.reason)
    // Crash loops are effectively repeated recent restarts.
    const crashLooping = reason === "CrashLoopBackOff" || reason === "Error"

    return {
      name,
      restartCount,
      reason,
      message: asString(waiting.message),
      tone: crashLooping ? "restarted" : "unhealthy",
      stateLabel: reason ? `Waiting: ${reason}` : "Waiting",
    }
  }

  if (running) {
    const restartedAt = restartCount > 0 ? latestRestartTime(container, state) : undefined
    const restartedRecently =
      restartedAt !== undefined &&
      now - restartedAt >= 0 &&
      now - restartedAt <= RECENT_RESTART_WINDOW_MS

    if (restartedRecently) {
      return {
        name,
        restartCount,
        tone: "restarted",
        stateLabel: `Restarted ${formatAgo(restartedAt, now)}`,
      }
    }

    if (container.ready === false) {
      return {
        name,
        restartCount,
        tone: "unhealthy",
        stateLabel: "Running (not ready)",
      }
    }

    return {
      name,
      restartCount,
      tone: "healthy",
      stateLabel: "Running",
    }
  }

  return {
    name,
    restartCount,
    tone: "unhealthy",
    stateLabel: "Unknown",
  }
}

/**
 * Builds one square per (non-init) container in the pod. Falls back to the pod
 * spec while container statuses are still being reported.
 */
export function getContainerStatusSummaries(
  pod: Record<string, unknown>,
  now = Date.now(),
): ContainerStatusSummary[] {
  const status = asRecord(pod.status)
  const rawStatuses = status?.containerStatuses

  if (Array.isArray(rawStatuses) && rawStatuses.length > 0) {
    return rawStatuses
      .map(asRecord)
      .filter((container): container is Record<string, unknown> => Boolean(container))
      .map((container) => summariseContainer(container, now))
  }

  const spec = asRecord(pod.spec)
  const rawContainers = spec?.containers

  if (!Array.isArray(rawContainers)) return []

  return rawContainers
    .map(asRecord)
    .filter((container): container is Record<string, unknown> => Boolean(container))
    .map((container) => ({
      name: asString(container.name) ?? "container",
      tone: "unhealthy" as const,
      restartCount: 0,
      reason: "Pending",
      stateLabel: "Waiting for container status",
    }))
}
