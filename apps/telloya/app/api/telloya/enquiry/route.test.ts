import { describe, it, expect } from "vitest"
import { POST } from "./route"

describe("POST /api/telloya/enquiry", () => {
  const validPayload = {
    product: "telloya",
    businessName: "Test Plumbing Ltd",
    country: "United Kingdom",
    trade: "Plumbing",
    locations: "London",
    fullName: "John Smith",
    email: "john@testplumbing.co.uk",
    phone: "+44 20 1234 5678",
    privacyAccepted: true,
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

  it("should return truthful unavailable message", async () => {
    const request = new Request("http://localhost:3000/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(json.message).toBeTruthy()
    expect(json.message).toContain("prepared for launch")
    expect(json.code).toBe("SERVICE_UNAVAILABLE")
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
