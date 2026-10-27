// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { GuardView } from "./guard-view"
import type { GuardLocation } from "@/lib/portal/guard/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/guard" }))
const refresh = vi.hoisted(() => vi.fn())
const navigation = vi.hoisted(() => ({ urls: [] as string[] }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh }),
}))
vi.mock("../../../../../lib/payments/stripe-url", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/payments/stripe-url")>("../../../../../lib/payments/stripe-url")
  return {
    ...actual,
    assignTrustedStripeCheckout(value: unknown) {
      const trusted = actual.trustedStripeUrl(value, "checkout")
      if (!trusted) return false
      navigation.urls.push(trusted)
      return true
    },
  }
})

const fetchMock = vi.fn()
const selector = `gd-${"ab".repeat(32)}`
const action = `ca-${"cd".repeat(32)}`

function location(overrides: Partial<GuardLocation> = {}): GuardLocation {
  return {
    selector,
    businessName: "Harbour Bakery",
    locationName: "High Street",
    arrangement: "Directly purchased Guard",
    status: "Permission required",
    monitoringActive: false,
    permission: "Permission required",
    activatedAt: null,
    includedEndsAt: null,
    billing: "Payment setup required",
    subscription: null,
    amountMinor: null,
    currency: null,
    taxBehaviour: null,
    periodEnd: null,
    cancellation: null,
    lastCheckedAt: "2026-10-03T10:00:00.000Z",
    profileAvailable: true,
    monitoring: "Change detected — being reviewed",
    issueUnderReview: true,
    actions: [{
      selector: action,
      kind: "permission",
      permissionVersion: "GUARD_PERMISSION_V1",
      permissionText: "I give permission for Guard at this location.",
    }],
    ...overrides,
  }
}

beforeEach(() => {
  nav.pathname = "/portal/guard"
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", message: "Recorded." }) })
  refresh.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guard screens", () => {
  it("shows the owned location in customer language and marks Guard in the navigation", () => {
    render(<PortalLayout><GuardView locations={[location()]} focused={false} /></PortalLayout>)
    expect(screen.getByRole("heading", { level: 1, name: "Relaunch Guard" })).toBeTruthy()
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getAllByText("Permission required").length).toBeGreaterThan(0)
    expect(screen.getByText("Your response is needed.")).toBeTruthy()
    expect(screen.getByText("Monitoring is not active.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open this location" })).toHaveAttribute("href", `/portal/guard/${selector}`)
    const guard = screen.getByRole("link", { name: "Relaunch Guard" })
    expect(guard).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/portal/messages")
    expect(document.querySelector(".portal-nav-disabled")).toBeNull()
    expect(document.body.textContent).not.toMatch(/customerId|coverageId|sub_|cus_|REQUESTED|AWAITING_AUTHORIZATION/)
  })

  it("shows an empty state without inventing coverage", () => {
    render(<GuardView locations={[]} focused={false} />)
    expect(screen.getByRole("heading", { name: "Protect your Google Business Profile with Relaunch Guard" })).toBeTruthy()
    expect(screen.getByText("£9.99")).toBeTruthy()
    expect(screen.getByText(/per month per location/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Learn about Relaunch Guard" })).toHaveAttribute("href", "https://profilerelaunch.com/relaunch-guard")
    expect(screen.queryByRole("link", { name: "Request monitoring setup" })).toBeNull()
    expect(screen.queryByRole("button", { name: /checkout|subscribe|pay/i })).toBeNull()
    expect(screen.getByText("Online setup is currently unavailable. Contact us to discuss monitoring.")).toBeTruthy()
  })

  it("offers setup only when the marketing request route is enabled", () => {
    render(<GuardView locations={[]} focused={false} setupEnabled />)
    expect(screen.getByRole("link", { name: "Request monitoring setup" })).toHaveAttribute("href", "https://profilerelaunch.com/start-monitoring")
    expect(screen.getByText("Requesting setup does not start monitoring or take payment.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /checkout|subscribe|pay/i })).toBeNull()
  })

  it("requires an explicit permission confirmation and does not treat silence as acceptance", async () => {
    render(<GuardView locations={[location()]} focused />)
    expect(screen.getByText("Change detected — being reviewed")).toBeTruthy()
    expect(screen.getByText("ProfileRelaunch is reviewing a detected issue.")).toBeTruthy()
    expect(screen.getByText("The profile appeared available.")).toBeTruthy()
    const accept = screen.getByRole("button", { name: "Accept Guard permission" })
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox"))
    expect(accept).toBeEnabled()
    fireEvent.submit(accept.closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init.body))).toMatchObject({
      selector,
      actionSelector: action,
      operation: "accept_permission",
      confirmation: { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" },
    })
  })

  it("does not describe an unknown check as an unavailable profile", () => {
    render(<GuardView locations={[location({
      profileAvailable: null,
      monitoring: "Check incomplete",
      issueUnderReview: false,
      actions: [],
    })]} focused />)
    expect(screen.getByText("Check incomplete")).toBeTruthy()
    expect(screen.queryByText("The profile did not appear available.")).toBeNull()
    expect(screen.queryByText("The profile appeared available.")).toBeNull()
  })

  it("hides checkout once the subscription is no longer in setup", () => {
    const billing = {
      selector: action,
      kind: "subscription" as const,
      amountMinor: 4900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE" as const,
      consentVersion: "GUARD_RECURRING_CONSENT_V1" as const,
      consentText: "I authorise monthly billing for this location.",
      consentRecorded: true,
      cancellationTerms: "Normal cancellation takes effect at the end of the already-paid period.",
      checkout: false,
      recovery: false,
      periodEndCancellation: true,
      undoPeriodEndCancellation: false,
      immediateCancellationReview: true,
    }
    render(<GuardView locations={[location({
      subscription: "Billing is active",
      actions: [billing],
    })]} focused />)
    expect(screen.queryByRole("button", { name: "Continue to secure Stripe Checkout" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Update the payment method securely" })).toBeNull()
    expect(screen.getByRole("button", { name: "Cancel at period end" })).toBeTruthy()
  })

  it("does not navigate when Guard Checkout returns an untrusted URL", async () => {
    navigation.urls.length = 0
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "javascript:alert(1)" }),
    })
    render(<GuardView locations={[location({
      actions: [{
        selector: action,
        kind: "subscription" as const,
        amountMinor: 4900,
        currency: "GBP",
        taxBehaviour: "NOT_APPLICABLE" as const,
        consentVersion: "GUARD_RECURRING_CONSENT_V1" as const,
        consentText: "I authorise monthly billing for this location.",
        consentRecorded: true,
        cancellationTerms: "Normal cancellation takes effect at the end of the already-paid period.",
        checkout: true,
        recovery: false,
        periodEndCancellation: false,
        undoPeriodEndCancellation: false,
        immediateCancellationReview: false,
      }],
    })]} focused />)
    fireEvent.submit(screen.getByRole("button", { name: "Continue to secure Stripe Checkout" }).closest("form")!)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Secure Stripe Checkout is not available yet."))
    expect(navigation.urls).toEqual([])
    expect(document.body.innerHTML).not.toContain("javascript:")
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://checkout.stripe.com/c/pay_guard" }),
    })
    fireEvent.submit(screen.getByRole("button", { name: "Continue to secure Stripe Checkout" }).closest("form")!)
    await waitFor(() => expect(navigation.urls).toEqual(["https://checkout.stripe.com/c/pay_guard"]))
  })

  it("offers price acceptance and decline as separate responses", () => {
    render(<GuardView locations={[location({
      actions: [{
        selector: action,
        kind: "price_change",
        oldAmountMinor: 4900,
        newAmountMinor: 5900,
        currency: "GBP",
        noticeVersion: "GUARD_PRICE_CHANGE_NOTICE_V1",
        noticeText: "The stored notice for this location.",
        effectiveAt: "2026-11-01T00:00:00.000Z",
      }],
    })]} focused />)
    expect(screen.getByText("No response is not acceptance.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Accept price change" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled()
  })
})
