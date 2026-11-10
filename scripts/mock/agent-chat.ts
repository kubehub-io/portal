import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import { MOCK_CLUSTERS } from "./data.ts"
import { readBody, sendJson, type Handler } from "./util.ts"

const API_BASE = "/apis/agentchat-v202611"

interface MockThread {
  id: string
  title?: string
  cluster_id?: string
  created_at: string
  updated_at: string
}

interface MockMessage {
  id: string
  thread_id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}

interface MockAgentChatState {
  threads: MockThread[]
  messages: Map<string, MockMessage[]>
}

function isoAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function createState(): MockAgentChatState {
  const thread: MockThread = {
    id: "thread-welcome",
    title: "Getting started with agent chat",
    cluster_id: "demo-cluster",
    created_at: isoAgo(30),
    updated_at: isoAgo(5),
  }

  const greeting: MockMessage = {
    id: "message-welcome",
    thread_id: thread.id,
    role: "assistant",
    content:
      "Hi! I'm the KubeHub support agent.\n\nI can inspect clusters, run commands in a sandbox, and help you troubleshoot workloads. Try asking **why a pod is restarting** or ask me to check connectivity to an address.",
    created_at: isoAgo(5),
  }

  return {
    threads: [thread],
    messages: new Map([[thread.id, [greeting]]]),
  }
}

function nowISO(): string {
  return new Date().toISOString()
}

function errorBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeEvent(res: ServerResponse, event: string, data: unknown): boolean {
  if (res.writableEnded || res.destroyed) return false
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  return true
}

function agentReply(prompt: string): string {
  return `**Agent mock response**

I received your message:

> ${prompt.replace(/\s+/g, " ").trim()}

This is a simulated streaming response from the local mock server. It demonstrates:

- \`token\` events rendered as Markdown
- \`progress\` events for tool and command activity
- the terminal \`done\` event

In a real deployment the KubeHub agent would inspect your cluster and stream its findings here.`
}

function tokenChunks(content: string): string[] {
  const chunks: string[] = []
  const size = 18
  for (let index = 0; index < content.length; index += size) {
    chunks.push(content.slice(index, index + size))
  }
  return chunks
}

async function streamReply(
  res: ServerResponse,
  thread: MockThread,
  prompt: string,
  stateMessages: Map<string, MockMessage[]>,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  if (!writeEvent(res, "progress", { type: "tool_started", tool: "sandbox_exec" })) return
  await sleep(180)

  if (
    !writeEvent(res, "progress", {
      type: "command_started",
      tool: "sandbox_exec",
      detail: "kubectl get pods -A",
    })
  ) {
    return
  }
  await sleep(220)

  if (!writeEvent(res, "progress", { type: "tool_completed", tool: "sandbox_exec" })) return

  const reply = agentReply(prompt)
  for (const chunk of tokenChunks(reply)) {
    await sleep(24)
    if (!writeEvent(res, "token", { content: chunk })) return
  }

  const message: MockMessage = {
    id: randomUUID(),
    thread_id: thread.id,
    role: "assistant",
    content: reply,
    created_at: nowISO(),
  }
  thread.updated_at = message.created_at

  if (!writeEvent(res, "done", {
    status: "completed",
    run_id: randomUUID(),
    thread_id: thread.id,
    message_id: message.id,
  })) {
    return
  }

  res.end()
  // Only persist after the stream closes so a disconnected client does not
  // leave a half-written assistant message behind.
  const messages = stateMessages.get(thread.id)
  if (messages) messages.push(message)
}

export function agentChatHandler(): Handler {
  const state = createState()

  return async (req: IncomingMessage, res: ServerResponse) => {
    const method = (req.method ?? "GET").toUpperCase()
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname

    if (!path.startsWith(API_BASE)) {
      return sendJson(res, 404, errorBody("NOT_FOUND", "Not found"))
    }

    const threadMatch = path.match(new RegExp(`^${API_BASE}/threads/([^/]+)$`))
    const messagesMatch = path.match(new RegExp(`^${API_BASE}/threads/([^/]+)/messages$`))

    if (path === `${API_BASE}/threads`) {
      if (method === "GET") {
        const threads = [...state.threads].sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at),
        )
        return sendJson(res, 200, threads)
      }

      if (method === "POST") {
        let body: { title?: unknown; cluster_name?: unknown }
        try {
          body = JSON.parse((await readBody(req)).toString("utf8")) as typeof body
        } catch {
          return sendJson(res, 400, errorBody("BAD_REQUEST", "Invalid JSON body"))
        }

        const title = typeof body.title === "string" ? body.title.trim() : ""
        const clusterName =
          typeof body.cluster_name === "string" ? body.cluster_name.trim() : ""
        if (!clusterName) {
          return sendJson(
            res,
            400,
            errorBody("BAD_REQUEST", "cluster_name is required"),
          )
        }

        const cluster = MOCK_CLUSTERS.find(
          (item) => item.metadata?.name === clusterName,
        )
        if (!cluster) {
          return sendJson(res, 404, errorBody("NOT_FOUND", "cluster not found"))
        }

        const timestamp = nowISO()
        const thread: MockThread = {
          id: randomUUID(),
          title: title || undefined,
          cluster_id: clusterName,
          created_at: timestamp,
          updated_at: timestamp,
        }
        state.threads.push(thread)
        state.messages.set(thread.id, [])
        return sendJson(res, 200, thread)
      }
    }

    if (threadMatch && method === "GET") {
      const threadID = decodeURIComponent(threadMatch[1])
      const thread = state.threads.find((item) => item.id === threadID)
      if (!thread) {
        return sendJson(res, 404, errorBody("NOT_FOUND", "thread not found"))
      }
      return sendJson(res, 200, thread)
    }

    if (messagesMatch) {
      const threadID = decodeURIComponent(messagesMatch[1])
      const thread = state.threads.find((item) => item.id === threadID)
      if (!thread) {
        return sendJson(res, 404, errorBody("NOT_FOUND", "thread not found"))
      }

      if (method === "GET") {
        return sendJson(res, 200, state.messages.get(threadID) ?? [])
      }

      if (method === "POST") {
        let body: { content?: unknown }
        try {
          body = JSON.parse((await readBody(req)).toString("utf8")) as typeof body
        } catch {
          return sendJson(res, 400, errorBody("BAD_REQUEST", "Invalid JSON body"))
        }

        const content = typeof body.content === "string" ? body.content.trim() : ""
        if (!content) {
          return sendJson(res, 400, errorBody("BAD_REQUEST", "content is required"))
        }

        const userMessage: MockMessage = {
          id: randomUUID(),
          thread_id: threadID,
          role: "user",
          content,
          created_at: nowISO(),
        }
        const messages = state.messages.get(threadID) ?? []
        messages.push(userMessage)
        state.messages.set(threadID, messages)
        thread.updated_at = userMessage.created_at

        return streamReply(res, thread, content, state.messages)
      }
    }

    return sendJson(res, 404, errorBody("NOT_FOUND", `No mock route for ${method} ${path}`))
  }
}
