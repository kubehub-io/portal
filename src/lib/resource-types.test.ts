import { describe, expect, it } from "vitest"
import type { APIDiscoveryResult } from "@/lib/api/k8s-client"
import {
  buildResourceTypes,
  matchesResourceTypeQuery,
  parseResourceTypeKey,
  resourceTypeKey,
  type ResourceTypeEntry,
} from "@/lib/resource-types"

function discovery(overrides?: Partial<APIDiscoveryResult>): APIDiscoveryResult {
  return {
    coreVersions: ["v1"],
    groups: [
      {
        name: "",
        versions: [{ groupVersion: "v1", version: "v1" }],
        preferredVersion: { groupVersion: "v1", version: "v1" },
        resources: [
          { name: "pods", singularName: "pod", kind: "Pod", namespaced: true },
          { name: "pods/log", singularName: "", kind: "Pod", namespaced: true },
          { name: "services", singularName: "service", kind: "Service", namespaced: true },
        ],
      },
      {
        name: "apps",
        versions: [{ groupVersion: "apps/v1", version: "v1" }],
        preferredVersion: { groupVersion: "apps/v1", version: "v1" },
        resources: [
          { name: "deployments", singularName: "deployment", kind: "Deployment", namespaced: true },
        ],
      },
      {
        name: "kube.example.com",
        versions: [{ groupVersion: "kube.example.com/v1", version: "v1" }],
        preferredVersion: { groupVersion: "kube.example.com/v1", version: "v1" },
        resources: [
          { name: "widgets", singularName: "widget", kind: "Widget", namespaced: true },
        ],
      },
      { name: "metrics.k8s.io", versions: [], preferredVersion: { groupVersion: "", version: "" } },
    ],
    ...overrides,
  }
}

describe("buildResourceTypes", () => {
  it("lists core, built-in and custom resource types", () => {
    const types = buildResourceTypes(discovery())
    expect(types.map((t) => t.key)).toEqual([
      "apps/v1/Deployment",
      "core/v1/Pod",
      "core/v1/Service",
      "kube.example.com/v1/Widget",
    ])
  })

  it("skips subresources such as pods/log", () => {
    const types = buildResourceTypes(discovery())
    expect(types.some((t) => t.plural.includes("/"))).toBe(false)
  })

  it("marks core resources with an empty group", () => {
    const pod = buildResourceTypes(discovery()).find((t) => t.kind === "Pod")
    expect(pod).toMatchObject({ group: "", key: "core/v1/Pod", namespaced: true })
  })

  it("skips groups without a served version", () => {
    const types = buildResourceTypes(discovery())
    expect(types.some((t) => t.group === "metrics.k8s.io")).toBe(false)
  })

  it("returns nothing without discovery", () => {
    expect(buildResourceTypes(undefined)).toEqual([])
  })
})

describe("resource type keys", () => {
  it("round-trips through parse", () => {
    expect(parseResourceTypeKey(resourceTypeKey("apps", "v1", "Deployment"))).toEqual({
      group: "apps",
      version: "v1",
      kind: "Deployment",
    })
    expect(parseResourceTypeKey("core/v1/Pod")).toEqual({
      group: "",
      version: "v1",
      kind: "Pod",
    })
  })

  it("rejects malformed keys", () => {
    expect(parseResourceTypeKey("apps/Deployment")).toBeNull()
    expect(parseResourceTypeKey("apps//Deployment")).toBeNull()
  })
})

describe("matchesResourceTypeQuery", () => {
  const entry: ResourceTypeEntry = {
    key: "kube.example.com/v1/Widget",
    group: "kube.example.com",
    version: "v1",
    kind: "Widget",
    plural: "widgets",
    namespaced: true,
  }

  it("matches kind, plural, group and full key", () => {
    expect(matchesResourceTypeQuery(entry, "widget")).toBe(true)
    expect(matchesResourceTypeQuery(entry, "widgets")).toBe(true)
    expect(matchesResourceTypeQuery(entry, "example.com")).toBe(true)
    expect(matchesResourceTypeQuery(entry, "example.com/v1/widget")).toBe(true)
  })

  it("rejects unrelated queries", () => {
    expect(matchesResourceTypeQuery(entry, "gateway")).toBe(false)
  })

  it("matches everything on an empty query", () => {
    expect(matchesResourceTypeQuery(entry, "")).toBe(true)
  })
})