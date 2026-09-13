/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { AnalyticsConsent, CookieSettingsButton } from "./analytics-consent"
import { ANALYTICS_CONSENT_KEY } from "@/lib/analytics"

const TEST_ID = "G-TESTONLY123"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("AnalyticsConsent", () => {
  it("renders nothing when analytics is not configured", () => {
    const { container } = render(<AnalyticsConsent measurementId="" />)
    expect(container).toBeEmptyDOMElement()
    render(<CookieSettingsButton measurementId="" />)
    expect(screen.queryByRole("button", { name: "Cookie settings" })).not.toBeInTheDocument()
  })

  it("shows Accept and Reject equally and does not load a choice before interaction", () => {
    render(<AnalyticsConsent measurementId={TEST_ID} />)
    expect(screen.getByRole("region", { name: "Analytics is optional" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept analytics" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reject analytics" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /accept all/i })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull()
  })

  it("opens Settings with analytics Off by default", () => {
    render(<AnalyticsConsent measurementId={TEST_ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(screen.getByTestId("cookie-settings-dialog")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "On" })).not.toBeChecked()
    expect(screen.getByText("Necessary")).toBeInTheDocument()
    expect(screen.getByText("Always active")).toBeInTheDocument()
    expect(screen.getByText("Optional")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /advertising|personalisation|social media|marketing|retargeting/i })).not.toBeInTheDocument()
  })

  it("stores rejection and hides the banner", () => {
    render(<AnalyticsConsent measurementId={TEST_ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reject analytics" }))
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("rejected")
    expect(screen.queryByTestId("analytics-consent-banner")).not.toBeInTheDocument()
  })

  it("stores acceptance", () => {
    render(<AnalyticsConsent measurementId={TEST_ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Accept analytics" }))
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("accepted")
  })

  it("reopens settings from Cookie settings and can turn analytics off", () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted")
    render(
      <>
        <CookieSettingsButton measurementId={TEST_ID} />
        <AnalyticsConsent measurementId={TEST_ID} />
      </>,
    )
    expect(screen.queryByTestId("analytics-consent-banner")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }))
    expect(screen.getByTestId("cookie-settings-dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Off" }))
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }))
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("rejected")
  })

  it("opens settings from the shared footer event", async () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, "rejected")
    render(
      <>
        <CookieSettingsButton measurementId={TEST_ID} />
        <AnalyticsConsent measurementId={TEST_ID} />
      </>,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Cookie settings" }))
    expect(await screen.findByTestId("cookie-settings-dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByTestId("cookie-settings-dialog")).not.toBeInTheDocument()
  })
})
