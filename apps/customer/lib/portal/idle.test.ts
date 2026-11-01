import { describe, expect, it } from "vitest"
import { portalDeadlineMs, portalExpiryWarning } from "./idle"

const clock = {
  authenticatedAt: "2026-10-31T12:00:00.000Z",
  expiresAt: "2026-10-31T20:00:00.000Z",
  idleExpiresAt: "2026-10-31T12:30:00.000Z",
}

describe("portal idle warning", () => {
  it("warns from the earlier of the idle and absolute deadlines", () => {
    const idle = Date.parse(clock.idleExpiresAt)
    expect(portalDeadlineMs(clock)).toBe(idle)
    expect(portalExpiryWarning(clock, idle - 120_000)).toBe(true)
    expect(portalExpiryWarning(clock, idle - 120_001)).toBe(false)
    expect(portalExpiryWarning(clock, idle)).toBe(false)
    const absoluteFirst = { ...clock, expiresAt: "2026-10-31T12:10:00.000Z" }
    expect(portalDeadlineMs(absoluteFirst)).toBe(Date.parse(absoluteFirst.expiresAt))
  })
})
