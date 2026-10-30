// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ACTION_CODE_INVALID, ACTION_RATE_LIMITED, ACTION_UNAVAILABLE } from "@/lib/access"
import { pdfPlainText } from "../../../../../lib/commercial/agreement-pdf"
import { ActionClient } from "./action-client"

const router = vi.hoisted(() => ({ push: vi.fn() }))
const navigation = vi.hoisted(() => ({ urls: [] as string[] }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
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
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const session = {
  actionId,
  kind: "AGREEMENT_ACCEPTANCE",
  status: "OPEN",
  maskedEmail: "d***@gmail.com",
  caseReference: "PR-26-ABCDEF",
  businessName: "Bakery",
  agreement: {
    title: "Managed recovery service agreement",
    body: "This is the owner-approved service wording for this exact case snapshot.",
    scope: "Restore the listed Google Business Profile for this case only.",
    kind: "SERVICE_AGREEMENT",
  },
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  router.push.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderAfterExchange(maskedEmail = "d***@gmail.com") {
  window.history.replaceState(null, "", `/action/${actionId}#t=${"b".repeat(64)}`)
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", maskedEmail }) })
  render(<ActionClient actionId={actionId} />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy())
}

async function sendCodeSuccessfully() {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", maskedEmail: "d***@gmail.com" }) })
  fireEvent.click(screen.getByRole("button", { name: "Send code" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy())
}

describe("customer action page", () => {
  it("still exchanges once when the effect is mounted twice", async () => {
    window.history.replaceState(null, "", `/action/${actionId}#t=${"b".repeat(64)}`)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "ok", maskedEmail: "a***@example.com" }) })
    render(<React.StrictMode><ActionClient actionId={actionId} /></React.StrictMode>)
    await waitFor(() => expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy())
    const exchanges = fetchMock.mock.calls.filter(call => String(call[0]).includes("/api/action/exchange"))
    expect(exchanges).toHaveLength(1)
    expect(window.location.hash).toBe("")
  })

  it("exchanges the fragment secret and removes it without using web storage", async () => {
    await renderAfterExchange("a***@example.com")
    expect(window.location.hash).toBe("")
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).toContain("b".repeat(64))
    expect(screen.getByText(/a\*\*\*@example.com/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/googletagmanager|dashboard|Submit to Google/i)
  })

  it("shows Send code and hides OTP controls until the code is sent", async () => {
    await renderAfterExchange()
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()
    expect(screen.getByText(/d\*\*\*@gmail.com/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
    expect(screen.queryByText(/We sent an eight-digit code/)).toBeNull()
  })

  it("hides Send code and shows Verify after a successful send", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy()
    expect(screen.getByLabelText("Eight-digit code")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeTruthy()
    expect(screen.getByText(/We sent an eight-digit code to d\*\*\*@gmail.com/)).toBeTruthy()
    expect(document.body.textContent).not.toContain("das.nabarun@gmail.com")
    expect(screen.queryByRole("img", { name: "ProfileRelaunch" })).toBeNull()
    expect(screen.getByRole("button", { name: /Resend code \(\d+\)/ })).toBeDisabled()
    expect(document.querySelectorAll("[data-otp-slot]")).toHaveLength(8)
  })

  it("removes OTP controls and shows the agreement after verification", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    const verifyCall = fetchMock.mock.calls.find(call => call[0] === "/api/action/verify")
    expect(verifyCall?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ code: "12345678" }) })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/portal"))).toBe(false)
    expect(screen.getByText("Managed recovery service agreement")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
    expect(screen.queryByText(/We sent an eight-digit code/)).toBeNull()
  })

  it("shows only the completed state after acceptance", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    fireEvent.click(screen.getByRole("checkbox"))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => expect(screen.getByText("This action is complete.")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("shows the immutable quote snapshot after verification", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "QUOTE_ACCEPTANCE",
          agreement: null,
          quote: {
            versionId: actionId,
            versionNumber: 1,
            serviceCode: "MANAGED_RELAUNCH",
            serviceName: "Managed Relaunch",
            paymentModel: "SUCCESS_FEE",
            scope: "Managed recovery for this location only.",
            exclusions: "Google decisions and payment collection are excluded.",
            successDefinition: "Success relates to the agreed successful restoration outcome.",
            standardAmountMinor: 29900,
            discountPolicyId: "PAID_GUARD_MANAGED_20",
            discountBps: 2000,
            discountAmountMinor: 5980,
            discountReason: "QUALIFIED",
            quotedSubtotalMinor: 23920,
            taxBehaviour: "NOT_APPLICABLE",
            taxRateBps: null,
            taxAmountMinor: 0,
            taxCode: null,
            taxJurisdiction: null,
            totalAmountMinor: 23920,
            currency: "GBP",
            validUntil: "2026-10-10T12:00:00.000Z",
            paymentTiming: "No service fee is charged today. The quoted success fee becomes collectible only after the defined successful outcome.",
            termsReference: "Service terms as published at quote time.",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept quote" })).toBeTruthy())
    expect(screen.getByText("Managed Relaunch")).toBeTruthy()
    expect(screen.getAllByText(/£239.20/).length).toBeGreaterThan(0)
    expect(screen.getByText("Total price, inclusive of any applicable taxes. No additional taxes or mandatory fees charged by ProfileRelaunch.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/NOT_APPLICABLE|basis points|VAT not charged|Tax is added/)
    expect(screen.getByText(/does not create an invoice or outstanding debt/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/charge a card today|monitoring has started|Stripe/i)
  })

  it("shows the bound agreement before the quote acknowledgements and can save it", async () => {
    const hash = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"
    const body = "ProfileRelaunch Ltd — Paid-service agreement\n\nThe quotation states the scope, exclusions and the 48-hour success definition."
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:agreement")
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "QUOTE_ACCEPTANCE",
          agreement: null,
          quote: {
            versionId: actionId,
            versionNumber: 1,
            serviceCode: "GUIDED_RELAUNCH",
            serviceName: "Guided Relaunch",
            paymentModel: "UPFRONT",
            scope: "Guided help for this location only.\n\nStandard wording version SCOPE-2026-10-21.3.",
            exclusions: "Work outside this quotation is excluded.",
            successDefinition: "The fee follows the 48-hour success definition in the agreement.",
            standardAmountMinor: 9900,
            discountPolicyId: "NONE",
            discountBps: 0,
            discountAmountMinor: 0,
            quotedSubtotalMinor: 9900,
            taxBehaviour: "NOT_APPLICABLE",
            taxRateBps: null,
            taxAmountMinor: 0,
            taxCode: null,
            taxJurisdiction: null,
            totalAmountMinor: 9900,
            currency: "GBP",
            validUntil: "2026-10-10T12:00:00.000Z",
            paymentTiming: "The Guided fee is payable upfront after acceptance.",
            termsReference: "Agreement PS-2026-10-14.2.",
            commercialAgreementVersion: "PS-2026-10-14.2",
            commercialAgreementHash: hash,
            commercialAgreementBody: body,
            commercialAgreementReady: true,
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    const agreement = await screen.findByRole("article", { name: "Paid-service agreement" })
    expect(agreement).toHaveTextContent("48-hour success definition")
    expect(screen.getByText("Guided help for this location only.")).toBeTruthy()
    expect(document.body.textContent).not.toContain("Standard wording version")
    expect(screen.getAllByText(/£99\.00/).length).toBeGreaterThan(0)
    expect(screen.getByText(/payable upfront after acceptance/)).toBeTruthy()
    expect(screen.queryByText("No discount")).toBeNull()
    expect(screen.queryByRole("heading", { name: "What counts as success" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/SHA-256/)
    expect(document.body.textContent).not.toContain("PS-2026-10-14.2")
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes).toHaveLength(2)
    for (const box of boxes) expect(box).not.toBeChecked()
    expect(document.body.innerHTML).not.toContain('href="/terms"')
    fireEvent.click(screen.getByRole("button", { name: "Download the agreement as a PDF" }))
    const downloaded = new Uint8Array(await (createObjectURL.mock.calls[0][0] as Blob).arrayBuffer())
    expect(pdfPlainText(downloaded)).toContain("48-hour success definition")
    expect(pdfPlainText(downloaded)).not.toContain("SHA-256")
    expect(revokeObjectURL).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("checkbox", { name: /acting for the business named on this quotation/ }))
    fireEvent.click(screen.getByRole("checkbox", { name: /agreement shown above/ }))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept quote" }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === "/api/action/command")).toBe(true))
    const command = fetchMock.mock.calls.find(call => call[0] === "/api/action/command") as [string, RequestInit]
    expect(JSON.parse(String(command[1].body))).toMatchObject({
      operation: "accept",
      businessPurpose: { accepted: true },
      terms: { accepted: true, version: "PS-2026-10-14.2", hash },
      feeBasis: null,
    })
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it("fails closed when the bound agreement is not ready", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "QUOTE_ACCEPTANCE",
          agreement: null,
          quote: {
            versionId: actionId,
            versionNumber: 1,
            serviceCode: "GUIDED_RELAUNCH",
            serviceName: "Guided Relaunch",
            paymentModel: "UPFRONT",
            scope: "Guided help for this location only.",
            exclusions: "Work outside this quotation is excluded.",
            successDefinition: "The fee follows the agreement.",
            standardAmountMinor: 9900,
            discountPolicyId: "NONE",
            discountBps: 0,
            discountAmountMinor: 0,
            quotedSubtotalMinor: 9900,
            taxBehaviour: "NOT_APPLICABLE",
            taxRateBps: null,
            taxAmountMinor: 0,
            taxCode: null,
            taxJurisdiction: null,
            totalAmountMinor: 9900,
            currency: "GBP",
            validUntil: "2026-10-10T12:00:00.000Z",
            paymentTiming: "The Guided fee is payable upfront after acceptance.",
            termsReference: "Agreement PS-2026-10-14.2.",
            commercialAgreementVersion: "PS-2026-10-14.2",
            commercialAgreementHash: "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4",
            commercialAgreementBody: null,
            commercialAgreementReady: false,
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByText(/commercial agreement bound to it is not available/)).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Accept quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Download the agreement as a PDF" })).toBeNull()
    expect(document.body.innerHTML).not.toContain('href="/terms"')
  })

  it("does not offer the legacy Managed off-session card setup", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "MANAGED_PAYMENT_SETUP",
          agreement: null,
          payment: {
            orderId: actionId,
            orderRef: "SO-26-ABCDE2",
            serviceCode: "MANAGED_RELAUNCH",
            amountMinor: 29900,
            currency: "GBP",
            taxBehaviour: "NOT_APPLICABLE",
            taxAmountMinor: 0,
            paymentModel: "SUCCESS_FEE",
            successDefinition: "Success is the documented restoration.",
            obligationId: actionId,
            obligationState: "NOT_DUE",
            consentText: "A saved card may be charged off-session after success.",
            consentVersion: "SUCCESS_FEE_CONSENT_V1",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Managed payment" })).toBeTruthy())
    expect(screen.getByText(/invoiced only after documented success/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Save payment method|Record later-charge consent/ })).toBeNull()
    expect(screen.getByText(/off-session charge is not available/)).toBeTruthy()
    expect(screen.queryByText(/charged off-session after success/)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("redirects CASE_ACCESS verification to the case documents page", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: { ...session, kind: "CASE_ACCESS", agreement: null },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/case"))
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("shows Guided payment details without claiming success from a return", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "GUIDED_PAYMENT",
          agreement: null,
          payment: {
            orderId: actionId,
            orderRef: "SO-26-ABCDE2",
            serviceCode: "GUIDED_RELAUNCH",
            amountMinor: 9900,
            currency: "GBP",
            taxBehaviour: "NOT_APPLICABLE",
            taxAmountMinor: 0,
            paymentModel: "UPFRONT",
            successDefinition: "Restore the listed profile.",
            obligationId: actionId,
            obligationState: "DUE",
            consentText: "No service fee is charged today.",
            consentVersion: "SUCCESS_FEE_CONSENT_V1",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Pay securely with Stripe" })).toBeTruthy())
    expect(screen.getByText(/SO-26-ABCDE2/)).toBeTruthy()
    expect(screen.getByText(/£99.00/)).toBeTruthy()
    expect(document.body.textContent).toMatch(/does not mark this paid/)
    expect(document.body.textContent).not.toMatch(/webhook|TEST-MODE/i)
    expect(screen.queryByText(/Payment successful/i)).toBeNull()
  })

  it("shows the hosted invoice link without marking the obligation paid", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "INVOICE_PAYMENT",
          agreement: null,
          payment: {
            orderId: actionId,
            orderRef: "SO-26-ABCDE2",
            serviceCode: "GUIDED_RELAUNCH",
            amountMinor: 9900,
            currency: "GBP",
            taxBehaviour: "NOT_APPLICABLE",
            taxAmountMinor: 0,
            paymentModel: "UPFRONT",
            successDefinition: "Restore the listed profile.",
            obligationId: actionId,
            obligationState: "DUE",
            consentText: "No service fee is charged today.",
            consentVersion: "SUCCESS_FEE_CONSENT_V1",
            invoiceId: actionId,
            invoiceStatus: "ISSUED",
            hostedInvoiceUrl: "https://invoice.stripe.test/in_test",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("link", { name: "Open the secure Stripe hosted invoice" })).toBeTruthy())
    expect(screen.getByRole("link", { name: "Open the secure Stripe hosted invoice" })).toHaveAttribute("href", "https://invoice.stripe.test/in_test")
    expect(document.body.textContent).toMatch(/does not mark this paid/)
    expect(document.body.textContent).not.toMatch(/TEST-MODE|fallback|obligation/i)
    expect(screen.queryByRole("button", { name: /mark paid/i })).toBeNull()
  })

  it("does not render or follow an untrusted hosted invoice or Checkout URL", async () => {
    navigation.urls.length = 0
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "INVOICE_PAYMENT",
          agreement: null,
          payment: {
            orderId: actionId,
            orderRef: "SO-26-ABCDE2",
            serviceCode: "GUIDED_RELAUNCH",
            amountMinor: 9900,
            currency: "GBP",
            taxBehaviour: "NOT_APPLICABLE",
            taxAmountMinor: 0,
            paymentModel: "UPFRONT",
            successDefinition: "Restore the listed profile.",
            obligationId: actionId,
            obligationState: "DUE",
            consentText: "No service fee is charged today.",
            consentVersion: "SUCCESS_FEE_CONSENT_V1",
            invoiceId: actionId,
            invoiceStatus: "ISSUED",
            hostedInvoiceUrl: "https://invoice.stripe.com.evil.example/i/x",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByText("The hosted invoice link is not available yet.")).toBeTruthy())
    expect(screen.queryByRole("link", { name: "Open the secure Stripe hosted invoice" })).toBeNull()
    expect(document.body.innerHTML).not.toContain("evil.example")
    expect(navigation.urls).toEqual([])
  })

  it("does not navigate when Checkout returns an untrusted URL", async () => {
    navigation.urls.length = 0
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "GUIDED_PAYMENT",
          agreement: null,
          payment: {
            orderId: actionId,
            orderRef: "SO-26-ABCDE2",
            serviceCode: "GUIDED_RELAUNCH",
            amountMinor: 9900,
            currency: "GBP",
            taxBehaviour: "NOT_APPLICABLE",
            taxAmountMinor: 0,
            paymentModel: "UPFRONT",
            successDefinition: "Restore the listed profile.",
            obligationId: actionId,
            obligationState: "DUE",
            consentText: "No service fee is charged today.",
            consentVersion: "SUCCESS_FEE_CONSENT_V1",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Pay securely with Stripe" })).toBeTruthy())
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://checkout.stripe.com@evil.example/pay" }),
    })
    fireEvent.click(screen.getByRole("button", { name: "Pay securely with Stripe" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Secure Stripe Checkout is not available yet."))
    expect(navigation.urls).toEqual([])
    expect(document.body.innerHTML).not.toContain("evil.example")
    expect(screen.queryByText(/payment successful/i)).toBeNull()
    navigation.urls.length = 0
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", checkoutUrl: "https://checkout.stripe.com/c/pay_test" }),
    })
    fireEvent.click(screen.getByRole("button", { name: "Pay securely with Stripe" }))
    await waitFor(() => expect(navigation.urls).toEqual(["https://checkout.stripe.com/c/pay_test"]))
  })

  it("requires a positive Guard permission choice after OTP", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "GUARD_PERMISSION",
          agreement: null,
          guard: {
            coverageId: actionId,
            coverageBasis: "INCLUDED",
            permissionVersion: "GUARD_PERMISSION_V1",
            permissionText: "I choose the included 30-day Relaunch Guard offer for this restored location.",
            includedDays: 30,
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept Guard permission" })).toBeTruthy())
    expect(screen.getByText(/30 days start only when Guard is activated/)).toBeTruthy()
    expect(screen.getByText(/Opening this link or verifying the one-time code is not acceptance/)).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox"))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept Guard permission" }))
    await waitFor(() => expect(screen.getByText("This action is complete.")).toBeTruthy())
    expect(JSON.stringify(fetchMock.mock.calls.at(-1)?.[1].body)).toContain("GUARD_PERMISSION_V1")
  })

  it("requires recurring consent before Guard Checkout and does not claim billing from a return", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "GUARD_SUBSCRIPTION_START",
          locationName: "High Street",
          agreement: null,
          subscription: {
            subscriptionId: actionId,
            amountMinor: 999,
            currency: "GBP",
            frequency: "MONTHLY",
            taxBehaviour: "NOT_APPLICABLE",
            consentVersion: "GUARD_RECURRING_CONSENT_V1",
            consentText: "I authorise monthly billing for Relaunch Guard for this exact location.",
            cancellationTermsVersion: "GUARD_CANCELLATION_TERMS_V1",
            cancellationTermsText: "Cancel at period end keeps already-paid service.",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept monthly billing for this location" })).toBeTruthy())
    expect(screen.getByText(/£9.99/)).toBeTruthy()
    expect(screen.getByText(/High Street/)).toBeTruthy()
    expect(document.body.textContent).toMatch(/does not start Guard billing/)
    expect(screen.queryByRole("button", { name: "Continue to secure Stripe Checkout" })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox"))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept monthly billing for this location" }))
    await waitFor(() => expect(screen.getByText("This action is complete.")).toBeTruthy())
    expect(JSON.stringify(fetchMock.mock.calls.at(-1)?.[1].body)).toContain("GUARD_RECURRING_CONSENT_V1")
  })

  it("requires an explicit accept or decline for a Guard price change", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        session: {
          ...session,
          kind: "GUARD_PRICE_CHANGE_ACCEPTANCE",
          locationName: "High Street",
          agreement: null,
          priceChange: {
            offerId: actionId,
            oldAmountMinor: 999,
            newAmountMinor: 1299,
            currency: "GBP",
            effectiveRenewalAt: "2026-11-01T00:00:00.000Z",
            noticeVersion: "GUARD_PRICE_CHANGE_NOTICE_V1",
            noticeText: "The new price applies at the next renewal only.",
            status: "OFFERED",
          },
        },
      }),
    })
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept price change" })).toBeTruthy())
    expect(screen.getByText(/£9.99/)).toBeTruthy()
    expect(screen.getByText(/£12.99/)).toBeTruthy()
    expect(document.body.textContent).toMatch(/No response is not acceptance/)
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy()
  })

  it("does not claim a code was sent when the provider fails", async () => {
    await renderAfterExchange()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }) })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByText(/unavailable or has expired/)).toBeTruthy())
    expect(screen.queryByText(/We sent an eight-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
  })

  it("keeps the send screen and shows the rate limit on 429", async () => {
    await renderAfterExchange()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }),
    })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(ACTION_RATE_LIMITED))
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "This link is not available" })).toBeNull()
    expect(screen.getByRole("button", { name: /Send code/ })).toBeDisabled()
    expect(screen.queryByText(/We sent an eight-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes("/api/portal"))).toHaveLength(0)
  })
})

function slots() {
  return [...document.querySelectorAll<HTMLElement>("[data-otp-slot]")]
}

describe("secure action OTP entry", () => {
  it("fills eight slots, ignores other characters, and does not submit a short code", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    const code = screen.getByLabelText("Eight-digit code") as HTMLInputElement
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(code).toHaveAttribute("autocomplete", "one-time-code")
    expect(code).not.toHaveAttribute("maxlength")
    expect(code).toHaveClass("otp-control")
    fireEvent.change(code, { target: { value: "12a3-4" } })
    expect(code).toHaveValue("1234")
    expect(slots().map(slot => slot.textContent)).toEqual(["1", "2", "3", "4", "", "", "", ""])
    expect(screen.getByRole("button", { name: "Verify code" })).toBeDisabled()
    fireEvent.submit(code.closest("form")!)
    expect(fetchMock.mock.calls.filter(call => call[0] === "/api/action/verify")).toHaveLength(0)
  })

  it("normalises a formatted paste and truncates an overlong paste without verifying", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    const code = screen.getByLabelText("Eight-digit code")
    fireEvent.paste(code)
    fireEvent.change(code, { target: { value: "12 34-5678" } })
    expect(code).toHaveValue("12345678")
    expect(slots().map(slot => slot.textContent).join("")).toBe("12345678")
    fireEvent.change(code, { target: { value: "123456789999" } })
    expect(code).toHaveValue("12345678")
    expect(fetchMock.mock.calls.filter(call => call[0] === "/api/action/verify")).toHaveLength(0)
  })

  it("keeps one input for keyboard entry and focuses it from a slot", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    const code = screen.getByLabelText("Eight-digit code") as HTMLInputElement
    await waitFor(() => expect(code).toHaveFocus())
    expect(slots()[0]).toHaveAttribute("data-current", "true")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.keyDown(code, { key: "Backspace" })
    fireEvent.change(code, { target: { value: "1234567" } })
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(code).toHaveValue("1234567")
    await act(async () => { code.blur() })
    expect(slots().every(slot => slot.getAttribute("data-current") === "false")).toBe(true)
    fireEvent.mouseDown(slots()[3])
    expect(code).toHaveFocus()
    fireEvent.keyDown(code, { key: "Enter" })
    expect(fetchMock.mock.calls.filter(call => call[0] === "/api/action/verify")).toHaveLength(0)
  })

  it("shows an invalid code on the verification screen and does not open the action", async () => {
    let resolveVerify: (value: unknown) => void = () => {}
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveVerify = resolve }))
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    const verifying = await screen.findByRole("button", { name: "Verifying…" })
    expect(verifying).toBeDisabled()
    expect(verifying.closest("form")).toHaveAttribute("aria-busy", "true")
    resolveVerify({ ok: false, status: 401, json: async () => ({ message: ACTION_CODE_INVALID, reason: "invalid_code" }) })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(ACTION_CODE_INVALID))
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeTruthy()
    expect(screen.getByLabelText("Eight-digit code")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Eight-digit code")).toHaveAttribute("aria-describedby", "action-code-error")
    expect(document.querySelector(".otp-field")).toHaveAttribute("data-invalid", "true")
    expect(screen.queryByRole("heading", { name: "This link is not available" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    const calls = fetchMock.mock.calls.filter(call => call[0] === "/api/action/verify")
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ body: JSON.stringify({ code: "12345678" }) })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/portal"))).toBe(false)
  })

  it("shows a rate limit during verification without treating the link as expired", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ message: ACTION_UNAVAILABLE }) })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(ACTION_RATE_LIMITED))
    expect(screen.getByRole("heading", { name: "Confirm it's you" })).toBeTruthy()
    expect(screen.getByLabelText("Eight-digit code")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "This link is not available" })).toBeNull()
  })

  it("shows an expired action when verification is no longer available", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: ACTION_UNAVAILABLE }) })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "This link is not available" })).toBeTruthy())
    expect(screen.getByText(ACTION_UNAVAILABLE)).toBeTruthy()
    expect(screen.getByText(/Do not reuse an expired code/)).toBeTruthy()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
    expect(screen.queryByRole("img", { name: "ProfileRelaunch" })).toBeNull()
  })

  it("shows an expired link when the exchange itself is refused", async () => {
    window.history.replaceState(null, "", `/action/${actionId}#t=${"b".repeat(64)}`)
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: ACTION_UNAVAILABLE }) })
    render(<ActionClient actionId={actionId} />)
    await waitFor(() => expect(screen.getByRole("heading", { name: "This link is not available" })).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByLabelText("Eight-digit code")).toBeNull()
  })

  it("waits out the resend hold, then posts only to the secure-action endpoint", async () => {
    const ticks: Array<() => void> = []
    const realInterval = window.setInterval.bind(window)
    const spy = vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 1000) {
        ticks.push(() => {
          if (typeof handler === "function") handler()
        })
        return 987654
      }
      return realInterval(handler, timeout, ...(args as []))
    }) as typeof window.setInterval)
    try {
      await renderAfterExchange()
      await sendCodeSuccessfully()
      const held = screen.getByRole("button", { name: /Resend code \(\d+\)/ })
      expect(held).toBeDisabled()
      fireEvent.click(held)
      expect(fetchMock.mock.calls.filter(call => call[0] === "/api/action/otp")).toHaveLength(1)
      expect(ticks.length).toBeGreaterThan(0)
      await act(async () => {
        for (let step = 0; step < 60; step += 1) ticks[0]()
      })
      const ready = screen.getByRole("button", { name: "Resend code" })
      expect(ready).toBeEnabled()
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", maskedEmail: "d***@gmail.com" }) })
      fireEvent.click(ready)
      await waitFor(() => expect(fetchMock.mock.calls.filter(call => call[0] === "/api/action/otp")).toHaveLength(2))
      const resend = fetchMock.mock.calls.filter(call => call[0] === "/api/action/otp")[1]
      expect(resend[1]).toMatchObject({ method: "POST", body: "{}" })
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/portal"))).toBe(false)
      await waitFor(() => expect(screen.getByRole("button", { name: /Resend code \(\d+\)/ })).toBeDisabled())
    } finally {
      spy.mockRestore()
    }
  })
})
