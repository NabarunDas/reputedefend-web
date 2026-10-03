// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../../../layout"
import { ServiceUnavailable, ServiceView } from "./service-view"
import type { CustomerCaseService, ServiceAction, ServiceAgreement, ServiceQuote } from "@/lib/portal/service/parse"

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/cases/PR-26-ABCDEF/service",
  useRouter: () => ({ push: vi.fn(), refresh }),
}))

const selector = `ca-${"ab".repeat(32)}`
const agreementSelector = `ca-${"cd".repeat(32)}`
const revokeSelector = `ca-${"12".repeat(32)}`
const validUntil = "2026-11-01T12:00:00.000Z"
const acceptedAt = "2026-10-02T12:00:00.000Z"

function quote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
  return {
    reference: "QT-26-ABCDEF",
    serviceName: "Guided profile help",
    scope: "We prepare the profile relaunch for this location.",
    exclusions: "Directory listings outside this location are excluded.",
    successDefinition: "Success means the profile is submitted for reinstatement.",
    standardAmountMinor: 29900,
    discountAmountMinor: 0,
    quotedAmountMinor: 29900,
    taxAmountMinor: 0,
    totalAmountMinor: 29900,
    currency: "GBP",
    taxBehaviour: "NOT_APPLICABLE",
    paymentTiming: "You pay the quoted amount before work starts.",
    validUntil,
    termsReference: "The service terms sent with this quote apply.",
    status: "offered",
    orderReference: null,
    acceptedAt: null,
    paymentNext: null,
    canAccept: true,
    ...overrides,
  }
}

function agreement(overrides: Partial<ServiceAgreement> = {}): ServiceAgreement {
  return {
    title: "ProfileRelaunch Service Agreement",
    body: "The complete agreement body the customer must read before agreeing.",
    scope: "This agreement covers only the case described here.",
    versionNumber: 2,
    status: "review",
    acceptedAt: null,
    canAccept: true,
    canDecline: true,
    ...overrides,
  }
}

function action(kind: ServiceAction["kind"], value: string, target: ServiceAction["target"] = null): ServiceAction {
  return { selector: value, kind, target }
}

function view(overrides: Partial<CustomerCaseService> = {}): CustomerCaseService {
  return {
    found: true,
    case: {
      reference: "PR-26-ABCDEF",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      serviceTrack: "GUIDED",
    },
    quote: quote(),
    serviceAgreement: agreement(),
    casePermission: agreement({
      title: "Case management permission",
      body: "This permission lets ProfileRelaunch manage this case only.",
      scope: "The permission is limited to the stored case scope.",
      canAccept: false,
      canDecline: false,
      status: "unavailable",
    }),
    actions: [action("quote", selector), action("service_agreement", agreementSelector)],
    ...overrides,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("crypto", { randomUUID: () => "44444444-4444-4444-8444-444444444444" })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("service and permissions", () => {
  it("shows an offered quote, the agreement text, and no payment or revoke control", () => {
    render(<PortalLayout><ServiceView service={view()} /></PortalLayout>)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Service and permissions" })).toBeTruthy()
    expect(screen.getAllByText("PR-26-ABCDEF").length).toBeGreaterThan(0)
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getByText("High Street")).toBeTruthy()
    expect(screen.getByText("Guided service")).toBeTruthy()
    expect(screen.getByText("QT-26-ABCDEF")).toBeTruthy()
    expect(screen.getAllByText("£299.00").length).toBeGreaterThan(0)
    expect(screen.getByText("Tax does not apply to this quote.")).toBeTruthy()
    expect(screen.getByText("We prepare the profile relaunch for this location.")).toBeTruthy()
    expect(screen.getByText("Directory listings outside this location are excluded.")).toBeTruthy()
    expect(screen.getByText("Success means the profile is submitted for reinstatement.")).toBeTruthy()
    expect(screen.getByText("You pay the quoted amount before work starts.")).toBeTruthy()
    expect(screen.getByText("The service terms sent with this quote apply.")).toBeTruthy()
    expect(screen.getByText("The complete agreement body the customer must read before agreeing.")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "I have read and agree to this Service Agreement." })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Withdraw this agreement" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Withdraw this permission" })).toBeNull()
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("href", "/portal/payments")
    expect(screen.queryByRole("link", { name: /Relaunch Guard|Account/ })).toBeNull()
    expect(screen.queryByText(/Stripe|PaymentIntent|checkout|card number/i)).toBeNull()
    const html = document.body.innerHTML
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(html).not.toContain("action-secret")
    expect(html).not.toMatch(/secure-link|token_hash|stripe_/i)
  })

  it("renders a discounted exclusive quote without raw tax enums", () => {
    render(<ServiceView service={view({
      quote: quote({
        standardAmountMinor: 29900,
        discountAmountMinor: 5980,
        quotedAmountMinor: 23920,
        taxAmountMinor: 4784,
        totalAmountMinor: 28704,
        taxBehaviour: "EXCLUSIVE",
        currency: "GBP",
      }),
      serviceAgreement: null,
      casePermission: null,
      actions: [action("quote", selector)],
    })} />)
    expect(screen.getByText("£59.80")).toBeTruthy()
    expect(screen.getByText("£239.20")).toBeTruthy()
    expect(screen.getByText("£47.84")).toBeTruthy()
    expect(screen.getByText("£287.04")).toBeTruthy()
    expect(screen.getByText("Tax is added to the quoted amount.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/EXCLUSIVE|UNCONFIRMED|tax_behaviour/)
  })

  it("shows an accepted quote and the email payment step without an accept button", () => {
    render(<ServiceView service={view({
      quote: quote({
        status: "accepted",
        canAccept: false,
        acceptedAt,
        orderReference: "SO-26-ABCDEF",
        paymentNext: "payment",
      }),
      actions: [],
    })} />)
    expect(screen.getByText("You accepted this quote on 2 October 2026.")).toBeTruthy()
    expect(screen.getByText("SO-26-ABCDEF")).toBeTruthy()
    expect(screen.getByText("Payment is the next step. Continue in Payments in the customer portal.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open payments for PR-26-ABCDEF" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/payments")
    expect(screen.queryByRole("button", { name: "Accept this quote" })).toBeNull()
  })

  it("shows declined and expired quotes without an accept control", () => {
    const { rerender } = render(<ServiceView service={view({
      quote: quote({ status: "declined", canAccept: false }),
      actions: [],
    })} />)
    expect(screen.getByText("You declined this quote.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept this quote" })).toBeNull()
    rerender(<ServiceView service={view({
      quote: quote({ status: "expired", canAccept: false }),
      actions: [],
    })} />)
    expect(screen.getByText("This quote has expired.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept this quote" })).toBeNull()
  })

  it("hides quote acceptance when tax is unconfirmed", () => {
    render(<ServiceView service={view({
      quote: quote({ taxBehaviour: "UNCONFIRMED", canAccept: false }),
      actions: [action("quote", selector)],
    })} />)
    expect(screen.getByText("Tax on this quote is not confirmed, so it cannot be accepted yet.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept this quote" })).toBeNull()
    expect(screen.getByRole("button", { name: "Decline this quote" })).toBeTruthy()
  })

  it("requires an explicit agreement acknowledgement before acceptance", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "success" }) })
    render(<ServiceView service={view()} />)
    const checkbox = screen.getByRole("checkbox", { name: "I have read and agree to this Service Agreement." })
    const continueButton = screen.getByRole("button", { name: "Continue with the Service Agreement" })
    expect(continueButton).toBeDisabled()
    fireEvent.click(checkbox)
    fireEvent.click(continueButton)
    fireEvent.click(screen.getByRole("button", { name: "Confirm acceptance" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/portal/service")
    expect(JSON.parse(String(init.body))).toEqual({
      reference: "PR-26-ABCDEF",
      selector: agreementSelector,
      operation: "accept_agreement",
      confirmation: { accepted: true },
    })
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("44444444-4444-4444-8444-444444444444")
    expect(refresh).toHaveBeenCalled()
  })

  it("states the effect of declining an agreement and does not cancel an order in the copy", () => {
    render(<ServiceView service={view()} />)
    fireEvent.click(screen.getByRole("button", { name: /^Decline$/ }))
    expect(screen.getByText("Declining this Service Agreement means you do not agree to it. It does not cancel a service order.")).toBeTruthy()
  })

  it("shows an accepted permission and a withdrawal only when a revocation action exists", () => {
    const { rerender } = render(<ServiceView service={view({
      casePermission: agreement({
        title: "Case management permission",
        body: "This permission lets ProfileRelaunch manage this case only.",
        scope: "The permission is limited to the stored case scope.",
        status: "accepted",
        acceptedAt,
        canAccept: false,
        canDecline: false,
      }),
      actions: [],
    })} />)
    expect(screen.getByText("You accepted this case management permission on 2 October 2026.")).toBeTruthy()
    expect(screen.getByText("This permission lets ProfileRelaunch manage this case only.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Withdraw this permission" })).toBeNull()
    rerender(<ServiceView service={view({
      casePermission: agreement({
        title: "Case management permission",
        body: "This permission lets ProfileRelaunch manage this case only.",
        scope: "The permission is limited to the stored case scope.",
        status: "accepted",
        acceptedAt,
        canAccept: false,
        canDecline: false,
      }),
      actions: [action("revocation", revokeSelector, "case_permission")],
    })} />)
    fireEvent.click(screen.getByRole("button", { name: "Withdraw this permission" }))
    expect(screen.getByText("Withdrawing this permission stops ProfileRelaunch using it. It does not cancel a service order.")).toBeTruthy()
  })

  it("shows a busy decline, then the server message, and retries with the same key", async () => {
    let release: (value: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    render(<ServiceView service={view({ serviceAgreement: null, casePermission: null, actions: [action("quote", selector)] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Decline this quote" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }))
    expect(screen.getByRole("button", { name: "Declining quote" })).toBeDisabled()
    release({ ok: false, json: async () => ({ message: "This page is out of date. Refresh it and try again." }) })
    expect(await screen.findByRole("alert")).toHaveTextContent("This page is out of date. Refresh it and try again.")
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "We couldn't complete that step. Please try again shortly." }) })
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const first = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    const second = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(first["idempotency-key"]).toBe(second["idempotency-key"])
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't complete that step. Please try again shortly.")
    expect(screen.queryByText("You declined this quote.")).toBeNull()
  })

  it("uses a calm unavailable state", () => {
    render(<ServiceUnavailable />)
    expect(screen.getByRole("heading", { level: 1, name: "We couldn't load service details" })).toBeTruthy()
  })
})
