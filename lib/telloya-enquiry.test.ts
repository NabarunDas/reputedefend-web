import { describe, it, expect } from "vitest"
import {
  validateTelloyaEnquiry,
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

  const validTierEnquiry: TelloyaEnquiryInput = {
    product: "telloya",
    planTier: "growth",
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
    const result = validateTelloyaEnquiry(enquiry as unknown as TelloyaEnquiryInput)
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

describe("Telloya enquiry validation - Phase 05A-02", () => {
  const validTierEnquiry: TelloyaEnquiryInput = {
    product: "telloya",
    planTier: "growth",
    businessName: "Test Plumbing Ltd",
    country: "GB",
    trade: "Plumbing services",
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    privacyAccepted: true,
    source: "telloya",
  }

  it("accepts enquiry with plan tier", () => {
    const result = validateTelloyaEnquiry(validTierEnquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.planTier).toBe("growth")
    }
  })

  it("accepts enquiry with Guard add-on", () => {
    const enquiry = { 
      ...validTierEnquiry, 
      guardInterested: true, 
      guardLocationCount: 3 
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.guardInterested).toBe(true)
      expect(result.data.guardLocationCount).toBe(3)
    }
  })

  it("requires Guard location count if Guard interested", () => {
    const enquiry = { 
      ...validTierEnquiry, 
      guardInterested: true 
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.guardLocationCount).toBeTruthy()
    }
  })

  it("accepts custom plan with all required fields", () => {
    const enquiry = { 
      ...validTierEnquiry,
      planTier: "custom" as const,
      customMonthlyMinutes: 1000,
      customMonthlyCalls: 200,
      customPhoneNumbers: 3,
      customLocations: 5,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
  })

  it("requires custom plan fields when planTier is custom", () => {
    const enquiry = { 
      ...validTierEnquiry,
      planTier: "custom" as const,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.customMonthlyMinutes).toBeTruthy()
      expect(result.errors?.customMonthlyCalls).toBeTruthy()
      expect(result.errors?.customPhoneNumbers).toBeTruthy()
      expect(result.errors?.customLocations).toBeTruthy()
    }
  })

  it("accepts voice preferences", () => {
    const enquiry = { 
      ...validTierEnquiry,
      voicePreference: "female" as const,
      voiceAccent: "British",
      primaryLanguage: "English",
      speakingStyle: "professional" as const,
      additionalLanguages: "Spanish, French",
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.voicePreference).toBe("female")
      expect(result.data.voiceAccent).toBe("British")
    }
  })

  it("rejects invalid voice preference enum", () => {
    const enquiry = { 
      ...validTierEnquiry,
      voicePreference: "robot" as any,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    // Enum validation happens at input level, returns PROCESS_ERROR
    if (!result.valid) {
      expect(result.error).toBe("Unable to process this enquiry.")
    }
  })

  it("accepts overage interest with cap", () => {
    const enquiry = { 
      ...validTierEnquiry,
      overageInterested: true,
      overageMonthlyCapGbp: 100,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.overageInterested).toBe(true)
      expect(result.data.overageMonthlyCapGbp).toBe(100)
    }
  })

  it("enforces character limits on new text fields", () => {
    const longString = "a".repeat(3000)
    const enquiry = { 
      ...validTierEnquiry,
      customRequirements: longString,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.customRequirements).toBeTruthy()
    }
  })

  it("rejects invalid plan tier enum", () => {
    const enquiry = { 
      ...validTierEnquiry,
      planTier: "premium" as any,
    }
    const result = validateTelloyaEnquiry(enquiry)
    expect(result.valid).toBe(false)
    // Enum validation happens at input level, returns PROCESS_ERROR
    if (!result.valid) {
      expect(result.error).toBe("Unable to process this enquiry.")
    }
  })

  it("maintains backward compatibility with legacy product-only enquiries", () => {
    const legacyEnquiry: TelloyaEnquiryInput = {
      product: "telloya",
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const result = validateTelloyaEnquiry(legacyEnquiry)
    expect(result.valid).toBe(true)
  })
})

describe("Telloya enquiry payload - Phase 05A-02", () => {
  it("includes plan tier in payload", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "growth",
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.planTier).toBe("growth")
    expect(payload.details).toContain("Plan tier: growth")
  })

  it("includes Guard interest in payload", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "pro",
      guardInterested: true,
      guardLocationCount: 3,
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.guardInterested).toBe(true)
    expect(payload.guardLocationCount).toBe(3)
    expect(payload.details).toContain("Guard interested: Yes (3 locations)")
  })

  it("includes custom plan requirements in payload", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "custom",
      customMonthlyMinutes: 1000,
      customMonthlyCalls: 200,
      customPhoneNumbers: 3,
      customLocations: 5,
      customLanguages: "English, Spanish",
      customRequirements: "Need integration with existing CRM",
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.details).toContain("Custom requirements:")
    expect(payload.details).toContain("Minutes: 1000/month")
    expect(payload.details).toContain("Languages: English, Spanish")
    expect(payload.details).toContain("Additional requirements:")
    expect(payload.details).toContain("Need integration with existing CRM")
  })

  it("includes voice preferences in payload", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "basic",
      voicePreference: "female",
      voiceAccent: "British",
      primaryLanguage: "English",
      speakingStyle: "professional",
      additionalLanguages: "Spanish",
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.details).toContain("Voice preferences:")
    expect(payload.details).toContain("Voice: female")
    expect(payload.details).toContain("Accent: British")
    expect(payload.details).toContain("Speaking style: professional")
  })

  it("includes overage interest in payload", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "basic",
      overageInterested: true,
      overageMonthlyCapGbp: 50,
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.overageInterested).toBe(true)
    expect(payload.overageMonthlyCapGbp).toBe(50)
    expect(payload.details).toContain("Overage interested: Yes (cap: £50/month)")
  })

  it("respects 5000 character limit in details field", () => {
    const longRequirements = "a".repeat(4000)
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "custom",
      customMonthlyMinutes: 1000,
      customMonthlyCalls: 200,
      customPhoneNumbers: 3,
      customLocations: 5,
      customRequirements: longRequirements,
      businessName: "Test",
      country: "GB",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.details.length).toBeLessThanOrEqual(5000)
  })
})
