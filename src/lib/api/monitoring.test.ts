import { describe, expect, it } from "vitest"
import {
  alertEntity,
  alertName,
  alertState,
  countBySeverity,
  formatAlertAge,
  getAlertSeverity,
  highestSeverity,
  isAlertActive,
  type Alert,
} from "@/lib/api/monitoring"

function alert(severity?: string, extra: Partial<Alert> = {}): Alert {
  return {
    labels: { alertname: "TestAlert", ...(severity ? { severity } : {}) },
    ...extra,
  }
}

/** The payload shape returned by the real API, captured from a live response. */
const nodeDown: Alert = {
  annotations: {
    description: "Kubelet metrics scrape is down on node ubuntu-alerted",
    summary: "Node ubuntu-alerted is down",
  },
  endsAt: "2026-09-26T18:26:52.638Z",
  fingerprint: "88ff9373df885b48",
  receivers: [{ name: "tgbot-kubehub" }],
  startsAt: "2026-09-25T21:53:50.623Z",
  status: { inhibitedBy: [], mutedBy: [], silencedBy: [], state: "active" },
  updatedAt: "2026-09-26T18:21:52.655Z",
  generatorURL: "/graph?g0.expr=up%20%3D%3D%200",
  labels: { alertname: "NodeDown", cluster: "alerted", node: "ubuntu-alerted", severity: "critical" },
}

describe("getAlertSeverity", () => {
  it("reads the severity label", () => {
    expect(getAlertSeverity(alert("critical"))).toBe("critical")
    expect(getAlertSeverity(alert("warning"))).toBe("warning")
  })

  it("defaults to none when the label is missing or unknown", () => {
    expect(getAlertSeverity(alert(undefined))).toBe("none")
    expect(getAlertSeverity(alert("bogus"))).toBe("none")
  })

  it("maps page/p1 style severities onto critical", () => {
    expect(getAlertSeverity(alert("page"))).toBe("critical")
    expect(getAlertSeverity(alert("P1"))).toBe("critical")
  })
})

describe("highestSeverity", () => {
  it("is none for an empty list", () => {
    expect(highestSeverity([])).toBe("none")
  })

  it("escalates to critical when any alert is critical", () => {
    expect(highestSeverity([alert("info"), alert("critical"), alert("warning")])).toBe("critical")
  })

  it("stays at warning when nothing is critical", () => {
    expect(highestSeverity([alert("info"), alert("warning")])).toBe("warning")
  })
})

describe("countBySeverity", () => {
  it("counts each severity", () => {
    expect(countBySeverity([alert("critical"), alert("critical"), alert("warning"), alert()])).toEqual({
      critical: 2,
      warning: 1,
      info: 0,
      none: 1,
    })
  })
})

describe("alertName", () => {
  it("prefers the alertname label", () => {
    expect(alertName(alert("warning"))).toBe("TestAlert")
  })

  it("falls back to the summary annotation", () => {
    expect(alertName({ annotations: { summary: "Something broke" } })).toBe("Something broke")
  })

  it("never returns an empty name", () => {
    expect(alertName({})).toBe("Unknown alert")
  })
})

describe("alertState", () => {
  it("reads status.state, which is where the real API puts it", () => {
    expect(alertState(nodeDown)).toBe("active")
  })

  it("falls back to the legacy top level state", () => {
    expect(alertState({ state: "suppressed" })).toBe("suppressed")
  })

  it("is empty when neither is set", () => {
    expect(alertState({})).toBe("")
  })
})

describe("isAlertActive", () => {
  it("accepts an active alert with a future endsAt", () => {
    expect(isAlertActive(nodeDown, Date.parse("2026-09-26T18:22:00Z"))).toBe(true)
  })

  it("rejects a suppressed alert", () => {
    expect(isAlertActive({ ...nodeDown, status: { state: "suppressed" } })).toBe(false)
  })

  it("rejects an unprocessed alert", () => {
    expect(isAlertActive({ ...nodeDown, status: { state: "unprocessed" } })).toBe(false)
  })

  it("rejects an alert whose endsAt has passed", () => {
    expect(isAlertActive(nodeDown, Date.parse("2026-09-26T19:00:00Z"))).toBe(false)
  })

  it("accepts an alert with no state at all", () => {
    expect(isAlertActive({ labels: { alertname: "A" } })).toBe(true)
  })
})

describe("formatAlertAge", () => {
  const now = Date.parse("2026-09-26T18:22:00Z")

  it("counts from startsAt", () => {
    // 2026-09-25T21:53:50Z -> just under a day
    expect(formatAlertAge(nodeDown, now)).toBe("20h 28m")
  })

  it("falls back to the legacy activeAt", () => {
    expect(formatAlertAge({ activeAt: "2026-09-26T18:12:00Z" }, now)).toBe("10m")
  })

  it("formats seconds, minutes, hours and days", () => {
    const at = (iso: string) => formatAlertAge({ startsAt: iso }, now)
    expect(at("2026-09-26T18:21:30Z")).toBe("30s")
    expect(at("2026-09-26T18:17:00Z")).toBe("5m")
    expect(at("2026-09-26T15:22:00Z")).toBe("3h 0m")
    expect(at("2026-09-24T18:22:00Z")).toBe("2d 0h")
  })

  it("returns a dash when there is no timestamp", () => {
    expect(formatAlertAge({}, now)).toBe("-")
  })

  it("does not go negative for clock skew", () => {
    expect(formatAlertAge({ startsAt: "2026-09-26T18:30:00Z" }, now)).toBe("just now")
  })
})

describe("alertEntity", () => {
  it("falls back to the node label, which the real payload uses", () => {
    expect(alertEntity(nodeDown)).toBe("ubuntu-alerted")
  })

  it("prefers the most specific label available", () => {
    expect(alertEntity({ labels: { instance: "i", pod: "p", node: "n" } })).toBe("i")
    expect(alertEntity({ labels: { pod: "p", node: "n" } })).toBe("p")
  })

  it("is undefined without labels", () => {
    expect(alertEntity({})).toBeUndefined()
  })
})
