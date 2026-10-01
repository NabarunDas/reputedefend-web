import { describe, expect, it } from "vitest"
import {
  commandMessage, isSettingKey, isSettingsOperation, isTemplateKey, payloadLooksSecret,
  privacyDeletionEnabled, responseTargetsPayload, serviceHoursPayload,
} from "./model"

describe("settings model", () => {
  it("accepts only the approved setting and template keys", () => {
    expect(isSettingKey("SERVICE_HOURS")).toBe(true)
    expect(isSettingKey("RESPONSE_TARGETS")).toBe(true)
    expect(isSettingKey("RETENTION")).toBe(false)
    expect(isSettingKey("STAFF_ROLES")).toBe(false)
    expect(isTemplateKey("GUARD_ALERT")).toBe(true)
    expect(isTemplateKey("MARKETING_BLAST")).toBe(false)
    expect(isSettingsOperation("approve_setting")).toBe(true)
    expect(isSettingsOperation("execute_deletion")).toBe(true)
    expect(isSettingsOperation("invite_staff")).toBe(false)
    expect(isSettingsOperation("delete_admin")).toBe(false)
  })

  it("rejects secret-shaped payloads and keeps hours independent of Guard", () => {
    expect(payloadLooksSecret({ stripeSecret: "sk_live_123" })).toBe(true)
    expect(payloadLooksSecret({ apiKey: "x" })).toBe(true)
    expect(payloadLooksSecret({ note: "sk_test_abc" })).toBe(true)
    expect(payloadLooksSecret({ firstResponseTargetHours: 8 })).toBe(false)
    expect(serviceHoursPayload("09:00", "17:00")).toMatchObject({
      timezone: "Europe/London",
      weekendPolicy: "EXCLUDED",
      bankHolidayPolicy: "INCLUDED",
    })
    expect(responseTargetsPayload(8, 4)).toEqual({
      ENQUIRY_FIRST_RESPONSE: { hours: 8 },
      CASE_FIRST_RESPONSE: { hours: 4 },
    })
    expect(privacyDeletionEnabled({})).toBe(false)
    expect(privacyDeletionEnabled({ PRIVACY_DELETION_ENABLED: "yes" })).toBe(false)
    expect(privacyDeletionEnabled({ PRIVACY_DELETION_ENABLED: "true" })).toBe(true)
  })

  it("explains reauth, holds, retroactive settings and unverified email", () => {
    expect(commandMessage("reauth_required")).toMatch(/five minutes/)
    expect(commandMessage("denied", "legal_hold")).toMatch(/legal hold/i)
    expect(commandMessage("denied", "email_not_verified")).toMatch(/current email/)
    expect(commandMessage("denied", "deletion_disabled")).toMatch(/Physical deletion is disabled/)
    expect(commandMessage("invalid", "retroactive_effective_from")).toMatch(/cannot start in the past/)
    expect(commandMessage("conflict")).toMatch(/changed/)
    expect(commandMessage("success")).toBe("Saved.")
  })
})
