import { describe, expect, it } from "vitest"
import { guardCheckArgs } from "./checks-validation"

const obligationId = "55555555-5555-4555-8555-555555555555"

function complete(overrides: Record<string, unknown> = {}) {
  return guardCheckArgs("complete", {
    obligationId,
    version: 1,
    classification: "HEALTHY",
    profileAvailability: "AVAILABLE",
    locationIdentified: true,
    displayedBusinessName: "Bakery",
    reviewCount: 10,
    ratingAvailable: false,
    ...overrides,
  })
}

describe("guard check observation validation", () => {
  it("accepts the bounded classification and availability matrix", () => {
    expect(complete({ classification: "HEALTHY", profileAvailability: "AVAILABLE" })).toMatchObject({
      classification: "HEALTHY", profileAvailability: "AVAILABLE",
    })
    expect(complete({ classification: "CHANGE_DETECTED", profileAvailability: "AVAILABLE" })).toMatchObject({
      classification: "CHANGE_DETECTED", profileAvailability: "AVAILABLE",
    })
    expect(complete({ classification: "INCOMPLETE", profileAvailability: "AVAILABLE" })).toMatchObject({
      classification: "INCOMPLETE",
    })
    expect(complete({ classification: "PROFILE_UNAVAILABLE", profileAvailability: "UNAVAILABLE" })).toMatchObject({
      classification: "PROFILE_UNAVAILABLE", profileAvailability: "UNAVAILABLE",
    })
    expect(complete({ classification: "INCOMPLETE", profileAvailability: "UNKNOWN" })).toMatchObject({
      classification: "INCOMPLETE", profileAvailability: "UNKNOWN",
    })
  })

  it("rejects invalid classification and availability combinations before the database", () => {
    expect(complete({ classification: "CHANGE_DETECTED", profileAvailability: "UNAVAILABLE" })).toBeNull()
    expect(complete({ classification: "HEALTHY", profileAvailability: "UNAVAILABLE" })).toBeNull()
    expect(complete({ classification: "CHANGE_DETECTED", profileAvailability: "UNKNOWN" })).toBeNull()
    expect(complete({ classification: "HEALTHY", profileAvailability: "UNKNOWN" })).toBeNull()
    expect(complete({ classification: "PROFILE_UNAVAILABLE", profileAvailability: "UNKNOWN" })).toBeNull()
    expect(complete({ classification: "PROFILE_UNAVAILABLE", profileAvailability: "AVAILABLE" })).toBeNull()
    expect(complete({ classification: "INCOMPLETE", profileAvailability: "UNAVAILABLE" })).toBeNull()
  })
})
