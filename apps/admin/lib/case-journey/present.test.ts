import { describe, expect, it } from "vitest"
import type {
  CaseFlowAuthorizationFact,
  CaseFlowCommunicationFact,
  CaseFlowEvidenceRequestFact,
  CaseFlowEvidenceVersionFact,
  CaseFlowFacts,
  CaseFlowOrderFact,
  CaseFlowQuoteFact,
} from "../case-flow/model"
import { journeyCatalogue, journeyStepIds, type JourneyStepId } from "./catalogue"
import { presentCaseJourney, presentJourneyState, type JourneyStepState } from "./present"

const CASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"
const LOCATION_ID = "33333333-3333-4333-8333-333333333333"
const NOW = "2026-06-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"

const transitions: Record<string, string[]> = {
  INITIAL_REVIEW: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
  EVIDENCE_COLLECTION: ["ASSESSMENT_READY"],
  ASSESSMENT_READY: ["EVIDENCE_COLLECTION", "SERVICE_SELECTION"],
  SERVICE_SELECTION: ["AUTHORIZATION_REQUIRED", "PAYMENT_REQUIRED"],
  PAYMENT_REQUIRED: ["PREPARATION"],
  AUTHORIZATION_REQUIRED: ["PREPARATION"],
  PREPARATION: ["EVIDENCE_COLLECTION", "READY_TO_SUBMIT"],
  READY_TO_SUBMIT: [],
  SUBMITTED: ["OUTCOME_REVIEW", "WAITING_GOOGLE"],
  WAITING_GOOGLE: ["FURTHER_REVIEW", "OUTCOME_REVIEW", "OWNER_ACTION"],
  OWNER_ACTION: ["FURTHER_REVIEW", "WAITING_GOOGLE"],
  FURTHER_REVIEW: ["OUTCOME_REVIEW", "PREPARATION"],
  OUTCOME_REVIEW: ["FURTHER_REVIEW"],
  FINISHED: [],
}

function authorization(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return {
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
    ...overrides,
  }
}

function fullyAuthorised(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return authorization({
    membershipStatus: "verified",
    customerEmailVerified: true,
    businessAuthorityVerified: true,
    serviceAgreementAccepted: true,
    caseManagementPermissionActive: true,
    managerAccessVerified: true,
    authorizationReady: true,
    agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
    ...overrides,
  })
}

function request(overrides: Partial<CaseFlowEvidenceRequestFact> = {}): CaseFlowEvidenceRequestFact {
  return { id: "request-1", status: "OPEN", dueAt: null, createdAt: PAST, ...overrides }
}

function upload(overrides: Partial<CaseFlowEvidenceVersionFact> = {}): CaseFlowEvidenceVersionFact {
  return {
    documentId: "document-1",
    versionId: "version-1",
    evidenceRequestId: "request-1",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "UNREVIEWED",
    ...overrides,
  }
}

function delivered(): CaseFlowCommunicationFact {
  return {
    id: "communication-1",
    templateKey: "EVIDENCE_REQUEST",
    lifecycle: "QUEUED",
    deliveryStatus: "DELIVERED",
    legacyStatus: null,
    draftedAt: PAST,
  }
}

function quote(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: "quote-1",
    status: "DRAFT",
    taxBehaviour: "INCLUSIVE",
    validUntil: FUTURE,
    actionStatus: null,
    actionExpiresAt: null,
    orderId: null,
    ...overrides,
  }
}

function order(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
  return {
    orderId: "order-1",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentRecorded: false,
    receiptRecorded: false,
    ...overrides,
  }
}

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  const stage = overrides.technicalStage ?? "INITIAL_REVIEW"
  return {
    caseId: CASE_ID,
    reference: "CASE-0001",
    caseType: "PROFILE_RECOVERY",
    technicalStage: stage,
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    locationId: LOCATION_ID,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: transitions[stage] ?? [],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: authorization(),
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

function show(overrides: Partial<CaseFlowFacts> = {}) {
  return presentCaseJourney(facts(overrides), NOW)
}

function step(journey: ReturnType<typeof show>, id: JourneyStepId) {
  const found = journey.steps.find(item => item.id === id)
  if (!found) throw new Error(id)
  return found
}

function completed(journey: ReturnType<typeof show>): JourneyStepId[] {
  return journey.steps.filter(item => item.state === "COMPLETED").map(item => item.id)
}

const reviewedEvidence = {
  requests: [request({ status: "FULFILLED" })],
  versions: [upload({ reviewStatus: "ACCEPTED" })],
}

describe("the eleven-step catalogue", () => {
  it("lists the operator steps in the required order", () => {
    expect(journeyCatalogue.map(item => item.title)).toEqual([
      "Case Received",
      "Business, Profile & Contact Verification",
      "Review Request & Request Documents",
      "Evidence Review",
      "Assessment & Recommended Path",
      "Quote & Contract Acceptance",
      "Service Activation — Guided or Managed",
      "Case Preparation & Approval",
      "Submission & Tracking",
      "Outcome Verification & Billing",
      "Closure & Optional Guard",
    ])
    expect(journeyCatalogue.map(item => item.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(journeyStepIds).toEqual(journeyCatalogue.map(item => item.id))
  })

  it("can represent every progress state, including one that does not apply", () => {
    const states: JourneyStepState[] = [
      presentJourneyState("complete", "before"),
      presentJourneyState("unproven", "focus"),
      presentJourneyState("unproven", "after"),
      presentJourneyState("waiting", "focus"),
      presentJourneyState("attention", "before"),
      presentJourneyState("not_applicable", "focus"),
      presentJourneyState("unproven", "before"),
    ]
    expect(states).toEqual(["COMPLETED", "CURRENT", "LOCKED", "WAITING", "NEEDS_ATTENTION", "NOT_APPLICABLE", "UNKNOWN"])
  })
})

describe("journey status from authoritative records", () => {
  it("keeps a new case in Initial Review on the first step and completes nothing", () => {
    const journey = show()
    expect(step(journey, "CASE_RECEIVED").state).toBe("CURRENT")
    expect(step(journey, "CASE_RECEIVED").focus).toBe(true)
    expect(completed(journey)).toEqual([])
    expect(journey.steps.filter(item => item.focus)).toHaveLength(1)
    expect(journey.steps.slice(1).every(item => item.state === "LOCKED")).toBe(true)
  })

  it("does not turn incomplete business verification into a success", () => {
    const journey = show({
      authorization: authorization({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "pending" }),
    })
    const verification = step(journey, "VERIFICATION")
    expect(verification.state).not.toBe("COMPLETED")
    expect(verification.known.join(" ")).toMatch(/not authority/)
    expect(verification.missing.join(" ")).toMatch(/Google listing/)
    expect(verification.missing.join(" ")).toMatch(/purchasing establishment/)
    expect(completed(journey)).toEqual([])
  })

  it("keeps an evidence request that has not reached the customer unfinished", () => {
    const journey = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), deliveryStatus: "PROVIDER_ACCEPTED" }],
    })
    const requestStep = step(journey, "REQUEST_DOCUMENTS")
    expect(requestStep.state).toBe("WAITING")
    expect(requestStep.state).not.toBe("COMPLETED")
    expect(step(journey, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(completed(journey)).toEqual([])
  })

  it("leaves evidence that is awaiting review unaccepted", () => {
    const journey = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload()] },
      communications: [delivered()],
    })
    expect(step(journey, "REQUEST_DOCUMENTS").state).toBe("COMPLETED")
    expect(step(journey, "EVIDENCE_REVIEW").state).toBe("CURRENT")
    expect(step(journey, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(completed(journey)).toEqual(["REQUEST_DOCUMENTS"])
  })

  it("accepts fulfilled evidence and still refuses to invent an assessment", () => {
    const journey = show({
      technicalStage: "ASSESSMENT_READY",
      evidence: reviewedEvidence,
      communications: [delivered()],
    })
    expect(step(journey, "EVIDENCE_REVIEW").state).toBe("COMPLETED")
    expect(step(journey, "ASSESSMENT").state).toBe("CURRENT")
    expect(step(journey, "ASSESSMENT").state).not.toBe("COMPLETED")
    expect(completed(journey)).not.toContain("ASSESSMENT")
  })

  it("waits for a Guided upfront payment and does not treat the order as paid", () => {
    const journey = show({
      technicalStage: "PAYMENT_REQUIRED",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order()] },
      evidence: reviewedEvidence,
      communications: [delivered()],
    })
    expect(step(journey, "QUOTE_ACCEPTANCE").state).toBe("COMPLETED")
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("WAITING")
    expect(step(journey, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(completed(journey)).not.toContain("SERVICE_ACTIVATION")
    expect(step(journey, "CASE_RECEIVED").state).not.toBe("COMPLETED")
    expect(step(journey, "ASSESSMENT").state).toBe("UNKNOWN")
  })

  it("completes Guided activation only when the obligation is PAID", () => {
    const journey = show({
      technicalStage: "PREPARATION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ obligationState: "PAID", orderState: "ACCEPTED_PAID" })] },
      evidence: reviewedEvidence,
      communications: [delivered()],
    })
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("COMPLETED")
    expect(step(journey, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/PAID/)
  })

  it("does not activate a Managed case while authorisation is incomplete, even with a saved card", () => {
    const base = {
      technicalStage: "AUTHORIZATION_REQUIRED",
      serviceTrack: "MANAGED" as const,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      evidence: reviewedEvidence,
      communications: [delivered()],
    }
    const withoutCard = show({
      ...base,
      payment: { complete: true, orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
    })
    const withCard = show({
      ...base,
      payment: {
        complete: true,
        orders: [order({
          paymentModel: "SUCCESS_FEE",
          orderState: "ACCEPTED_SUCCESS_FEE",
          obligationKind: null,
          obligationState: null,
          setupReady: true,
          consentRecorded: true,
        })],
      },
    })
    expect(step(withoutCard, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(step(withCard, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(withCard.incompatibilities.join(" ")).toMatch(/PS-2026-10-14\.2/)
    expect(withCard.suppressedAction).toBeNull()
    expect(withCard.blockers.some(item => item.code === "MANAGED_PAYMENT_SETUP_INCOMPLETE")).toBe(false)
  })

  it("drops Managed activation when a previously accepted permission is no longer valid", () => {
    const journey = show({
      technicalStage: "AUTHORIZATION_REQUIRED",
      serviceTrack: "MANAGED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true })] },
      authorization: fullyAuthorised({
        caseManagementPermissionActive: false,
        authorizationReady: true,
        reviewRequired: ["CASE_MANAGEMENT_PERMISSION"],
      }),
      evidence: reviewedEvidence,
      communications: [delivered()],
    })
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(journey, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(step(journey, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/no longer valid|moved back to review/i)
  })

  it("does not treat a missing or stale pack as published", () => {
    const paid = {
      technicalStage: "PREPARATION",
      serviceTrack: "GUIDED" as const,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ obligationState: "PAID" })] },
      evidence: reviewedEvidence,
      communications: [delivered()],
    }
    const missing = show(paid)
    const stale = show({
      ...paid,
      packs: { packs: [{ id: "pack-1", packNumber: 1, status: "STALE", published: false, everPublished: true, itemCount: 2 }], eligibleCount: 1 },
    })
    expect(step(missing, "PREPARATION").state).not.toBe("COMPLETED")
    expect(step(stale, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(completed(stale)).not.toContain("PREPARATION")
  })

  it("waits while a submission has no result from Google", () => {
    const journey = show({
      technicalStage: "WAITING_GOOGLE",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: PAST, result: null }],
    })
    expect(step(journey, "SUBMISSION").state).toBe("WAITING")
    expect(step(journey, "SUBMISSION").state).not.toBe("COMPLETED")
    expect(step(journey, "SUBMISSION").known.join(" ")).toMatch(/No live Google/)
  })

  it("does not complete outcome review before an outcome is recorded", () => {
    const journey = show({
      technicalStage: "OUTCOME_REVIEW",
      serviceTrack: "GUIDED",
      outcome: null,
      tasks: [{ id: "task-1", title: "Confirm the listing", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: PAST, result: "RESTORED" }],
    })
    expect(step(journey, "OUTCOME_BILLING").state).not.toBe("COMPLETED")
    expect(step(journey, "OUTCOME_BILLING").focus).toBe(true)
    expect(step(journey, "SUBMISSION").state).toBe("COMPLETED")
  })

  it("closes from the case status and does not require Guard or paint the earlier steps", () => {
    for (const caseStatus of ["CLOSED", "CANCELLED"]) {
      const journey = show({ caseStatus, technicalStage: "FINISHED", outcome: "WITHDRAWN", serviceTrack: "GUIDED" })
      expect(step(journey, "CLOSURE").state).toBe("COMPLETED")
      expect(step(journey, "CLOSURE").known.join(" ")).toMatch(/Guard was not required/)
      expect(journey.focusStepId).toBeNull()
      expect(completed(journey)).toEqual(["CLOSURE"])
    }
  })

  it("treats a reopened case as open again", () => {
    const journey = show({ reopened: true, caseStatus: "UNDER_REVIEW", technicalStage: "INITIAL_REVIEW", outcome: null })
    expect(journey.reopened).toBe(true)
    expect(step(journey, "CLOSURE").state).not.toBe("COMPLETED")
    expect(step(journey, "CLOSURE").known.join(" ")).toMatch(/reopened/)
    expect(step(journey, "CASE_RECEIVED").state).toBe("CURRENT")
    expect(completed(journey)).toEqual([])
  })

  it("leaves an incomplete projection unknown instead of green", () => {
    const journey = show({
      technicalStage: "NOT_A_STAGE",
      commercial: { complete: false, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: false, orders: [order({ obligationState: "PAID" })] },
      serviceTrack: "GUIDED",
    })
    expect(journey.projectionNote).toMatch(/not one this build recognises/)
    expect(journey.focusStepId).toBeNull()
    expect(step(journey, "QUOTE_ACCEPTANCE").state).not.toBe("COMPLETED")
    expect(step(journey, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(completed(journey)).toEqual([])
    expect(journey.steps.every(item => item.state === "UNKNOWN" || item.state === "NEEDS_ATTENTION" || item.state === "WAITING")).toBe(true)
  })

  it("refuses the records that look finished and are not", () => {
    const threatened = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload({ reviewStatus: "ACCEPTED", scanStatus: "THREATS_FOUND" })] },
      communications: [delivered()],
    })
    const unreviewed = show({
      evidence: { requests: [request({ status: "FULFILLED" })], versions: [upload()] },
      communications: [delivered()],
    })
    const checkout = show({
      technicalStage: "PAYMENT_REQUIRED",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ obligationState: "COLLECTING" })] },
    })
    const opened = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    })
    expect(step(threatened, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(unreviewed, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(checkout, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(step(opened, "QUOTE_ACCEPTANCE").state).toBe("WAITING")
    expect(completed(opened)).not.toContain("QUOTE_ACCEPTANCE")
  })

  it("can complete Managed activation from authority and Google access without a saved card", () => {
    const journey = show({
      technicalStage: "AUTHORIZATION_REQUIRED",
      serviceTrack: "MANAGED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
      authorization: fullyAuthorised(),
      evidence: reviewedEvidence,
      communications: [delivered()],
    })
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("COMPLETED")
    expect(journey.suppressedAction?.id).toBe("START_MANAGED_PAYMENT_SETUP")
    expect(journey.nextAction).toBeNull()
  })
})
