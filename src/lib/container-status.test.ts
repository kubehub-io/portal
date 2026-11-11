import { describe, expect, it } from "vitest"
import {
  getContainerStatusSummaries,
  RECENT_RESTART_WINDOW_MS,
} from "@/lib/container-status"

const NOW = Date.parse("2026-01-01T12:00:00.000Z")

function podWith(...containerStatuses: Record<string, unknown>[]) {
  return { status: { containerStatuses } }
}

describe("container status summaries", () => {
  it("marks a successfully terminated container as completed", () => {
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "job",
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 0, reason: "Completed" } },
      }),
      NOW,
    )

    expect(container).toMatchObject({
      name: "job",
      tone: "completed",
      stateLabel: "Completed",
      restartCount: 0,
    })
  })

  it("marks a ready running container as healthy", () => {
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "app",
        ready: true,
        restartCount: 0,
        state: { running: { startedAt: "2026-01-01T11:50:00.000Z" } },
      }),
      NOW,
    )

    expect(container).toMatchObject({ tone: "healthy", stateLabel: "Running" })
  })

  it("marks a running but not ready container as unhealthy", () => {
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "app",
        ready: false,
        restartCount: 0,
        state: { running: { startedAt: "2026-01-01T11:50:00.000Z" } },
      }),
      NOW,
    )

    expect(container).toMatchObject({ tone: "unhealthy", stateLabel: "Running (not ready)" })
  })

  it("marks a container that restarted recently as restarted", () => {
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "app",
        ready: true,
        restartCount: 3,
        state: { running: { startedAt: "2026-01-01T11:59:30.000Z" } },
      }),
      NOW,
    )

    expect(container).toMatchObject({
      tone: "restarted",
      stateLabel: "Restarted 30s ago",
      restartCount: 3,
    })
  })

  it("stays healthy once the restart is older than the window", () => {
    const startedAt = new Date(NOW - RECENT_RESTART_WINDOW_MS - 1000).toISOString()
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "app",
        ready: true,
        restartCount: 3,
        state: { running: { startedAt } },
      }),
      NOW,
    )

    expect(container).toMatchObject({ tone: "healthy", restartCount: 3 })
  })

  it("marks crash loops as restarted and other waiting states as unhealthy", () => {
    const [crashLoop, creating] = getContainerStatusSummaries(
      podWith(
        {
          name: "crashing",
          ready: false,
          restartCount: 7,
          state: { waiting: { reason: "CrashLoopBackOff" } },
        },
        {
          name: "starting",
          ready: false,
          restartCount: 0,
          state: { waiting: { reason: "ContainerCreating" } },
        },
      ),
      NOW,
    )

    expect(crashLoop).toMatchObject({ tone: "restarted", stateLabel: "Waiting: CrashLoopBackOff" })
    expect(creating).toMatchObject({ tone: "unhealthy", stateLabel: "Waiting: ContainerCreating" })
  })

  it("treats a failed termination as restarted", () => {
    const [container] = getContainerStatusSummaries(
      podWith({
        name: "app",
        ready: false,
        restartCount: 1,
        state: { terminated: { exitCode: 1, reason: "Error" } },
      }),
      NOW,
    )

    expect(container).toMatchObject({
      tone: "restarted",
      stateLabel: "Terminated: Error",
      reason: "Error",
    })
  })

  it("falls back to spec containers while statuses are missing", () => {
    const containers = getContainerStatusSummaries(
      { spec: { containers: [{ name: "app" }, { name: "sidecar" }] } },
      NOW,
    )

    expect(containers).toHaveLength(2)
    expect(containers.map((container) => container.name)).toEqual(["app", "sidecar"])
    expect(containers.every((container) => container.tone === "unhealthy")).toBe(true)
  })

  it("returns no squares when the pod has no containers", () => {
    expect(getContainerStatusSummaries({}, NOW)).toEqual([])
  })
})
