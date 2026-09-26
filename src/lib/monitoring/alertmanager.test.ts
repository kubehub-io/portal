import { describe, expect, it } from "vitest"
import {
  emptyReceiver,
  getReceiverConfigs,
  normalizeConfig,
  parseGroupBy,
  receiverTypes,
  sanitizeConfig,
  uniqueReceiverName,
  validateConfig,
  withReceiverConfigs,
} from "@/lib/monitoring/alertmanager"
import type { AlertmanagerConfig } from "@/lib/api/monitoring"

const baseConfig = (): AlertmanagerConfig => ({
  route: { receiver: "teams", group_by: ["alertname"], group_wait: "30s" },
  receivers: [
    {
      name: "teams",
      msteams_configs: [{ webhook_url: "https://outlook.office.com/webhook/abc", send_resolved: true }],
    },
  ],
})

describe("receiverTypes", () => {
  it("lists the configured types in declaration order", () => {
    const receiver = withReceiverConfigs(withReceiverConfigs({ name: "r" }, "webhook", [{}]), "telegram", [{}])
    expect(receiverTypes(receiver)).toEqual(["telegram", "webhook"])
  })

  it("is empty for an untyped receiver", () => {
    expect(receiverTypes({ name: "r" })).toEqual([])
  })
})

describe("emptyReceiver", () => {
  it("creates a single empty config of the requested type", () => {
    const receiver = emptyReceiver("telegram", "t")
    expect(receiver.name).toBe("t")
    expect(getReceiverConfigs(receiver, "telegram")).toEqual([{}])
    expect(receiverTypes(receiver)).toEqual(["telegram"])
  })
})

describe("uniqueReceiverName", () => {
  it("does not collide with existing names", () => {
    expect(uniqueReceiverName([{ name: "receiver-2" }, { name: "receiver-3" }])).toBe("receiver-4")
  })
})

describe("normalizeConfig", () => {
  it("fills in route defaults", () => {
    const config = normalizeConfig({ route: {} })
    expect(config.route.group_interval).toBe("5m")
    expect(config.route.repeat_interval).toBe("4h")
  })

  it("repairs a route pointing at a deleted receiver", () => {
    const config = normalizeConfig({ route: { receiver: "gone" }, receivers: [{ name: "kept" }] })
    expect(config.route.receiver).toBe("kept")
  })

  it("leaves a valid route alone", () => {
    expect(normalizeConfig(baseConfig()).route.receiver).toBe("teams")
  })
})

describe("sanitizeConfig", () => {
  it("strips empty fields from receiver configs", () => {
    const config = sanitizeConfig({
      ...baseConfig(),
      receivers: [
        {
          name: "teams",
          msteams_configs: [{ webhook_url: "https://example.com/hook", send_resolved: false }],
        },
      ],
    })
    expect(config.receivers?.[0].msteams_configs).toEqual([
      { webhook_url: "https://example.com/hook", send_resolved: false },
    ])
  })

  it("keeps send_resolved false, which is a meaningful value", () => {
    const config = sanitizeConfig({
      ...baseConfig(),
      receivers: [{ name: "teams", msteams_configs: [{ webhook_url: "https://x.io", send_resolved: false }] }],
    })
    expect(config.receivers?.[0].msteams_configs?.[0].send_resolved).toBe(false)
  })

  it("drops receivers without any configured type", () => {
    const config = sanitizeConfig({
      ...baseConfig(),
      receivers: [...(baseConfig().receivers ?? []), { name: "empty" }],
    })
    expect(config.receivers?.map((r) => r.name)).toEqual(["teams"])
  })

  it("trims the receiver name", () => {
    const config = sanitizeConfig({
      ...baseConfig(),
      receivers: [
        { name: "  teams  ", msteams_configs: [{ webhook_url: "https://example.com/hook" }] },
      ],
    })
    expect(config.receivers?.[0].name).toBe("teams")
  })

  it("removes an unset route receiver", () => {
    const config = sanitizeConfig({ ...baseConfig(), route: { receiver: "   " } })
    expect(config.route.receiver).toBeUndefined()
  })
})

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    expect(validateConfig(sanitizeConfig(baseConfig()))).toEqual({})
  })

  it("requires at least one receiver", () => {
    expect(validateConfig({ route: {}, receivers: [] }).receivers).toBeTruthy()
  })

  it("requires a receiver name", () => {
    const config = sanitizeConfig({ ...baseConfig(), receivers: [{ name: "", msteams_configs: [{}] }] })
    expect(validateConfig(config)["receivers.0.name"]).toBeTruthy()
  })

  it("rejects duplicate receiver names", () => {
    const config = sanitizeConfig({
      route: {},
      receivers: [
        { name: "dup", msteams_configs: [{ webhook_url: "https://x.io" }] },
        { name: "dup", webhook_configs: [{ url: "https://y.io" }] },
      ],
    })
    expect(validateConfig(config)["receivers.1.name"]).toMatch(/unique/)
  })

  it("rejects a non url teams webhook", () => {
    const config = sanitizeConfig({ ...baseConfig(), receivers: [{ name: "t", msteams_configs: [{ webhook_url: "nope" }] }] })
    expect(validateConfig(config)["receivers.0.msteams.0.webhook_url"]).toBeTruthy()
  })

  it("requires a telegram bot token and chat id", () => {
    const config = sanitizeConfig({ route: {}, receivers: [{ name: "t", telegram_configs: [{}] }] })
    const errors = validateConfig(config)
    expect(errors["receivers.0.telegram.0.bot_token"]).toBeTruthy()
    expect(errors["receivers.0.telegram.0.chat_id"]).toBeTruthy()
  })

  it("accepts a telegram config with a negative chat id", () => {
    const config = sanitizeConfig({
      route: {},
      receivers: [{ name: "t", telegram_configs: [{ bot_token: "abc", chat_id: -1001234 }] }],
    })
    expect(validateConfig(config)).toEqual({})
  })

  it("rejects an invalid email address", () => {
    const config = sanitizeConfig({ route: {}, receivers: [{ name: "e", email_configs: [{ to: "not-an-email" }] }] })
    expect(validateConfig(config)["receivers.0.email.0.to"]).toBeTruthy()
  })

  it("rejects a negative webhook max_alerts", () => {
    const config = sanitizeConfig({
      route: {},
      receivers: [{ name: "w", webhook_configs: [{ url: "https://x.io", max_alerts: -1 }] }],
    })
    expect(validateConfig(config)["receivers.0.webhook.0.max_alerts"]).toBeTruthy()
  })

  it("rejects malformed route durations", () => {
    const config = sanitizeConfig({ ...baseConfig(), route: { ...baseConfig().route, group_wait: "5 minutes" } })
    expect(validateConfig(config)["route.group_wait"]).toBeTruthy()
  })

  it("accepts compound durations", () => {
    const config = sanitizeConfig({ ...baseConfig(), route: { ...baseConfig().route, repeat_interval: "1h30m" } })
    expect(validateConfig(config)).toEqual({})
  })

  it("rejects a route pointing at a missing receiver", () => {
    const config = sanitizeConfig({ ...baseConfig(), route: { receiver: "ghost" }, receivers: [{ name: "teams", msteams_configs: [{ webhook_url: "https://x.io" }] }] })
    expect(validateConfig(config)["route.receiver"]).toBeTruthy()
  })
})

describe("parseGroupBy", () => {
  it("splits and trims comma separated labels", () => {
    expect(parseGroupBy(" alertname , cluster ,")).toEqual(["alertname", "cluster"])
  })

  it("returns an empty list for blank input", () => {
    expect(parseGroupBy("  ,  ")).toEqual([])
  })
})
