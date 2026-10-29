import { describe, expect, it } from "vitest"
import type { CaseFlowFacts, CaseFlowOrderFact, CaseFlowQuoteFact } from "../case-flow/model"
import type { CaseDetail, Submission, Task } from "../cases/model"
import type { MoneyOrder } from "../payments/model"
import { presentCaseJourney } from "./present"
import { presentJourneyClosure } from "./closure"

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const ORDER_ID = "88888888-8888-4888-8888-888888888888"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const WHEN = "2026-06-01T12:00:00.000Z"
const NOW = "2026-10-03T12:00:00.000Z"
const SUMMARY = "The listing was restored after the recorded appeal."

function quote(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: "quote-1",
    status: "ACCEPTED",
    taxBehaviour: "NOT_APPLICABLE",
    validUntil: "2026-12-01T00:00:00.000Z",
    actionStatus: null,
    actionExpiresAt: null,
    orderId: ORDER_ID,
    ...overrides,
  }
}

function upfront(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
  return {
    orderId: ORDER_ID,
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    obligationKind: "UPFRONT",
    obligationState: "PAID",
    setupReady: false,
    consentRecorded: false,
    receiptRecorded: true,
    ...overrides,
  }
}

function successFee(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
  return {
    orderId: ORDER_ID,
    paymentModel: "SUCCESS_FEE",
    orderState: "ACCEPTED_SUCCESS_FEE",
    obligationKind: "SUCCESS_FEE",
    obligationState: "PAID",
    setupReady: true,
    consentRecorded: true,
    receiptRecorded: true,
    ...overrides,
  }
}

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "OUTCOME_REVIEW",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: "RESTORED",
    outcomeSummary: SUMMARY,
    customerId: CUSTOMER_ID,
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: [],
    reopened: false,
    tasks: [],
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" }],
    authorization: {
      membershipStatus: "verified",
      customerEmailVerified: true,
      businessAuthorityVerified: true,
      serviceAgreementAccepted: true,
      caseManagementPermissionActive: false,
      managerAccessVerified: false,
      authorizationReady: false,
      reviewRequired: [],
      agreementKinds: [],
      hasLocation: true,
    },
    customerActions: [],
    commercial: { complete: true, quotes: [quote()] },
    payment: { complete: true, orders: [upfront()] },
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function attempt(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    actor: "CUSTOMER",
    track: "GUIDED",
    submittedAt: WHEN,
    reference: "GOOGLE-123",
    channel: "Google appeals tool",
    evidence: "Submission receipt reviewed and referenced",
    result: "DECIDED",
    resultNote: "The listing was restored.",
    ...overrides,
  }
}

function money(overrides: Partial<MoneyOrder> = {}): MoneyOrder {
  return {
    orderId: ORDER_ID,
    orderRef: "SO-26-ABCDEF",
    customerId: CUSTOMER_ID,
    caseId: CASE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 14900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    version: 2,
    obligationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    obligationKind: "UPFRONT",
    obligationState: "PAID",
    setupReady: false,
    consentId: null,
    approvalId: null,
    receiptId: "receipt-1",
    invoiceId: null,
    invoiceStatus: null,
    acceptedEvidence: [],
    ...overrides,
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    caseId: CASE_ID,
    reference: "PR-1",
    title: "Confirm the listing",
    owner: "ADMIN",
    kind: "FOLLOW_UP",
    due: "2026-11-01T12:00:00.000Z",
    source: "Follow-up agreed on the phone",
    timezone: "Europe/London",
    status: "OPEN",
    resolution: "",
    ...overrides,
  }
}

function detailFor(source: CaseFlowFacts, overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: source.caseId,
    reference: source.reference,
    type: source.caseType,
    stage: source.technicalStage as CaseDetail["stage"],
    track: source.serviceTrack as CaseDetail["track"],
    status: source.caseStatus,
    client: "Alex",
    business: "Bakery",
    assigned: true,
    priority: "NORMAL",
    nextAction: "",
    due: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 4,
    outcome: source.outcome as CaseDetail["outcome"],
    summary: source.outcomeSummary,
    priorityReason: "",
    firstResponseDue: null,
    issue: "Profile suspended",
    reviewUrl: null,
    customerId: source.customerId ?? "",
    businessId: source.businessId ?? "",
    locationId: source.locationId ?? "",
    events: [],
    tasks: [],
    submissions: [attempt({
      actor: source.serviceTrack === "MANAGED" ? "ADMIN" : "CUSTOMER",
      track: source.serviceTrack === "MANAGED" ? "MANAGED" : "GUIDED",
    })],
    transitions: [],
    customerPreview: { reference: source.reference, type: source.caseType, summary: source.outcomeSummary, notes: [] },
    ...overrides,
  }
}

function show(
  source: CaseFlowFacts,
  options: {
    orders?: MoneyOrder[] | null
    submissions?: Submission[] | null
    detail?: Partial<CaseDetail>
    precedingComplete?: boolean
    mailRecovery?: boolean
    events?: { id: string; event: string; details: Record<string, unknown> }[]
  } = {},
) {
  const detail = detailFor(source, {
    ...(options.submissions ? { submissions: options.submissions } : {}),
    ...(options.events ? {
      events: options.events.map(event => ({
        ...event,
        note: "Recorded during the case.",
        visibility: "INTERNAL",
        createdAt: WHEN,
      })),
    } : {}),
    ...options.detail,
  })
  const presented = presentJourneyClosure({
    facts: source,
    now: NOW,
    recorded: {
      submissions: options.submissions === undefined ? detail.submissions : options.submissions,
      caseTrack: detail.track,
      caseOutcome: detail.outcome,
      caseStatus: detail.status,
      moneyOrders: options.orders === undefined ? [money(source.serviceTrack === "MANAGED" ? {
        serviceCode: "MANAGED_RELAUNCH",
        paymentModel: "SUCCESS_FEE",
        orderState: "ACCEPTED_SUCCESS_FEE",
        obligationKind: "SUCCESS_FEE",
        setupReady: true,
        consentId: "consent-1",
        receiptId: "receipt-1",
      } : {})] : options.orders,
    },
    events: options.events ?? [],
    detail,
    precedingComplete: options.precedingComplete ?? true,
    mailRecovery: options.mailRecovery,
  })
  return { ...presented.panel, closureRecordsDisagree: presented.closureRecordsDisagree, billingDisagreed: presented.disagreed }
}

describe("guided closure", () => {
  it("offers the existing close command for a settled Guided case and locks the recorded outcome", () => {
    const panel = show(facts())
    expect(panel.headline).toBe("Not closed")
    expect(panel.closureRecord).toBeNull()
    expect(panel.outcomeLabel).toBe("Restored")
    expect(panel.summary).toBe(SUMMARY)
    expect(panel.billingLabel).toMatch(/Paid/)
    expect(panel.billingLabel).toMatch(/receipt recorded/)
    expect(panel.locked).toEqual({ outcome: "RESTORED", summary: SUMMARY })
    expect(panel.commands).toEqual({ close: true, reopen: false })
    expect(panel.guard.offered).toBe(false)
    expect(panel.guard.href).toBe("/guard")
    expect(panel.guard.text).toMatch(/not required/)
    expect(panel.notices.join(" ")).toMatch(/does not send email/)
    expect(panel.fulfilmentClose).toBe(false)
    expect(panel.completionRecovery).toBe(false)
    expect(panel.version).toBe(4)
  })

  it("offers Guided closure from a settled pack without a Google outcome", () => {
    const panel = show(facts({
      outcome: null,
      outcomeSummary: "",
      submissions: [],
      technicalStage: "PAYMENT_REQUIRED",
    }), { submissions: [] })
    expect(panel.fulfilmentClose).toBe(true)
    expect(panel.completionRecovery).toBe(false)
    expect(panel.commands).toEqual({ close: true, reopen: false })
    expect(panel.locked).toBeNull()
    expect(panel.who).toMatch(/Google's later decision is not required/)
    expect(panel.notices.join(" ")).toMatch(/completion summary/)
    expect(panel.guard.offered).toBe(false)
    expect(panel.guard.text).toMatch(/does not enrol/)
  })

  it("verifies a closed Guided preparation that has no Google outcome", () => {
    const panel = show(facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: null,
      outcomeSummary: "The Guided preparation was handed to the customer.",
      submissions: [],
    }), { submissions: [] })
    expect(panel.headline).toBe("Closed")
    expect(panel.outcomeLabel).toBe("Guided preparation delivered")
    expect(panel.detail).toMatch(/not a Google decision/)
    expect(panel.guard.offered).toBe(false)
    expect(panel.completionRecovery).toBe(false)
    expect(panel.notices.join(" ")).toMatch(/No case-closure email/)
    expect(panel.notices.join(" ")).toMatch(/document-ready email/)
  })

  it("offers one completion update when a closed Guided case has no completion email", () => {
    const source = facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: null,
      outcomeSummary: "The Guided preparation was handed to the customer.",
      submissions: [],
    })
    const panel = show(source, { submissions: [], mailRecovery: true })
    expect(panel.completionRecovery).toBe(true)
    expect(panel.fulfilmentClose).toBe(false)
    expect(panel.commands?.close).toBeFalsy()
    const queued = show({
      ...source,
      communications: [{
        id: "comm-1",
        templateKey: "GUIDED_COMPLETION",
        lifecycle: "QUEUED",
        deliveryStatus: "NONE",
        legacyStatus: null,
        draftedAt: WHEN,
      }],
    }, { submissions: [], mailRecovery: true })
    expect(queued.completionRecovery).toBe(false)
    expect(queued.notices.join(" ")).toMatch(/queued/)
    expect(queued.notices.join(" ")).not.toMatch(/The provider reported delivery/)
    const accepted = show({
      ...source,
      communications: [{
        id: "comm-1",
        templateKey: "GUIDED_COMPLETION",
        lifecycle: "SENT",
        deliveryStatus: "PROVIDER_ACCEPTED",
        legacyStatus: null,
        draftedAt: WHEN,
      }],
    }, { submissions: [], mailRecovery: true })
    expect(accepted.completionRecovery).toBe(false)
    expect(accepted.notices.join(" ")).toMatch(/not proof the customer received it/)
  })

  it("keeps a Guided case open while the upfront fee is pending", () => {
    const panel = show(facts({
      payment: { complete: true, orders: [upfront({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "DUE", receiptRecorded: false })] },
    }), {
      orders: [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "DUE", receiptId: null })],
    })
    expect(panel.headline).toBe("Not closed")
    expect(panel.commands).toBeNull()
    expect(panel.locked).toBeNull()
    expect(panel.billingLabel).toMatch(/Due/)
    expect(panel.blockers).toContain("The billing position is not ready.")
  })

  it("closes a qualifying Managed case only after the success fee is settled", () => {
    const settled = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee()] },
    })
    const ready = show(settled)
    expect(ready.commands).toEqual({ close: true, reopen: false })
    expect(ready.billingLabel).toMatch(/Paid/)
    expect(ready.guard.offered).toBe(false)

    const pending = show(facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee({ obligationState: "DUE", receiptRecorded: false })] },
    }), {
      orders: [money({
        serviceCode: "MANAGED_RELAUNCH",
        paymentModel: "SUCCESS_FEE",
        orderState: "ACCEPTED_SUCCESS_FEE",
        obligationKind: "SUCCESS_FEE",
        obligationState: "DUE",
        receiptId: null,
        setupReady: true,
        consentId: "consent-1",
      })],
    })
    expect(pending.commands).toBeNull()
    expect(pending.blockers).toContain("The billing position is not ready.")
  })

  it("allows a non-qualifying Managed outcome with no success-fee obligation, and withholds one that still has a fee", () => {
    const open = facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee({ obligationKind: null, obligationState: null, receiptRecorded: false, setupReady: false, consentRecorded: false })] },
    })
    const ready = show(open, {
      orders: [money({
        serviceCode: "MANAGED_RELAUNCH",
        paymentModel: "SUCCESS_FEE",
        orderState: "ACCEPTED_SUCCESS_FEE",
        obligationId: null,
        obligationKind: null,
        obligationState: null,
        receiptId: null,
        setupReady: false,
        consentId: null,
      })],
    })
    expect(ready.commands).toEqual({ close: true, reopen: false })
    expect(ready.outcomeLabel).toBe("Not restored")

    const billed = show(facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee({ obligationState: "DUE", receiptRecorded: false })] },
    }), {
      orders: [money({
        serviceCode: "MANAGED_RELAUNCH",
        paymentModel: "SUCCESS_FEE",
        orderState: "ACCEPTED_SUCCESS_FEE",
        obligationKind: "SUCCESS_FEE",
        obligationState: "DUE",
        receiptId: null,
        setupReady: true,
        consentId: "consent-1",
      })],
    })
    expect(billed.commands).toBeNull()
    expect(billed.closureRecord).toBeNull()
  })

  it("prepares a withdrawal as CANCELLED and does not call the open case closed", () => {
    const panel = show(facts({
      outcome: "WITHDRAWN",
      technicalStage: "FURTHER_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "WITHDRAWN" }],
    }), {
      submissions: [attempt({ result: "WITHDRAWN" })],
    })
    expect(panel.headline).toBe("Not closed")
    expect(panel.commands?.close).toBe(true)
    expect(panel.locked).toEqual({ outcome: "WITHDRAWN", summary: SUMMARY })
    expect(panel.notices.join(" ")).toMatch(/CANCELLED/)
    expect(panel.closureRecord).toBeNull()
  })

  it("confirms a withdrawal only when the database status is CANCELLED", () => {
    const source = facts({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "WITHDRAWN" }],
    })
    const panel = show(source, {
      submissions: [attempt({ result: "WITHDRAWN" })],
      events: [{ id: "8", event: "close", details: { outcome: "WITHDRAWN", summary: SUMMARY } }],
    })
    expect(panel.headline).toBe("Cancelled")
    expect(panel.closureRecordsDisagree).toBe(false)
    expect(panel.billingDisagreed).toBe(false)
    expect(panel.closureRecord).toEqual({ status: "CANCELLED", outcomeLabel: "Withdrawn", summary: SUMMARY })
    expect(panel.commands).toEqual({ close: false, reopen: true })
    expect(panel.history[0].label).toBe("Close command")
    expect(panel.notices.join(" ")).toMatch(/withdrawal keeps the CANCELLED status/)
    expect(presentCaseJourney(source, NOW).steps.find(step => step.id === "CLOSURE")?.state).toBe("COMPLETED")
  })

  it("confirms CLOSED separately from a cancellation", () => {
    const source = facts({ caseStatus: "CLOSED", technicalStage: "FINISHED" })
    const panel = show(source, {
      events: [{ id: "8", event: "close", details: { outcome: "RESTORED", summary: SUMMARY } }],
    })
    expect(panel.headline).toBe("Closed")
    expect(panel.detail).toMatch(/CLOSED/)
    expect(panel.detail).toMatch(/does not call the case cancelled/)
    expect(panel.closureRecord?.status).toBe("CLOSED")
    expect(panel.commands).toEqual({ close: false, reopen: true })
    expect(panel.guard.offered).toBe(false)
  })

  it("does not confirm closure when the stored summary does not match the case record", () => {
    const panel = show(facts(), { detail: { summary: `${SUMMARY} ` } })
    expect(panel.headline).toBe("Not closed")
    expect(panel.commands).toBeNull()
    expect(panel.locked).toBeNull()
    expect(panel.summary).toBe(SUMMARY)
    expect(panel.otherSummary).toBe(`${SUMMARY} `)
    expect(panel.notices.join(" ")).toMatch(/do not agree/)
  })

  it("withholds closure while a task is open or a submission is unresolved", () => {
    const openTask = show(facts({
      tasks: [{ id: "task-1", title: "Confirm the listing", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: "2026-11-01T12:00:00.000Z" }],
    }), { detail: { tasks: [task()] } })
    expect(openTask.commands).toBeNull()
    expect(openTask.tasks[0]).toMatchObject({ title: "Confirm the listing", state: "Open" })
    expect(openTask.blockers).toContain("An open task remains.")

    const unresolved = show(facts({
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: null }],
    }), { submissions: [attempt({ result: null })] })
    expect(unresolved.commands).toBeNull()
    expect(unresolved.attempts[0].state).toMatch(/awaiting a decision/)
    expect(unresolved.blockers).toContain("A submission attempt is unresolved.")
  })

  it("withholds the guided control until the earlier steps are complete", () => {
    const panel = show(facts(), { precedingComplete: false })
    expect(panel.commands).toBeNull()
    expect(panel.blockers).toContain("Earlier guided steps are still open.")
  })

  it("does not offer close again on a closed case, including a second reading", () => {
    const source = facts({ caseStatus: "CLOSED", technicalStage: "FINISHED" })
    const first = show(source)
    const second = show(source)
    expect(first.commands).toEqual({ close: false, reopen: true })
    expect(second.commands).toEqual(first.commands)
    expect(first.closureRecord?.status).toBe("CLOSED")
  })

  it("keeps a reopened case incomplete and separates the old outcome from the new one", () => {
    const source = facts({ reopened: true, outcome: "PARTIALLY_RESTORED", outcomeSummary: SUMMARY })
    const panel = show(source, {
      events: [
        { id: "4", event: "close", details: { outcome: "RESTORED", summary: SUMMARY } },
        { id: "5", event: "reopen", details: { previousOutcome: "RESTORED", previousSummary: SUMMARY } },
        { id: "6", event: "record_outcome", details: { outcome: "PARTIALLY_RESTORED", summary: SUMMARY, closesCase: false } },
      ],
    })
    expect(panel.headline).toBe("Not closed")
    expect(panel.closureRecord).toBeNull()
    expect(panel.commands).toEqual({ close: true, reopen: false })
    expect(panel.locked).toEqual({ outcome: "PARTIALLY_RESTORED", summary: SUMMARY })
    expect(panel.history.map(item => item.label)).toEqual([
      "Outcome recorded, case left open",
      "Reopened",
      "Earlier close command",
    ])
    expect(panel.history[1].detail).toMatch(/Previous outcome: Restored/)
    expect(panel.history[2].detail).toMatch(/current case is not closed/)
    expect(presentCaseJourney(source, NOW, [], { outcomeEvents: [
      { id: "5", event: "reopen", details: { previousOutcome: "RESTORED", previousSummary: SUMMARY } },
      { id: "6", event: "record_outcome", details: { outcome: "PARTIALLY_RESTORED", summary: SUMMARY, closesCase: false } },
    ] }).steps.find(step => step.id === "CLOSURE")?.state).not.toBe("COMPLETED")
  })

  it("refuses a reopened outcome that is only the retained history", () => {
    const panel = show(facts({ reopened: true }), {
      events: [
        { id: "6", event: "record_outcome", details: { outcome: "RESTORED", summary: SUMMARY, closesCase: false } },
        { id: "7", event: "reopen", details: { previousOutcome: "RESTORED", previousSummary: SUMMARY } },
      ],
    })
    expect(panel.commands).toBeNull()
    expect(panel.headline).toBe("Not closed")
    expect(panel.blockers).toContain("No authoritative pre-closure outcome is stored.")
  })

  it("offers Guard only as a separate review after a restored Managed closure", () => {
    const offered = show(facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee()] },
    }))
    expect(offered.guard.offered).toBe(true)
    expect(offered.guard.href).toBe("/guard")
    expect(offered.guard.text).toMatch(/included Guard offer/)
    expect(offered.guard.text).toMatch(/does not create the offer/)
    expect(offered.commands).toEqual({ close: false, reopen: true })

    const absent = show(facts({ caseStatus: "CLOSED", technicalStage: "FINISHED", outcome: "NOT_RESTORED" }))
    expect(absent.guard.offered).toBe(false)
    expect(absent.guard.text).toMatch(/does not enrol/)
  })

  it("does not verify CLOSED with a withdrawal or CANCELLED with another outcome", () => {
    const withdrawn = facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
    })
    const withdrawnPanel = show(withdrawn)
    expect(withdrawnPanel.headline).toBe("Inconsistent closure")
    expect(withdrawnPanel.detail).toMatch(/database status is CLOSED/)
    expect(withdrawnPanel.closureRecord).toBeNull()
    expect(withdrawnPanel.guard.offered).toBe(false)
    expect(withdrawnPanel.commands).toEqual({ close: false, reopen: true })
    expect(withdrawnPanel.notices.join(" ")).toMatch(/inconsistent closure/)
    expect(presentCaseJourney(withdrawn, NOW).steps.find(step => step.id === "CLOSURE")?.state).toBe("NEEDS_ATTENTION")

    const cancelled = facts({
      caseType: "REVIEW_PROTECTION",
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "REMOVED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [successFee()] },
    })
    const cancelledPanel = show(cancelled)
    expect(cancelledPanel.headline).toBe("Inconsistent closure")
    expect(cancelledPanel.detail).toMatch(/database status is CANCELLED/)
    expect(cancelledPanel.statusLabel).toBe("CANCELLED")
    expect(cancelledPanel.closureRecord).toBeNull()
    expect(cancelledPanel.guard.offered).toBe(false)
    expect(cancelledPanel.commands).toEqual({ close: false, reopen: true })
    expect(presentCaseJourney(cancelled, NOW).steps.find(step => step.id === "CLOSURE")?.state).toBe("NEEDS_ATTENTION")
  })

  it("does not verify a terminal case at the wrong stage or with a missing summary", () => {
    const wrongStage = show(facts({
      caseStatus: "CLOSED",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
    }))
    expect(wrongStage.headline).toBe("Inconsistent closure")
    expect(wrongStage.closureRecord).toBeNull()
    expect(wrongStage.guard.offered).toBe(false)
    expect(wrongStage.commands).toEqual({ close: false, reopen: true })
    expect(wrongStage.blockers).toContain("The status, outcome, summary and stage do not form a valid closure.")

    const missingSummary = show(facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: "short",
    }))
    expect(missingSummary.headline).toBe("Inconsistent closure")
    expect(missingSummary.closureRecord).toBeNull()
    expect(missingSummary.guard.offered).toBe(false)
    expect(missingSummary.commands?.reopen).toBe(true)
    expect(missingSummary.commands?.close).toBe(false)
  })

  it("does not verify a coherent projection when the loaded case record disagrees", () => {
    const panel = show(facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
    }), { detail: { summary: `${SUMMARY} changed` } })
    expect(panel.headline).toBe("Inconsistent closure")
    expect(panel.closureRecord).toBeNull()
    expect(panel.guard.offered).toBe(false)
    expect(panel.commands).toBeNull()
    expect(panel.closureRecordsDisagree).toBe(true)
    expect(panel.billingDisagreed).toBe(false)
    expect(panel.otherSummary).toBe(`${SUMMARY} changed`)
  })

  it("withholds both commands when the case stage does not match the projection", () => {
    const panel = show(facts(), { detail: { stage: "PREPARATION" } })
    expect(panel.headline).toBe("Not closed")
    expect(panel.commands).toBeNull()
    expect(panel.closureRecord).toBeNull()
    expect(panel.closureRecordsDisagree).toBe(true)
    expect(panel.blockers).toContain("The case record and the projection do not agree.")
  })
})
