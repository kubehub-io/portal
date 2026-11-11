import type { AgentProgressEvent, ChatMessage, ChatThread } from "@/lib/api/agent-chat"

/** Title shown in the thread list, with a sensible fallback for untitled threads. */
export function threadTitle(thread: ChatThread): string {
  const title = thread.title?.trim()
  return title || "Untitled chat"
}

/** Derive a short thread title from the first user message. */
export function deriveThreadTitle(content: string, maxLength = 60): string {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

/** Compact relative age such as "just now", "12m ago", "3d ago". */
export function formatRelativeTime(value: string | undefined, now: number): string {
  if (!value) return ""
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ""

  // `now` is 0 until the useNow hook ticks on the client. Render nothing during
  // the first paint so server and client markup stay in sync.
  if (!now) return ""
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

/** Human-readable label for an agent progress event. */
export function progressLabel(event: AgentProgressEvent): string {
  const tool = event.tool?.trim()
  switch (event.type) {
    case "tool_started":
      return tool ? `Running ${tool}` : "Running tool"
    case "tool_completed":
      return tool ? `Finished ${tool}` : "Tool finished"
    case "command_started":
      return tool ? `Running command in ${tool}` : "Running command"
    case "command_completed":
      return tool ? `Command finished in ${tool}` : "Command finished"
    default:
      return event.type.replaceAll("_", " ")
  }
}

export function isProgressRunning(event: AgentProgressEvent): boolean {
  return event.type.endsWith("_started")
}

/**
 * Overlay a just-sent user message on the server list until it is persisted.
 *
 * `baselineMatches` is how many identical messages were already in the list
 * when the send started. It prevents sending the same text twice from hiding
 * the new optimistic bubble as soon as the previous copy shows up.
 */
export function withPendingUserMessage(
  serverMessages: ChatMessage[],
  pending: ChatMessage | null,
  baselineMatches = 0,
): ChatMessage[] {
  if (!pending) return serverMessages

  const persistedMatches = serverMessages.filter(
    (message) =>
      message.thread_id === pending.thread_id &&
      message.role === "user" &&
      message.content === pending.content,
  ).length

  // The server already reports the pending message, so rendering the optimistic
  // copy as well would show the bubble twice.
  if (persistedMatches > baselineMatches) return serverMessages
  return [...serverMessages, pending]
}
