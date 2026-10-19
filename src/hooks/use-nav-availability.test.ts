import { beforeEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useNavAvailability } from "@/hooks/use-nav-availability"
import { useClusterStore, type Cluster } from "@/stores/cluster-store"

function cluster(overrides: Partial<Cluster["spec"]> = {}, state = "running"): Cluster {
  return {
    apiVersion: "v1",
    kind: "Cluster",
    metadata: { name: "demo" },
    spec: { region: "local", network: {}, ...overrides },
    status: { publicDns: "demo.example.com", state },
  }
}

function availabilityFor(clusterValue: Cluster | null) {
  useClusterStore.setState({ activeCluster: clusterValue })
  const { result } = renderHook(() => useNavAvailability())
  return result.current
}

describe("useNavAvailability", () => {
  beforeEach(() => {
    useClusterStore.setState({ activeCluster: null })
  })

  it("marks tabs unavailable when the cluster feature behind them is disabled", () => {
    const availability = availabilityFor(cluster({ managedIngressProfile: { enabled: false } }))

    expect(availability.get("appingresses")).toMatchObject({ available: false })
    expect(availability.get("pods")?.available).toBe(true)
  })

  it("treats a missing managed ingress profile as enabled", () => {
    const availability = availabilityFor(cluster())
    expect(availability.get("appingresses")?.available).toBe(true)
  })

  it("keeps the catalog reachable when the cluster is stopped", () => {
    const availability = availabilityFor(cluster({}, "stopped"))

    expect(availability.get("all-resources")).toMatchObject({ available: true, unreachable: false })
    expect(availability.get("nodes")).toMatchObject({ available: true, unreachable: false })
    expect(availability.get("custom-resources")).toMatchObject({ available: true, unreachable: true })
    expect(availability.get("secrets")).toMatchObject({ available: true, unreachable: true })
  })

  it("reports a stopped cluster and a disabled feature together", () => {
    const availability = availabilityFor(cluster({ managedIngressProfile: { enabled: false } }, "stopped"))

    expect(availability.get("appingresses")).toMatchObject({
      available: false,
      unreachable: true,
      reason: "Managed ingress is disabled for this cluster",
    })
  })

  it("does not gate anything without a cluster", () => {
    const availability = availabilityFor(null)
    expect(availability.get("pods")).toMatchObject({ available: true, unreachable: false })
  })
})