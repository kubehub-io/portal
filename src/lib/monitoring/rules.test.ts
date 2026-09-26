import { describe, expect, it } from "vitest"
import {
  alertNames,
  countRules,
  draftToRequest,
  fromRows,
  isValidNamespace,
  namespaceSummary,
  sanitizeRequest,
  toDraft,
  toRows,
  validateRequest,
} from "@/lib/monitoring/rules"

describe("toRows / fromRows", () => {
  it("round trips a record", () => {
    expect(fromRows(toRows({ severity: "critical" }))).toEqual({ severity: "critical" })
  })

  it("drops rows with a blank key", () => {
    expect(fromRows([{ key: "  ", value: "orphan" }, { key: " a ", value: "b" }])).toEqual({ a: "b" })
  })
})

describe("countRules / alertNames", () => {
  const groups = [
    { name: "g1", rules: [{ alert: "Foo", expr: "up == 0" }, { expr: "bar" }] },
    { name: "g2", rules: [{ alert: "Baz", expr: "up == 0" }] },
  ]

  it("counts every rule", () => {
    expect(countRules(groups)).toBe(3)
  })

  it("only lists alerting rules, sorted", () => {
    expect(alertNames(groups)).toEqual(["Baz", "Foo"])
  })

  it("summarises a namespace entry", () => {
    expect(namespaceSummary({ namespace: "ns", groups })).toEqual({
      groups: 2,
      rules: 3,
      alerts: ["Baz", "Foo"],
    })
  })
})

describe("isValidNamespace", () => {
  it("accepts DNS style names", () => {
    expect(isValidNamespace("platform")).toBe(true)
    expect(isValidNamespace("kube-system")).toBe(true)
  })

  it("rejects empty, uppercase and invalid names", () => {
    expect(isValidNamespace("")).toBe(false)
    expect(isValidNamespace("Platform")).toBe(false)
    expect(isValidNamespace("-leading")).toBe(false)
    expect(isValidNamespace("has space")).toBe(false)
  })
})

describe("sanitizeRequest", () => {
  it("trims values and pins the namespace as the rule name", () => {
    const request = sanitizeRequest(
      {
        name: "wrong",
        groups: [{ name: " g ", interval: " 30s ", rules: [{ alert: " Foo ", expr: " up == 0 " }] }],
      },
      "platform",
    )
    expect(request.name).toBe("platform")
    expect(request.groups?.[0].name).toBe("g")
    expect(request.groups?.[0].interval).toBe("30s")
    expect(request.groups?.[0].rules?.[0]).toEqual({ alert: "Foo", expr: "up == 0" })
  })

  it("drops rules without an expression", () => {
    const request = sanitizeRequest(
      { groups: [{ name: "g", rules: [{ alert: "NoExpr" }, { alert: "Ok", expr: "up == 0" }] }] },
      "ns",
    )
    expect(request.groups?.[0].rules).toHaveLength(1)
    expect(request.groups?.[0].rules?.[0].alert).toBe("Ok")
  })

  it("drops groups that end up with no rules", () => {
    const request = sanitizeRequest({ groups: [{ name: "empty", rules: [] }] }, "ns")
    expect(request.groups).toEqual([])
  })

  it("drops empty labels and annotations", () => {
    const request = sanitizeRequest(
      { groups: [{ name: "g", rules: [{ alert: "A", expr: "up", labels: {}, annotations: {} }] }] },
      "ns",
    )
    expect(request.groups?.[0].rules?.[0]).toEqual({ alert: "A", expr: "up" })
  })

  it("keeps a zero for duration-like and numeric fields", () => {
    const request = sanitizeRequest(
      { groups: [{ name: "g", rules: [{ alert: "A", expr: "up", for: "0s" }] }] },
      "ns",
    )
    expect(request.groups?.[0].rules?.[0].for).toBe("0s")
  })
})

describe("validateRequest", () => {
  const valid = {
    name: "ns",
    groups: [
      {
        name: "g",
        interval: "30s",
        rules: [{ alert: "Foo", expr: "up == 0", for: "5m", labels: { severity: "critical" } }],
      },
    ],
  }

  it("accepts a valid request", () => {
    expect(validateRequest(valid)).toEqual({})
  })

  it("requires at least one group", () => {
    expect(validateRequest({ groups: [] }).groups).toBeTruthy()
  })

  it("requires an expression", () => {
    const errors = validateRequest({ groups: [{ name: "g", rules: [{ alert: "Foo" }] }] })
    expect(errors["groups.0.rules.0.expr"]).toBeTruthy()
  })

  it("allows a recording rule with no alert name", () => {
    expect(validateRequest({ groups: [{ name: "g", rules: [{ expr: "up" }] }] })).toEqual({})
  })

  it("rejects an invalid alert name", () => {
    const errors = validateRequest({ groups: [{ name: "g", rules: [{ alert: "9lives", expr: "up" }] }] })
    expect(errors["groups.0.rules.0.alert"]).toBeTruthy()
  })

  it("rejects duplicate alert names across groups", () => {
    const errors = validateRequest({
      groups: [
        { name: "g1", rules: [{ alert: "Foo", expr: "up" }] },
        { name: "g2", rules: [{ alert: "Foo", expr: "up" }] },
      ],
    })
    expect(errors["groups.1.rules.0.alert"]).toMatch(/Duplicate/)
  })

  it("rejects a malformed for duration", () => {
    const errors = validateRequest({ groups: [{ name: "g", rules: [{ alert: "Foo", expr: "up", for: "5 min" }] }] })
    expect(errors["groups.0.rules.0.for"]).toBeTruthy()
  })

  it("rejects an invalid label name", () => {
    const errors = validateRequest({
      groups: [{ name: "g", rules: [{ alert: "Foo", expr: "up", labels: { "not-a-label": "x" } }] }],
    })
    expect(errors["groups.0.rules.0.labels"]).toBeTruthy()
  })

  it("keys errors by their position in the second group", () => {
    const errors = validateRequest({
      groups: [
        { name: "g1", rules: [{ alert: "A", expr: "up" }] },
        { name: "g2", rules: [{ alert: "B" }] },
      ],
    })
    expect(errors["groups.1.rules.0.expr"]).toBeTruthy()
  })
})

describe("draftToRequest", () => {
  it("strips the client side rule ids", () => {
    const draft = toDraft({ groups: [{ name: "g", rules: [{ alert: "Foo", expr: "up" }] }] })
    const request = draftToRequest(draft)
    expect(request.groups?.[0].rules?.[0]).toEqual({ alert: "Foo", expr: "up" })
    expect(JSON.stringify(request)).not.toContain("rule-")
  })

  it("gives every draft rule a unique id", () => {
    const draft = toDraft({ groups: [{ name: "g", rules: [{ alert: "A", expr: "up" }, { alert: "B", expr: "up" }] }] })
    const ids = draft.groups[0].rules.map((r) => r.id)
    expect(new Set(ids).size).toBe(2)
  })
})
