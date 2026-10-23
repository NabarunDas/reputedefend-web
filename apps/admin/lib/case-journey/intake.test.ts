import { describe, expect, it } from "vitest"
import { buildJourneyIntake, emailReadiness, formatUkSubmittedAt, journeyCountryKey, screeningContradictsRecord, screeningFieldDefaults } from "./intake"
import { parseJourneyExtension } from "./read"

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
    expect(emailReadiness({ ...brief, emailSuppressed: false }).state).toBe("verified")
    expect(emailReadiness({ ...brief, emailSuppressed: true })).toMatchObject({ state: "suppressed", outstanding: false, label: "Verified and suppressed" })
    expect(emailReadiness({ ...brief, emailSuppressed: null }).state).toBe("verified_unchecked")
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
    expect(emailReadiness(brief)).toMatchObject({ state: "records_disagree", label: "Not verified", outstanding: true })
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
    expect(emailReadiness(brief).detail).toMatch(/does not verify this address/)
    expect(emailReadiness({ ...brief, emailConfirmationPending: true })).toMatchObject({
      state: "not_recorded",
      label: "Email confirmation pending — requested automatically in your case receipt",
      outstanding: true,
      confirmationPending: true,
    })
    expect(emailReadiness({ ...brief, emailControl: "verified", emailSuppressed: false, emailConfirmationPending: true }).label).toBe("Verified")
    expect(emailReadiness({ ...brief, email: "", snapshot: null })).toMatchObject({ label: "No email", outstanding: true })
    expect(emailReadiness({
      ...brief,
      email: "new@example.com",
      emailControl: "verified",
      emailSuppressed: false,
      snapshot: { ...snapshot, email: "submitted@example.com" },
    })).toMatchObject({ state: "address_differs", label: "Not verified", outstanding: true })
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

  it("prefills a recorded website and leaves a saved Google URL unselected", () => {
    expect(screeningFieldDefaults({ website: " https://bakery.example ", profileUrl: "https://maps.example/listing" })).toEqual({
      website: "PRESENT",
      listing: "",
      websiteRecorded: true,
      profileRecorded: true,
    })
    expect(screeningFieldDefaults({ website: "  ", profileUrl: null })).toEqual({
      website: "NONE",
      listing: "NOT_SUPPLIED",
      websiteRecorded: false,
      profileRecorded: false,
    })
    expect(screeningFieldDefaults({ website: null, profileUrl: "  " }).listing).toBe("NOT_SUPPLIED")
    expect(screeningFieldDefaults({ website: null, profileUrl: "https://maps.example/listing" }).listing).not.toBe("ACCESSIBLE")
  })

  it("treats no website or not supplied as a contradiction only when that value is already recorded", () => {
    expect(screeningContradictsRecord({
      website: "NONE", listing: "SUSPENDED_OR_MISSING", recordedWebsite: "https://bakery.example", recordedProfileUrl: null,
      outcome: "PRELIMINARY_COMPLETE", discrepancy: false,
    })).toBe(true)
    expect(screeningContradictsRecord({
      website: "NONE", listing: "NOT_SUPPLIED", recordedWebsite: null, recordedProfileUrl: null,
      outcome: "FURTHER_INFORMATION", discrepancy: false,
    })).toBe(false)
    expect(screeningContradictsRecord({
      website: "PRESENT", listing: "NOT_SUPPLIED", recordedWebsite: null, recordedProfileUrl: "https://maps.example/listing",
      outcome: "FURTHER_INFORMATION", discrepancy: false,
    })).toBe(true)
    expect(screeningContradictsRecord({
      website: "NONE", listing: "NOT_SUPPLIED", recordedWebsite: "https://bakery.example", recordedProfileUrl: "https://maps.example/listing",
      outcome: "ESCALATE", discrepancy: true,
    })).toBe(false)
    expect(screeningContradictsRecord({
      website: "PRESENT", listing: "SUSPENDED_OR_MISSING", recordedWebsite: "https://bakery.example", recordedProfileUrl: "https://maps.example/listing",
      outcome: "PRELIMINARY_COMPLETE", discrepancy: false,
    })).toBe(false)
  })

  it("formats the original submission in UK local time and keeps that time on the brief", () => {
    expect(formatUkSubmittedAt("2026-01-15T12:00:00.000Z")).toBe("15 January 2026 at 12:00")
    expect(formatUkSubmittedAt("2026-07-01T12:00:00.000Z")).toBe("1 July 2026 at 13:00")
    expect(formatUkSubmittedAt("not-a-time")).toBeNull()
    const brief = buildJourneyIntake({
      message: "The profile disappeared.",
      reviewUrl: null,
      customer: { name: "Alex", email: "alex@example.com" },
      business: { name: "Bakery", website: null },
      location: { country: "United Kingdom", profileUrl: null },
      duplicates: [],
      projectedEmailVerified: false,
      projectedAuthority: false,
      membershipStatus: null,
      snapshot: null,
      openedAt: "2026-01-15T12:00:00.000Z",
    })
    expect(brief.openedAt).toBe("2026-01-15T12:00:00.000Z")
    expect(brief.submittedAtLabel).toBe("15 January 2026 at 12:00")
    expect(parseJourneyExtension({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: null,
      events: [],
    })?.openedAt).toBe("2026-01-15T12:00:00.000Z")
  })
})
