import { beforeEach, describe, expect, it, vi } from "vitest"
import { authFetch } from "@/lib/api/http"
import {
  agentServiceAccountRef,
  createThread,
  defaultAgentServiceAccount,
  isDefaultAgentServiceAccount,
  streamMessage,
  type AgentStreamEvent,
} from "@/lib/api/agent-chat"

vi.mock("@/lib/api/http", () => ({
  authFetch: vi.fn(),
  asItemList: vi.fn(),
}))

const authFetchMock = vi.mocked(authFetch)

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

async function collect(
  threadID: string,
  content: string,
  options?: { agentServiceAccount?: string },
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = []
  for await (const event of streamMessage(threadID, content, options)) {
    events.push(event)
  }
  return events
}

describe("createThread", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("sends cluster_name instead of cluster context details", async () => {
    authFetchMock.mockResolvedValue({
      json: async () => ({
        id: "thread-1",
        title: "Support",
        cluster_id: "demo-cluster",
        created_at: "2026-11-02T12:00:00.000Z",
        updated_at: "2026-11-02T12:00:00.000Z",
      }),
    } as unknown as Response)

    const thread = await createThread({
      title: "Support",
      cluster_name: "demo-cluster",
    })

    expect(thread.id).toBe("thread-1")
    expect(authFetchMock).toHaveBeenCalledWith(
      "/apis/agentchat-v202611/threads",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Support", cluster_name: "demo-cluster" }),
      }),
    )
  })
})
describe("agentServiceAccountRef", () => {
  it("omits the payload for the server default account", () => {
    expect(isDefaultAgentServiceAccount(defaultAgentServiceAccount())).toBe(true)
    expect(agentServiceAccountRef(defaultAgentServiceAccount())).toBeUndefined()
  })

  it("encodes another account as namespace/name", () => {
    expect(
      agentServiceAccountRef({
        namespace: "team-a",
        serviceAccount: "troubleshooter",
      }),
    ).toBe("team-a/troubleshooter")
  })
})

describe("streamMessage", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("maps token, progress, error and done events", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText(
        [
          'event: progress\ndata: {"type":"tool_started","tool":"sandbox_exec"}\n\n',
          'event: progress\ndata: {"type":"command_started","tool":"sandbox_exec","detail":"curl -v http://10.10.1.138"}\n\n',
          'event: token\ndata: {"content":"The IP "}\n\n',
          'event: token\ndata: {"content":"is reachable."}\n\n',
          'event: done\ndata: {"status":"completed","run_id":"run-1","thread_id":"thread-1","message_id":"msg-1"}\n\n',
        ].join(""),
      ),
    } as unknown as Response)

    const events = await collect("thread-1", "is it reachable?")

    expect(events).toEqual([
      {
        type: "progress",
        progress: { type: "tool_started", tool: "sandbox_exec" },
      },
      {
        type: "progress",
        progress: {
          type: "command_started",
          tool: "sandbox_exec",
          detail: "curl -v http://10.10.1.138",
        },
      },
      { type: "token", content: "The IP " },
      { type: "token", content: "is reachable." },
      {
        type: "done",
        done: {
          status: "completed",
          run_id: "run-1",
          thread_id: "thread-1",
          message_id: "msg-1",
          error: undefined,
        },
      },
    ])

    expect(authFetchMock).toHaveBeenCalledWith(
      "/apis/agentchat-v202611/threads/thread-1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "is it reachable?" }),
      }),
    )
  })

  it("sends a non-default agent service account as namespace/name", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText(
        'event: done\ndata: {"status":"completed"}\n\n',
      ),
    } as unknown as Response)

    await collect("thread-1", "hello", {
      agentServiceAccount: "team-a/troubleshooter",
    })

    expect(authFetchMock).toHaveBeenCalledWith(
      "/apis/agentchat-v202611/threads/thread-1/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          content: "hello",
          agentServiceAccount: "team-a/troubleshooter",
        }),
      }),
    )
  })

  it("omits agentServiceAccount when no account is provided", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText('event: done\ndata: {"status":"completed"}\n\n'),
    } as unknown as Response)

    await collect("thread-1", "hello")

    expect(authFetchMock).toHaveBeenCalledWith(
      "/apis/agentchat-v202611/threads/thread-1/messages",
      expect.objectContaining({
        body: JSON.stringify({ content: "hello" }),
      }),
    )
  })

  it("stops reading after the terminal done event", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText(
        [
          'event: token\ndata: {"content":"before"}\n\n',
          'event: done\ndata: {"status":"completed"}\n\n',
          'event: token\ndata: {"content":"after"}\n\n',
        ].join(""),
      ),
    } as unknown as Response)

    const events = await collect("thread-1", "hello")
    expect(events.map((event) => event.type)).toEqual(["token", "done"])
  })

  it("surfaces a failed run error", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText(
        [
          'event: error\ndata: {"message":"the agent run failed"}\n\n',
          'event: done\ndata: {"status":"failed","error":"the agent run failed"}\n\n',
        ].join(""),
      ),
    } as unknown as Response)

    const events = await collect("thread-1", "hello")
    expect(events).toContainEqual({ type: "error", message: "the agent run failed" })
    expect(events).toContainEqual({
      type: "done",
      done: {
        status: "failed",
        run_id: undefined,
        thread_id: undefined,
        message_id: undefined,
        error: "the agent run failed",
      },
    })
  })

  it("reports a stream that closes without a done event", async () => {
    authFetchMock.mockResolvedValue({
      body: streamFromText('event: token\ndata: {"content":"partial"}\n\n'),
    } as unknown as Response)

    await expect(collect("thread-1", "hello")).rejects.toThrow(
      "The agent stream ended before the run completed",
    )
  })
})
