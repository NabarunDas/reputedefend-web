import { describe, expect, it } from "vitest"
import {
  buildCaseReceivedCustomerMessage,
  buildCaseReceivedInternalMessage,
  caseReceivedCustomerSubject,
  caseReceivedInternalSubject,
} from "@/lib/cases/received-email"
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

describe("case received customer email", () => {
  it("includes the public case reference and does not reuse generic enquiry copy", () => {
    expect(caseReceivedCustomerSubject("PROFILE_RECOVERY", "PR-26-7K4M2Q")).toBe(
      "[ProfileRelaunch] We've received your Profile Recovery case — PR-26-7K4M2Q",
    )
    expect(caseReceivedCustomerSubject("REVIEW_PROTECTION", "RV-26-X8P3LM")).toBe(
      "[ProfileRelaunch] We've received your Review Protection case — RV-26-X8P3LM",
    )

    const message = buildCaseReceivedCustomerMessage(
      validCase,
      "PROFILE_RECOVERY",
      "PR-26-7K4M2Q",
      "enquiries@reputedefend.com",
    )
    expect(message.kind).toBe("customer-ack")
    expect(message.to).toBe("alex@example.com")
    expect(message.subject).toContain("PR-26-7K4M2Q")
    expect(message.text).toContain("PR-26-7K4M2Q")
    expect(message.text).toContain("Harbour Bakery")
    expect(message.text).toContain("Profile Recovery")
    expect(message.text).toMatch(/passwords/i)
    expect(message.text).toMatch(/OTPs/i)
    expect(message.text).toMatch(/verification codes/i)
    expect(message.text).toMatch(/security answers/i)
    expect(message.text).toMatch(/No payment is taken/i)
    expect(message.text).not.toMatch(/We have received your enquiry/)
    expect(message.text).not.toMatch(/reinstat/i)
    expect(message.text).not.toMatch(/within 24 hours/i)
    expect(message.text).not.toMatch(/will be removed/i)
  })
})

describe("case received internal email", () => {
  it("prominently includes the same public reference and Get Help details", () => {
    expect(caseReceivedInternalSubject("PROFILE_RECOVERY", "PR-26-7K4M2Q", "Harbour Bakery")).toBe(
      "[ProfileRelaunch] New Profile Recovery case — PR-26-7K4M2Q — Harbour Bakery",
    )

    const message = buildCaseReceivedInternalMessage(
      validCase,
      "PROFILE_RECOVERY",
      "PR-26-7K4M2Q",
      "enquiries@reputedefend.com",
      "owner@example.com",
      undefined,
      new Date("2026-09-15T12:00:00.000Z"),
    )
    expect(message.kind).toBe("internal")
    expect(message.to).toBe("owner@example.com")
    expect(message.subject).toContain("PR-26-7K4M2Q")
    expect(message.text).toContain("Case reference: PR-26-7K4M2Q")
    expect(message.text).toContain("Form route: Business Profile Recovery")
    expect(message.text).toContain("Name: Alex Morgan")
    expect(message.text).toContain("Email: alex@example.com")
    expect(message.text).toContain("Phone: +44 7700 900123")
    expect(message.text).toContain("Business: Harbour Bakery")
    expect(message.text).toContain("Country: United Kingdom")
    expect(message.text).toContain("Website: https://harbourbakery.example")
    expect(message.text).toContain("Business Profile URL: https://maps.google.com/?cid=123")
    expect(message.text).toContain("The profile was suspended on Monday.")
    expect(message.text).toContain("Submitted: 2026-09-15T12:00:00.000Z")
    expect(message.text).not.toContain("companyFax")
    expect(message.text).not.toMatch(/RESEND|SUPABASE|apiKey/i)
  })
})
