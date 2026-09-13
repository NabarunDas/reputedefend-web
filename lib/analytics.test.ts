/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ANALYTICS_CONSENT_KEY,
  acceptAnalytics,
  pageViewPayload,
  readGaMeasurementId,
  readStoredConsent,
  removeAnalyticsCookies,
  sanitizePathname,
  sanitizedPageLocation,
  sendSanitizedPageView,
  withdrawAnalytics,
} from "@/lib/analytics"
import { googleSiteVerification } from "@/lib/site-verification"

describe("GA measurement ID", () => {
  it("is absent when the env value is missing or not a GA4 id", () => {
    expect(readGaMeasurementId(undefined)).toBeUndefined()
    expect(readGaMeasurementId("")).toBeUndefined()
    expect(readGaMeasurementId("G-XXXXXXXXXX")).toBe("G-XXXXXXXXXX")
    expect(readGaMeasurementId("UA-123456")).toBeUndefined()
    expect(readGaMeasurementId("G-TESTONLY123")).toBe("G-TESTONLY123")
  })
})

describe("page view sanitisation", () => {
  it("sends pathname only and drops query strings and fragments", () => {
    expect(sanitizePathname("/get-help?service=profile-recovery#form")).toBe("/get-help")
    expect(sanitizedPageLocation("https://profilerelaunch.com", "/get-help?service=profile-recovery")).toBe(
      "https://profilerelaunch.com/get-help",
    )
    const payload = pageViewPayload("https://profilerelaunch.com", "/get-help?service=review")
    expect(payload).toEqual({
      page_path: "/get-help",
      page_location: "https://profilerelaunch.com/get-help",
    })
    expect(JSON.stringify(payload)).not.toMatch(/service=|email=|reviewUrl|businessName/)
  })
})

describe("consent storage", () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it("persists accepted and rejected choices without storing case data", () => {
    acceptAnalytics("G-TESTONLY123")
    expect(readStoredConsent()).toBe("accepted")
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("accepted")

    withdrawAnalytics("G-TESTONLY123")
    expect(readStoredConsent()).toBe("rejected")
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("rejected")
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).not.toMatch(/@|http|profile/)
    expect((window as unknown as Record<string, unknown>)["ga-disable-G-TESTONLY123"]).toBe(true)
  })

  it("does not send a page view before acceptance", () => {
    const gtag = vi.fn()
    window.gtag = gtag
    expect(sendSanitizedPageView("https://profilerelaunch.com", "/contact")).toBe(false)
    expect(gtag).not.toHaveBeenCalled()
    acceptAnalytics("G-TESTONLY123")
    expect(sendSanitizedPageView("https://profilerelaunch.com", "/contact?ref=test")).toBe(true)
    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_path: "/contact",
      page_location: "https://profilerelaunch.com/contact",
    })
  })

  it("attempts to remove first-party _ga cookies on withdrawal", () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      writable: true,
      value: "_ga=GA1.1.1; _ga_TESTONLY123=GS1.1.1; other=keep",
    })
    const setter = vi.fn()
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "_ga=GA1.1.1; _ga_TESTONLY123=GS1.1.1; other=keep",
      set: setter,
    })
    removeAnalyticsCookies()
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("_ga="))).toBe(true)
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("_ga_TESTONLY123="))).toBe(true)
    expect(setter.mock.calls.some((call) => String(call[0]).startsWith("other="))).toBe(false)
  })

  it("removes gtag scripts on withdrawal", () => {
    const script = document.createElement("script")
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-TESTONLY123"
    document.body.appendChild(script)
    withdrawAnalytics("G-TESTONLY123")
    expect(document.querySelector("script[src*='googletagmanager.com/gtag/js']")).toBeNull()
  })
})

describe("Search Console verification", () => {
  it("emits nothing when the token is absent", () => {
    expect(googleSiteVerification(undefined)).toBeUndefined()
    expect(googleSiteVerification("")).toBeUndefined()
    expect(googleSiteVerification("abc123")).toBe("abc123")
  })
})
