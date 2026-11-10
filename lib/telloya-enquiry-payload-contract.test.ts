/**
 * Telloya Enquiry Payload Contract Tests
 * 
 * These tests verify the exact structure and content of payloads generated
 * for each plan tier (Basic, Growth, Pro, Custom) and historical Telloya enquiries.
 * 
 * Contract guarantees:
 * - Exact field presence/absence for each tier
 * - Correct typing and formatting
 * - Backward compatibility with legacy enquiries
 * - Details field construction
 */

import { describe, it, expect } from "vitest"
import {
  type TelloyaEnquiryInput,
  telloyaEnquiryToPayload,
} from "../apps/telloya/lib/telloya-enquiry"

describe("Telloya payload contract - Basic tier", () => {
  it("generates exact payload for Basic tier without add-ons", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "basic",
      guardInterested: false,
      overageInterested: false,
      businessName: "Basic Plumbing Ltd",
      country: "United Kingdom",
      trade: "Plumbing",
      locations: "London",
      websiteUrl: "https://basic-plumbing.co.uk",
      fullName: "John Basic",
      email: "john@basic-plumbing.co.uk",
      phone: "+44 7700 900001",
      missedCallProblem: "Too busy on-site",
      phoneSetup: "Single mobile",
      contactPreference: "email",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    // Core fields
    expect(payload.planTier).toBe("basic")
    expect(payload.product).toBe("telloya")
    expect(payload.guardInterested).toBe(false)
    expect(payload.overageInterested).toBe(false)

    // Optional fields should be undefined
    expect(payload.guardLocationCount).toBeUndefined()
    expect(payload.customMonthlyMinutes).toBeUndefined()
    expect(payload.customMonthlyCalls).toBeUndefined()
    expect(payload.customPhoneNumbers).toBeUndefined()
    expect(payload.customLocations).toBeUndefined()
    expect(payload.customLanguages).toBeUndefined()
    expect(payload.customRequirements).toBeUndefined()
    expect(payload.voicePreference).toBeUndefined()
    expect(payload.voiceAccent).toBeUndefined()
    expect(payload.primaryLanguage).toBeUndefined()
    expect(payload.speakingStyle).toBeUndefined()
    expect(payload.additionalLanguages).toBeUndefined()
    expect(payload.overageMonthlyCapGbp).toBeUndefined()

    // Business details
    expect(payload.businessName).toBe("Basic Plumbing Ltd")
    expect(payload.country).toBe("United Kingdom")
    expect(payload.trade).toBe("Plumbing")

    // Details field structure
    expect(payload.details).toContain("Plan tier: basic")
    // Guard and overage "No" states are not included in details (only "Yes")
    expect(payload.details).not.toContain("Guard interested:")
    expect(payload.details).not.toContain("Overage interested:")
    expect(payload.details).toContain("Missed call requirements:")
    expect(payload.details).toContain("Too busy on-site")
  })

  it("generates exact payload for Basic tier with Guard add-on", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "basic",
      guardInterested: true,
      guardLocationCount: 3,
      overageInterested: false,
      businessName: "Guard Plumbing Ltd",
      country: "United Kingdom",
      trade: "Plumbing",
      fullName: "Jane Guard",
      email: "jane@guard-plumbing.co.uk",
      phone: "+44 7700 900002",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    expect(payload.planTier).toBe("basic")
    expect(payload.guardInterested).toBe(true)
    expect(payload.guardLocationCount).toBe(3)
    expect(payload.overageInterested).toBe(false)

    expect(payload.details).toContain("Plan tier: basic")
    expect(payload.details).toContain("Guard interested: Yes (3 locations)")
  })
})

describe("Telloya payload contract - Growth tier", () => {
  it("generates exact payload for Growth tier with overage", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "growth",
      guardInterested: false,
      overageInterested: true,
      overageMonthlyCapGbp: 100,
      businessName: "Growth Electrical Ltd",
      country: "United Kingdom",
      trade: "Electrical",
      fullName: "Bob Growth",
      email: "bob@growth-electrical.co.uk",
      phone: "+44 7700 900003",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    expect(payload.planTier).toBe("growth")
    expect(payload.product).toBe("telloya")
    expect(payload.guardInterested).toBe(false)
    expect(payload.overageInterested).toBe(true)
    expect(payload.overageMonthlyCapGbp).toBe(100)

    expect(payload.details).toContain("Plan tier: growth")
    expect(payload.details).toContain("Overage interested: Yes (cap: £100/month)")
  })
})

describe("Telloya payload contract - Pro tier", () => {
  it("generates exact payload for Pro tier with voice preferences", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "pro",
      guardInterested: false,
      overageInterested: false,
      voicePreference: "female",
      voiceAccent: "British Received Pronunciation",
      primaryLanguage: "English",
      speakingStyle: "professional",
      additionalLanguages: "Spanish, French",
      businessName: "Pro Consultancy Ltd",
      country: "United Kingdom",
      trade: "Business Consultancy",
      fullName: "Alice Pro",
      email: "alice@pro-consultancy.co.uk",
      phone: "+44 7700 900004",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    expect(payload.planTier).toBe("pro")
    expect(payload.product).toBe("telloya")
    expect(payload.voicePreference).toBe("female")
    expect(payload.voiceAccent).toBe("British Received Pronunciation")
    expect(payload.primaryLanguage).toBe("English")
    expect(payload.speakingStyle).toBe("professional")
    expect(payload.additionalLanguages).toBe("Spanish, French")

    expect(payload.details).toContain("Plan tier: pro")
    expect(payload.details).toContain("Voice: female")
    expect(payload.details).toContain("Accent: British Received Pronunciation")
    expect(payload.details).toContain("Primary language: English")
    expect(payload.details).toContain("Speaking style: professional")
    expect(payload.details).toContain("Additional languages: Spanish, French")
  })
})

describe("Telloya payload contract - Custom tier", () => {
  it("generates exact payload for Custom tier with all requirements", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "custom",
      guardInterested: true,
      guardLocationCount: 50,
      customMonthlyMinutes: 50000,
      customMonthlyCalls: 5000,
      customPhoneNumbers: 25,
      customLocations: 500,
      customLanguages: "English, Polish, Romanian, Bulgarian",
      customRequirements: "Need CRM integration with Salesforce, custom reporting dashboard, and API access for call data",
      overageInterested: true,
      overageMonthlyCapGbp: 500,
      businessName: "Custom Enterprises Ltd",
      country: "United Kingdom",
      trade: "Multi-location Retail",
      fullName: "Charlie Custom",
      email: "charlie@custom-enterprises.co.uk",
      phone: "+44 7700 900005",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    // Plan tier
    expect(payload.planTier).toBe("custom")
    expect(payload.product).toBe("telloya")

    // Guard add-on
    expect(payload.guardInterested).toBe(true)
    expect(payload.guardLocationCount).toBe(50)

    // Custom requirements
    expect(payload.customMonthlyMinutes).toBe(50000)
    expect(payload.customMonthlyCalls).toBe(5000)
    expect(payload.customPhoneNumbers).toBe(25)
    expect(payload.customLocations).toBe(500)
    expect(payload.customLanguages).toBe("English, Polish, Romanian, Bulgarian")
    expect(payload.customRequirements).toBe("Need CRM integration with Salesforce, custom reporting dashboard, and API access for call data")

    // Overage
    expect(payload.overageInterested).toBe(true)
    expect(payload.overageMonthlyCapGbp).toBe(500)

    // Details field
    expect(payload.details).toContain("Plan tier: custom")
    expect(payload.details).toContain("Guard interested: Yes (50 locations)")
    expect(payload.details).toContain("Minutes: 50000/month")
    expect(payload.details).toContain("Calls: 5000/month")
    expect(payload.details).toContain("Phone numbers: 25")
    expect(payload.details).toContain("Locations: 500")
    expect(payload.details).toContain("Languages: English, Polish, Romanian, Bulgarian")
    expect(payload.details).toContain("Custom requirements:")
    expect(payload.details).toContain("Additional requirements:")
    expect(payload.details).toContain("Need CRM integration with Salesforce")
    expect(payload.details).toContain("Overage interested: Yes (cap: £500/month)")
  })

  it("generates exact payload for Custom tier with optional monthly calls omitted", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "custom",
      guardInterested: false,
      customMonthlyMinutes: 10000,
      // customMonthlyCalls: omitted (optional)
      customPhoneNumbers: 5,
      customLocations: 10,
      overageInterested: false,
      businessName: "Custom Small Ltd",
      country: "United Kingdom",
      trade: "Local Business",
      fullName: "Dave Custom",
      email: "dave@custom-small.co.uk",
      phone: "+44 7700 900006",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    expect(payload.planTier).toBe("custom")
    expect(payload.customMonthlyMinutes).toBe(10000)
    expect(payload.customMonthlyCalls).toBeUndefined()
    expect(payload.customPhoneNumbers).toBe(5)
    expect(payload.customLocations).toBe(10)

    // Details should not mention monthly calls when omitted
    expect(payload.details).toContain("Minutes: 10000/month")
    expect(payload.details).not.toContain("Calls:")
  })
})

describe("Telloya payload contract - Historical/Legacy", () => {
  it("generates exact payload for legacy product-only enquiry", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      // No planTier - legacy format
      businessName: "Legacy Plumbing Ltd",
      country: "United Kingdom",
      trade: "Plumbing",
      locations: "Manchester",
      fullName: "Emma Legacy",
      email: "emma@legacy-plumbing.co.uk",
      phone: "+44 7700 900007",
      missedCallProblem: "Always on-site",
      phoneSetup: "Single mobile number",
      contactPreference: "phone",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    // Legacy fields
    expect(payload.product).toBe("telloya")
    expect(payload.planTier).toBeUndefined()

    // Phase 05A-02 fields should be undefined or default
    expect(payload.guardInterested).toBe(false)
    expect(payload.guardLocationCount).toBeUndefined()
    expect(payload.overageInterested).toBe(false)
    expect(payload.overageMonthlyCapGbp).toBeUndefined()
    expect(payload.customMonthlyMinutes).toBeUndefined()

    // Business details preserved
    expect(payload.businessName).toBe("Legacy Plumbing Ltd")
    expect(payload.trade).toBe("Plumbing")
    expect(payload.missedCallProblem).toBe("Always on-site")

    // Details field should not contain Phase 05A-02 sections
    expect(payload.details).not.toContain("Plan tier:")
    expect(payload.details).toContain("Missed call requirements:")
    expect(payload.details).toContain("Phone setup:")
    expect(payload.details).toContain("Contact preference:")
  })

  it("generates exact payload for historical product=complete enquiry", () => {
    const input: TelloyaEnquiryInput = {
      product: "complete",
      businessName: "Complete Solutions Ltd",
      country: "United Kingdom",
      trade: "IT Services",
      fullName: "Frank Complete",
      email: "frank@complete-solutions.co.uk",
      phone: "+44 7700 900008",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    expect(payload.product).toBe("complete")
    expect(payload.planTier).toBeUndefined()
    expect(payload.businessName).toBe("Complete Solutions Ltd")
  })
})

describe("Telloya payload contract - Combined scenarios", () => {
  it("generates exact payload for maximum-feature enquiry (all fields)", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "custom",
      guardInterested: true,
      guardLocationCount: 100,
      customMonthlyMinutes: 100000,
      customMonthlyCalls: 10000,
      customPhoneNumbers: 50,
      customLocations: 1000,
      customLanguages: "All major European languages",
      customRequirements: "Enterprise requirements",
      voicePreference: "female",
      voiceAccent: "British",
      primaryLanguage: "English",
      speakingStyle: "friendly",
      additionalLanguages: "Multiple",
      overageInterested: true,
      overageMonthlyCapGbp: 5000,
      businessName: "Maximum Ltd",
      country: "UK",
      trade: "Enterprise",
      locations: "Nationwide",
      websiteUrl: "https://maximum.co.uk",
      fullName: "Max User",
      email: "max@maximum.co.uk",
      phone: "+44 7700 900999",
      missedCallProblem: "High volume",
      phoneSetup: "Complex",
      contactPreference: "email",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    // Verify all fields are present and correctly typed
    expect(payload.planTier).toBe("custom")
    expect(payload.product).toBe("telloya")
    expect(payload.guardInterested).toBe(true)
    expect(payload.guardLocationCount).toBe(100)
    expect(payload.customMonthlyMinutes).toBe(100000)
    expect(payload.customMonthlyCalls).toBe(10000)
    expect(payload.customPhoneNumbers).toBe(50)
    expect(payload.customLocations).toBe(1000)
    expect(payload.voicePreference).toBe("female")
    expect(payload.overageInterested).toBe(true)
    expect(payload.overageMonthlyCapGbp).toBe(5000)

    // Verify details contains all sections
    expect(payload.details).toContain("Plan tier: custom")
    expect(payload.details).toContain("Guard interested: Yes (100 locations)")
    expect(payload.details).toContain("Minutes: 100000/month")
    expect(payload.details).toContain("Voice: female")
    expect(payload.details).toContain("Overage interested: Yes")
    expect(payload.details.length).toBeLessThanOrEqual(5000)
  })

  it("preserves backward compatibility when both product and planTier provided", () => {
    const input: TelloyaEnquiryInput = {
      product: "telloya",
      planTier: "basic",
      businessName: "Backward Compatible Ltd",
      country: "UK",
      trade: "Testing",
      fullName: "Test User",
      email: "test@backward.co.uk",
      phone: "+44 7700 900010",
      privacyAccepted: true,
      source: "telloya",
    }

    const payload = telloyaEnquiryToPayload(input)

    // Both should be present
    expect(payload.product).toBe("telloya")
    expect(payload.planTier).toBe("basic")
  })

  it("stores receptionist questions only when the customer provided them", () => {
    const input: TelloyaEnquiryInput = {
      planTier: "basic",
      businessName: "Question Plumbing Ltd",
      country: "United Kingdom",
      trade: "Plumbing",
      fullName: "Question Owner",
      email: "owner@question-plumbing.co.uk",
      phone: "+44 7700 900011",
      privacyAccepted: true,
      source: "telloya",
      receptionistQuestions: "Ask whether they have a service plan.",
    }
    const payload = telloyaEnquiryToPayload(input)
    expect(payload.receptionistQuestions).toBe("Ask whether they have a service plan.")
    expect(payload.details).toContain("Receptionist questions:\nAsk whether they have a service plan.")
    const { receptionistQuestions: _omitted, ...withoutQuestion } = input
    const blank = telloyaEnquiryToPayload(withoutQuestion)
    expect(blank.receptionistQuestions).toBeUndefined()
    expect(blank.details).not.toContain("Receptionist questions:")
  })
})
