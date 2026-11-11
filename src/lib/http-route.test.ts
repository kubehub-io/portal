import { describe, expect, it } from "vitest"
import {
  getHttpRouteConditions,
  getHttpRouteRuleLines,
  isHttpRouteKind,
} from "@/lib/http-route"

const HTTP_ROUTE = {
  metadata: { name: "adguard", namespace: "home-infra" },
  spec: {
    hostnames: ["adguard.ey1a0f.localkube.app"],
    rules: [
      {
        matches: [{ path: { type: "PathPrefix", value: "/" } }],
        backendRefs: [{ name: "adguard-home", port: 80, weight: 1 }],
      },
    ],
  },
  status: {
    parents: [
      {
        controllerName: "io.cilium/gateway-controller",
        conditions: [
          { type: "Accepted", status: "True", reason: "Accepted", message: "Accepted HTTPRoute" },
          {
            type: "ResolvedRefs",
            status: "True",
            reason: "ResolvedRefs",
            message: "Service reference is valid",
          },
        ],
      },
    ],
  },
}

describe("http route helpers", () => {
  it("recognises the Gateway API HTTPRoute kind", () => {
    expect(isHttpRouteKind("HTTPRoute")).toBe(true)
    expect(isHttpRouteKind("HttpRoute")).toBe(true)
    expect(isHttpRouteKind("TCPRoute")).toBe(false)
  })

  it("maps a rule to path => backend:port", () => {
    expect(getHttpRouteRuleLines(HTTP_ROUTE)).toEqual([
      { match: "/", backend: "adguard-home:80" },
    ])
  })

  it("expands multiple matches and backends", () => {
    const lines = getHttpRouteRuleLines({
      spec: {
        rules: [
          {
            matches: [{ path: { value: "/api" } }, { path: { value: "/v1" } }],
            backendRefs: [{ name: "api", port: 8080 }, { name: "fallback", port: 8081 }],
          },
        ],
      },
    })

    expect(lines).toEqual([
      { match: "/api", backend: "api:8080" },
      { match: "/api", backend: "fallback:8081" },
      { match: "/v1", backend: "api:8080" },
      { match: "/v1", backend: "fallback:8081" },
    ])
  })

  it("uses defaults for missing matches and backends", () => {
    expect(getHttpRouteRuleLines({ spec: { rules: [{ backendRefs: [{ name: "app" }] }] } })).toEqual([
      { match: "/", backend: "app" },
    ])
    expect(getHttpRouteRuleLines({ spec: { rules: [{ matches: [{ path: { value: "/api" } }] }] } })).toEqual([
      { match: "/api", backend: "-" },
    ])
    expect(getHttpRouteRuleLines({})).toEqual([])
  })

  it("reads Accepted and ResolvedRefs in display order", () => {
    expect(getHttpRouteConditions(HTTP_ROUTE)).toEqual([
      { type: "Accepted", status: "True", reason: "Accepted", message: "Accepted HTTPRoute" },
      {
        type: "ResolvedRefs",
        status: "True",
        reason: "ResolvedRefs",
        message: "Service reference is valid",
      },
    ])
  })

  it("surfaces the worst status when parents disagree", () => {
    const conditions = getHttpRouteConditions({
      status: {
        parents: [
          { conditions: [{ type: "Accepted", status: "True", reason: "Accepted" }] },
          { conditions: [{ type: "Accepted", status: "False", reason: "NotAccepted" }] },
        ],
      },
    })

    expect(conditions).toEqual([
      { type: "Accepted", status: "False", reason: "NotAccepted", message: undefined },
    ])
  })

  it("also reads flat HubHttpRoute conditions", () => {
    expect(
      getHttpRouteConditions(
        { status: { conditions: [{ type: "DNSReady", status: "True" }] } },
        ["DNSReady"],
      ),
    ).toEqual([{ type: "DNSReady", status: "True", reason: undefined, message: undefined }])
  })

  it("returns nothing when the route has no conditions", () => {
    expect(getHttpRouteConditions({})).toEqual([])
  })
})
