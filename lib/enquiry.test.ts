import { describe, expect, it } from "vitest"
import {
  parseServiceParam,
  validateEnquiry,
  type EnquiryInput,
} from "./enquiry"

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
  details: "The profile was suspended on Monday after a verification prompt. We have the original notice and have not tried another appeal yet.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help",
  subject: "",
  companyFax: "",
} satisfies EnquiryInput & { companyFax: string }

const validGeneral = {
  fullName: "Jordan Lee",
  email: "jordan@example.com",
  businessName: "Lee & Co",
  service: "review-protection",
  details: "We would like to understand whether a recent review can be assessed.",
  source: "homepage",
}

describe("validateEnquiry", () => {
  it("accepts a complete case intake payload", () => {
    const result = validateEnquiry(validCase)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.fullName).toBe("Alex Morgan")
      expect(result.data.websiteUrl).toBe("https://harbourbakery.example")
      expect(result.data.source).toBe("get-help")
    }
  })

  it("accepts a lightweight homepage enquiry", () => {
    const result = validateEnquiry(validGeneral)
    expect(result.valid).toBe(true)
  })

  it("requires core fields", () => {
    const result = validateEnquiry({ ...validCase, fullName: "", details: "" })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.fullName).toMatch(/name/i)
      expect(result.errors?.details).toMatch(/happened/i)
    }
  })

  it("validates email addresses", () => {
    const result = validateEnquiry({ ...validCase, email: "not-an-email" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.email).toMatch(/email/i)
  })

  it("validates optional URLs when they are provided", () => {
    const invalid = validateEnquiry({ ...validCase, websiteUrl: "javascript:alert(1)" })
    expect(invalid.valid).toBe(false)
    if (!invalid.valid) expect(invalid.errors?.websiteUrl).toMatch(/url/i)

    const missingProtocol = validateEnquiry({ ...validCase, businessProfileUrl: "maps.google.com/profile" })
    expect(missingProtocol.valid).toBe(false)

    const valid = validateEnquiry({ ...validCase, websiteUrl: "https://example.com/about" })
    expect(valid.valid).toBe(true)
  })

  it("rejects unexpected service values", () => {
    const result = validateEnquiry({ ...validCase, service: "guaranteed-removal" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.service).toBeTruthy()
  })

  it("rejects a filled honeypot without treating websiteUrl as spam", () => {
    const trapped = validateEnquiry({ ...validCase, companyFax: "https://spam.example" })
    expect(trapped.valid).toBe(false)
    if (!trapped.valid) {
      expect(trapped.error).toBe("Unable to process this enquiry.")
      expect(trapped.errors).toBeUndefined()
    }

    const legitimateWebsite = validateEnquiry({
      ...validCase,
      websiteUrl: "https://legitimate.example",
      companyFax: "",
    })
    expect(legitimateWebsite.valid).toBe(true)
  })

  it("requires the privacy acknowledgement for case intake", () => {
    const result = validateEnquiry({ ...validCase, privacyAccepted: false })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.privacyAccepted).toMatch(/privacy/i)
  })

  it("requires the accuracy confirmation for case intake", () => {
    const result = validateEnquiry({ ...validCase, informationAccurate: false })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.informationAccurate).toMatch(/accurate/i)
  })

  it("accepts a contact enquiry with a valid subject and no case service", () => {
    const result = validateEnquiry({
      fullName: "Sam Patel",
      email: "sam@example.com",
      businessName: "Patel Studio",
      subject: "partnership",
      details: "We are exploring whether a partnership conversation would be appropriate.",
      source: "contact",
    })
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.subject).toBe("partnership")
      expect(result.data.service).toBe("")
      expect(result.data.source).toBe("contact")
    }
  })

  it("still accepts a lightweight contact payload that uses a service field", () => {
    const result = validateEnquiry({
      fullName: "Sam Patel",
      email: "sam@example.com",
      service: "general",
      details: "A general question about the service.",
      source: "contact",
    })
    expect(result.valid).toBe(true)
  })

  it("rejects an unexpected contact subject", () => {
    const result = validateEnquiry({
      fullName: "Sam Patel",
      email: "sam@example.com",
      subject: "guaranteed-pricing",
      details: "How much does it cost?",
      source: "contact",
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors?.subject).toMatch(/subject/i)
  })

  it("requires a subject or enquiry type for contact messages", () => {
    const result = validateEnquiry({
      fullName: "Sam Patel",
      email: "sam@example.com",
      details: "Hello, I have a question.",
      source: "contact",
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.subject).toMatch(/subject/i)
      expect(result.errors?.service).toMatch(/enquiry type/i)
    }
  })

  it("does not require case confirmations or a case service for contact", () => {
    const result = validateEnquiry({
      fullName: "Sam Patel",
      email: "sam@example.com",
      subject: "general-question",
      details: "Could you explain how you work with clients?",
      source: "contact",
      informationAccurate: false,
      privacyAccepted: false,
    })
    expect(result.valid).toBe(true)
  })

  it("requires country and business name for case intake", () => {
    const result = validateEnquiry({ ...validCase, country: "", businessName: "" })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors?.country).toBeTruthy()
      expect(result.errors?.businessName).toBeTruthy()
    }
  })

  it("ignores a leftover website field so it is no longer a honeypot", () => {
    const result = validateEnquiry({ ...validCase, website: "https://spam.example" })
    expect(result.valid).toBe(true)
  })

  it("rejects non-string field types", () => {
    const result = validateEnquiry({ ...validCase, email: 42 })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toBe("Unable to process this enquiry.")
  })

  it("strips control characters from narrative text without otherwise rewriting it", () => {
    const result = validateEnquiry({
      ...validCase,
      details: "Line one\nLine two\u0007 still readable.",
    })
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.data.details).toBe("Line one\nLine two still readable.")
  })
})

describe("parseServiceParam", () => {
  it("maps valid query values and ignores unknown ones", () => {
    expect(parseServiceParam("profile")).toBe("profile-recovery")
    expect(parseServiceParam("review")).toBe("review-protection")
    expect(parseServiceParam("access")).toBe("profile-access")
    expect(parseServiceParam("general")).toBe("general")
    expect(parseServiceParam("profile-recovery")).toBe("profile-recovery")
    expect(parseServiceParam("unknown")).toBe("")
    expect(parseServiceParam(undefined)).toBe("")
  })
})
