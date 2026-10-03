// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowFacts } from "@/lib/case-flow/model"

const getCase = vi.fn()
const loadCaseFlowFacts = vi.fn()
const loadCatalogue = vi.fn()
const loadQuote = vi.fn()
const loadOrder = vi.fn()
const loadMoney = vi.fn()

vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/case-flow/load", () => ({ loadCaseFlowFacts: (...args: unknown[]) => loadCaseFlowFacts(...args) }))
vi.mock("@/lib/commerce/queries", () => ({
  loadCatalogue: (...args: unknown[]) => loadCatalogue(...args),
  loadQuote: (...args: unknown[]) => loadQuote(...args),
  loadOrder: (...args: unknown[]) => loadOrder(...args),
}))
vi.mock("@/lib/payments/queries", () => ({ loadMoney: (...args: unknown[]) => loadMoney(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import CaseCommercialPage from "./page"

const caseId = "55555555-5555-4555-8555-555555555555"

function facts(): CaseFlowFacts {
  return {
    caseId,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "SERVICE_SELECTION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: null,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["PAYMENT_REQUIRED"],
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
      hasLocation: false,
    },
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
  }
}

afterEach(() => cleanup())

describe("case commercial page", () => {
  it("uses the case next action and does not ask for pasted identifiers", async () => {
    getCase.mockResolvedValue({
      id: caseId,
      reference: "PR-1",
      client: "Alex",
      business: "Bakery",
      customerId: "11111111-1111-4111-8111-111111111111",
      businessId: "22222222-2222-4222-8222-222222222222",
      locationId: "",
    } as CaseDetail)
    loadCaseFlowFacts.mockResolvedValue(facts())
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuote.mockResolvedValue(null)
    loadOrder.mockResolvedValue(null)
    loadMoney.mockResolvedValue({ orders: [] })
    render(await CaseCommercialPage({ params: Promise.resolve({ id: caseId }) }))
    expect(screen.getByRole("heading", { name: "Commercial and money" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to case PR-1" })).toHaveAttribute("href", `/cases/${caseId}`)
    expect(screen.getByText("Create the quote")).toBeInTheDocument()
    expect(screen.getByText(/No current approved price/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/customer id/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge/i })).toBeNull()
    expect(loadQuote).not.toHaveBeenCalled()
    expect(loadOrder).not.toHaveBeenCalled()
  })

  it("loads quote and order detail by the case's own ids", async () => {
    const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const otherOrderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    const loaded = facts()
    loaded.technicalStage = "PAYMENT_REQUIRED"
    loaded.capabilities = { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false }
    loaded.commercial = {
      complete: true,
      quotes: [{ id: quoteId, status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId }],
    }
    loaded.payment = {
      complete: true,
      orders: [{ orderId, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "DUE", setupReady: false, consentRecorded: false, receiptRecorded: false }],
    }
    getCase.mockResolvedValue({
      id: caseId, reference: "PR-1", client: "Alex", business: "Bakery",
      customerId: loaded.customerId, businessId: loaded.businessId, locationId: "",
    } as CaseDetail)
    loadCaseFlowFacts.mockResolvedValue(loaded)
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuote.mockResolvedValue({
      id: quoteId, publicRef: "QT-EXACT", status: "ACCEPTED", version: 2,
      customerId: loaded.customerId, customerName: "Alex", businessName: "Bakery", locationName: null,
      caseId, caseReference: "PR-1", monitoringRequestId: null, acceptedAt: "2026-10-02T09:00:00.000Z",
      orderId, orderRef: "SO-EXACT", action: null,
      currentVersion: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", versionNumber: 1, status: "ACCEPTED",
        serviceCode: "GUIDED_RELAUNCH", serviceName: "Guided Relaunch", paymentModel: "UPFRONT",
        scope: "Prepare the profile recovery pack.", exclusions: "Nothing is guaranteed.",
        successDefinition: "Later.", standardAmountMinor: 9900, discountPolicyId: "NONE", discountBps: 0,
        discountAmountMinor: 0, quotedSubtotalMinor: 9900, taxBehaviour: "INCLUSIVE", taxAmountMinor: 0,
        totalAmountMinor: 9900, currency: "GBP", validUntil: "2026-11-03T12:00:00.000Z",
        paymentTiming: "Later.", offeredAt: null, discountSnapshot: null,
      },
    })
    loadOrder.mockResolvedValue({
      id: orderId, publicRef: "SO-EXACT", quoteId, quoteRef: "QT-EXACT",
      quoteVersionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", customerName: "Alex", businessName: "Bakery",
      caseReference: "PR-1", caseId, serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP",
      paymentModel: "UPFRONT", taxBehaviour: "INCLUSIVE", taxAmountMinor: 0,
      state: "ACCEPTED_AWAITING_PAYMENT", acceptedAt: "2026-10-02T09:00:00.000Z",
    })
    loadMoney.mockResolvedValue({ orders: [
      { orderId: otherOrderId, orderRef: "SO-OTHER", customerId: loaded.customerId, caseId, serviceCode: "GUIDED_RELAUNCH", amountMinor: 100, currency: "GBP", paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", version: 9, obligationId: null, obligationKind: "UPFRONT", obligationState: "DUE", setupReady: false, consentId: null, approvalId: null, receiptId: null, acceptedEvidence: [] },
      { orderId, orderRef: "SO-EXACT", customerId: loaded.customerId, caseId, serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", version: 2, obligationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", obligationKind: "UPFRONT", obligationState: "DUE", setupReady: false, consentId: null, approvalId: null, receiptId: null, acceptedEvidence: [] },
    ] })
    render(await CaseCommercialPage({ params: Promise.resolve({ id: caseId }) }))
    expect(loadQuote).toHaveBeenCalledWith(quoteId)
    expect(loadOrder).toHaveBeenCalledWith(orderId)
    expect(screen.getByText(/QT-EXACT/)).toBeInTheDocument()
    expect(screen.getAllByText(/SO-EXACT/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/SO-OTHER/)).toBeNull()
    expect(screen.getByRole("button", { name: "Issue upfront payment link" })).toBeInTheDocument()
  })

  it("fails closed when the named quote cannot be loaded", async () => {
    const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const loaded = facts()
    loaded.commercial = {
      complete: true,
      quotes: [{ id: quoteId, status: "OFFERED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: null }],
    }
    getCase.mockResolvedValue({
      id: caseId, reference: "PR-1", client: "Alex", business: "Bakery",
      customerId: loaded.customerId, businessId: loaded.businessId, locationId: "",
    } as CaseDetail)
    loadCaseFlowFacts.mockResolvedValue(loaded)
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuote.mockResolvedValue(null)
    loadMoney.mockResolvedValue({ orders: [] })
    render(await CaseCommercialPage({ params: Promise.resolve({ id: caseId }) }))
    expect(loadQuote).toHaveBeenCalledWith(quoteId)
    expect(loadOrder).not.toHaveBeenCalled()
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.queryByText("No quote")).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
  })

  it("fails closed when the loaded order is a different order", async () => {
    const quoteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const otherOrderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    const loaded = facts()
    loaded.technicalStage = "PAYMENT_REQUIRED"
    loaded.capabilities = { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false }
    loaded.commercial = {
      complete: true,
      quotes: [{ id: quoteId, status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-03T12:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId }],
    }
    loaded.payment = {
      complete: true,
      orders: [{ orderId, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "DUE", setupReady: false, consentRecorded: false, receiptRecorded: false }],
    }
    getCase.mockResolvedValue({
      id: caseId, reference: "PR-1", client: "Alex", business: "Bakery",
      customerId: loaded.customerId, businessId: loaded.businessId, locationId: "",
    } as CaseDetail)
    loadCaseFlowFacts.mockResolvedValue(loaded)
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuote.mockResolvedValue({
      id: quoteId, publicRef: "QT-EXACT", status: "ACCEPTED", version: 2,
      customerId: loaded.customerId, customerName: "Alex", businessName: "Bakery", locationName: null,
      caseId, caseReference: "PR-1", monitoringRequestId: null, acceptedAt: "2026-10-02T09:00:00.000Z",
      orderId, orderRef: "SO-EXACT", action: null,
      currentVersion: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", versionNumber: 1, status: "ACCEPTED",
        serviceCode: "GUIDED_RELAUNCH", serviceName: "Guided Relaunch", paymentModel: "UPFRONT",
        scope: "Prepare the profile recovery pack.", exclusions: "Nothing is guaranteed.",
        successDefinition: "Later.", standardAmountMinor: 9900, discountPolicyId: "NONE", discountBps: 0,
        discountAmountMinor: 0, quotedSubtotalMinor: 9900, taxBehaviour: "INCLUSIVE", taxAmountMinor: 0,
        totalAmountMinor: 9900, currency: "GBP", validUntil: "2026-11-03T12:00:00.000Z",
        paymentTiming: "Later.", offeredAt: null, discountSnapshot: null,
      },
    })
    loadOrder.mockResolvedValue({
      id: otherOrderId, publicRef: "SO-OTHER", quoteId, quoteRef: "QT-EXACT",
      quoteVersionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", customerName: "Alex", businessName: "Bakery",
      caseReference: "PR-1", caseId, serviceCode: "GUIDED_RELAUNCH", amountMinor: 100, currency: "GBP",
      paymentModel: "UPFRONT", taxBehaviour: "INCLUSIVE", taxAmountMinor: 0,
      state: "ACCEPTED_AWAITING_PAYMENT", acceptedAt: "2026-10-02T09:00:00.000Z",
    })
    loadMoney.mockResolvedValue({ orders: [] })
    render(await CaseCommercialPage({ params: Promise.resolve({ id: caseId }) }))
    expect(loadOrder).toHaveBeenCalledWith(orderId)
    expect(screen.getByText(/not the order this case names/i)).toBeInTheDocument()
    expect(screen.queryByText("SO-OTHER")).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue upfront payment link" })).toBeNull()
  })
})
