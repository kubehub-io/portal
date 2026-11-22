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

const TOKEN = `header.${btoa(JSON.stringify({ sub: "alice" }))}.signature`
const PVC_URL = "/persistentvolumeclaims/portal-shell-alice"

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function mockClusterApi(initialConfig?: unknown, initialRawConfig?: string) {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  let config = initialConfig
  let configRaw = initialRawConfig
  let createdBody: Record<string, unknown> | null = null
  let sandboxDeleted = false
  let sandboxDeleteCount = 0
  let pvcExists = false

  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, init })

    if (url === "/config.json") return json({ webShellConfig: { sandboxImage: "sandboxd:test" } })
    if (url.endsWith("/api/v1/namespaces/agent-sandbox")) return json({}, 200)
    if (url.endsWith("/apis/node.k8s.io/v1/runtimeclasses/gvisor")) return json({}, 200)
    if (url.endsWith(PVC_URL)) return pvcExists ? json({ metadata: { name: "portal-shell-alice" } }) : json({}, 404)
    if (url.endsWith("/persistentvolumeclaims")) {
      if (init?.method === "POST") {
        pvcExists = true
        return json({}, 201)
      }
      if (init?.method === "DELETE") return json({}, 200)
      return json({ items: [] })
    }
    if (url.endsWith("/pods")) return json({ items: [] })
    if (url.includes("/namespaces/agent-sandbox/configmaps/shell-config-")) {
      return config === undefined && configRaw === undefined
        ? json({}, 404)
        : json({ data: { "config.json": configRaw ?? JSON.stringify(config) } })
    }
    if (url.endsWith("/apis/storage.k8s.io/v1/storageclasses/portal-shell-retain")) {
      return json({}, 404)
    }
    if (url.endsWith("/apis/storage.k8s.io/v1/storageclasses")) {
      if (init?.method === "POST") return json({}, 201)
      return json({
        items: [
          {
            metadata: { name: "standard", annotations: { "storageclass.kubernetes.io/is-default-class": "true" } },
            provisioner: "example.com/disk",
            parameters: { type: "ssd" },
          },
          {
            metadata: { name: "fast" },
            provisioner: "example.com/fast",
            parameters: { tier: "fast" },
          },
        ],
      })
    }
    if (url.endsWith("/sandboxes")) {
      createdBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      sandboxDeleted = false
      return json({}, 201)
    }
    if (url.includes("/sandboxes/portal-shell-")) {
      if (init?.method === "PATCH") return json({})
      if (init?.method === "DELETE") {
        sandboxDeleted = true
        sandboxDeleteCount += 1
        return json({})
      }
      if (createdBody && !sandboxDeleted) {
        const metadata = (createdBody.metadata ?? {}) as Record<string, unknown>
        return json({
          metadata: {
            ...metadata,
            annotations: {
              ...(metadata.annotations as Record<string, unknown> | undefined),
              "agents.x-k8s.io/pod-name": "portal-shell-alice",
            },
          },
          spec: createdBody.spec,
          status: { conditions: [{ type: "Ready", status: "True" }] },
        })
      }
      return json({}, 404)
    }
    throw new Error(`Unexpected request: ${url}`)
  }))

  return {
    requests,
    setConfig(next: unknown) { config = next; configRaw = undefined },
    postsTo(path: string) {
      return requests.filter((r) => r.url.endsWith(path) && r.init?.method === "POST")
    },
    deletesOf(path: string) {
      return requests.filter((r) => r.url.endsWith(path) && r.init?.method === "DELETE")
    },
    postBody() {
      const request = this.postsTo("/sandboxes")[0]
      return JSON.parse(String(request?.init?.body)) as Record<string, unknown>
    },
    get sandboxDeleted() { return sandboxDeleted },
    get sandboxDeleteCount() { return sandboxDeleteCount },
  }
}

describe("useClusterShell sandbox lifecycle", () => {
  afterEach(() => {
    window.dispatchEvent(new Event("pagehide"))
    vi.restoreAllMocks()
  })

  it("creates one Sandbox per token subject with safe defaults", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi()

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))

    expect(result.current.podName).toBe("portal-shell-alice")
    expect(api.requests.some(({ url }) => url.includes("shell-config-alice"))).toBe(true)
    const body = api.postBody()
    expect(body.metadata).toMatchObject({ name: "portal-shell-alice", namespace: "agent-sandbox" })
    const spec = body.spec as Record<string, unknown>
    expect(spec.shutdownPolicy).toBe("Delete")
    const podSpec = ((spec.podTemplate as Record<string, unknown>).spec) as Record<string, unknown>
    expect(podSpec.runtimeClassName).toBe("gvisor")
    expect(podSpec).not.toHaveProperty("hostUsers")
    expect((podSpec.volumes as Record<string, unknown>[])[0]).toEqual({ name: "workspace", emptyDir: {} })
    expect(api.postsTo("/persistentvolumeclaims")).toHaveLength(0)
    unmount()
  })

  it("applies config.json overrides for storage and isolation", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi({
      storage: { size: "2Gi", class: "fast" },
      security: { isolation: "usernamespace" },
    })

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))

    // No StorageClass is created by the portal; the admin's choice is used as-is.
    expect(api.postsTo("/apis/storage.k8s.io/v1/storageclasses")).toHaveLength(0)

    const pvcPost = api.postsTo("/persistentvolumeclaims")[0]
    expect(JSON.parse(String(pvcPost?.init?.body))).toMatchObject({
      metadata: { name: "portal-shell-alice", namespace: "agent-sandbox" },
      spec: {
        storageClassName: "fast",
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage: "2Gi" } },
      },
    })

    const spec = api.postBody().spec as Record<string, unknown>
    expect(spec.shutdownPolicy).toBe("Delete")
    expect(spec).not.toHaveProperty("volumeClaimTemplates")
    const podSpec = ((spec.podTemplate as Record<string, unknown>).spec) as Record<string, unknown>
    expect(podSpec.hostUsers).toBe(false)
    expect(podSpec).not.toHaveProperty("runtimeClassName")
    expect((podSpec.volumes as Record<string, unknown>[])[0]).toEqual({
      name: "workspace",
      persistentVolumeClaim: { claimName: "portal-shell-alice" },
    })
    const container = (podSpec.containers as Record<string, unknown>[])[0]
    expect(container.image).toBe("sandboxd:test")
    unmount()
  })

  it("keeps the PVC alive beyond the Sandbox and reuses it on the next start", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi({ storage: {} })

    const first = renderHook(() => useClusterShell())
    await act(async () => { await first.result.current.start() })
    await waitFor(() => expect(first.result.current.phase).toBe("ready"))
    expect(api.postsTo("/persistentvolumeclaims")).toHaveLength(1)

    await act(async () => { await first.result.current.cleanup() })
    expect(api.sandboxDeleted).toBe(true)
    expect(api.deletesOf(PVC_URL)).toHaveLength(0)
    first.unmount()

    const second = renderHook(() => useClusterShell())
    await act(async () => { await second.result.current.start() })
    await waitFor(() => expect(second.result.current.phase).toBe("ready"))

    expect(api.postsTo("/persistentvolumeclaims")).toHaveLength(1)
    expect(api.deletesOf(PVC_URL)).toHaveLength(0)
    const spec = api.postBody().spec as Record<string, unknown>
    const podSpec = ((spec.podTemplate as Record<string, unknown>).spec) as Record<string, unknown>
    expect((podSpec.volumes as Record<string, unknown>[])[0]).toEqual({
      name: "workspace",
      persistentVolumeClaim: { claimName: "portal-shell-alice" },
    })
    second.unmount()
  })

  it("deletes the Sandbox (not the PVC) on cleanup with the defaults", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi()

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))

    await act(async () => { await result.current.cleanup() })
    expect(api.sandboxDeleted).toBe(true)
    expect(api.deletesOf(PVC_URL)).toHaveLength(0)
    unmount()
  })

  it("reuses the same per-user Sandbox after the hook is remounted", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi()

    const first = renderHook(() => useClusterShell())
    await act(async () => { await first.result.current.start() })
    await waitFor(() => expect(first.result.current.phase).toBe("ready"))
    first.unmount()

    const second = renderHook(() => useClusterShell())
    await act(async () => { await second.result.current.start() })
    await waitFor(() => expect(second.result.current.phase).toBe("ready"))
    expect(api.postsTo("/sandboxes")).toHaveLength(1)
    expect(api.sandboxDeleted).toBe(false)
    second.unmount()
  })

  it("recreates the Sandbox when the isolation setting changes, keeping the PVC", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi({ security: { isolation: "gvisor" }, storage: {} })

    const first = renderHook(() => useClusterShell())
    await act(async () => { await first.result.current.start() })
    await waitFor(() => expect(first.result.current.phase).toBe("ready"))
    first.unmount()

    api.setConfig({ security: { isolation: "usernamespace" }, storage: {} })
    const second = renderHook(() => useClusterShell())
    await act(async () => { await second.result.current.start() })
    await waitFor(() => expect(second.result.current.phase).toBe("ready"))

    expect(api.sandboxDeleteCount).toBe(1)
    expect(api.postsTo("/sandboxes")).toHaveLength(2)
    expect(api.postsTo("/persistentvolumeclaims")).toHaveLength(1)
    expect(api.deletesOf(PVC_URL)).toHaveLength(0)
    second.unmount()
  })

  it("accepts trailing commas and comments in config.json", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    const api = mockClusterApi(undefined, `{
      // hand-edited config
      "storage": {"size":"1Gi"},
      "security": {"isolation":"gvisor"},
    }`)

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("ready"))

    const pvcPost = api.postsTo("/persistentvolumeclaims")[0]
    expect(JSON.parse(String(pvcPost?.init?.body))).toMatchObject({
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: { requests: { storage: "1Gi" } },
      },
    })
    expect(JSON.parse(String(pvcPost?.init?.body)).spec).not.toHaveProperty("storageClassName")
    unmount()
  })

  it("reports the parser error, ConfigMap name and content for malformed config.json", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    mockClusterApi(undefined, `{ "storage": `)

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("error"))
    expect(result.current.error).toContain("Invalid config.json in ConfigMap agent-sandbox/shell-config-alice")
    expect(result.current.error).toContain("Content: { \"storage\":")
    expect(result.current.error).not.toBe("Invalid config.json in shell config ConfigMap")
    unmount()
  })

  it("reports invalid field values with the expected shape", async () => {
    useAuthStore.setState({ accessToken: TOKEN, isAuthenticated: true })
    useClusterStore.setState({ activeCluster: cluster as never })
    mockClusterApi({ security: { isolation: "kata" } })

    const { result, unmount } = renderHook(() => useClusterShell())
    await act(async () => { await result.current.start() })
    await waitFor(() => expect(result.current.phase).toBe("error"))
    expect(result.current.error).toContain('security.isolation "kata" is invalid')
    expect(result.current.error).toContain('expected "gvisor" or "usernamespace"')
    unmount()
  })
})
