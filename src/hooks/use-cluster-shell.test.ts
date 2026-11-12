import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useClusterShell } from "@/hooks/use-cluster-shell"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterStore } from "@/stores/cluster-store"

const cluster = {
  apiVersion: "kubehub.io/v1",
  kind: "Cluster",
  metadata: { name: "test-cluster" },
  spec: {
    region: "test",
    network: {},
    managedControllerProfile: { enabledControllers: ["agent-sandbox"] },
  },
  status: { publicDns: "cluster.example.test" },
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe("useClusterShell sandbox lifecycle", () => {
  afterEach(() => {
    window.dispatchEvent(new Event("pagehide"))
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it("cold-creates a gVisor Sandbox and reaches ready", async () => {
    useAuthStore.setState({ accessToken: "token", isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    let sandboxCreated = false
    const requests: Array<{ url: string; init?: RequestInit }> = []

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === "/config.json") return json({ webShellConfig: { sandboxImage: "sandboxd:test" } })
      if (url.endsWith("/api/v1/namespaces/agent-sandbox")) return json({}, 200)
      if (url.endsWith("/apis/node.k8s.io/v1/runtimeclasses/gvisor")) return json({}, 200)
      requests.push({ url, init })

      if (url.includes("/sandboxclaims/")) return json({}, 404)
      if (url.includes("/sandboxes/portal-shell-")) {
        return sandboxCreated
          ? json({
              metadata: {
                name: "portal-shell-test",
                annotations: { "agents.x-k8s.io/pod-name": "portal-shell-test" },
              },
              status: { conditions: [{ type: "Ready", status: "True" }] },
            })
          : json({}, 404)
      }
      if (url.includes("sandboxwarmpools")) return json({ items: [] })
      if (url.includes("sandboxtemplates/")) {
        return json({
          spec: {
            podTemplate: {
              spec: { containers: [{ name: "sandboxd", image: "sandboxd:test" }] },
            },
          },
        })
      }
      if (url.endsWith("/sandboxes")) {
        sandboxCreated = true
        expect(init?.method).toBe("POST")
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body.spec).toMatchObject({ shutdownPolicy: "Delete" })
        expect(
          ((body.spec as Record<string, unknown>).podTemplate as Record<string, unknown>).spec,
        ).toMatchObject({ runtimeClassName: "gvisor" })
        expect(
          ((
            ((body.spec as Record<string, unknown>).podTemplate as Record<string, unknown>)
              .spec as Record<string, unknown>
          ).containers as Array<Record<string, unknown>>)[0].env,
        ).toEqual([
          { name: "HOME", value: "/workspace" },
          { name: "PS1", value: "sandbox@\\h:\\w\\$ " },
        ])
        expect(
          (((body.spec as Record<string, unknown>).podTemplate as Record<string, unknown>).spec as Record<string, unknown>).securityContext,
        ).toMatchObject({ runAsUser: 0, runAsGroup: 0, runAsNonRoot: false })
        return json({ metadata: { name: "portal-shell-test" } }, 201)
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))
    expect(result.current.podName).toBe("portal-shell-test")
    expect(requests.some(({ url }) => url.includes("/apis/agents.x-k8s.io/v1beta1/"))).toBe(true)
    window.dispatchEvent(new Event("pagehide"))
    expect(requests.some(({ init }) => init?.method === "DELETE")).toBe(false)
    unmount()
  })

  it("reuses the same Sandbox after the hook is remounted", async () => {
    useAuthStore.setState({ accessToken: "token", isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    let sandboxCreated = false
    let createCount = 0
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/config.json") return json({ webShellConfig: { sandboxImage: "sandboxd:test" } })
      if (url.endsWith("/api/v1/namespaces/agent-sandbox")) return json({}, 200)
      if (url.endsWith("/apis/node.k8s.io/v1/runtimeclasses/gvisor")) return json({}, 200)
      if (url.includes("/sandboxclaims/")) return json({}, 404)
      if (url.endsWith("/sandboxes")) {
        sandboxCreated = true
        createCount += 1
        return json({}, 201)
      }
      if (url.includes("/sandboxes/portal-shell-")) {
        return sandboxCreated
          ? json({
              metadata: {
                name: "portal-shell-test",
                annotations: { "agents.x-k8s.io/pod-name": "portal-shell-test" },
              },
              status: { conditions: [{ type: "Ready", status: "True" }] },
            })
          : json({}, 404)
      }
      if (url.includes("sandboxwarmpools")) return json({ items: [] })
      if (url.includes("sandboxtemplates/")) return json({ spec: { podTemplate: { spec: {} } } })
      throw new Error(`Unexpected request: ${url}`)
    }))

    const first = renderHook(() => useClusterShell())
    await act(async () => { await first.result.current.start() })
    await waitFor(() => expect(first.result.current.phase).toBe("ready"))
    first.unmount() // Dock close: must not delete the Sandbox.

    const second = renderHook(() => useClusterShell())
    await act(async () => { await second.result.current.start() })
    await waitFor(() => expect(second.result.current.phase).toBe("ready"))
    expect(createCount).toBe(1)
    second.unmount()
  })
})
