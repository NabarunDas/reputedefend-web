/** @vitest-environment jsdom */

import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { TelloyaGoogleAnalytics, resetTelloyaAnalyticsRuntime } from "./google-analytics"
import {
  acceptAnalytics,
  sendTelloyaLeadConversion,
  storeConsent,
  TELLOYA_ANALYTICS_CONSENT_KEY,
  withdrawAnalytics,
} from "@/lib/analytics"

const TEST_ID = "G-TESTONLY123"

const navigation = vi.hoisted(() => ({ pathname: "/pricing?plan=pro&email=ada@example.com#plans" }))

function isArgumentsObject(value: unknown) {
  return Object.prototype.toString.call(value) === "[object Arguments]"
}

function queuedCommand(index: number) {
  const entry = window.dataLayer?.[index]
  return {
    isArguments: isArgumentsObject(entry),
    isArray: Array.isArray(entry),
    values: Array.from((entry ?? []) as ArrayLike<unknown>),
  }
}

function commandNames() {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>)[0])
}

function pageViewCount() {
  return (window.dataLayer ?? []).filter((entry) => Array.from(entry as ArrayLike<unknown>)[1] === "page_view").length
}

vi.mock("next/script", async () => {
  const React = await import("react")
  return {
    default: function MockScript({ src }: { src?: string }) {
      return React.createElement("div", {
        "data-testid": "ga-external-script",
        "data-src": src,
      })
    },
  }
})

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetTelloyaAnalyticsRuntime()
  delete window.gtag
  delete window.dataLayer
  navigation.pathname = "/pricing?plan=pro&email=ada@example.com#plans"
  vi.unstubAllEnvs()
})

describe("TelloyaGoogleAnalytics", () => {
  it("does not insert a script or queue commands before consent or without an id", () => {
    const { rerender } = render(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
    expect(window.dataLayer).toBeUndefined()
    expect(window.gtag).toBeUndefined()
    rerender(<TelloyaGoogleAnalytics measurementId="UA-123" />)
    expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
  })

  it("does not load after rejection", () => {
    window.localStorage.setItem(TELLOYA_ANALYTICS_CONSENT_KEY, "rejected")
    render(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it("loads once after acceptance, denies ads, and sends one sanitised page view", async () => {
    acceptAnalytics(TEST_ID)
    render(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    const script = document.querySelector("[data-testid='ga-external-script']")
    expect(script).toHaveAttribute("data-src", `https://www.googletagmanager.com/gtag/js?id=${TEST_ID}`)
    await waitFor(() => expect(commandNames()).toEqual(["consent", "js", "config", "event"]))
    expect(queuedCommand(0).isArguments).toBe(true)
    expect(queuedCommand(0).isArray).toBe(false)
    expect(queuedCommand(0).values).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ])
    expect(queuedCommand(2).values).toEqual([
      "config",
      TEST_ID,
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: "none",
      },
    ])
    expect(queuedCommand(3).values).toEqual([
      "event",
      "page_view",
      {
        page_path: "/pricing",
        page_location: `${window.location.origin}/pricing`,
      },
    ])
    const serialized = JSON.stringify(window.dataLayer)
    expect(serialized).not.toMatch(/plan=|email=|ada@|#plans/)
    expect(serialized).not.toMatch(/"ad_storage":"granted"/)
  })

  it("sends one sanitised view per route change and ignores a repeated consent event", async () => {
    acceptAnalytics(TEST_ID)
    const view = render(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    await waitFor(() => expect(pageViewCount()).toBe(1))
    storeConsent("accepted")
    view.rerender(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    expect(pageViewCount()).toBe(1)

    navigation.pathname = "/features?ref=TY-26-ABCDEF&submissionKey=11111111-1111-4111-8111-111111111111#voice"
    view.rerender(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    await waitFor(() => expect(pageViewCount()).toBe(2))
    const views = (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((values) => values[1] === "page_view")
    expect(views[1]?.[2]).toEqual({
      page_path: "/features",
      page_location: `${window.location.origin}/features`,
    })
    expect(JSON.stringify(window.dataLayer)).not.toMatch(/TY-|submissionKey|ref=/)
  })

  it("stops further reporting after withdrawal", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID", TEST_ID)
    acceptAnalytics(TEST_ID)
    const view = render(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    await waitFor(() => expect(pageViewCount()).toBe(1))
    withdrawAnalytics(TEST_ID)
    await waitFor(() => expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull())
    navigation.pathname = "/enquire?email=ada@example.com"
    view.rerender(<TelloyaGoogleAnalytics measurementId={TEST_ID} />)
    expect(pageViewCount()).toBe(1)
    expect(sendTelloyaLeadConversion({ planTier: "pro", guardInterested: false })).toBe(false)
    expect(JSON.stringify(window.dataLayer)).not.toMatch(/generate_lead|ada@/)
  })
})
