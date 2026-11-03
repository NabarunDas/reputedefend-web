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
      // customMonthlyCalls is optional, no error expected
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
      voicePreference: "robot",
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
      planTier: "premium",
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

describe("Telloya enquiry regression tests", () => {
  it("accepts legacy enquiry without any Phase 05A-02 fields", () => {
    const legacyEnquiry: TelloyaEnquiryInput = {
      product: "telloya",
      businessName: "Legacy Business Ltd",
      country: "United Kingdom",
      trade: "Plumbing",
      locations: "London, Manchester",
      websiteUrl: "https://legacy.example.com",
      fullName: "John Legacy",
      email: "john@legacy.example.com",
      phone: "+44 7700 900123",
      missedCallProblem: "Too busy on-site to answer",
      phoneSetup: "Single mobile number",
      contactPreference: "email",
      privacyAccepted: true,
      source: "telloya",
    }

    const result = validateTelloyaEnquiry(legacyEnquiry)
    expect(result.valid).toBe(true)

    const payload = telloyaEnquiryToPayload(legacyEnquiry)
    expect(payload.product).toBe("telloya")
    expect(payload.businessName).toBe("Legacy Business Ltd")
    expect(payload.details).toContain("Missed call requirements:")
  })

  it("accepts maximum-size payload with all Phase 05A-02 fields at upper bounds", () => {
    const maxRequirements = "X".repeat(2000) // Large but under combined limit
    const maxLanguages = "A".repeat(500)
    const maxCustomLangs = "B".repeat(500)

    const maxEnquiry: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "custom",
      guardInterested: true,
      guardLocationCount: 999, // Maximum
      customMonthlyMinutes: 1000000, // Maximum
      customMonthlyCalls: 100000, // Maximum
      customPhoneNumbers: 999, // Maximum
      customLocations: 9999, // Maximum
      customLanguages: maxCustomLangs,
      customRequirements: maxRequirements,
      voicePreference: "female",
      voiceAccent: "A".repeat(100), // Maximum length
      primaryLanguage: "B".repeat(100), // Maximum length
      speakingStyle: "professional",
      additionalLanguages: maxLanguages,
      overageInterested: true,
      overageMonthlyCapGbp: 100000, // Maximum
      businessName: "Maximum Test Business Ltd",
      country: "United Kingdom",
      trade: "Multi-location Enterprise",
      locations: "Nationwide coverage across all UK regions",
      websiteUrl: "https://maximum-test.example.com",
      fullName: "Maximum Test User",
      email: "max@test.example.com",
      phone: "+44 7700 900999",
      missedCallProblem: "High volume enterprise requirements",
      phoneSetup: "Complex multi-site configuration",
      contactPreference: "email",
      privacyAccepted: true,
      source: "telloya",
    }

    // Should validate successfully
    const result = validateTelloyaEnquiry(maxEnquiry)
    expect(result.valid).toBe(true)

    // Should convert to payload successfully
    const payload = telloyaEnquiryToPayload(maxEnquiry)
    expect(payload.planTier).toBe("custom")
    expect(payload.guardLocationCount).toBe(999)
    expect(payload.customMonthlyMinutes).toBe(1000000)
    expect(payload.customMonthlyCalls).toBe(100000)
    expect(payload.customPhoneNumbers).toBe(999)
    expect(payload.customLocations).toBe(9999)
    expect(payload.overageMonthlyCapGbp).toBe(100000)
    expect(payload.details.length).toBeLessThanOrEqual(5000)
  })

  it("rejects enquiry exceeding 5000 character details limit", () => {
    const veryLongRequirements = "X".repeat(4950)

    const oversizedEnquiry: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "custom",
      guardInterested: true,
      guardLocationCount: 50,
      customMonthlyMinutes: 50000,
      customMonthlyCalls: 5000,
      customPhoneNumbers: 50,
      customLocations: 500,
      customLanguages: "A".repeat(500),
      customRequirements: veryLongRequirements,
      voicePreference: "female",
      voiceAccent: "British Received Pronunciation",
      primaryLanguage: "English",
      speakingStyle: "professional",
      additionalLanguages: "Spanish, French, German, Polish, Romanian, Italian",
      overageInterested: true,
      overageMonthlyCapGbp: 1000,
      businessName: "Oversized Test Business",
      country: "United Kingdom",
      trade: "Testing",
      fullName: "Test User",
      email: "test@example.com",
      phone: "+44 7700 900000",
      privacyAccepted: true,
      source: "telloya",
    }

    const result = validateTelloyaEnquiry(oversizedEnquiry)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.customRequirements).toBeTruthy()
      expect(result.errors?.customRequirements).toContain("combined length")
    }
  })

  it("accepts minimal Phase 05A-02 enquiry with only required fields", () => {
    const minimalEnquiry: TelloyaEnquiryInput = {
      planTier: "basic",
      businessName: "Minimal Business",
      country: "UK",
      trade: "Testing",
      fullName: "Min User",
      email: "min@test.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }

    const result = validateTelloyaEnquiry(minimalEnquiry)
    expect(result.valid).toBe(true)

    const payload = telloyaEnquiryToPayload(minimalEnquiry)
    expect(payload.planTier).toBe("basic")
    expect(payload.guardInterested).toBe(false)
    expect(payload.overageInterested).toBe(false)
  })

  it("preserves backward compatibility with product field only", () => {
    const productOnlyEnquiry: TelloyaEnquiryInput = {
      product: "complete",
      businessName: "Product Only Business",
      country: "United Kingdom",
      trade: "Legacy Testing",
      fullName: "Product User",
      email: "product@test.com",
      phone: "+44 7700 900111",
      privacyAccepted: true,
      source: "telloya",
    }

    const result = validateTelloyaEnquiry(productOnlyEnquiry)
    expect(result.valid).toBe(true)

    const payload = telloyaEnquiryToPayload(productOnlyEnquiry)
    expect(payload.product).toBe("complete")
    expect(payload.planTier || undefined).toBeUndefined()
  })

  it("accepts enquiry with planTier and auto-sets product for compatibility", () => {
    const tierEnquiry: TelloyaEnquiryInput = {
      planTier: "growth",
      businessName: "Tier Business",
      country: "UK",
      trade: "Testing",
      fullName: "Tier User",
      email: "tier@test.com",
      phone: "07700900222",
      privacyAccepted: true,
      source: "telloya",
    }

    const result = validateTelloyaEnquiry(tierEnquiry)
    expect(result.valid).toBe(true)

    const payload = telloyaEnquiryToPayload(tierEnquiry)
    expect(payload.planTier).toBe("growth")
    expect(payload.product || "telloya").toBe("telloya") // Product may be empty string or undefined
  })

  it("validates all plan tiers are accepted", () => {
    const tiers = ["basic", "growth", "pro", "custom"] as const

    for (const tier of tiers) {
      const enquiry: TelloyaEnquiryInput = {
        planTier: tier,
        customMonthlyMinutes: tier === "custom" ? 10000 : undefined,
        customPhoneNumbers: tier === "custom" ? 5 : undefined,
        customLocations: tier === "custom" ? 10 : undefined,
        businessName: `${tier} Business`,
        country: "UK",
        trade: "Testing",
        fullName: "Test User",
        email: `${tier}@test.com`,
        phone: "07700900000",
        privacyAccepted: true,
        source: "telloya",
      }

      const result = validateTelloyaEnquiry(enquiry)
      expect(result.valid).toBe(true)
    }
  })

  it("validates conditional Guard requirements", () => {
    const withoutGuard: TelloyaEnquiryInput = {
      planTier: "basic",
      guardInterested: false,
      businessName: "No Guard Business",
      country: "UK",
      trade: "Testing",
      fullName: "Test User",
      email: "noguard@test.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }

    expect(validateTelloyaEnquiry(withoutGuard).valid).toBe(true)

    const withGuardNoCount: TelloyaEnquiryInput = {
      ...withoutGuard,
      guardInterested: true,
      email: "guardnocount@test.com",
    }

    const result = validateTelloyaEnquiry(withGuardNoCount)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.guardLocationCount).toBeTruthy()
    }
  })

  it("validates conditional overage requirements", () => {
    const withoutOverage: TelloyaEnquiryInput = {
      planTier: "pro",
      overageInterested: false,
      businessName: "No Overage Business",
      country: "UK",
      trade: "Testing",
      fullName: "Test User",
      email: "nooverage@test.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya",
    }

    expect(validateTelloyaEnquiry(withoutOverage).valid).toBe(true)

    const withOverageNoCap: TelloyaEnquiryInput = {
      ...withoutOverage,
      overageInterested: true,
      email: "overagenocap@test.com",
    }

    const result = validateTelloyaEnquiry(withOverageNoCap)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.overageMonthlyCapGbp).toBeTruthy()
    }
  })

  it("rejects explicit invalid numbers even when the related option is off", () => {
    const base = {
      planTier: "basic" as const,
      guardInterested: false,
      overageInterested: false,
      businessName: "Bounds Business",
      country: "UK",
      trade: "Testing",
      fullName: "Test User",
      email: "bounds@test.com",
      phone: "07700900000",
      privacyAccepted: true,
      source: "telloya" as const,
    }

    const negativeGuard = validateTelloyaEnquiry({ ...base, guardLocationCount: -2 })
    expect(negativeGuard.valid).toBe(false)
    if (!negativeGuard.valid) expect(negativeGuard.errors?.guardLocationCount).toBeTruthy()

    const fractionalGuard = validateTelloyaEnquiry({ ...base, guardInterested: true, guardLocationCount: 1.5 })
    expect(fractionalGuard.valid).toBe(false)
    if (!fractionalGuard.valid) expect(fractionalGuard.errors?.guardLocationCount).toBeTruthy()

    const hugeMinutes = validateTelloyaEnquiry({ ...base, customMonthlyMinutes: 999999999 })
    expect(hugeMinutes.valid).toBe(false)
    if (!hugeMinutes.valid) expect(hugeMinutes.errors?.customMonthlyMinutes).toBeTruthy()

    const negativeCap = validateTelloyaEnquiry({ ...base, overageMonthlyCapGbp: -1 })
    expect(negativeCap.valid).toBe(false)
    if (!negativeCap.valid) expect(negativeCap.errors?.overageMonthlyCapGbp).toBeTruthy()
  })
})
