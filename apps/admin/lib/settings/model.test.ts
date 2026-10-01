import { describe, expect, it } from "vitest"
import {
  commandMessage, isSettingKey, isSettingsOperation, isTemplateKey, payloadLooksSecret,
  retentionPayload, weekdayHoursPayload,
} from "./model"

describe("settings model", () => {
  it("accepts only the approved setting and template keys", () => {
    expect(isSettingKey("SERVICE_HOURS")).toBe(true)
    expect(isSettingKey("RETENTION")).toBe(true)
    expect(isSettingKey("STAFF_ROLES")).toBe(false)
    expect(isTemplateKey("GUARD_ALERT")).toBe(true)
    expect(isTemplateKey("MARKETING_BLAST")).toBe(false)
    expect(isSettingsOperation("approve_setting")).toBe(true)
    expect(isSettingsOperation("invite_staff")).toBe(false)
    expect(isSettingsOperation("delete_admin")).toBe(false)
  })

  it("rejects secret-shaped payloads and keeps hours independent of Guard", () => {
    expect(payloadLooksSecret({ stripeSecret: "sk_live_123" })).toBe(true)
    expect(payloadLooksSecret({ apiKey: "x" })).toBe(true)
    expect(payloadLooksSecret({ note: "sk_test_abc" })).toBe(true)
    expect(payloadLooksSecret({ firstResponseTargetHours: 8 })).toBe(false)
    expect(weekdayHoursPayload("09:00", "17:30", 8)).toMatchObject({
      timezone: "Europe/London",
      independentOfGuardMonitoring: true,
      firstResponseTargetHours: 8,
    })
    expect(retentionPayload({
      unsuccessfulEnquiriesDays: 90,
      caseEvidenceDays: 365,
      financialDays: 2555,
      consentDays: 365,
      securityLogsDays: 365,
    }).financialDays).toBe(2555)
  })

  it("explains reauth, holds, retroactive settings and unverified email", () => {
    expect(commandMessage("reauth_required")).toMatch(/five minutes/)
    expect(commandMessage("denied", "legal_hold")).toMatch(/legal hold/i)
    expect(commandMessage("denied", "email_not_verified")).toMatch(/current email/)
    expect(commandMessage("invalid", "retroactive_effective_from")).toMatch(/cannot start in the past/)
    expect(commandMessage("conflict")).toMatch(/changed/)
    expect(commandMessage("success")).toBe("Saved.")
  })
})
