import { describe, expect, it } from "vitest"
import type { ChatMessage } from "@/lib/api/agent-chat"
import {
  deriveThreadTitle,
  formatRelativeTime,
  isProgressRunning,
  progressLabel,
  progressStep,
  withPendingUserMessage,
} from "@/lib/chat"

function userMessage(id: string, content: string, threadID = "thread-1"): ChatMessage {
  return {
    id,
    thread_id: threadID,
    role: "user",
    content,
    created_at: "2026-11-02T12:00:00.000Z",
  }
}

describe("deriveThreadTitle", () => {
  it("collapses whitespace and keeps short messages intact", () => {
    expect(deriveThreadTitle("  Why is my\n pod restarting?  ")).toBe(
      "Why is my pod restarting?",
    )
  })

  it("truncates long messages", () => {
    const title = deriveThreadTitle("a".repeat(100), 20)
    expect(title.length).toBeLessThanOrEqual(20)
    expect(title.endsWith("…")).toBe(true)
  })
})

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-02T12:00:00Z").getTime()

  it("renders nothing before the clock ticks", () => {
    expect(formatRelativeTime("2026-11-02T11:59:00Z", 0)).toBe("")
  })

  it("formats recent timestamps", () => {
    expect(formatRelativeTime("2026-11-02T11:59:45Z", now)).toBe("just now")
    expect(formatRelativeTime("2026-11-02T11:45:00Z", now)).toBe("15m ago")
    expect(formatRelativeTime("2026-11-02T09:00:00Z", now)).toBe("3h ago")
  })
})

describe("withPendingUserMessage", () => {
  const pending = userMessage("local-1", "hello")

  it("appends the optimistic message until the server persists it", () => {
    expect(withPendingUserMessage([], pending)).toEqual([pending])
  })

  it("drops the optimistic message once the server reports it", () => {
    const persisted = userMessage("message-1", "hello")
    expect(withPendingUserMessage([persisted], pending)).toEqual([persisted])
  })

  it("keeps a repeated message visible when an older identical copy exists", () => {
    const previous = userMessage("message-1", "hello")
    const persisted = userMessage("message-2", "hello")

    expect(withPendingUserMessage([previous], pending, 1)).toEqual([
      previous,
      pending,
    ])
    expect(withPendingUserMessage([previous, persisted], pending, 1)).toEqual([
      previous,
      persisted,
    ])
  })
})

describe("progressLabel", () => {
  it("describes tool lifecycle events", () => {
    expect(progressLabel({ type: "tool_started", tool: "sandbox_exec" })).toBe(
      "Running sandbox_exec",
    )
    expect(progressLabel({ type: "tool_completed", tool: "sandbox_exec" })).toBe(
      "Finished sandbox_exec",
    )
  })

  it("knows which events are still running", () => {
    expect(isProgressRunning({ type: "tool_started" })).toBe(true)
    expect(isProgressRunning({ type: "tool_completed" })).toBe(false)
  })

  it("labels a failed tool distinctly", () => {
    expect(progressLabel({ type: "tool_failed", tool: "sandbox_exec" })).toBe(
      "sandbox_exec failed",
    )
  })
})

describe("progressStep", () => {
  it("reports the last iteration and the configured bound", () => {
    expect(
      progressStep([
        { type: "iteration_started", iteration: 1, max_iterations: 20 },
        { type: "tool_started", tool: "pods_list", iteration: 1, max_iterations: 20 },
        { type: "iteration_started", iteration: 2, max_iterations: 20 },
      ]),
    ).toEqual({ iteration: 2, maxIterations: 20 })
  })

  it("omits the step when an older server does not report it", () => {
    expect(progressStep([{ type: "tool_started", tool: "pods_list" }])).toEqual({
      iteration: undefined,
      maxIterations: undefined,
    })
  })
})
