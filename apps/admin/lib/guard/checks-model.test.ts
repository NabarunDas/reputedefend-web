import { describe, expect, it } from "vitest"
import {
  canCancelCheck,
  claimedWorkSurface,
  claimIsActive,
  classificationsForAvailability,
  guardCheckClassificationAllowed,
  guardCheckQueueHref,
  parseCheckQueueCursors,
  queueFor,
  type GuardCheckObligation,
} from "./checks-model"

const base: GuardCheckObligation = {
  id: "1",
  coverageId: "c",
  locationId: "l",
  coverageBasis: "INCLUDED",
  coverageState: "ACTIVE",
  serviceDate: "2026-09-30",
  windowCode: "MORNING",
  state: "CLAIMED",
  timezone: "Europe/London",
  claimedBy: "admin",
  claimExpiresAt: "2026-09-30T10:05:00.000Z",
  late: false,
  secondsLate: 0,
  attemptCount: 1,
  retryCount: 0,
  version: 1,
}

describe("guard check queue membership", () => {
  it("does not treat an expired claim as claimed by me", () => {
    expect(claimIsActive(base, "2026-09-30T10:05:01.000Z")).toBe(false)
    expect(queueFor(base, "admin", "2026-09-30T10:05:01.000Z")).not.toContain("claimed")
    expect(queueFor(base, "admin", "2026-09-30T10:04:59.000Z")).toContain("claimed")
  })

  it("exposes reclaim for an expired claim and hides work for another operator", () => {
    expect(claimedWorkSurface(base, "admin", "2026-09-30T10:04:59.000Z")).toBe("mine")
    expect(claimedWorkSurface(base, "other", "2026-09-30T10:04:59.000Z")).toBe("other")
    expect(claimedWorkSurface(base, "admin", "2026-09-30T10:05:01.000Z")).toBe("expired")
  })

  it("allows cancel only when coverage is no longer active", () => {
    expect(canCancelCheck(base)).toBe(false)
    expect(canCancelCheck({ ...base, state: "PENDING" })).toBe(false)
    expect(canCancelCheck({ ...base, coverageState: "PAUSED" })).toBe(true)
    expect(canCancelCheck({ ...base, state: "PENDING", coverageState: "ENDED" })).toBe(true)
    expect(canCancelCheck({ ...base, state: "COMPLETED", coverageState: "PAUSED" })).toBe(false)
  })

  it("treats a non-uuid queue cursor as unresolved", () => {
    const parsed = parseCheckQueueCursors({ morning: "not-a-cursor", missed: "55555555-5555-4555-8555-555555555555" }, value =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    )
    expect(parsed.morning).toEqual({ after: null, invalid: true })
    expect(parsed.missed).toEqual({ after: "55555555-5555-4555-8555-555555555555", invalid: false })
    expect(guardCheckQueueHref({ morning: null, missed: "55555555-5555-4555-8555-555555555555" }, "missed", "66666666-6666-4666-8666-666666666666"))
      .toBe("/guard/checks?missed=66666666-6666-4666-8666-666666666666")
    expect(guardCheckQueueHref({ missed: "55555555-5555-4555-8555-555555555555" }, "missed", null)).toBe("/guard/checks")
  })

  it("allows only the bounded classification and availability matrix", () => {
    expect(guardCheckClassificationAllowed("AVAILABLE", "HEALTHY")).toBe(true)
    expect(guardCheckClassificationAllowed("AVAILABLE", "CHANGE_DETECTED")).toBe(true)
    expect(guardCheckClassificationAllowed("AVAILABLE", "INCOMPLETE")).toBe(true)
    expect(guardCheckClassificationAllowed("AVAILABLE", "PROFILE_UNAVAILABLE")).toBe(false)
    expect(guardCheckClassificationAllowed("UNAVAILABLE", "PROFILE_UNAVAILABLE")).toBe(true)
    expect(guardCheckClassificationAllowed("UNAVAILABLE", "CHANGE_DETECTED")).toBe(false)
    expect(guardCheckClassificationAllowed("UNAVAILABLE", "HEALTHY")).toBe(false)
    expect(guardCheckClassificationAllowed("UNKNOWN", "INCOMPLETE")).toBe(true)
    expect(guardCheckClassificationAllowed("UNKNOWN", "CHANGE_DETECTED")).toBe(false)
    expect(guardCheckClassificationAllowed("UNKNOWN", "HEALTHY")).toBe(false)
    expect(guardCheckClassificationAllowed("UNKNOWN", "PROFILE_UNAVAILABLE")).toBe(false)
    expect(classificationsForAvailability("AVAILABLE")).toEqual(["HEALTHY", "CHANGE_DETECTED", "INCOMPLETE"])
    expect(classificationsForAvailability("UNAVAILABLE")).toEqual(["PROFILE_UNAVAILABLE"])
    expect(classificationsForAvailability("UNKNOWN")).toEqual(["INCOMPLETE"])
  })
})
