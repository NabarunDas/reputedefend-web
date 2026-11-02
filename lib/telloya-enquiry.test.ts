import { describe, it, expect } from "vitest"
import {
  validateTelloyaEnquiry,
  collectTelloyaEnquiryErrors,
  telloyaEnquiryToPayload,
  type TelloyaEnquiryInput,
} from "../apps/telloya/lib/telloya-enquiry"

describe("Telloya enquiry validation", () => {
  const validEnquiry: TelloyaEnquiryInput = {
    product: "telloya",
    businessName: "Test Plumbing Ltd",
    country: "GB",
    trade: "Plumbing services",
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    privacyAccepted: true,
    source: "telloya",
  }

  it("accepts valid Telloya enquiry", () => {
    const result = validateTelloyaEnquiry(validEnquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.product).toBe("telloya")
      expect(result.data.businessName).toBe("Test Plumbing Ltd")
      expect(result.data.source).toBe("telloya")
    }
  })

  it("accepts valid Complete product enquiry", () => {
    const enquiry = { ...validEnquiry, product: "complete" as const }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.product).toBe("complete")
    }
  })

  it("rejects missing product", () => {
    const enquiry = { ...validEnquiry, product: "" as const }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.product).toBeTruthy()
    }
  })

  it("rejects invalid product", () => {
    const enquiry = { ...validEnquiry, product: "invalid" }
    const result = validateTelloyaEnquiry(enquiry as TelloyaEnquiryInput)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.product).toBeTruthy()
    }
  })

  it("rejects missing business name", () => {
    const enquiry = { ...validEnquiry, businessName: "" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.businessName).toBeTruthy()
    }
  })

  it("normalizes and validates country code", () => {
    const enquiry = { ...validEnquiry, country: "United Kingdom" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.country).toBe("GB")
    }
  })

  it("rejects invalid country", () => {
    const enquiry = { ...validEnquiry, country: "Invalid Country" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.country).toBeTruthy()
    }
  })

  it("rejects missing trade", () => {
    const enquiry = { ...validEnquiry, trade: "" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.trade).toBeTruthy()
    }
  })

  it("rejects missing name", () => {
    const enquiry = { ...validEnquiry, fullName: "" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.fullName).toBeTruthy()
    }
  })

  it("rejects invalid email", () => {
    const enquiry = { ...validEnquiry, email: "notanemail" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.email).toBeTruthy()
    }
  })

  it("rejects missing email", () => {
    const enquiry = { ...validEnquiry, email: "" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.email).toBeTruthy()
    }
  })

  it("rejects invalid phone", () => {
    const enquiry = { ...validEnquiry, phone: "123" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.phone).toBeTruthy()
    }
  })

  it("rejects missing phone", () => {
    const enquiry = { ...validEnquiry, phone: "" }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.phone).toBeTruthy()
    }
  })

  it("accepts valid phone formats", () => {
    const phones = ["+447700900000", "07700 900000", "(020) 1234 5678", "+1-555-123-4567"]
    for (const phone of phones) {
      const enquiry = { ...validEnquiry, phone }
      const result = validateTelloyaEnquiry(enquiry)
      expect(result.valid).toBe(true)
    }
  })

  it("rejects privacy not accepted", () => {
    const enquiry = { ...validEnquiry, privacyAccepted: false }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.privacyAccepted).toBeTruthy()
    }
  })

  it("accepts optional fields", () => {
    const enquiry: TelloyaEnquiryInput = {
      ...validEnquiry,
      locations: "5",
      websiteUrl: "https://example.com",
      missedCallProblem: "We miss many calls during busy periods",
      phoneSetup: "Mobile phone",
      contactPreference: "Weekday mornings",
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.locations).toBe("5")
      expect(result.data.websiteUrl).toBe("https://example.com")
    }
  })

  it("rejects invalid website URL", () => {
    const enquiry: TelloyaEnquiryInput = {
      ...validEnquiry,
      websiteUrl: "not a url",
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.websiteUrl).toBeTruthy()
    }
  })

  it("rejects wrong source", () => {
    const enquiry = { ...validEnquiry, source: "contact" }
    const result = validateTelloyaEnquiry(enquiry as any)
    expect(result.valid).toBe(false)
  })

  it("rejects malformed data", () => {
    expect(validateTelloyaEnquiry(null).valid).toBe(false)
    expect(validateTelloyaEnquiry([]).valid).toBe(false)
    expect(validateTelloyaEnquiry("string").valid).toBe(false)
  })
})

describe("Telloya enquiry payload conversion", () => {
  const input: TelloyaEnquiryInput = {
    product: "telloya",
    businessName: "Test Business",
    country: "GB",
    trade: "Plumbing",
    locations: "3",
    websiteUrl: "https://example.com",
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    missedCallProblem: "Missing important calls",
    phoneSetup: "Mobile",
    contactPreference: "Mornings",
    privacyAccepted: true,
    source: "telloya",
  }

  it("converts Telloya enquiry to database payload format", () => {
    const payload = telloyaEnquiryToPayload(input)

    expect(payload.fullName).toBe("John Smith")
    expect(payload.email).toBe("john@example.com")
    expect(payload.phone).toBe("+447700900000")
    expect(payload.businessName).toBe("Test Business")
    expect(payload.country).toBe("GB")
    expect(payload.source).toBe("telloya")
  })

  it("includes Telloya-specific fields in payload", () => {
    const payload = telloyaEnquiryToPayload(input)

    expect(payload.trade).toBe("Plumbing")
    expect(payload.product).toBe("telloya")
    expect(payload.locations).toBe("3")
    expect(payload.websiteUrl).toBe("https://example.com")
    expect(payload.missedCallProblem).toBe("Missing important calls")
    expect(payload.phoneSetup).toBe("Mobile")
    expect(payload.contactPreference).toBe("Mornings")
  })

  it("combines optional fields into structured details", () => {
    const payload = telloyaEnquiryToPayload(input)

    expect(payload.details).toContain("Missed call requirements:")
    expect(payload.details).toContain("Missing important calls")
    expect(payload.details).toContain("Phone setup:")
    expect(payload.details).toContain("Mobile")
    expect(payload.details).toContain("Contact preference:")
    expect(payload.details).toContain("Mornings")
  })

  it("handles missing optional fields", () => {
    const minimalInput: TelloyaEnquiryInput = {
      product: "complete",
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(minimalInput)

    expect(payload.locations).toBe("")
    expect(payload.websiteUrl).toBe("")
    expect(payload.missedCallProblem).toBe("")
    expect(payload.phoneSetup).toBe("")
    expect(payload.contactPreference).toBe("")
    expect(payload.details).toContain("No additional details provided")
  })
})
