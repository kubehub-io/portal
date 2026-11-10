/**
 * Minimal server-sent events reader.
 *
 * The agent chat API streams `event:`/`data:` records over a POST response, so
 * `EventSource` (which only supports GET) cannot be used. This decoder follows
 * the SSE framing rules and works across arbitrary chunk boundaries.
 */

export interface ServerSentEvent {
  /** SSE event name, defaults to "message". */
  event: string
  /** `data:` lines joined with newlines. */
  data: string
  /** Optional `id:` field. */
  id?: string
}

interface ExtractedLine {
  line: string
  rest: string
}

/**
 * Pull the next complete line out of `buffer`.
 *
 * Supports LF, CRLF and bare CR terminators. A CR at the very end of the buffer
 * is held back until the next read so a split CRLF pair is not decoded as two
 * line breaks.
 */
function nextLine(buffer: string): ExtractedLine | null {
  for (let i = 0; i < buffer.length; i += 1) {
    const char = buffer[i]
    if (char === "\n") {
      return { line: buffer.slice(0, i), rest: buffer.slice(i + 1) }
    }
    if (char === "\r") {
      if (i + 1 === buffer.length) return null
      if (buffer[i + 1] === "\n") {
        return { line: buffer.slice(0, i), rest: buffer.slice(i + 2) }
      }
      return { line: buffer.slice(0, i), rest: buffer.slice(i + 1) }
    }
  }
  return null
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  let buffer = ""
  let eventName = "message"
  let eventID: string | undefined
  let dataLines: string[] = []

  const dispatch = (): ServerSentEvent | null => {
    if (dataLines.length === 0) {
      // A block with only comments/event/id is not a dispatchable event.
      eventName = "message"
      eventID = undefined
      return null
    }
    const event: ServerSentEvent = {
      event: eventName || "message",
      data: dataLines.join("\n"),
      ...(eventID !== undefined ? { id: eventID } : {}),
    }
    eventName = "message"
    eventID = undefined
    dataLines = []
    return event
  }

  const processLine = (rawLine: string): ServerSentEvent | null => {
    if (rawLine === "") return dispatch()
    if (rawLine.startsWith(":")) return null

    const colon = rawLine.indexOf(":")
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon)
    let value = colon === -1 ? "" : rawLine.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "event") {
      eventName = value
    } else if (field === "data") {
      dataLines.push(value)
    } else if (field === "id") {
      eventID = value
    }
    // `retry` is irrelevant for a fetch-based stream and is ignored.
    return null
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let extracted = nextLine(buffer)
      while (extracted) {
        buffer = extracted.rest
        const event = processLine(extracted.line)
        if (event) yield event
        extracted = nextLine(buffer)
      }
    }

    buffer += decoder.decode()

    // Process a final line without a trailing newline.
    if (buffer.length > 0) {
      const finalLine = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer
      const event = processLine(finalLine)
      if (event) yield event
    }

    // Dispatch a buffered event that was not followed by a blank line.
    const finalEvent = dispatch()
    if (finalEvent) yield finalEvent
  } finally {
    reader.releaseLock()
  }
}
