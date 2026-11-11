import { describe, expect, it } from "vitest"
import {
  hostnameColumnFor,
  isLinkableHostname,
  isWildcardHostname,
  normaliseHostnames,
} from "@/lib/hostnames"

describe("hostname helpers", () => {
  it("normalises, trims and de-duplicates names", () => {
    expect(
      normaliseHostnames([" app.example.com ", "app.example.com", "", null, "api.example.com."]),
    ).toEqual(["app.example.com", "api.example.com"])
  })

  it("does not link wildcards, IPs or bare names", () => {
    expect(isLinkableHostname("app.example.com")).toBe(true)
    expect(isLinkableHostname("api.eu.example.com")).toBe(true)
    expect(isLinkableHostname("*.example.com")).toBe(false)
    expect(isLinkableHostname("192.168.0.68")).toBe(false)
    expect(isLinkableHostname("localhost")).toBe(false)
    expect(isLinkableHostname("")).toBe(false)
  })

  it("identifies wildcard hostnames", () => {
    expect(isWildcardHostname("*.example.com")).toBe(true)
    expect(isWildcardHostname("app.example.com")).toBe(false)
  })
})

describe("hostname columns", () => {
  it("reads HubGatewayProfile DNS names from status", () => {
    const column = hostnameColumnFor("gateway.kubehub.io", "HubGatewayProfile")
    expect(column).toMatchObject({ key: "status.dnsNames", label: "DNS Names" })
    expect(
      column?.read({
        status: { dnsNames: ["*.ey1a0f.localkube.app", "ey1a0f.localkube.app"] },
      }),
    ).toEqual(["*.ey1a0f.localkube.app", "ey1a0f.localkube.app"])
  })

  it("reads listener hostnames from Gateway and ListenerSet", () => {
    const item = {
      spec: {
        listeners: [
          { name: "http", hostname: "*.example.com" },
          { name: "api", hostname: "api.example.com" },
          { name: "no-host" },
        ],
      },
    }

    for (const kind of ["Gateway", "ListenerSet"]) {
      const column = hostnameColumnFor("gateway.networking.k8s.io", kind)
      expect(column?.label).toBe("Hostnames")
      expect(column?.read(item)).toEqual(["*.example.com", "api.example.com"])
    }
  })

  it("reads HttpRoute hostnames from spec", () => {
    const column = hostnameColumnFor("gateway.networking.k8s.io", "HttpRoute")
    expect(column?.key).toBe("spec.hostnames")
    expect(column?.read({ spec: { hostnames: ["a.example.com", "b.example.com"] } })).toEqual([
      "a.example.com",
      "b.example.com",
    ])
  })

  it("ignores unrelated resources and same-named kinds in other groups", () => {
    expect(hostnameColumnFor("gateway.kubehub.io", "HubHttpRoute")).toBeNull()
    expect(hostnameColumnFor("gateway.networking.k8s.io", "TCPRoute")).toBeNull()
    expect(hostnameColumnFor("example.com", "Gateway")).toBeNull()
  })
})
