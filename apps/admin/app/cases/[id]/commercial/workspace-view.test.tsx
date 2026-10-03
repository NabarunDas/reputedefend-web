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
  const projected = loaded.commercial.quotes[0]
  const managed = loaded.serviceTrack === "MANAGED"
  const quote = projected ? {
    id: projected.id,
    publicRef: "QT-26-ABCDEF",
    status: projected.status,
    version: 2,
    customerId: caseDetail.customerId,
    customerName: "Alex",
    businessName: "Bakery",
    locationName: null,
    caseId: CASE_ID,
    caseReference: "PR-1",
    monitoringRequestId: null,
    acceptedAt: projected.status === "ACCEPTED" ? "2026-10-02T09:00:00.000Z" : null,
    orderId: projected.orderId,
    orderRef: projected.orderId ? "SO-26-ABCDEF" : null,
    action: null,
    currentVersion: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      versionNumber: 1,
      status: projected.status,
      serviceCode: managed ? "MANAGED_RELAUNCH" : "GUIDED_RELAUNCH",
      serviceName: managed ? "Managed Relaunch" : "Guided Relaunch",
      paymentModel: managed ? "SUCCESS_FEE" : "UPFRONT",
      scope: "Prepare the profile recovery pack.",
      exclusions: "Google's decision is not guaranteed.",
      successDefinition: "Later.",
      standardAmountMinor: 9900,
      discountPolicyId: "NONE",
      discountBps: 0,
      discountAmountMinor: 0,
      quotedSubtotalMinor: 9900,
      taxBehaviour: "INCLUSIVE" as const,
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
      validUntil: "2026-11-03T12:00:00.000Z",
      paymentTiming: "Payable later.",
      offeredAt: null,
      discountSnapshot: null,
    },
  } : null
  const order = projected?.orderId ? {
    id: projected.orderId,
    publicRef: "SO-26-ABCDEF",
    quoteId: projected.id,
    quoteRef: "QT-26-ABCDEF",
    quoteVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    customerName: "Alex",
    businessName: "Bakery",
    caseReference: "PR-1",
    caseId: CASE_ID,
    serviceCode: managed ? "MANAGED_RELAUNCH" : "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: managed ? "SUCCESS_FEE" : "UPFRONT",
    taxBehaviour: "INCLUSIVE" as const,
    taxAmountMinor: 0,
    state: managed ? "ACCEPTED_SUCCESS_FEE" : "ACCEPTED_AWAITING_PAYMENT",
    acceptedAt: "2026-10-02T09:00:00.000Z",
  } : null
  const model = buildCommercialWorkspaceModel({
    facts: loaded,
    primaryAction: flow.primaryAction,
    now: NOW,
    quote,
    order,
    money: projected?.orderId ? [{
      orderId: projected.orderId,
      orderRef: "SO-26-ABCDEF",
      customerId: caseDetail.customerId,
      caseId: CASE_ID,
      serviceCode: managed ? "MANAGED_RELAUNCH" : "GUIDED_RELAUNCH",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: managed ? "SUCCESS_FEE" : "UPFRONT",
      orderState: managed ? "ACCEPTED_SUCCESS_FEE" : "ACCEPTED_AWAITING_PAYMENT",
      version: 2,
      obligationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      obligationKind: managed ? null : "UPFRONT",
      obligationState: managed ? null : loaded.payment.orders[0]?.obligationState ?? "PAID",
      setupReady: managed && !!loaded.payment.orders[0]?.setupReady,
      consentId: managed && loaded.payment.orders[0]?.consentRecorded ? "consent-1" : null,
      approvalId: null,
      receiptId: loaded.payment.orders[0]?.receiptRecorded ? "receipt-1" : null,
      acceptedEvidence: [],
    }] : [],
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

  it("shows a Managed setup link only when that is the next action", () => {
    const quote = { id: QUOTE_ID, status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: ORDER_ID }
    const payment = { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: false, consentRecorded: false, receiptRecorded: false }] }
    renderWorkspace({
      serviceTrack: "MANAGED",
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: {
        membershipStatus: "verified",
        customerEmailVerified: true,
        businessAuthorityVerified: true,
        serviceAgreementAccepted: true,
        caseManagementPermissionActive: true,
        managerAccessVerified: true,
        authorizationReady: true,
        reviewRequired: [],
        agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
        hasLocation: true,
      },
      commercial: { complete: true, quotes: [quote] },
      payment,
    })
    expect(screen.getByRole("button", { name: "Issue payment-method setup link" })).toBeInTheDocument()
    cleanup()
    renderWorkspace({
      serviceTrack: "MANAGED",
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: {
        membershipStatus: "verified",
        customerEmailVerified: true,
        businessAuthorityVerified: true,
        serviceAgreementAccepted: true,
        caseManagementPermissionActive: true,
        managerAccessVerified: true,
        authorizationReady: true,
        reviewRequired: [],
        agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
        hasLocation: true,
      },
      commercial: { complete: true, quotes: [quote] },
      payment,
      customerActions: [{ id: "setup-1", kind: "MANAGED_PAYMENT_SETUP", agreementKind: null, status: "OPEN", expiresAt: "2026-11-03T12:00:00.000Z" }],
    })
    expect(screen.queryByRole("button", { name: "Issue payment-method setup link" })).toBeNull()
    expect(screen.getByText(/open until/i)).toBeInTheDocument()
  })

  it("routes an unverified offered quote to verification instead of an acceptance link", () => {
    renderWorkspace({
      technicalStage: "SERVICE_SELECTION",
      authorization: {
        membershipStatus: "pending",
        customerEmailVerified: false,
        businessAuthorityVerified: false,
        serviceAgreementAccepted: false,
        caseManagementPermissionActive: false,
        managerAccessVerified: false,
        authorizationReady: false,
        reviewRequired: [],
        agreementKinds: [],
        hasLocation: true,
      },
      commercial: { complete: true, quotes: [{ id: QUOTE_ID, status: "OFFERED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: null }] },
      payment: { complete: true, orders: [] },
    })
    expect(screen.getByText("Verify the customer's email address")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
  })

  it("points a Managed quote at Guard qualification without applying a discount", () => {
    renderWorkspace({
      serviceTrack: "MANAGED",
      caseType: "PROFILE_RECOVERY",
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: {
        membershipStatus: "verified",
        customerEmailVerified: true,
        businessAuthorityVerified: true,
        serviceAgreementAccepted: true,
        caseManagementPermissionActive: true,
        managerAccessVerified: true,
        authorizationReady: true,
        reviewRequired: [],
        agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
        hasLocation: true,
      },
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }, [{
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      serviceCode: "MANAGED_RELAUNCH",
      displayName: "Managed Relaunch",
      amountMinor: 14900,
      paymentModel: "SUCCESS_FEE",
      status: "APPROVED",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: null,
    }])
    expect(screen.getByText(/does not apply a discount/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open Guard qualification" })).toHaveAttribute("href", "/commercial?tab=quotes")
    expect(screen.getByRole("button", { name: "Create draft quote" })).toBeInTheDocument()
  })
})
