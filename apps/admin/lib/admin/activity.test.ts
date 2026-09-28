import { describe, expect, it } from "vitest"
import { parseActivityFilters, ukDate } from "./activity"
describe("activity filters", () => {
  it.each([{ before: "9223372036854775808" }, { before: "-1" }, { before: "0" }, { before: "1e2" }, { before: ["1", "2"] }, { action: "__proto__" }, { outcome: "unknown" }])("rejects unsafe filters %j", value => {
    expect(parseActivityFilters(value)).toBeNull()
  })
  it("preserves bigint cursor precision", () => {
    expect(parseActivityFilters({ before: "9223372036854775807", action: "SIGNED_IN", outcome: "success" })).toEqual({ before: "9223372036854775807", action: "SIGNED_IN", outcome: "success" })
    expect(parseActivityFilters({ action: "EVIDENCE_CHANGED" })).toEqual({ before: null, action: "EVIDENCE_CHANGED", outcome: null })
    expect(parseActivityFilters({ action: "AUTHORIZATION_CHANGED" })).toEqual({ before: null, action: "AUTHORIZATION_CHANGED", outcome: null })
  })
  it("accepts cleared filters", () => {
    expect(parseActivityFilters({ action: "", outcome: "" })).toEqual({ before: null, action: null, outcome: null })
  })
  it("uses UK daylight saving time", () => {
    expect(ukDate("2026-07-01T12:00:00Z")).toContain("13:00")
    expect(ukDate("2026-01-01T12:00:00Z")).toContain("12:00")
  })
})
