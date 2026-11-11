import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useClusterShell } from "@/hooks/use-cluster-shell"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterStore } from "@/stores/cluster-store"

class MockWebSocket {
  static instances: MockWebSocket[] = []
  binaryType = ""
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  close() {
    this.onclose?.()
  }
}

const cluster = {
  apiVersion: "kubehub.io/v1",
  kind: "Cluster",
  metadata: { name: "test-cluster" },
  spec: { region: "test", network: {} },
  status: { publicDns: "cluster.example.test" },
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

describe("useClusterShell startup", () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    MockWebSocket.instances = []
    vi.useRealTimers()
  })

  it("does not block the shell on credential injection", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useAuthStore.setState({ accessToken: "test-token", isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })

    globalThis.WebSocket = MockWebSocket as never
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/pods/shell-pod")) {
        return response({
          metadata: { annotations: { "shell.kubehub.io/spec-version": "1" } },
          spec: { nodeName: "node-1" },
          status: { phase: "Running" },
        })
      }
      if (url.endsWith("/api/v1/nodes")) return response({ items: [{ metadata: { name: "node-1" } }] })
      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    const { result, unmount } = renderHook(() => useClusterShell())
    act(() => { void result.current.start() })

    // The regression was caused by awaiting the exec WebSocket before setting
    // ready. A socket that never closes must not leave the panel in an endless
    // "Injecting credentials" state.
    await waitFor(() => expect(result.current.phase).toBe("ready"))
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(result.current.error).toBeNull()

    unmount()
    await vi.advanceTimersByTimeAsync(15_000)
  })

  it("uses the existing Running response without a status polling request", async () => {
    useAuthStore.setState({ accessToken: "test-token", isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    globalThis.WebSocket = MockWebSocket as never

    const requests: string[] = []
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.includes("/pods/shell-pod")) {
        return response({
          metadata: { annotations: { "shell.kubehub.io/spec-version": "1" } },
          spec: { nodeName: "node-1" },
          status: { phase: "Running" },
        })
      }
      if (url.endsWith("/api/v1/nodes")) return response({ items: [{ metadata: { name: "node-1" } }] })
      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    const { result, unmount } = renderHook(() => useClusterShell())
    act(() => { void result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))

    expect(requests.filter((url) => url.includes("shellPoll=")).length).toBe(0)
    expect(requests.filter((url) => url.includes("/pods/shell-pod") && !url.includes("shellCheck=")).length).toBe(0)
    unmount()
  })
})
