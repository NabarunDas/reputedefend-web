import { describe, expect, it } from "vitest"
import { acceptanceWindowExpired, communicationsSendEnabled, sendDisabledReason } from "./gate"

const live = {
  VERCEL_ENV: "production",
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_WORKER_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  RESEND_API_KEY: "re_live_key",
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  JOB_WORKER_CADENCE_SECONDS: "300",
}

describe("customer mail activation gate", () => {
  it("fails closed for the current daily Hobby cadence and disabled provider mode", () => {
    expect(communicationsSendEnabled({
      ...live,
      COMMUNICATIONS_SEND_ENABLED: undefined,
      JOB_PROVIDER_MODE: "disabled",
      JOB_WORKER_CADENCE_SECONDS: "86400",
    })).toBe(false)
    expect(communicationsSendEnabled({ ...live, JOB_WORKER_CADENCE_SECONDS: "86400" })).toBe(false)
    expect(communicationsSendEnabled({ ...live, VERCEL_ENV: "preview" })).toBe(false)
    expect(sendDisabledReason(live)).toBe("")
    expect(sendDisabledReason({})).toMatch(/not enabled yet/)
  })

  it("expires the unknown-acceptance window after 23 hours", () => {
    const start = new Date("2026-09-28T12:00:00.000Z")
    expect(acceptanceWindowExpired(start, Date.parse("2026-09-29T10:59:00.000Z"))).toBe(false)
    expect(acceptanceWindowExpired(start, Date.parse("2026-09-29T11:00:00.000Z"))).toBe(true)
  })
})
