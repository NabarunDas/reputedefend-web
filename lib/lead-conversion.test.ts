/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import {
  ANALYTICS_CONSENT_KEY,
  LEAD_CONVERSION_EVENT,
  LEAD_TYPES,
  acceptAnalytics,
  leadConversionPayload,
  sendLeadConversion,
  withdrawAnalytics,
  type LeadType,
} from "@/lib/analytics"
import { CASE_SERVICES, GENERAL_SERVICE_OPTIONS } from "@/lib/enquiry"

const MEASUREMENT_ID = "G-TESTONLY123"

/**
 * Anything a visitor typed, or any identifier we mint for them, must never
 * appear in a conversion payload.
 */
const FORBIDDEN_KEYS = [
  "name",
  "fullName",
  "full_name",
  "email",
  "phone",
  "businessName",
  "business_name",
  "country",
  "websiteUrl",
  "website_url",
  "businessProfileUrl",
  "business_profile_url",
  "reviewUrl",
  "review_url",
  "message",
  "details",
  "subject",
  "caseRef",
  "case_ref",
  "submissionKey",
  "submission_key",
  "ip",
  "customerId",
  "customer_id",
  "documentName",
  "user_id",
]

let gtag: Mock<(...args: unknown[]) => void>

beforeEach(() => {
  window.localStorage.clear()
  gtag = vi.fn()
  window.gtag = gtag
})

afterEach(() => {
  window.localStorage.clear()
  delete window.gtag
  vi.restoreAllMocks()
})

function lastEvent() {
  expect(gtag).toHaveBeenCalledTimes(1)
  const [command, name, params] = gtag.mock.calls[0] as [string, string, Record<string, unknown>]
  return { command, name, params }
}

describe("lead conversion event contract", () => {
  it("exposes exactly the four approved lead types and the GA4 event name", () => {
    expect(LEAD_CONVERSION_EVENT).toBe("generate_lead")
    expect([...LEAD_TYPES]).toEqual(["homepage_enquiry", "contact", "assessment", "guard_setup"])
  })

  it("sends nothing when consent has not been given", () => {
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull()
    expect(sendLeadConversion({ leadType: "contact" })).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })

  it("sends nothing when consent was rejected", () => {
    withdrawAnalytics(MEASUREMENT_ID)
    gtag.mockClear()
    expect(sendLeadConversion({ leadType: "contact" })).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })

  it("sends nothing when gtag is unavailable even with consent", () => {
    acceptAnalytics(MEASUREMENT_ID)
    delete window.gtag
    expect(sendLeadConversion({ leadType: "contact" })).toBe(false)
  })

  it("sends generate_lead once consent is accepted and gtag exists", () => {
    acceptAnalytics(MEASUREMENT_ID)
    expect(sendLeadConversion({ leadType: "homepage_enquiry" })).toBe(true)
    const { command, name, params } = lastEvent()
    expect(command).toBe("event")
    expect(name).toBe("generate_lead")
    expect(params).toEqual({ lead_type: "homepage_enquiry" })
  })

  it.each(LEAD_TYPES.map((leadType) => [leadType] as const))(
    "accepts the approved lead type %s",
    (leadType) => {
      acceptAnalytics(MEASUREMENT_ID)
      expect(sendLeadConversion({ leadType })).toBe(true)
      expect(lastEvent().params.lead_type).toBe(leadType)
    },
  )

  it("rejects a lead type outside the approved list", () => {
    acceptAnalytics(MEASUREMENT_ID)
    expect(sendLeadConversion({ leadType: "newsletter" as LeadType })).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })

  it("passes through an approved service enum value", () => {
    acceptAnalytics(MEASUREMENT_ID)
    expect(sendLeadConversion({ leadType: "assessment", serviceType: "profile-access" })).toBe(true)
    expect(lastEvent().params).toEqual({ lead_type: "assessment", service_type: "profile-access" })
  })

  it.each([
    ...CASE_SERVICES.map((service) => service.value),
    ...GENERAL_SERVICE_OPTIONS.map((option) => option.value),
  ].map((value) => [value] as const))("allows the %s service enum", (serviceType) => {
    acceptAnalytics(MEASUREMENT_ID)
    expect(sendLeadConversion({ leadType: "assessment", serviceType })).toBe(true)
    expect(lastEvent().params.service_type).toBe(serviceType)
  })

  it("drops a service value that is not part of the approved enums", () => {
    acceptAnalytics(MEASUREMENT_ID)
    for (const serviceType of [
      "My bakery was suspended last Tuesday",
      "alex@example.com",
      "https://maps.google.com/?cid=123",
      "",
      "PROFILE-RECOVERY",
    ]) {
      gtag.mockClear()
      expect(sendLeadConversion({ leadType: "assessment", serviceType })).toBe(true)
      expect(lastEvent().params).toEqual({ lead_type: "assessment" })
    }
  })

  it("never includes a personal or identifying parameter key", () => {
    acceptAnalytics(MEASUREMENT_ID)
    for (const leadType of LEAD_TYPES) {
      gtag.mockClear()
      sendLeadConversion({ leadType, serviceType: "review-protection" })
      const { params } = lastEvent()
      expect(Object.keys(params).sort()).toEqual(["lead_type", "service_type"])
      for (const key of FORBIDDEN_KEYS) {
        expect(params, `${leadType}/${key}`).not.toHaveProperty(key)
      }
    }
  })

  it("builds a payload of at most lead_type and service_type", () => {
    expect(leadConversionPayload({ leadType: "contact" })).toEqual({ lead_type: "contact" })
    expect(
      leadConversionPayload({ leadType: "contact", serviceType: "general" }),
    ).toEqual({ lead_type: "contact", service_type: "general" })
    expect(
      Object.keys(leadConversionPayload({ leadType: "guard_setup", serviceType: "nonsense" })),
    ).toEqual(["lead_type"])
  })

  it("does not initialise analytics or grant advertising consent", () => {
    acceptAnalytics(MEASUREMENT_ID)
    sendLeadConversion({ leadType: "guard_setup" })
    const commands = gtag.mock.calls.map((call) => call[0])
    expect(commands).toEqual(["event"])
    expect(commands).not.toContain("config")
    expect(commands).not.toContain("consent")
    expect(commands).not.toContain("js")
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(0)
  })

  it("stops sending again after analytics is withdrawn", () => {
    acceptAnalytics(MEASUREMENT_ID)
    expect(sendLeadConversion({ leadType: "contact" })).toBe(true)
    withdrawAnalytics(MEASUREMENT_ID)
    gtag.mockClear()
    window.gtag = gtag
    expect(sendLeadConversion({ leadType: "contact" })).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
  })
})
