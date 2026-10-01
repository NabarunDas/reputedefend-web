import { describe, expect, it } from "vitest"
import { coverageLabel, isReportKey, netAmounts, parsePeriod } from "./model"

describe("report period and labels", () => {
  it("accepts presets and rejects malformed custom ranges", () => {
    expect(parsePeriod({ preset: "today" })?.preset).toBe("today")
    expect(parsePeriod({ preset: "last_7_days" })?.preset).toBe("last_7_days")
    expect(parsePeriod({ preset: "current_month" })?.preset).toBe("current_month")
    expect(parsePeriod({ preset: "custom", start: "2026-01-01", end: "2026-01-31" })).toMatchObject({
      preset: "custom", startDate: "2026-01-01", endDate: "2026-01-31",
    })
    expect(parsePeriod({ preset: "custom", start: "2026-02-01", end: "2026-01-01" })).toBeNull()
    expect(parsePeriod({ preset: "custom", start: "2026-01-01", end: "2027-01-03" })).toBeNull()
    expect(parsePeriod({ preset: "custom", start: "2026-13-01", end: "2026-13-02" })).toBeNull()
    expect(parsePeriod({ preset: "custom", start: "yesterday", end: "today" })).toBeNull()
  })

  it("never invents 100% coverage or mixed-currency nets", () => {
    expect(coverageLabel({ numerator: 0, denominator: 0, percentage: null })).toBe("Not applicable")
    expect(coverageLabel({ numerator: 1, denominator: 2, percentage: 50 })).toBe("1 / 2 (50%)")
    expect(isReportKey("overdue_work")).toBe(true)
    expect(isReportKey("export_all_customers")).toBe(false)
    expect(netAmounts(
      [{ currency: "GBP", amountMinor: 1000 }, { currency: "EUR", amountMinor: 200 }],
      [{ currency: "GBP", amountMinor: 250 }],
    )).toEqual([
      { currency: "EUR", amountMinor: 200 },
      { currency: "GBP", amountMinor: 750 },
    ])
  })
})
