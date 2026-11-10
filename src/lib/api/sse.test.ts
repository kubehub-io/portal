import { describe, expect, it } from "vitest"
import { parseSSEStream, type ServerSentEvent } from "@/lib/api/sse"

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<ServerSentEvent[]> {
  const events: ServerSentEvent[] = []
  for await (const event of parseSSEStream(streamFromChunks(chunks))) {
    events.push(event)
  }
  return events
}

describe("parseSSEStream", () => {
  it("parses the captured agent chat stream across arbitrary chunks", async () => {
    const events = await collect([
      'event: progress\ndata: {"type":"tool_started","tool":"sandbox_exec"}\n\n',
      'event: token\ndata: {"content":"**Verification result**"}\n\nevent: don',
      'e\ndata: {"status":"completed","message_id":"msg-1"}\n\n',
    ])

    expect(events).toEqual([
      { event: "progress", data: '{"type":"tool_started","tool":"sandbox_exec"}' },
      { event: "token", data: '{"content":"**Verification result**"}' },
      { event: "done", data: '{"status":"completed","message_id":"msg-1"}' },
    ])
  })

  it("supports CRLF line endings and multi-line data fields", async () => {
    const events = await collect(['event: token\r\ndata: line one\r\ndata: line two\r\n\r\n'])
    expect(events).toEqual([{ event: "token", data: "line one\nline two" }])
  })

  it("handles a CRLF pair split between chunks", async () => {
    const events = await collect([
      "event: token\r",
      '\ndata: {"content":"x"}\r\n\r\n',
    ])
    expect(events).toEqual([{ event: "token", data: '{"content":"x"}' }])
  })

  it("ignores comments and blocks without data", async () => {
    const events = await collect([
      ": keep-alive\n\n",
      "event: token\n\n",
      'event: token\ndata: {"content":"ok"}\n\n',
    ])
    expect(events).toEqual([{ event: "token", data: '{"content":"ok"}' }])
  })

  it("dispatches a final event without a trailing blank line", async () => {
    const events = await collect(['event: done\ndata: {"status":"completed"}'])
    expect(events).toEqual([{ event: "done", data: '{"status":"completed"}' }])
  })
})
