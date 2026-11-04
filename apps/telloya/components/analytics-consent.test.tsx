/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { TelloyaAnalyticsConsent, TelloyaCookieSettingsButton } from "./analytics-consent"
import { TELLOYA_ANALYTICS_CONSENT_KEY, PROFILERELAUNCH_ANALYTICS_CONSENT_KEY } from "@/lib/analytics"
import styles from "./analytics-consent.module.css"

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

describe("TelloyaAnalyticsConsent", () => {
  it("renders nothing when analytics is not configured", () => {
    const { container } = render(<TelloyaAnalyticsConsent measurementId="" />)
    expect(container).toBeEmptyDOMElement()
    render(<TelloyaCookieSettingsButton measurementId="" />)
    expect(screen.queryByRole("button", { name: "Cookie settings" })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBeNull()
  })

  it("shows Accept and Reject with equal button treatment before any choice is stored", () => {
    render(<TelloyaAnalyticsConsent measurementId={TEST_ID} />)
    const accept = screen.getByRole("button", { name: "Accept analytics" })
    const reject = screen.getByRole("button", { name: "Reject analytics" })
    expect(screen.getByRole("region", { name: "Analytics is optional" })).toBeInTheDocument()
    expect(accept).toHaveClass(styles.accept)
    expect(reject).toHaveClass(styles.reject)
    expect(accept.className.split(" ").sort()).not.toEqual(reject.className.split(" ").sort())
    expect(screen.getByRole("link", { name: "cookie notice" })).toHaveAttribute("href", "/cookies")
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "https://profilerelaunch.com/privacy")
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBeNull()
    expect(document.querySelector("[data-testid='ga-external-script']")).toBeNull()
  })

  it("stores rejection without touching the ProfileRelaunch preference", () => {
    window.localStorage.setItem(PROFILERELAUNCH_ANALYTICS_CONSENT_KEY, "accepted")
    render(<TelloyaAnalyticsConsent measurementId={TEST_ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reject analytics" }))
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBe("rejected")
    expect(window.localStorage.getItem(PROFILERELAUNCH_ANALYTICS_CONSENT_KEY)).toBe("accepted")
    expect(screen.queryByTestId("analytics-consent-banner")).not.toBeInTheDocument()
  })

  it("stores acceptance", () => {
    render(<TelloyaAnalyticsConsent measurementId={TEST_ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Accept analytics" }))
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBe("accepted")
  })

  it("opens settings from the footer, traps Tab, and closes on Escape", () => {
    window.localStorage.setItem(TELLOYA_ANALYTICS_CONSENT_KEY, "accepted")
    render(
      <>
        <TelloyaCookieSettingsButton measurementId={TEST_ID} />
        <TelloyaAnalyticsConsent measurementId={TEST_ID} />
      </>,
    )
    const opener = screen.getByRole("button", { name: "Cookie settings" })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByTestId("cookie-settings-dialog")
    expect(dialog).toHaveAttribute("role", "dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    const off = screen.getByRole("radio", { name: "Off" })
    const on = screen.getByRole("radio", { name: "On" })
    const save = screen.getByRole("button", { name: "Save settings" })
    const cancel = screen.getByRole("button", { name: "Cancel" })
    expect(on).toBeChecked()
    expect(off).not.toBeChecked()
    expect(document.activeElement).toBe(off)

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(off)

    fireEvent.click(off)
    save.focus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByTestId("cookie-settings-dialog")).not.toBeInTheDocument()
    expect(document.activeElement).toBe(opener)
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBe("accepted")
  })

  it("can withdraw consent from settings", () => {
    window.localStorage.setItem(TELLOYA_ANALYTICS_CONSENT_KEY, "accepted")
    render(
      <>
        <TelloyaCookieSettingsButton measurementId={TEST_ID} />
        <TelloyaAnalyticsConsent measurementId={TEST_ID} />
      </>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }))
    expect(screen.getByRole("radio", { name: "On" })).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: "Off" }))
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }))
    expect(window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)).toBe("rejected")
    expect(screen.queryByRole("heading", { name: /advertising|remarketing|personalisation/i })).not.toBeInTheDocument()
  })
})

