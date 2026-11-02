import { describe, it, expect } from "vitest"
import { POST } from "./route"
import type { TelloyaEnquiryRequest } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"

describe("POST /api/telloya/enquiry", () => {
  const validPayload: TelloyaEnquiryRequest = {
    product: "telloya",
    businessName: "Test Plumbing Ltd",
    country: "United Kingdom",
    trade: "Plumbing",
    locations: "London",
    fullName: "John Smith",
    email: "john@testplumbing.co.uk",
    phone: "+44 20 1234 5678",
    privacyAccepted: true,
    source: "telloya",
    submissionKey: crypto.randomUUID(),
  }

  it("should NOT return success without persistence", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    // Critical: Must NOT return ok:true until database is wired
    expect(json.ok).toBe(false)
    expect(response.status).toBe(503)
  })

  it("should NOT generate fake references", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    // Critical: Must NOT return fake TY-XX-XXXXXX references
    expect(json.enquiryRef).toBeUndefined()
  })

  it("should return truthful unavailable message with verified contact email", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(json.message).toBeTruthy()
    expect(json.message).toContain("prepared for launch")
    expect(json.message).toContain(legalIdentity.contactEmail)
    expect(json.code).toBe("SERVICE_UNAVAILABLE")
  })

  it("should NOT include fabricated contact details", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    // Must NOT include fake phone numbers or unverified emails
    expect(json.message).not.toContain("hello@profilerelaunch.com")
    expect(json.message).not.toContain("+44 20")
    expect(json.message).not.toContain("1234 5678")
    // Should include verified email
    expect(json.message).toContain("contact@profilerelaunch.com")
  })

  it("should accept valid frontend payload structure", async () => {
    // Test with actual frontend payload structure
    const frontendPayload: TelloyaEnquiryRequest = {
      product: "complete",
      businessName: "Example Electricians",
      country: "United Kingdom",
      trade: "Electrical Services",
      locations: "Manchester, Bolton",
      websiteUrl: "https://example-electric.co.uk",
      fullName: "Jane Doe",
      email: "jane@example-electric.co.uk",
      phone: "+44 161 123 4567",
      missedCallProblem: "Miss calls when on site",
      phoneSetup: "Mobile forwarding",
      contactPreference: "Email preferred",
      privacyAccepted: true,
      source: "telloya",
      submissionKey: crypto.randomUUID(),
    }

    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(frontendPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    // Should reach prelaunch response (503), not fail validation (400)
    expect(response.status).toBe(503)
    expect(json.code).toBe("SERVICE_UNAVAILABLE")
    expect(json.ok).toBe(false)
  })

  it("should validate required fields", async () => {
    const invalidPayload = {
      product: "",
      businessName: "",
      country: "",
      trade: "",
      fullName: "",
      email: "invalid-email",
      phone: "",
      privacyAccepted: false,
      source: "telloya",
      submissionKey: crypto.randomUUID(),
    }

    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalidPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(json.ok).toBe(false)
    expect(response.status).toBe(400)
    expect(json.errors).toBeDefined()
    expect(json.errors.product).toBeTruthy()
    expect(json.errors.businessName).toBeTruthy()
    expect(json.errors.email).toBeTruthy()
  })

  it("should reject oversized payloads", async () => {
    const hugePayload = {
      ...validPayload,
      trade: "x".repeat(200000),
    }

    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hugePayload),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(json.ok).toBe(false)
    expect(response.status).toBe(413)
  })

  it("should reject malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ invalid json",
    })

    const response = await POST(request)
    const json = await response.json()

    expect(json.ok).toBe(false)
    expect(response.status).toBe(400)
  })
})
