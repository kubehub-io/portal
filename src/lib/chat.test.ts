import { describe, expect, it } from "vitest"
import {
  deriveThreadTitle,
  formatRelativeTime,
  isProgressRunning,
  progressLabel,
} from "@/lib/chat"

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
})
