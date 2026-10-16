import { describe, expect, it } from "vitest"
import { buildJourneyIntake } from "./intake"

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
})
