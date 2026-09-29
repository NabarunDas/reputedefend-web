/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { GoogleAnalytics, resetGoogleAnalyticsRuntime } from "./google-analytics"
import {
  acceptAnalytics,
  ANALYTICS_CONSENT_KEY,
  sendLeadConversion,
  withdrawAnalytics,
} from "@/lib/analytics"

const TEST_ID = "G-TESTONLY123"

/**
 * gtag.js only treats a queue entry as a command when it is an Arguments
 * object. A plain Array is read as a GTM-style event and never collected, so
 * the shape of each entry matters as much as its contents.
 */
function isArgumentsObject(value: unknown) {
  return Object.prototype.toString.call(value) === "[object Arguments]"
}

function queuedCommand(index: number) {
  const entry = window.dataLayer?.[index]
  return {
    entry,
    isArguments: isArgumentsObject(entry),
    isArray: Array.isArray(entry),
    values: Array.from((entry ?? []) as ArrayLike<unknown>),
  }
}

function commandNames() {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>)[0])
}

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

describe("gtag dataLayer queue", () => {
  async function renderAccepted() {
    acceptAnalytics(TEST_ID)
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    await waitFor(() => expect(commandNames()).toEqual(["consent", "js", "config", "event"]))
  }

  it("queues nothing at all before consent", () => {
    render(<GoogleAnalytics measurementId={TEST_ID} />)
    expect(window.dataLayer).toBeUndefined()
    expect(window.gtag).toBeUndefined()
  })

  it("pushes an Arguments object rather than an Array", async () => {
    await renderAccepted()
    expect(Array.isArray(window.dataLayer?.[0])).toBe(false)
    for (let index = 0; index < (window.dataLayer?.length ?? 0); index += 1) {
      const command = queuedCommand(index)
      expect(command.isArguments, `entry ${index}`).toBe(true)
      expect(command.isArray, `entry ${index}`).toBe(false)
    }
  })

  it("keeps the consent command contents intact", async () => {
    await renderAccepted()
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
  })

  it("keeps the js command contents intact", async () => {
    await renderAccepted()
    const [command, timestamp] = queuedCommand(1).values
    expect(command).toBe("js")
    expect(timestamp).toBeInstanceOf(Date)
  })

  it("keeps the config command contents intact, with automatic page views off", async () => {
    await renderAccepted()
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
  })

  it("keeps the sanitised page_view command contents intact", async () => {
    await renderAccepted()
    const [command, name, params] = queuedCommand(3).values
    expect(command).toBe("event")
    expect(name).toBe("page_view")
    expect(params).toEqual({
      page_path: "/get-help",
      page_location: `${window.location.origin}/get-help`,
    })
  })

  it("queues a lead conversion through the same shim", async () => {
    await renderAccepted()
    expect(sendLeadConversion({ leadType: "contact" })).toBe(true)
    const conversion = queuedCommand(4)
    expect(conversion.isArguments).toBe(true)
    expect(conversion.isArray).toBe(false)
    expect(conversion.values).toEqual(["event", "generate_lead", { lead_type: "contact" }])
  })

  it("queues the withdrawal consent update as an Arguments object", async () => {
    await renderAccepted()
    withdrawAnalytics(TEST_ID)
    const update = queuedCommand(4)
    expect(update.isArguments).toBe(true)
    expect(update.values).toEqual([
      "consent",
      "update",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ])
  })
})
