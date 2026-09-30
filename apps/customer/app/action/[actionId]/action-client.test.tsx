// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ActionClient } from "./action-client"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

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
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
  })

  it("hides Send code and shows Verify after a successful send", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy()
    expect(screen.getByLabelText("Six-digit code")).toBeTruthy()
    expect(screen.getByText(/We sent a six-digit code to d\*\*\*@gmail.com/)).toBeTruthy()
    expect(document.body.textContent).not.toContain("das.nabarun@gmail.com")
    expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull()
  })

  it("removes OTP controls and shows the agreement after verification", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    expect(screen.getByText("Managed recovery service agreement")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
  })

  it("shows only the completed state after acceptance", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    fireEvent.click(screen.getByRole("checkbox"))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => expect(screen.getByText("This action is complete.")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept quote" })).toBeTruthy())
    expect(screen.getByText("Managed Relaunch")).toBeTruthy()
    expect(screen.getAllByText(/£239.20/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Tax is recorded as not applicable/)).toBeTruthy()
    expect(screen.getByText(/does not create an invoice or outstanding debt/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/charge a card today|monitoring has started|Stripe/i)
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Pay securely with Stripe" })).toBeTruthy())
    expect(screen.getByText(/SO-26-ABCDE2/)).toBeTruthy()
    expect(screen.getByText(/£99.00/)).toBeTruthy()
    expect(document.body.textContent).toMatch(/never marks this paid/)
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("link", { name: "Open the secure Stripe hosted invoice" })).toBeTruthy())
    expect(screen.getByRole("link", { name: "Open the secure Stripe hosted invoice" })).toHaveAttribute("href", "https://invoice.stripe.test/in_test")
    expect(document.body.textContent).toMatch(/does not mark this paid/)
    expect(screen.queryByRole("button", { name: /mark paid/i })).toBeNull()
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
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
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
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
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
  })

  it("keeps the send screen and shows the server message on 429", async () => {
    await renderAfterExchange()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }),
    })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/unavailable or has expired/))
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
  })
})
