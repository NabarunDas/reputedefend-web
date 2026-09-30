import { describe, expect, it } from "vitest"
import { claimIsActive, queueFor, type GuardCheckObligation } from "./checks-model"

const base: GuardCheckObligation = {
  id: "1",
  coverageId: "c",
  locationId: "l",
  coverageBasis: "INCLUDED",
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
})
