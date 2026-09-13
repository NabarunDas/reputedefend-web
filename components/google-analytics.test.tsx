/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { GoogleAnalytics, resetGoogleAnalyticsRuntime } from "./google-analytics"
import { acceptAnalytics, ANALYTICS_CONSENT_KEY, withdrawAnalytics } from "@/lib/analytics"

const TEST_ID = "G-TESTONLY123"

vi.mock("next/script", async () => {
  const React = await import("react")
  return {
    default: function MockScript({ src, onLoad }: { src?: string; onLoad?: () => void }) {
      React.useEffect(() => {
        onLoad?.()
      }, [onLoad, src])
      return React.createElement("div", {
        "data-testid": "ga-external-script",
        "data-src": src,
      })
    },
  }
})

vi.mock("next/navigation", () => ({
  usePathname: () => "/get-help",
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetGoogleAnalyticsRuntime()
  delete window.gtag
  delete window.dataLayer
})

describe("GoogleAnalytics", () => {
  it("does not insert a script before consent or without a measurement id", async () => {
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    await waitFor(() => expect(screen.queryByTestId("ga-external-script")).not.toBeInTheDocument())
    render(<GoogleAnalytics />)
    expect(screen.queryByTestId("ga-external-script")).not.toBeInTheDocument()
  })

  it("does not load after rejection", () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "rejected")
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    expect(screen.queryByTestId("ga-external-script")).not.toBeInTheDocument()
  })

  it("loads once after acceptance, denies advertising consent, and sends a sanitised page view", async () => {
    acceptAnalytics(TEST_ID)
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    expect(screen.getByTestId("ga-external-script")).toHaveAttribute(
      "data-src",
      `https://www.googletagmanager.com/gtag/js?id=${TEST_ID}`,
    )
    await waitFor(() => expect(window.dataLayer?.length).toBeGreaterThan(0))
    const serialized = JSON.stringify(window.dataLayer)
    expect(serialized).toContain("analytics_storage")
    expect(serialized).toContain("granted")
    expect(serialized).toContain("ad_storage")
    expect(serialized).toContain("ad_user_data")
    expect(serialized).toContain("ad_personalization")
    expect(serialized).toContain("denied")
    expect(serialized).toContain("page_view")
    expect(serialized).toContain("/get-help")
    expect(serialized).not.toMatch(/service=|email|businessName|reviewUrl/)
    expect(serialized).toContain("allow_google_signals")
    expect(serialized).toContain("allow_ad_personalization_signals")
    expect(serialized).toContain("cookie_domain")
    expect(serialized).toContain("none")
    expect(serialized).not.toMatch(/"ad_storage":"granted"/)
  })

  it("stops loading after withdrawal", async () => {
    acceptAnalytics(TEST_ID)
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    await screen.findByTestId("ga-external-script")
    withdrawAnalytics(TEST_ID)
    await waitFor(() => expect(screen.queryByTestId("ga-external-script")).not.toBeInTheDocument())
  })
})
