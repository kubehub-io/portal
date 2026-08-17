import { describe, expect, it, vi } from "vitest"
import { exchangeCode, oidcConfig } from "@/lib/auth/pkce"
import { listClusters } from "@/lib/api/control-plane"
import { listClusterScopedResources } from "@/lib/api/k8s-client"

describe("local mock mode", () => {
  it("returns mock auth data when mock mode is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true")

    const cfg = await oidcConfig()
    expect(cfg.issuer).toContain("mock")

    const tokens = await exchangeCode("local-code", "local-verifier")
    expect(tokens.access_token).toBeTruthy()
    expect(tokens.refresh_token).toBeTruthy()
    expect(tokens.expires_in).toBeGreaterThan(0)
  })

  it("returns representative control-plane and k8s data in mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true")

    const clusters = await listClusters()
    expect(clusters.length).toBeGreaterThan(0)

    const pods = await listClusterScopedResources("demo-cluster", { version: "v1", resource: "pods" })
    expect(pods.items.length).toBeGreaterThan(0)
  })
})
