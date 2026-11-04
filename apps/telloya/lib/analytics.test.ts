/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PROFILERELAUNCH_ANALYTICS_CONSENT_KEY,
  PROFILERELAUNCH_GA_ENV,
  TELLOYA_ANALYTICS_CONSENT_KEY,
  TELLOYA_GA_RUNTIME_CONFIG,
  acceptAnalytics,
  pageViewPayload,
  readStoredConsent,
  readTelloyaGaMeasurementId,
  removeAnalyticsCookies,
  sanitizePathname,
  sendSanitizedPageView,
  sendTelloyaLeadConversion,
  telloyaLeadPayload,
  withdrawAnalytics,
} from "@/lib/analytics"

const TEST_ID = "G-TESTONLY123"

describe("Telloya GA measurement ID", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is absent when the Telloya env value is missing or not a GA4 id", () => {
    expect(readTelloyaGaMeasurementId(undefined)).toBeUndefined()
    expect(readTelloyaGaMeasurementId("")).toBeUndefined()
    expect(readTelloyaGaMeasurementId("UA-123456")).toBeUndefined()
    expect(readTelloyaGaMeasurementId("g-testonly123")).toBeUndefined()
    expect(readTelloyaGaMeasurementId(" G-TESTONLY123 ")).toBe(TEST_ID)
  })

  it("does not read the ProfileRelaunch measurement ID", () => {
    vi.stubEnv(PROFILERELAUNCH_GA_ENV, TEST_ID)
    vi.stubEnv("NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID", "")
    expect(readTelloyaGaMeasurementId()).toBeUndefined()
    vi.stubEnv("NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID", "not-a-property")
    expect(readTelloyaGaMeasurementId()).toBeUndefined()
  })
})

describe("page view sanitisation", () => {
  it("drops query strings and fragments", () => {
    expect(sanitizePathname("/enquire?plan=growth&email=ada@example.com#voice")).toBe("/enquire")
    const payload = pageViewPayload("https://telloya.com", "/pricing?plan=pro#plans")
    expect(payload).toEqual({
      page_path: "/pricing",
      page_location: "https://telloya.com/pricing",
    })
    expect(JSON.stringify(payload)).not.toMatch(/plan=|email=|TY-|submissionKey/)
  })

  it("keeps automatic page views, signals and advertising personalisation off", () => {
    expect(TELLOYA_GA_RUNTIME_CONFIG).toEqual({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: "none",
    })
  })
})

describe("Telloya consent storage", () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllEnvs()
    delete window.gtag
  })

  it("keeps the Telloya choice separate from ProfileRelaunch", () => {
    window.localStorage.setItem(PROFILERELAUNCH_ANALYTICS_CONSENT_KEY, "accepted")
    expect(readStoredConsent()).toBeNull()
    acceptAnalytics(TEST_ID)
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBe("accepted")
    expect(window.localStorage.getItem(PROFILERELAUNCH_ANALYTICS_CONSENT_KEY)).toBe("accepted")
    expect(readStoredConsent()).toBe("accepted")
  })

  it("does not send a page view before acceptance", () => {
    const gtag = vi.fn()
    window.gtag = gtag
    expect(sendSanitizedPageView("https://telloya.com", "/enquire?email=ada@example.com")).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
    acceptAnalytics(TEST_ID)
    expect(sendSanitizedPageView("https://telloya.com", "/enquire?email=ada@example.com")).toBe(true)
    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_path: "/enquire",
      page_location: "https://telloya.com/enquire",
    })
  })

  it("stops measurement and removes analytics cookies on withdrawal", () => {
    acceptAnalytics(TEST_ID)
    const gtag = vi.fn()
    window.gtag = gtag
    const setter = vi.fn()
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "_ga=GA1.1.1; _ga_TESTONLY123=GS1.1.1; telloya_session=keep",
      set: setter,
    })
    const script = document.createElement("script")
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-TESTONLY123"
    document.body.appendChild(script)

    withdrawAnalytics(TEST_ID)

    expect(readStoredConsent()).toBe("rejected")
    expect(sendSanitizedPageView("https://telloya.com", "/pricing")).toBe(false)
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    })
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("_ga="))).toBe(true)
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("_ga_TESTONLY123="))).toBe(true)
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("telloya_session="))).toBe(false)
    expect(document.querySelector("script[src*='googletagmanager.com/gtag/js']")).toBeNull()
    expect((window as unknown as Record<string, unknown>)["ga-disable-G-TESTONLY123"]).toBe(true)
  })

  it("removes only analytics cookies", () => {
    removeAnalyticsCookies()
  })
})

describe("Telloya lead conversion", () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllEnvs()
    delete window.gtag
  })

  it("sends one non-personal generate_lead after consent", () => {
    vi.stubEnv("NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID", TEST_ID)
    const gtag = vi.fn()
    window.gtag = gtag
    const dirty = {
      planTier: "growth",
      guardInterested: true,
      enquiryRef: "TY-26-ABCDEF",
      submissionKey: "11111111-1111-4111-8111-111111111111",
      email: "ada@example.com",
      phone: "+447700900000",
      businessName: "Harbour Plumbing",
      websiteUrl: "https://harbour.example",
      customRequirements: "Call me about transcripts",
      overageMonthlyCapGbp: 75,
    }
    expect(sendTelloyaLeadConversion(dirty)).toBe(false)
    acceptAnalytics(TEST_ID)
    expect(sendTelloyaLeadConversion(dirty)).toBe(true)
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", {
      lead_type: "telloya_enquiry",
      plan_tier: "growth",
      guard_interested: true,
    })
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/TY-|submissionKey|ada@|4477|Harbour|transcript|75/)
  })

  it("drops an unapproved plan tier and still records guard interest as a boolean", () => {
    expect(telloyaLeadPayload({ planTier: "enterprise", guardInterested: false })).toEqual({
      lead_type: "telloya_enquiry",
      guard_interested: false,
    })
    expect(telloyaLeadPayload({ planTier: "custom", guardInterested: true }).plan_tier).toBe("custom")
  })

  it("does not send after withdrawal", () => {
    vi.stubEnv("NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID", TEST_ID)
    const gtag = vi.fn()
    window.gtag = gtag
    acceptAnalytics(TEST_ID)
    withdrawAnalytics(TEST_ID)
    gtag.mockClear()
    expect(sendTelloyaLeadConversion({ planTier: "basic", guardInterested: false })).toBe(false)
    expect(gtag).not.toHaveBeenCalledWith("event", "generate_lead", expect.anything())
  })
})
