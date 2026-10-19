import { describe, expect, it } from "vitest"
import {
  getNavItem,
  getNavItemForPlural,
  isNavItemActive,
  NAV_ITEMS,
  resourceTypeHref,
  resourceTypeNavId,
} from "@/lib/navigation"

describe("navigation registry", () => {
  it("has unique ids", () => {
    const ids = NAV_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("routes every tab under /dashboard", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/dashboard/")).toBe(true)
    }
  })

  it("matches nested routes but not sibling prefixes", () => {
    const pods = getNavItem("pods")!
    expect(isNavItemActive("/dashboard/workloads/pods", pods)).toBe(true)
    expect(isNavItemActive("/dashboard/workloads/pods/abc", pods)).toBe(true)
    expect(isNavItemActive("/dashboard/workloads", pods)).toBe(false)
  })

  it("resolves curated pages from their API plural", () => {
    expect(getNavItemForPlural("pods")?.id).toBe("pods")
    expect(getNavItemForPlural("persistentvolumeclaims")?.id).toBe("persistentvolumeclaims")
    expect(getNavItemForPlural("widgets")).toBeUndefined()
  })

  it("maps a nav id to a full /dashboard path so gating can match it", () => {
    // Regression: gating used to compare against "/appingresses" while the href was
    // "/dashboard/appingresses", so the managed-ingress gate never fired.
    expect(getNavItem("appingresses")?.href).toBe("/dashboard/appingresses")
    expect(getNavItem("appingresses")?.requires).toBe("managedIngress")
  })
})

describe("resource type links", () => {
  it("links CRD entries to the generic viewer with the type preselected", () => {
    expect(resourceTypeHref({ group: "kube.example.com", version: "v1", kind: "Widget" })).toBe(
      "/dashboard/custom-resources?type=kube.example.com%2Fv1%2FWidget",
    )
  })

  it("namespaces core types as core", () => {
    expect(resourceTypeHref({ group: "", version: "v1", kind: "Pod" })).toBe(
      "/dashboard/custom-resources?type=core%2Fv1%2FPod",
    )
    expect(resourceTypeNavId("core/v1/Pod")).toBe("crd:core/v1/Pod")
  })
})