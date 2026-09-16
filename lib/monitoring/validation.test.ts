import { describe, expect, it } from "vitest"
import { validateMonitoringRequest, monitoringLimits } from "@/lib/monitoring/validation"

const valid = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 1,
  termsAccepted: true,
  source: "start-monitoring",
}

describe("validateMonitoringRequest", () => {
  it("accepts a valid minimal request", () => {
    const result = validateMonitoringRequest(valid)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.phone).toBe("")
      expect(result.data.websiteUrl).toBe("")
      expect(result.data.numberOfLocations).toBe(1)
    }
  })

  it("accepts optional phone and website", () => {
    const result = validateMonitoringRequest({
      ...valid,
      phone: "+44 7700 900123",
      websiteUrl: "https://harbourbakery.example",
    })
    expect(result.valid).toBe(true)
  })

  it("rejects missing full name", () => {
    const result = validateMonitoringRequest({ ...valid, fullName: "" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.fullName).toMatch(/name/i)
  })

  it("rejects invalid email", () => {
    const result = validateMonitoringRequest({ ...valid, email: "not-an-email" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.email).toMatch(/email/i)
  })

  it("rejects missing business", () => {
    const result = validateMonitoringRequest({ ...valid, businessName: "   " })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.businessName).toMatch(/business/i)
  })

  it("rejects missing country", () => {
    const result = validateMonitoringRequest({ ...valid, country: "" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.country).toMatch(/country/i)
  })

  it("rejects invalid website", () => {
    const result = validateMonitoringRequest({ ...valid, websiteUrl: "ftp://example.com" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.websiteUrl).toMatch(/website/i)
  })

  it("rejects missing Business Profile URL", () => {
    const result = validateMonitoringRequest({ ...valid, businessProfileUrl: "" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.businessProfileUrl).toMatch(/Business Profile/i)
  })

  it("rejects invalid Business Profile URL", () => {
    const result = validateMonitoringRequest({ ...valid, businessProfileUrl: "javascript:alert(1)" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.businessProfileUrl).toMatch(/valid/i)
  })

  it("accepts a Google Maps share-link variant", () => {
    const result = validateMonitoringRequest({
      ...valid,
      businessProfileUrl: "https://maps.app.goo.gl/abc123",
    })
    expect(result.valid).toBe(true)
  })

  it("rejects locations 0, 1001 and decimals", () => {
    expect(validateMonitoringRequest({ ...valid, numberOfLocations: 0 }).valid).toBe(false)
    expect(validateMonitoringRequest({ ...valid, numberOfLocations: 1001 }).valid).toBe(false)
    expect(validateMonitoringRequest({ ...valid, numberOfLocations: 1.5 }).valid).toBe(false)
    expect(validateMonitoringRequest({ ...valid, numberOfLocations: "2.2" }).valid).toBe(false)
  })

  it("accepts locations as a digit string within range", () => {
    const result = validateMonitoringRequest({ ...valid, numberOfLocations: "3" })
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.data.numberOfLocations).toBe(3)
  })

  it("rejects termsAccepted false", () => {
    const result = validateMonitoringRequest({ ...valid, termsAccepted: false })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.termsAccepted).toMatch(/authorised/i)
  })

  it("rejects a filled honeypot without field errors", () => {
    const result = validateMonitoringRequest({ ...valid, companyFax: "spam" })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors).toBeUndefined()
      expect(result.error).toBe("Unable to process this request.")
    }
  })

  it("rejects oversized values", () => {
    const result = validateMonitoringRequest({
      ...valid,
      fullName: "A".repeat(monitoringLimits.fullName + 1),
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.fullName).toMatch(/characters/i)
  })

  it("rejects a non start-monitoring source", () => {
    const result = validateMonitoringRequest({ ...valid, source: "get-help" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors).toBeUndefined()
  })
})
