import type { IncomingMessage, ServerResponse } from "node:http"

export type Handler = (req: IncomingMessage, res: ServerResponse) => unknown

export async function readBody(req: IncomingMessage, limit = 2 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      throw new Error("Request body too large")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(body)
}

export function sendText(res: ServerResponse, status: number, text: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": contentType })
  res.end(text)
}

export function handleError(res: ServerResponse, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error("[mock] request handler error:", err)
  if (!res.headersSent) {
    sendJson(res, 500, { message: `Mock server error: ${message}` })
  } else {
    res.end()
  }
}