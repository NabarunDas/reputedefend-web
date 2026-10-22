import { describe, expect, it } from "vitest"
import { localDateTime, quoteActionExpiryWindow } from "./action-expiry"

const now = Date.parse("2026-10-22T12:00:00.000Z")

describe("customer quotation acceptance link expiry", () => {
  it("defaults to one day but never exceeds the offered quote's validity", () => {
    const window = quoteActionExpiryWindow("2026-10-29T13:28:02.806Z", now)
    expect(window.ready).toBe(true)
    expect(window.suggested).toBe(now + 24 * 60 * 60 * 1000)
    expect(window.latest).toBeLessThan(now + 7 * 24 * 60 * 60 * 1000)
    expect(window.latest).toBeLessThanOrEqual(Date.parse("2026-10-29T13:28:02.806Z"))
  })
  it("clamps suggested expiration to an earlier quote expiry", () => {
    const limit = new Date(now + 8 * 60 * 60 * 1000).toISOString()
    const window = quoteActionExpiryWindow(limit, now)
    expect(window.ready).toBe(true)
    expect(window.suggested).toBeLessThan(Date.parse(limit))
  })
  it("refuses to suggest a link when the quote expires too soon", () => {
    const window = quoteActionExpiryWindow(new Date(now + 10 * 60 * 1000).toISOString(), now)
    expect(window.ready).toBe(false)
    expect(Number.isNaN(window.suggested)).toBe(true)
  })
  it("uses calendar date/time fields for browser-local input", () => {
    expect(localDateTime(NaN)).toBe("")
    expect(localDateTime(now)).toMatch(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/)
  })
})
