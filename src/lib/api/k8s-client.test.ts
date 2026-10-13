import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyK8sResource, deleteK8sResource, sanitizeForApply } from "@/lib/api/k8s-client"
import { useAuthStore } from "@/stores/auth-store"
import type { Cluster } from "@/stores/cluster-store"

const cluster = {
  metadata: { name: "prod" },
  status: { publicDns: "prod.example.com" },
} as unknown as Cluster

const DEPLOY_DESC = { group: "apps", version: "v1", resource: "deployments" }
const PATH = "/apis/apps/v1/namespaces/default/deployments/web"

/** A hand-written manifest: no resourceVersion, which is what makes a PUT fail. */
const MANIFEST = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name: "web", namespace: "default" },
  spec: { replicas: 2 },
}

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

let calls: Call[] = []

function reply(status: number, body: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Wire up fetch with one response per call, in order. */
function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? "GET",
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? init.body : undefined,
    })
    const next = responses.shift()
    if (!next) throw new Error(`unexpected request: ${init.method ?? "GET"} ${url}`)
    return next
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function bodyOf(index: number): Record<string, unknown> {
  return JSON.parse(calls[index].body ?? "{}")
}

beforeEach(() => {
  calls = []
  useAuthStore.setState({ accessToken: "token", isAuthenticated: true, clearTokens: () => {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("applyK8sResource", () => {
  it("applies with server-side apply instead of a replace", async () => {
    mockFetch(reply(200, MANIFEST))

    await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("PATCH")
    expect(calls[0].url).toBe(`https://prod.example.com:8443${PATH}?fieldManager=kubehub-portal&force=true`)
    expect(calls[0].headers["Content-Type"]).toBe("application/apply-patch+yaml")
  })

  it("strips server-owned metadata, so no resourceVersion is sent", async () => {
    mockFetch(reply(200, MANIFEST))

    await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", {
      ...MANIFEST,
      metadata: {
        name: "web",
        namespace: "default",
        resourceVersion: 4711,
        uid: "5f4d",
        creationTimestamp: "2026-01-01T00:00:00Z",
        managedFields: [{ manager: "kubectl" }],
      },
    })

    expect(bodyOf(0).metadata).toEqual({ name: "web", namespace: "default" })
  })

  it("applies the same manifest repeatedly", async () => {
    // The bug: the second apply used to PUT without a resourceVersion and the
    // apiserver answered "metadata.resourceVersion: Invalid value: 0: must be
    // specified for an update".
    mockFetch(reply(201, MANIFEST), reply(200, MANIFEST))

    await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)
    await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)

    expect(calls.map((c) => c.method)).toEqual(["PATCH", "PATCH"])
  })

  it("surfaces the apiserver message on rejection", async () => {
    mockFetch(
      reply(422, {
        kind: "Status",
        message: "Deployment.apps \"web\" is invalid: spec.replicas: Invalid value: -1",
        code: 422,
      }),
    )

    await expect(applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)).rejects.toThrow(
      /spec.replicas: Invalid value: -1/,
    )
  })

  describe("when the apiserver has no server-side apply", () => {
    const unsupported = () => reply(415, { message: "unsupported media type" })

    it("creates a resource that does not exist yet", async () => {
      mockFetch(unsupported(), reply(404, {}), reply(201, MANIFEST))

      await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)

      expect(calls.map((c) => c.method)).toEqual(["PATCH", "GET", "POST"])
    })

    it("carries the live resourceVersion into the update", async () => {
      mockFetch(
        unsupported(),
        reply(200, { metadata: { name: "web", namespace: "default", uid: "5f4d", resourceVersion: "4711" } }),
        reply(200, MANIFEST),
      )

      await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)

      expect(calls.map((c) => c.method)).toEqual(["PATCH", "GET", "PUT"])
      expect(bodyOf(2).metadata).toMatchObject({ resourceVersion: "4711", uid: "5f4d" })
    })

    it("retries once against the version a racing writer left behind", async () => {
      const conflict = reply(409, { message: "the object has been modified; please apply your changes to the latest version" })
      mockFetch(
        unsupported(),
        reply(200, { metadata: { name: "web", namespace: "default", resourceVersion: "4711" } }),
        conflict,
        reply(200, { metadata: { name: "web", namespace: "default", resourceVersion: "4712" } }),
        reply(200, MANIFEST),
      )

      await applyK8sResource(cluster, "default", DEPLOY_DESC, "web", MANIFEST)

      expect(calls.map((c) => c.method)).toEqual(["PATCH", "GET", "PUT", "GET", "PUT"])
      expect(bodyOf(2).metadata).toMatchObject({ resourceVersion: "4711" })
      expect(bodyOf(4).metadata).toMatchObject({ resourceVersion: "4712" })
    })
  })
})

describe("sanitizeForApply", () => {
  it("leaves the manifest otherwise untouched", () => {
    expect(sanitizeForApply(MANIFEST)).toEqual(MANIFEST)
  })

  it("does not mutate its input", () => {
    const input = { metadata: { name: "web", resourceVersion: "1" } }
    sanitizeForApply(input)
    expect(input.metadata.resourceVersion).toBe("1")
  })

  it("tolerates a manifest with no metadata", () => {
    expect(sanitizeForApply({ kind: "Namespace" })).toEqual({ kind: "Namespace" })
  })
})

describe("deleteK8sResource", () => {
  it("sends a DELETE to the namespaced path", async () => {
    mockFetch(reply(200, { kind: "Status", status: "Success" }))

    await deleteK8sResource(cluster, "default", DEPLOY_DESC, "web")

    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].url).toBe(`https://prod.example.com:8443${PATH}`)
  })

  it("surfaces the apiserver message rather than a bare status text", async () => {
    mockFetch(reply(403, { message: 'deployments.apps is forbidden: User "dev" cannot delete' }))

    await expect(deleteK8sResource(cluster, "default", DEPLOY_DESC, "web")).rejects.toThrow(
      /cannot delete/,
    )
  })
})
