import { describe, expect, it } from "vitest"
import { buildJourneyIntake, journeyCountryKey } from "./intake"

const snapshot = {
  fullName: "Alex",
  email: "alex@example.com",
  businessName: "Other Bakery",
  country: "United Kingdom",
  phone: "",
  websiteUrl: "",
  businessProfileUrl: "https://maps.example/old",
  reviewUrl: "",
  details: "The profile disappeared.",
}

describe("journey intake brief", () => {
  it("shows a saved URL as a saved URL and keeps email control apart from authority", () => {
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "alex@example.com", emailVerified: true },
      business: { name: "Bakery", website: null },
      location: { name: "High Street", country: "United Kingdom", profileUrl: "https://maps.example/listing" },
      duplicates: [{ id: "1", name: "Bakery" }],
      projectedEmailVerified: true,
      projectedAuthority: false,
      membershipStatus: null,
      snapshot: null,
    })
    expect(brief.emailControl).toBe("verified")
    expect(brief.authority).toBe("not_recorded")
    expect(brief.profileUrl).toBe("https://maps.example/listing")
    expect(brief.website).toBeNull()
    expect(brief.duplicates).toHaveLength(1)
  })

  it("does not show email as verified when the records disagree, and names a conflicting business", () => {
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "new@example.com", emailVerified: false },
      business: { name: "Bakery", website: "" },
      location: { name: null, country: "United Kingdom", profileUrl: "" },
      duplicates: [],
      projectedEmailVerified: true,
      projectedAuthority: false,
      membershipStatus: "pending",
      snapshot,
    })
    expect(brief.emailControl).toBe("records_disagree")
    expect(brief.authority).toBe("pending")
    expect(brief.conflicts.join(" ")).toMatch(/business name/)
    expect(brief.conflicts.join(" ")).toMatch(/email/)
    expect(brief.conflicts.join(" ")).toMatch(/profile URL/)
  })

  it("does not let a revoked membership look verified", () => {
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "alex@example.com", emailVerified: false },
      business: { name: "Bakery", website: null },
      location: { country: "United Kingdom", profileUrl: null },
      duplicates: [],
      projectedEmailVerified: false,
      projectedAuthority: false,
      membershipStatus: "revoked",
      snapshot: null,
    })
    expect(brief.authority).toBe("revoked")
  })

  it("treats legacy UK labels and canonical GB as the same country", () => {
    for (const country of ["GB", "UK", "U.K.", "United Kingdom"]) {
      expect(journeyCountryKey(country)).toBe("gb")
    }
    expect(journeyCountryKey("France")).not.toBe(journeyCountryKey("United Kingdom"))
    expect(journeyCountryKey("Ireland")).not.toBe("gb")
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "alex@example.com", emailVerified: false },
      business: { name: "Bakery", website: "https://bakery.example" },
      location: { country: "UK", profileUrl: "https://maps.example/listing" },
      duplicates: [],
      projectedEmailVerified: false,
      projectedAuthority: false,
      membershipStatus: "pending",
      snapshot: { ...snapshot, country: "GB", websiteUrl: "", businessProfileUrl: "", businessName: "Bakery", email: "alex@example.com" },
    })
    expect(brief.conflicts).toEqual([])
    expect(brief.authority).toBe("pending")
    expect(brief.emailControl).toBe("not_recorded")
    expect(brief.profileUrl).toBe("https://maps.example/listing")
  })

  it("keeps a supplied URL or an unrelated country as a discrepancy and does not rewrite the record", () => {
    const business = { name: "Bakery", website: "https://bakery.example" }
    const location = { country: "United Kingdom", profileUrl: "https://maps.example/listing" }
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "alex@example.com", emailVerified: false },
      business,
      location,
      duplicates: [],
      projectedEmailVerified: false,
      projectedAuthority: false,
      membershipStatus: null,
      snapshot: { ...snapshot, country: "France", websiteUrl: "https://other.example/", businessProfileUrl: "https://maps.example/listing" },
    })
    expect(brief.conflicts.join(" ")).toMatch(/country/)
    expect(brief.conflicts.join(" ")).toMatch(/website/)
    expect(brief.conflicts.join(" ")).not.toMatch(/profile URL/)
    expect(business.website).toBe("https://bakery.example")
    expect(location.country).toBe("United Kingdom")
  })
})
