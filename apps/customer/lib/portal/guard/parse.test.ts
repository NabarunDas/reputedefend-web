import { describe, expect, it } from "vitest"
import { parseGuard, parseGuardDetail } from "./parse"

const selector = `gd-${"ab".repeat(32)}`

function location(extra: Record<string, unknown> = {}) {
  return {
    selector,
    businessName: "Harbour Bakery",
    locationName: "High Street",
    arrangement: "Directly purchased Guard",
    status: "Permission required",
    monitoringActive: false,
    permission: "Permission required",
    billing: "Payment setup required",
    issueUnderReview: false,
    actions: [],
    ...extra,
  }
}

describe("guard projection parser", () => {
  it("accepts a customer-safe location and rejects an unexpected key", () => {
    expect(parseGuard({ locations: [location()] })?.locations[0].businessName).toBe("Harbour Bakery")
    expect(parseGuard({ locations: [location({ customerId: selector })] })).toBeNull()
    expect(parseGuard({ locations: [location({ coverageId: selector })] })).toBeNull()
    expect(parseGuard({ locations: [location({ stripeSubscriptionId: "sub_secret" })] })).toBeNull()
    expect(parseGuardDetail({ found: false })).toEqual({ found: false })
    expect(parseGuardDetail({ found: true, location: location({ notes: "secret operator note" }) })).toBeNull()
  })

  it("keeps the monitoring trio together", () => {
    const checked = location({
      lastCheckedAt: "2026-10-03T10:00:00Z",
      profileAvailable: true,
      monitoring: "Change detected — being reviewed",
      issueUnderReview: true,
    })
    expect(parseGuard({ locations: [checked] })?.locations[0].monitoring).toBe("Change detected — being reviewed")
    expect(parseGuard({ locations: [location({ lastCheckedAt: "2026-10-03T10:00:00Z" })] })).toBeNull()
    expect(parseGuard({ locations: [location({ monitoring: "No issue detected" })] })).toBeNull()
  })
})
