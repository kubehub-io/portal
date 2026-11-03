import { asItemList, authFetch } from "@/lib/api/http"
import { parseSSEStream } from "@/lib/api/sse"

/** Base path declared by swagger/agentchat-v202611.yaml. */
export const AGENT_CHAT_API_BASE = "/apis/agentchat-v202611"

// ── Resources ────────────────────────────────────────────

export interface ChatThread {
  id: string
  title?: string
  cluster_id?: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  thread_id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}

export interface CreateThreadInput {
  title?: string
  /** Name of one of the caller's existing clusters. */
  cluster_name: string
}

export interface SendMessageInput {
  content: string
}

// ── Streaming event payloads ─────────────────────────────

/** Progress events emitted by the agent while it works (e.g. tool calls). */
export interface AgentProgressEvent {
  type: string
  tool?: string
  detail?: string
  [key: string]: unknown
}

export interface AgentDoneEvent {
  status: string
  run_id?: string
  thread_id?: string
  message_id?: string
  error?: string
}

export type AgentStreamEvent =
  | { type: "token"; content: string }
  | { type: "progress"; progress: AgentProgressEvent }
  | { type: "error"; message: string }
  | { type: "done"; done: AgentDoneEvent }
  /** Forward-compatible fallback for event names the UI does not know yet. */
  | { type: "event"; event: string; data: string }

function parseJSON<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T
  } catch {
    return undefined
  }
}

function errorMessage(data: string): string {
  const parsed = parseJSON<{ message?: unknown; error?: unknown }>(data)
  if (parsed) {
    if (typeof parsed.message === "string") return parsed.message
    if (typeof parsed.error === "string") return parsed.error
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error &&
      typeof (parsed.error as { message?: unknown }).message === "string"
    ) {
      return (parsed.error as { message: string }).message
    }
  }
  return data.trim() || "The agent run failed"
}

// ── Endpoints ────────────────────────────────────────────

export async function listThreads(): Promise<ChatThread[]> {
  const res = await authFetch(`${AGENT_CHAT_API_BASE}/threads`, { cache: "no-store" })
  return asItemList<ChatThread>(res)
}

export async function createThread(input: CreateThreadInput): Promise<ChatThread> {
  const res = await authFetch(`${AGENT_CHAT_API_BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return res.json() as Promise<ChatThread>
}

export async function getThread(threadID: string): Promise<ChatThread> {
  const res = await authFetch(`${AGENT_CHAT_API_BASE}/threads/${encodeURIComponent(threadID)}`)
  return res.json() as Promise<ChatThread>
}

export async function listMessages(threadID: string): Promise<ChatMessage[]> {
  const res = await authFetch(
    `${AGENT_CHAT_API_BASE}/threads/${encodeURIComponent(threadID)}/messages`,
    { cache: "no-store" },
  )
  return asItemList<ChatMessage>(res)
}

/**
 * Send a message and turn the API's SSE response into typed events.
 *
 * The stream always terminates with a `done` event on success and on failure,
 * so callers can drive a single `isStreaming` flag from the generator.
 */
export async function* streamMessage(
  threadID: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent> {
  const res = await authFetch(
    `${AGENT_CHAT_API_BASE}/threads/${encodeURIComponent(threadID)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ content } satisfies SendMessageInput),
      cache: "no-store",
      signal,
    },
  )

  if (!res.body) {
    throw new Error("The agent response did not include a stream")
  }

  let sawErrorEvent = false

  for await (const event of parseSSEStream(res.body)) {
    if (event.event === "token") {
      const data = parseJSON<{ content?: unknown }>(event.data)
      if (typeof data?.content === "string") {
        yield { type: "token", content: data.content }
      }
      continue
    }

    if (event.event === "progress") {
      const progress = parseJSON<AgentProgressEvent>(event.data)
      if (progress && typeof progress.type === "string") {
        yield { type: "progress", progress }
      }
      continue
    }

    if (event.event === "error") {
      sawErrorEvent = true
      yield { type: "error", message: errorMessage(event.data) }
      continue
    }

    if (event.event === "done") {
      const data = parseJSON<Partial<AgentDoneEvent>>(event.data)
      yield {
        type: "done",
        done: {
          status: data?.status ?? "completed",
          run_id: data?.run_id,
          thread_id: data?.thread_id,
          message_id: data?.message_id,
          error: data?.error,
        },
      }
      // The done event terminates the run even if the server keeps the
      // connection open for a little longer.
      return
    }

    yield { type: "event", event: event.event, data: event.data }
  }

  if (!sawErrorEvent) {
    throw new Error("The agent stream ended before the run completed")
  }
}
