import { describe, expect, it } from "vitest"
import { buildIntakeSnapshot, parseIntakeSnapshot } from "@/lib/cases/snapshot"
import type { EnquiryInput } from "@/lib/enquiry"

const validCase = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  phone: "+44 7700 900123",
  service: "profile-recovery",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  reviewUrl: "",
  details: "The profile was suspended on Monday.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help",
  subject: "",
} satisfies EnquiryInput

describe("buildIntakeSnapshot", () => {
  it("preserves the validated original submission without secrets or honeypot", () => {
    const snapshot = buildIntakeSnapshot(validCase)
    expect(snapshot).toEqual({
      service: "profile-recovery",
      fullName: "Alex Morgan",
      email: "alex@example.com",
      businessName: "Harbour Bakery",
      country: "United Kingdom",
      phone: "+44 7700 900123",
      websiteUrl: "https://harbourbakery.example",
      businessProfileUrl: "https://maps.google.com/?cid=123",
      reviewUrl: "",
      details: "The profile was suspended on Monday.",
      informationAccurate: true,
      privacyAccepted: true,
      source: "get-help",
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/companyFax|honeypot|RESEND|SUPABASE|apiKey|secret/i)
    expect(snapshot).not.toHaveProperty("companyFax")
    expect(snapshot).not.toHaveProperty("ip")
  })
})

describe("parseIntakeSnapshot", () => {
  it("round-trips a validated snapshot", () => {
    const parsed = parseIntakeSnapshot(buildIntakeSnapshot(validCase))
    expect(parsed?.businessName).toBe("Harbour Bakery")
    expect(parsed?.service).toBe("profile-recovery")
    expect(parsed?.email).toBe("alex@example.com")
  })

  it("rejects incomplete or unsafe snapshots", () => {
    expect(parseIntakeSnapshot(null)).toBeNull()
    expect(parseIntakeSnapshot({ corrupted: true })).toBeNull()
    expect(parseIntakeSnapshot({ ...buildIntakeSnapshot(validCase), email: 42 })).toBeNull()
    expect(parseIntakeSnapshot({ ...buildIntakeSnapshot(validCase), service: "not-a-service" })).toBeNull()
  })
})
