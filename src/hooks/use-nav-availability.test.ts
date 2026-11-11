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

  it("marks every built-in tab available when the cluster is running", () => {
    const availability = availabilityFor(cluster())

    expect(availability.get("pods")?.available).toBe(true)
    expect(availability.get("clusters")?.available).toBe(true)
  })

  it("keeps control-plane tabs reachable when the cluster is stopped", () => {
    const availability = availabilityFor(cluster({}, "stopped"))

    expect(availability.get("clusters")).toMatchObject({ available: true, unreachable: false })
    expect(availability.get("nodes")).toMatchObject({ available: true, unreachable: false })
    expect(availability.get("custom-resources")).toMatchObject({ available: true, unreachable: true })
    expect(availability.get("secrets")).toMatchObject({ available: true, unreachable: true })
  })

  it("explains why a tab is unreachable", () => {
    const availability = availabilityFor(cluster({}, "stopped"))

    expect(availability.get("pods")).toMatchObject({
      available: true,
      unreachable: true,
      reason: "Cluster is stopped",
    })
  })

  it("does not gate anything without a cluster", () => {
    const availability = availabilityFor(null)
    expect(availability.get("pods")).toMatchObject({ available: true, unreachable: false })
  })
})