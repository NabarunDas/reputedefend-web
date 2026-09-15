import { describe, expect, it } from "vitest"
import {
  brandAssets,
  brandName,
  brandSiteUrl,
  brandTagline,
} from "@/lib/brand"
import {
  buildCaseReceivedCustomerMessage,
  buildCaseReceivedInternalMessage,
  caseReceivedCustomerHtml,
  caseReceivedCustomerLogoUrl,
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

const commercialCopy = /no payment|paid service|price|pricing|Guided|Managed/i
const outcomePromiseCopy = /reinstat|successful recovery|review removal|will be removed|within 24 hours|within \d+ (hour|business day)/i

function expectCustomerReceiptContent(
  text: string,
  html: string,
  data: Pick<EnquiryInput, "fullName" | "businessName">,
  serviceName: string,
  publicRef: string,
) {
  for (const body of [text, html]) {
    expect(body).toContain(brandName)
    expect(body).toContain(data.fullName)
    expect(body).toContain(data.businessName)
    expect(body).toContain(serviceName)
    expect(body).toContain(publicRef)
    expect(body).toContain("What happens next")
    expect(body).toContain("Security reminder")
    expect(body).toContain("simply reply to this email")
    expect(body).toContain("keep your case reference in the subject")
    expect(body).toContain(brandTagline)
    expect(body).toContain("profilerelaunch.com")
    expect(body).not.toMatch(commercialCopy)
    expect(body).not.toMatch(outcomePromiseCopy)
  }
}

describe("case received customer email", () => {
  it("keeps the searchable subject format", () => {
    expect(caseReceivedCustomerSubject("PROFILE_RECOVERY", "PR-26-7K4M2Q")).toBe(
      "[ProfileRelaunch] We've received your Profile Recovery case — PR-26-7K4M2Q",
    )
    expect(caseReceivedCustomerSubject("REVIEW_PROTECTION", "RV-26-X8P3LM")).toBe(
      "[ProfileRelaunch] We've received your Review Protection case — RV-26-X8P3LM",
    )
  })

  it("builds a complete Profile Recovery receipt without payment or outcome promises", () => {
    const message = buildCaseReceivedCustomerMessage(
      validCase,
      "PROFILE_RECOVERY",
      "PR-26-7K4M2Q",
      "enquiries@reputedefend.com",
    )
    expect(message.kind).toBe("customer-ack")
    expect(message.to).toBe("alex@example.com")
    expect(message.replyTo).toBe("enquiries@reputedefend.com")
    expect(message.subject).toContain("PR-26-7K4M2Q")
    expectCustomerReceiptContent(
      message.text,
      message.html,
      validCase,
      "Profile Recovery",
      "PR-26-7K4M2Q",
    )
    expect(message.text).toContain("Hi Alex Morgan,")
    expect(message.text).toContain("Google password")
    expect(message.text).toContain("one-time password")
    expect(message.text).toContain("verification code")
    expect(message.text).toContain("security answers")
    expect(message.text).not.toMatch(/We have received your enquiry/)
  })

  it("uses Review Protection wording and the exact public reference", () => {
    const reviewCase = {
      ...validCase,
      service: "review-protection" as const,
      businessName: "North Shore Dental",
    }
    const publicRef = "RV-26-X8P3LM"
    const message = buildCaseReceivedCustomerMessage(
      reviewCase,
      "REVIEW_PROTECTION",
      publicRef,
      "enquiries@reputedefend.com",
    )
    expect(message.subject).toBe(
      "[ProfileRelaunch] We've received your Review Protection case — RV-26-X8P3LM",
    )
    expectCustomerReceiptContent(
      message.text,
      message.html,
      reviewCase,
      "Review Protection",
      publicRef,
    )
    expect(message.text).not.toContain("Profile Recovery")
    expect(message.html).not.toContain("Profile Recovery")
  })

  it("uses the persisted communication recipient when supplied", () => {
    const message = buildCaseReceivedCustomerMessage(
      validCase,
      "PROFILE_RECOVERY",
      "PR-26-7K4M2Q",
      "enquiries@reputedefend.com",
      "canonical.recipient@example.com",
    )
    expect(message.to).toBe("canonical.recipient@example.com")
  })

  it("uses the sample Nabarun / abc receipt copy without transforming the reference", () => {
    const sample = {
      ...validCase,
      fullName: "Nabarun",
      businessName: "abc",
    }
    const publicRef = "PR-26-EQMVKZ"
    const message = buildCaseReceivedCustomerMessage(
      sample,
      "PROFILE_RECOVERY",
      publicRef,
      "enquiries@reputedefend.com",
    )
    expect(message.text).toContain("Hi Nabarun,")
    expect(message.text).toContain("details about abc")
    expect(message.text).toMatch(/Your case reference\n\nPR-26-EQMVKZ\n\n/)
    expect(message.html).toContain("PR-26-EQMVKZ")
    expect(message.html).not.toContain("pr-26-eqmvkz")
  })
})

describe("case received customer HTML", () => {
  it("uses email-safe layout, brand logo URL, and the case-reference panel", () => {
    const html = caseReceivedCustomerHtml(validCase, "PROFILE_RECOVERY", "PR-26-7K4M2Q")
    const logoUrl = caseReceivedCustomerLogoUrl()

    expect(logoUrl).toBe(`${brandSiteUrl}${brandAssets.horizontal.dark}`)
    expect(html).toContain('role="presentation"')
    expect(html).toMatch(/max-width:\s*600px/)
    expect(html).toContain(logoUrl)
    expect(html).toContain(`alt="${brandName}"`)
    expect(html).toContain("case-reference-panel")
    expect(html).toContain("security-reminder-panel")
    expect(html).toContain(brandSiteUrl)
    expect(html).not.toContain("github.com")
    expect(html).not.toContain("data:image")
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/display\s*:\s*flex/i)
    expect(html).not.toMatch(/display\s*:\s*grid/i)
  })

  it("escapes untrusted name, business, and case reference values", () => {
    const malicious = {
      ...validCase,
      fullName: `<script>alert("name")</script>`,
      businessName: `<img src=x onerror=alert(1)>`,
    }
    const publicRef = `PR-26-EQMVKZ"><script>alert(1)</script>`
    const html = caseReceivedCustomerHtml(malicious, "PROFILE_RECOVERY", publicRef)

    expect(html).not.toContain("<script>alert")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(html).toContain("PR-26-EQMVKZ&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;")
  })

  it("does not leak internal identifiers or secrets", () => {
    const html = caseReceivedCustomerHtml(validCase, "PROFILE_RECOVERY", "PR-26-7K4M2Q")
    expect(html).not.toMatch(/submission[_-]?key/i)
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(html).not.toMatch(/supabase/i)
    expect(html).not.toMatch(/resend/i)
    expect(html).not.toMatch(/api[_-]?key/i)
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
    expect(message.html).toContain("<strong>Case reference</strong>")
    expect(message.html).toContain("PR-26-7K4M2Q")
  })
})
