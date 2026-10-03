// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import { resolveCaseFlow } from "@/lib/case-flow/resolve"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import { buildCommercialWorkspaceModel } from "@/lib/commercial-workspace/model"
import { OfferQuoteActionForm } from "../../../commercial/forms"
import { CommercialWorkspace } from "./workspace-view"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const NOW = "2026-10-03T12:00:00.000Z"

const caseDetail = {
  id: CASE_ID,
  reference: "PR-1",
  client: "Alex",
  business: "Bakery",
  customerId: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222",
  locationId: "33333333-3333-4333-8333-333333333333",
} as CaseDetail

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "PAYMENT_REQUIRED",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: caseDetail.customerId,
    businessId: caseDetail.businessId,
    locationId: caseDetail.locationId,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["PREPARATION"],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: {
      membershipStatus: "verified",
      customerEmailVerified: true,
      businessAuthorityVerified: true,
      serviceAgreementAccepted: false,
      caseManagementPermissionActive: false,
      managerAccessVerified: false,
      authorizationReady: false,
      reviewRequired: [],
      agreementKinds: [],
      hasLocation: true,
    },
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [{ id: QUOTE_ID, status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: ORDER_ID }] },
    payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: true }] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

function renderWorkspace(overrides: Partial<CaseFlowFacts> = {}, prices: Array<{ id: string; serviceCode: string; displayName: string; amountMinor: number; paymentModel: string; status: string; effectiveFrom: string; effectiveTo: null }> = []) {
  const loaded = facts(overrides)
  const flow = resolveCaseFlow(loaded, NOW)
  const model = buildCommercialWorkspaceModel({
    facts: loaded,
    primaryAction: flow.primaryAction,
    now: NOW,
    quotes: overrides.commercial ? [] : [{
      id: QUOTE_ID,
      publicRef: "QT-26-ABCDEF",
      status: "ACCEPTED",
      version: 2,
      customerId: caseDetail.customerId,
      customerName: "Alex",
      businessName: "Bakery",
      locationName: null,
      caseId: CASE_ID,
      caseReference: "PR-1",
      monitoringRequestId: null,
      acceptedAt: "2026-10-02T09:00:00.000Z",
      orderId: ORDER_ID,
      orderRef: "SO-26-ABCDEF",
      action: null,
      currentVersion: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        versionNumber: 1,
        status: "ACCEPTED",
        serviceCode: "GUIDED_RELAUNCH",
        serviceName: "Guided Relaunch",
        paymentModel: "UPFRONT",
        scope: "Prepare the profile recovery pack.",
        exclusions: "Google's decision is not guaranteed.",
        successDefinition: "Later.",
        standardAmountMinor: 9900,
        discountPolicyId: "NONE",
        discountBps: 0,
        discountAmountMinor: 0,
        quotedSubtotalMinor: 9900,
        taxBehaviour: "INCLUSIVE",
        taxAmountMinor: 0,
        totalAmountMinor: 9900,
        currency: "GBP",
        validUntil: "2026-11-03T12:00:00.000Z",
        paymentTiming: "Payable later.",
        offeredAt: null,
        discountSnapshot: null,
      },
    }],
    orders: [{
      id: ORDER_ID,
      publicRef: "SO-26-ABCDEF",
      quoteId: QUOTE_ID,
      quoteRef: "QT-26-ABCDEF",
      quoteVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      customerName: "Alex",
      businessName: "Bakery",
      caseReference: "PR-1",
      caseId: CASE_ID,
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: "UPFRONT",
      taxBehaviour: "INCLUSIVE",
      taxAmountMinor: 0,
      state: "ACCEPTED_AWAITING_PAYMENT",
      acceptedAt: "2026-10-02T09:00:00.000Z",
    }],
    money: [{
      orderId: ORDER_ID,
      orderRef: "SO-26-ABCDEF",
      customerId: caseDetail.customerId,
      caseId: CASE_ID,
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: "UPFRONT",
      orderState: "ACCEPTED_AWAITING_PAYMENT",
      version: 2,
      obligationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      obligationKind: "UPFRONT",
      obligationState: "PAID",
      setupReady: false,
      consentId: null,
      approvalId: null,
      receiptId: "receipt-1",
      acceptedEvidence: [],
    }],
    prices: prices as never,
  })
  render(<CommercialWorkspace model={model} caseDetail={caseDetail} />)
  return model
}

afterEach(() => cleanup())

describe("commercial workspace view", () => {
  it("shows the accepted order and the case next action without a collection control", () => {
    const model = renderWorkspace()
    expect(screen.getByRole("heading", { name: "Next action" })).toBeInTheDocument()
    expect(screen.getByText(model.caseAction.kind === "none" ? "" : model.caseAction.label)).toBeInTheDocument()
    expect(screen.getByText("Customer accepted the quote — service order created")).toBeInTheDocument()
    expect(screen.getByText("SO-26-ABCDEF")).toBeInTheDocument()
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /offer quote/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /issue upfront payment link/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge card|charge/i })).toBeNull()
    expect(screen.queryByLabelText(/customer id/i)).toBeNull()
    expect(screen.queryByLabelText(/business id/i)).toBeNull()
    expect(screen.queryByLabelText(/case id/i)).toBeNull()
  })

  it("creates a quote from the case without a free-text identifier", () => {
    renderWorkspace({
      technicalStage: "SERVICE_SELECTION",
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }, [{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      serviceCode: "GUIDED_RELAUNCH",
      displayName: "Guided Relaunch",
      amountMinor: 9900,
      paymentModel: "UPFRONT",
      status: "APPROVED",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: null,
    }])
    expect(screen.getByText(/Quoting/)).toHaveTextContent("Alex")
    expect(screen.getByText(/Quoting/)).toHaveTextContent("Bakery")
    expect(screen.getByRole("button", { name: "Create draft quote" })).toBeInTheDocument()
    expect(screen.queryByLabelText(/customer id/i)).toBeNull()
    expect(screen.queryByLabelText(/price version id/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /offer quote/i })).toBeNull()
  })

  it("does not claim a Managed setup has collected the success fee", () => {
    renderWorkspace({
      serviceTrack: "MANAGED",
      technicalStage: "AUTHORIZATION_REQUIRED",
      commercial: { complete: true, quotes: [{ id: QUOTE_ID, status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: ORDER_ID }] },
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
    })
    // The default quote detail in renderWorkspace is still the Guided quote when commercial override is set,
    // because the helper skips quotes whenever commercial is overridden. The case-flow order is enough.
    expect(screen.getAllByText(/£0 collected now/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Payment method saved for the agreed success fee/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /issue upfront payment link/i })).toBeNull()
    expect(screen.queryByText("Paid")).toBeNull()
  })

  it("says a newly returned customer link is shown once", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ message: "Issued.", actionUrl: "https://customer.example/once" }) }))
    vi.stubGlobal("fetch", fetchMock)
    render(<OfferQuoteActionForm quoteId={QUOTE_ID} />)
    fireEvent.change(screen.getByLabelText("Action expires"), { target: { value: "2026-12-01T12:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Issue customer acceptance link" }))
    expect(await screen.findByText(/one-time customer link/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be shown again/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue("https://customer.example/once")).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
