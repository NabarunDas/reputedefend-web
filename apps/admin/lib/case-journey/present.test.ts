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
import type { JourneyWorkEvent } from "./decisions"
import type { AssessmentJudgement } from "./assessment"
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

function show(
  overrides: Partial<CaseFlowFacts> = {},
  events: readonly JourneyWorkEvent[] = [],
  options: { recordConflict?: boolean; emailRecordsDisagree?: boolean; authorityRecordsDisagree?: boolean; assessment?: AssessmentJudgement | null; packRecordsDisagree?: boolean; submissionRecordsDisagree?: boolean; outcomeRecordsDisagree?: boolean; closureRecordsDisagree?: boolean } = {},
) {
  return presentCaseJourney(facts(overrides), NOW, events, options)
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
      "Preliminary business, profile and contact screening",
      "Review Request & Request Documents",
      "Evidence Review",
      "Assessment & Recommended Path",
      "Quotation & Acceptance",
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
    expect(verification.known.join(" ")).toMatch(/A website, a Companies House registration/)
    expect(verification.known.join(" ")).toMatch(/Verified customer email is recorded/)
    expect(verification.known.join(" ")).toMatch(/not authority/)
    expect(verification.known.join(" ")).toMatch(/Business authority is not recorded/)
    expect(verification.known.join(" ")).toMatch(/purchasing establishment/)
    expect(verification.known.join(" ")).toMatch(/not a verified Google listing/)
    expect(verification.missing.join(" ")).toMatch(/preliminary screening record/)
    expect(verification.known.join(" ")).toMatch(/before a binding paid quote/)
    expect(verification.unlock).toMatch(/does not wait for the legal purchasing establishment/)
    expect(verification.unlock).toMatch(/country and tax eligibility/)
    expect(verification.unlock).not.toMatch(/All four facts have to be recorded before the request for documents/)
    expect(completed(journey)).toEqual([])
  })

  it("does not hold an evidence request for the purchasing establishment or a missing listing", () => {
    const journey = show({
      technicalStage: "EVIDENCE_COLLECTION",
      authorization: authorization({ customerEmailVerified: false, businessAuthorityVerified: false }),
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), lifecycle: "DRAFT", deliveryStatus: null }],
    })
    expect(step(journey, "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(journey, "REQUEST_DOCUMENTS").state).not.toBe("LOCKED")
    expect(step(journey, "REQUEST_DOCUMENTS").state).not.toBe("COMPLETED")
    expect(step(journey, "ASSESSMENT").unlock).toMatch(/suspended or missing/)
    expect(step(journey, "ASSESSMENT").missing.join(" ")).not.toMatch(/listing verification/)
    expect(completed(journey)).toEqual([])
  })

  it("does not treat a delivered or opened email as verified identity", () => {
    const journey = show({
      authorization: authorization({ customerEmailVerified: true, businessAuthorityVerified: true, membershipStatus: "verified" }),
      communications: [{ ...delivered(), id: "confirmation", templateKey: "CASE_RECEIVED" }],
    })
    const text = `${step(journey, "CASE_RECEIVED").known.join(" ")} ${step(journey, "VERIFICATION").known.join(" ")}`
    expect(text).toMatch(/opened/)
    expect(text).toMatch(/not verified identity/)
    expect(step(journey, "VERIFICATION").state).not.toBe("COMPLETED")
    expect(completed(journey)).toEqual([])
  })

  it("keeps queued, provider-accepted and delivered as different statuses", () => {
    const queued = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), deliveryStatus: null, lifecycle: "QUEUED" }],
    })
    const accepted = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), deliveryStatus: "PROVIDER_ACCEPTED" }],
    })
    const arrived = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [delivered()],
    })
    expect(step(queued, "REQUEST_DOCUMENTS").state).toBe("WAITING")
    expect(step(queued, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/Queued/)
    expect(step(queued, "REQUEST_DOCUMENTS").known.join(" ")).not.toMatch(/recorded delivery status of DELIVERED/)
    expect(step(accepted, "REQUEST_DOCUMENTS").state).toBe("WAITING")
    expect(step(accepted, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/provider accepted/i)
    expect(step(accepted, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/not delivery/)
    expect(step(accepted, "REQUEST_DOCUMENTS").known.join(" ")).not.toMatch(/recorded delivery status of DELIVERED/)
    expect(step(arrived, "REQUEST_DOCUMENTS").state).toBe("COMPLETED")
    expect(step(arrived, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/recorded delivery status of DELIVERED/)
    expect(completed(queued)).toEqual([])
    expect(completed(accepted)).toEqual([])
  })

  it("shows a draft review and an issue as unfinished admin work", () => {
    const drafted = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), lifecycle: "DRAFT", deliveryStatus: null }],
    })
    const reviewed = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [] },
      communications: [{ ...delivered(), lifecycle: "REVIEWED", deliveryStatus: null }],
    })
    expect(step(drafted, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/review that draft/)
    expect(step(reviewed, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/has not been issued/)
    expect(step(drafted, "REQUEST_DOCUMENTS").state).not.toBe("COMPLETED")
    expect(step(reviewed, "REQUEST_DOCUMENTS").state).not.toBe("COMPLETED")
    expect(completed(drafted)).toEqual([])
    expect(completed(reviewed)).toEqual([])
  })

  it("lets a customer upload be reviewed before delivery is confirmed", () => {
    const journey = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ submissionSource: "CUSTOMER" })] },
      communications: [{ ...delivered(), deliveryStatus: "PROVIDER_ACCEPTED" }],
    })
    expect(step(journey, "REQUEST_DOCUMENTS").state).toBe("COMPLETED")
    expect(step(journey, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/does not record the email as delivered/)
    expect(step(journey, "REQUEST_DOCUMENTS").known.join(" ")).not.toMatch(/recorded delivery status of DELIVERED/)
    expect(step(journey, "EVIDENCE_REVIEW").state).not.toBe("LOCKED")
    expect(step(journey, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(journey, "EVIDENCE_REVIEW").known.join(" ")).toMatch(/reviewed before email delivery is confirmed/)
    expect(step(journey, "EVIDENCE_REVIEW").known.join(" ")).not.toMatch(/recorded delivery status of DELIVERED/)
    expect(completed(journey)).toEqual(["REQUEST_DOCUMENTS"])
  })

  it("opens evidence review from a linked upload during initial review and evidence collection", () => {
    for (const technicalStage of ["INITIAL_REVIEW", "EVIDENCE_COLLECTION"] as const) {
      const events = technicalStage === "INITIAL_REVIEW" ? [intake("REVIEWED"), screening()] : []
      const providerAccepted = [{ ...delivered(), deliveryStatus: "PROVIDER_ACCEPTED" as const }]
      const opened = show({
        technicalStage,
        evidence: {
          requests: [request()],
          versions: [upload({ submissionSource: "CUSTOMER", scanStatus: "PENDING", validationStatus: "PENDING", reviewStatus: "UNREVIEWED" })],
        },
        communications: providerAccepted,
      }, events)
      expect(step(opened, "REQUEST_DOCUMENTS").state, technicalStage).toBe("COMPLETED")
      expect(step(opened, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).toMatch(/does not record the email as delivered/)
      expect(step(opened, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).toMatch(/does not accept the file/)
      expect(step(opened, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).not.toMatch(/recorded delivery status of DELIVERED/)
      expect(step(opened, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("LOCKED")
      expect(step(opened, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("COMPLETED")
      expect(step(opened, "EVIDENCE_REVIEW").known.join(" "), technicalStage).toMatch(/scan can be checked/)
      expect(step(opened, "EVIDENCE_REVIEW").known.join(" "), technicalStage).toMatch(/not acceptance/)

      const deliveredOnly = show({
        technicalStage,
        evidence: { requests: [request()], versions: [] },
        communications: [delivered()],
      }, events)
      expect(step(deliveredOnly, "REQUEST_DOCUMENTS").state, technicalStage).toBe("COMPLETED")
      expect(step(deliveredOnly, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).toMatch(/recorded delivery status of DELIVERED/)
      expect(step(deliveredOnly, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("LOCKED")
      expect(step(deliveredOnly, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("COMPLETED")

      const staff = show({
        technicalStage,
        evidence: {
          requests: [request()],
          versions: [upload({ submissionSource: "ADMIN", scanStatus: "PENDING", validationStatus: "PENDING", reviewStatus: "UNREVIEWED" })],
        },
        communications: providerAccepted,
      }, events)
      expect(step(staff, "REQUEST_DOCUMENTS").state, technicalStage).toBe("WAITING")
      expect(step(staff, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).toMatch(/not delivery/)
      expect(step(staff, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).not.toMatch(/secure portal/)
      expect(step(staff, "EVIDENCE_REVIEW").state, technicalStage).toBe("LOCKED")

      const waiting = show({
        technicalStage,
        evidence: { requests: [request()], versions: [] },
        communications: providerAccepted,
      }, events)
      expect(step(waiting, "REQUEST_DOCUMENTS").state, technicalStage).toBe("WAITING")
      expect(step(waiting, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).toMatch(/not delivery/)
      expect(step(waiting, "REQUEST_DOCUMENTS").known.join(" "), technicalStage).not.toMatch(/recorded delivery status of DELIVERED/)
      expect(step(waiting, "EVIDENCE_REVIEW").state, technicalStage).toBe("LOCKED")

      const threatened = show({
        technicalStage,
        evidence: {
          requests: [request()],
          versions: [upload({ submissionSource: "CUSTOMER", scanStatus: "THREATS_FOUND", validationStatus: "PENDING", reviewStatus: "UNREVIEWED" })],
        },
        communications: providerAccepted,
      }, events)
      expect(step(threatened, "EVIDENCE_REVIEW").state, technicalStage).toBe("NEEDS_ATTENTION")
      expect(step(threatened, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("COMPLETED")
      expect(step(threatened, "EVIDENCE_REVIEW").known.join(" "), technicalStage).toMatch(/blocks use of the affected file/)

      const invalid = show({
        technicalStage,
        evidence: {
          requests: [request()],
          versions: [upload({ submissionSource: "CUSTOMER", scanStatus: "NO_THREATS_FOUND", validationStatus: "INVALID", reviewStatus: "UNREVIEWED" })],
        },
        communications: providerAccepted,
      }, events)
      expect(step(invalid, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("LOCKED")
      expect(step(invalid, "EVIDENCE_REVIEW").state, technicalStage).not.toBe("COMPLETED")
      expect(step(invalid, "EVIDENCE_REVIEW").state, technicalStage).toBe("NEEDS_ATTENTION")
    }
  })

  it("does not treat an unlinked or unfinished upload as the customer's response", () => {
    const providerAccepted = [{ ...delivered(), deliveryStatus: "PROVIDER_ACCEPTED" as const }]
    const unlinked = show({
      technicalStage: "INITIAL_REVIEW",
      evidence: {
        requests: [request()],
        versions: [upload({ submissionSource: "CUSTOMER", evidenceRequestId: null, scanStatus: "PENDING", validationStatus: "PENDING" })],
      },
      communications: providerAccepted,
    }, [intake("REVIEWED"), screening()])
    expect(step(unlinked, "REQUEST_DOCUMENTS").state).toBe("WAITING")
    expect(step(unlinked, "EVIDENCE_REVIEW").state).toBe("LOCKED")

    const unfinished = show({
      technicalStage: "INITIAL_REVIEW",
      evidence: {
        requests: [request()],
        versions: [upload({ submissionSource: "CUSTOMER", uploadStatus: "PENDING_UPLOAD", scanStatus: "PENDING", validationStatus: "PENDING" })],
      },
      communications: providerAccepted,
    }, [intake("REVIEWED"), screening()])
    expect(step(unfinished, "REQUEST_DOCUMENTS").state).toBe("WAITING")
    expect(step(unfinished, "EVIDENCE_REVIEW").state).toBe("LOCKED")

    const collected = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request()],
        versions: [upload({ submissionSource: "CUSTOMER", evidenceRequestId: "someone-else", scanStatus: "PENDING", validationStatus: "PENDING" })],
      },
      communications: providerAccepted,
    })
    expect(step(collected, "REQUEST_DOCUMENTS").state).not.toBe("COMPLETED")
    expect(step(collected, "EVIDENCE_REVIEW").state).toBe("LOCKED")
  })

  it("returns a rejected file to the evidence loop and keeps an outstanding threat blocked", () => {
    const rejected = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: { requests: [request()], versions: [upload({ reviewStatus: "REJECTED" })] },
      communications: [delivered()],
    })
    const threatened = show({
      technicalStage: "EVIDENCE_COLLECTION",
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [
          upload({ reviewStatus: "ACCEPTED" }),
          upload({ documentId: "document-2", versionId: "version-2", reviewStatus: "UNREVIEWED", scanStatus: "THREATS_FOUND" }),
        ],
      },
      communications: [delivered()],
    })
    expect(step(rejected, "EVIDENCE_REVIEW").state).toBe("NEEDS_ATTENTION")
    expect(step(rejected, "EVIDENCE_REVIEW").known.join(" ")).toMatch(/returns the case to the evidence loop/)
    expect(step(rejected, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(threatened, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(threatened, "EVIDENCE_REVIEW").known.join(" ")).toMatch(/blocks use of the affected file/)
    expect(completed(rejected)).not.toContain("EVIDENCE_REVIEW")
    expect(completed(threatened)).not.toContain("EVIDENCE_REVIEW")
    const replaced = show({
      technicalStage: "ASSESSMENT_READY",
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [
          upload({ reviewStatus: "REJECTED", versionId: "version-old" }),
          upload({ reviewStatus: "ACCEPTED" }),
        ],
      },
      communications: [delivered()],
    })
    expect(step(replaced, "EVIDENCE_REVIEW").state).toBe("COMPLETED")
  })

  it("leaves a no-documents path unknown until a waiver record exists", () => {
    const journey = show({ technicalStage: "EVIDENCE_COLLECTION" })
    expect(step(journey, "REQUEST_DOCUMENTS").state).not.toBe("COMPLETED")
    expect(step(journey, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/ADMIN-JOURNEY-03/)
    expect(step(journey, "REQUEST_DOCUMENTS").known.join(" ")).toMatch(/unknown/)
    expect(step(journey, "EVIDENCE_REVIEW").state).not.toBe("COMPLETED")
    expect(step(journey, "EVIDENCE_REVIEW").known.join(" ")).toMatch(/recorded separately/)
    expect(step(journey, "EVIDENCE_REVIEW").known.join(" ")).toMatch(/unknown/)
    expect(step(journey, "EVIDENCE_REVIEW").missing.join(" ")).toMatch(/Silence is not that decision/)
    expect(step(journey, "EVIDENCE_REVIEW").unsupported).toMatch(/record that no documents are required/)
    expect(completed(journey)).toEqual([])
  })

  it("does not treat an unissued quote as cleared for the purchasing establishment", () => {
    const journey = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote()] },
    })
    expect(step(journey, "QUOTE_ACCEPTANCE").state).not.toBe("COMPLETED")
    expect(step(journey, "QUOTE_ACCEPTANCE").missing.join(" ")).toMatch(/purchasing establishment/)
    expect(step(journey, "QUOTE_ACCEPTANCE").missing.join(" ")).toMatch(/tax eligibility/)
    expect(step(journey, "QUOTE_ACCEPTANCE").unlock).toMatch(/Issuing a binding paid quote still requires/)
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
      payment: { complete: true, orders: [order({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] },
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

  it("completes preparation only for the current published pack", () => {
    const published = {
      id: "pack-2",
      packNumber: 2,
      status: "APPROVED",
      published: true,
      everPublished: true,
      itemCount: 2,
    }
    const ready = show({
      technicalStage: "PREPARATION",
      packs: { packs: [published], eligibleCount: 2 },
    })
    expect(step(ready, "PREPARATION").state).toBe("COMPLETED")
    expect(step(ready, "PREPARATION").known.join(" ")).toMatch(/does not submit anything to Google/)
    expect(step(ready, "SUBMISSION").state).not.toBe("COMPLETED")

    const approved = show({
      technicalStage: "PREPARATION",
      packs: { packs: [{ ...published, published: false }], eligibleCount: 2 },
    })
    expect(step(approved, "PREPARATION").state).not.toBe("COMPLETED")
    expect(step(approved, "PREPARATION").missing.join(" ")).toMatch(/Publication/)

    const draft = show({
      technicalStage: "PREPARATION",
      packs: { packs: [{ ...published, status: "DRAFT", published: false, itemCount: 0 }], eligibleCount: 1 },
    })
    expect(step(draft, "PREPARATION").state).not.toBe("COMPLETED")
    expect(step(draft, "PREPARATION").missing.join(" ")).toMatch(/staff document does not need an evidence request/)

    const history = show({
      technicalStage: "PREPARATION",
      packs: {
        packs: [
          { ...published, id: "pack-1", packNumber: 1, status: "SUPERSEDED", published: false },
          { ...published, status: "DRAFT", published: false },
        ],
        eligibleCount: 2,
      },
    })
    expect(step(history, "PREPARATION").state).not.toBe("COMPLETED")

    const earlierPublished = show({
      technicalStage: "PREPARATION",
      packs: {
        packs: [
          { ...published, id: "pack-1", packNumber: 1 },
          { ...published, status: "DRAFT", published: false },
        ],
        eligibleCount: 2,
      },
    })
    expect(step(earlierPublished, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(step(earlierPublished, "PREPARATION").known.join(" ")).toMatch(/records disagree/)
    expect(completed(earlierPublished)).not.toContain("PREPARATION")

    const conflict = show({
      technicalStage: "PREPARATION",
      packs: { packs: [published], eligibleCount: 2 },
    }, [], { recordConflict: true })
    expect(step(conflict, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(completed(conflict)).not.toContain("PREPARATION")

    const mismatched = show({
      technicalStage: "PREPARATION",
      packs: { packs: [published], eligibleCount: 2 },
    }, [], { packRecordsDisagree: true })
    expect(step(mismatched, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(step(mismatched, "PREPARATION").known.join(" ")).toMatch(/prepared-pack record/)
    expect(completed(mismatched)).not.toContain("PREPARATION")

    const bothPublished = show({
      technicalStage: "PREPARATION",
      packs: {
        packs: [
          { ...published, id: "pack-1", packNumber: 1 },
          published,
        ],
        eligibleCount: 2,
      },
    })
    expect(step(bothPublished, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(step(bothPublished, "PREPARATION").known.join(" ")).toMatch(/earlier pack is still published/)
    expect(completed(bothPublished)).not.toContain("PREPARATION")

    const supersededHistory = show({
      technicalStage: "PREPARATION",
      packs: {
        packs: [
          { ...published, id: "pack-1", packNumber: 1, status: "SUPERSEDED", published: false },
          published,
        ],
        eligibleCount: 2,
      },
    })
    expect(step(supersededHistory, "PREPARATION").state).toBe("COMPLETED")
    expect(step(supersededHistory, "PREPARATION").whoMustAct).toBe("The completed pack is available to the customer.")

    const authority = show({
      technicalStage: "PREPARATION",
      packs: { packs: [published], eligibleCount: 2 },
    }, [], { authorityRecordsDisagree: true })
    expect(step(authority, "PREPARATION").state).toBe("NEEDS_ATTENTION")
    expect(step(authority, "PREPARATION").known.join(" ")).toMatch(/authority records disagree/)
    expect(completed(authority)).not.toContain("PREPARATION")
  })

  it("waits while a submission has no result from Google", () => {
    const journey = show({
      technicalStage: "WAITING_GOOGLE",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: null }],
    })
    expect(step(journey, "SUBMISSION").state).toBe("WAITING")
    expect(step(journey, "SUBMISSION").state).not.toBe("COMPLETED")
    expect(step(journey, "SUBMISSION").known.join(" ")).toMatch(/No live Google/)
    expect(step(journey, "SUBMISSION").known.join(" ")).toMatch(/did not submit it/)
    expect(step(journey, "OUTCOME_BILLING").state).not.toBe("COMPLETED")
  })

  it("completes submission only when every attempt has a decision or a withdrawal", () => {
    const decided = show({
      technicalStage: "OUTCOME_REVIEW",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    })
    expect(step(decided, "SUBMISSION").state).toBe("COMPLETED")
    expect(step(decided, "SUBMISSION").known.join(" ")).toMatch(/later step/)
    expect(step(decided, "OUTCOME_BILLING").state).not.toBe("COMPLETED")

    const withdrawn = show({
      technicalStage: "FURTHER_REVIEW",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: PAST, result: "WITHDRAWN" }],
    })
    expect(step(withdrawn, "SUBMISSION").state).toBe("COMPLETED")

    const mixed = show({
      technicalStage: "FURTHER_REVIEW",
      serviceTrack: "GUIDED",
      submissions: [
        { id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" },
        { id: "submission-2", actor: "CUSTOMER", submittedAt: PAST, result: null },
      ],
    })
    expect(step(mixed, "SUBMISSION").state).toBe("WAITING")
    expect(completed(mixed)).not.toContain("SUBMISSION")

    const none = show({ technicalStage: "READY_TO_SUBMIT", serviceTrack: "GUIDED", submissions: [] })
    expect(step(none, "SUBMISSION").state).not.toBe("COMPLETED")

    const wrongParty = show({
      technicalStage: "WAITING_GOOGLE",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: PAST, result: "DECIDED" }],
    })
    expect(step(wrongParty, "SUBMISSION").state).toBe("NEEDS_ATTENTION")
    expect(step(wrongParty, "SUBMISSION").known.join(" ")).toMatch(/service track/)
    expect(completed(wrongParty)).not.toContain("SUBMISSION")

    const unrecognised = show({
      technicalStage: "OUTCOME_REVIEW",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "RESTORED" }],
    })
    expect(step(unrecognised, "SUBMISSION").state).toBe("NEEDS_ATTENTION")
    expect(completed(unrecognised)).not.toContain("SUBMISSION")

    const conflict = show({
      technicalStage: "WAITING_GOOGLE",
      serviceTrack: "GUIDED",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    }, [], { submissionRecordsDisagree: true })
    expect(step(conflict, "SUBMISSION").state).toBe("NEEDS_ATTENTION")
    expect(step(conflict, "SUBMISSION").known.join(" ")).toMatch(/records disagree/)
    expect(completed(conflict)).not.toContain("SUBMISSION")
  })

  it("does not complete outcome review before an outcome is recorded", () => {
    const journey = show({
      technicalStage: "OUTCOME_REVIEW",
      serviceTrack: "GUIDED",
      outcome: null,
      tasks: [{ id: "task-1", title: "Confirm the listing", owner: "ADMIN", kind: "FOLLOW_UP", status: "OPEN", dueAt: FUTURE }],
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: PAST, result: "DECIDED" }],
    })
    expect(step(journey, "OUTCOME_BILLING").state).not.toBe("COMPLETED")
    expect(step(journey, "OUTCOME_BILLING").focus).toBe(true)
    expect(step(journey, "SUBMISSION").state).toBe("COMPLETED")
  })

  it("completes closure only when the terminal status, outcome, stage and summary agree", () => {
    const summary = "The customer withdrew the request."
    const cancelled = show({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      outcomeSummary: summary,
      serviceTrack: "GUIDED",
    })
    expect(step(cancelled, "CLOSURE").state).toBe("COMPLETED")
    expect(step(cancelled, "CLOSURE").known.join(" ")).toMatch(/Guard was not required/)
    expect(step(cancelled, "CLOSURE").known.join(" ")).toMatch(/CANCELLED/)
    expect(cancelled.focusStepId).toBeNull()
    expect(completed(cancelled)).toEqual(["CLOSURE"])

    const closed = show({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: "The listing was restored after the recorded appeal.",
      serviceTrack: "GUIDED",
    })
    expect(step(closed, "CLOSURE").state).toBe("COMPLETED")
    expect(step(closed, "CLOSURE").known.join(" ")).toMatch(/Guard was not required/)
    expect(step(closed, "CLOSURE").known.join(" ")).toMatch(/not a CANCELLED/)
    expect(completed(closed)).toEqual(["CLOSURE"])
  })

  it("does not complete an inconsistent terminal closure", () => {
    const summary = "The listing was restored after the recorded appeal."
    const withdrawnClosed = show({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      outcomeSummary: summary,
      serviceTrack: "GUIDED",
    })
    expect(step(withdrawnClosed, "CLOSURE").state).toBe("NEEDS_ATTENTION")
    expect(step(withdrawnClosed, "CLOSURE").known.join(" ")).toMatch(/database status is CLOSED/)
    expect(step(withdrawnClosed, "CLOSURE").known.join(" ")).toMatch(/do not form a valid closure/)
    expect(completed(withdrawnClosed)).not.toContain("CLOSURE")

    const cancelledRestored = show({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "GUIDED",
    })
    expect(step(cancelledRestored, "CLOSURE").state).toBe("NEEDS_ATTENTION")
    expect(step(cancelledRestored, "CLOSURE").known.join(" ")).toMatch(/database status is CANCELLED/)
    expect(completed(cancelledRestored)).not.toContain("CLOSURE")

    const wrongStage = show({
      caseStatus: "CLOSED",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "GUIDED",
    })
    expect(step(wrongStage, "CLOSURE").state).toBe("NEEDS_ATTENTION")

    const missingSummary = show({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: "",
      serviceTrack: "GUIDED",
    })
    expect(step(missingSummary, "CLOSURE").state).toBe("NEEDS_ATTENTION")

    const shortSummary = show({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      outcomeSummary: "short",
      serviceTrack: "GUIDED",
    })
    expect(step(shortSummary, "CLOSURE").state).toBe("NEEDS_ATTENTION")
    expect(step(shortSummary, "CLOSURE").known.join(" ")).not.toMatch(/Guard was not required/)
  })

  it("does not complete closure when the loaded case record disagrees with the projection", () => {
    const summary = "The listing was restored after the recorded appeal."
    const closed = {
      caseStatus: "CLOSED" as const,
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "GUIDED" as const,
    }
    const agreed = show(closed)
    const disagreed = show(closed, [], { closureRecordsDisagree: true })
    expect(step(agreed, "CLOSURE").state).toBe("COMPLETED")
    expect(step(disagreed, "CLOSURE").state).toBe("NEEDS_ATTENTION")
    expect(step(disagreed, "CLOSURE").known.join(" ")).toMatch(/loaded case record and the case-flow projection do not agree/)
    expect(step(disagreed, "CLOSURE").known.join(" ")).not.toMatch(/Guard was not required/)
    expect(completed(disagreed)).not.toContain("CLOSURE")
    expect(step(disagreed, "OUTCOME_BILLING").state).toBe(step(agreed, "OUTCOME_BILLING").state)

    const billing = show(closed, [], { outcomeRecordsDisagree: true })
    expect(step(billing, "CLOSURE").state).toBe("COMPLETED")
    expect(step(billing, "OUTCOME_BILLING").state).toBe("NEEDS_ATTENTION")

    const open = show({
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "GUIDED",
    }, [], { closureRecordsDisagree: true })
    expect(step(open, "CLOSURE").state).toBe("NEEDS_ATTENTION")
    expect(step(open, "CLOSURE").known.join(" ")).toMatch(/The case is open/)
    expect(completed(open)).not.toContain("CLOSURE")
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

const reason = "Name, country and the public listing were compared."

function intake(outcome: "REVIEWED" | "INCOMPLETE", at = PAST): JourneyWorkEvent {
  return {
    event: "INTAKE_REVIEW",
    createdAt: at,
    details: { outcome, nextAction: outcome === "REVIEWED" ? "" : "Ask which town the shop is in" },
  }
}

function screening(details: Record<string, unknown> = {}, at = PAST): JourneyWorkEvent {
  return {
    event: "BUSINESS_VERIFICATION",
    createdAt: at,
    details: {
      outcome: "PRELIMINARY_COMPLETE",
      source: "Public listing and the enquiry",
      listing: "ACCESSIBLE",
      website: "PRESENT",
      discrepancy: false,
      reason,
      ...details,
    },
  }
}

describe("intake review and business screening records", () => {
  it("completes case received only from a current staff review", () => {
    const reviewed = show({}, [intake("REVIEWED")])
    expect(step(reviewed, "CASE_RECEIVED").state).toBe("COMPLETED")
    expect(step(reviewed, "VERIFICATION").state).toBe("CURRENT")
    expect(show({}, [intake("INCOMPLETE")]).steps.find(item => item.id === "CASE_RECEIVED")?.state).not.toBe("COMPLETED")
    const reopened = show({ reopened: true }, [intake("REVIEWED", PAST), { event: "reopen", createdAt: NOW, details: {} }])
    expect(step(reopened, "CASE_RECEIVED").state).not.toBe("COMPLETED")
    expect(step(reopened, "CASE_RECEIVED").known.join(" ")).toMatch(/reopen/)
  })

  it("does not treat a delivered confirmation as the review", () => {
    const journey = show({ communications: [{ ...delivered(), templateKey: "CASE_RECEIVED_CUSTOMER" }] })
    expect(step(journey, "CASE_RECEIVED").state).not.toBe("COMPLETED")
  })

  it("completes screening for a genuine business, including one with no website or a suspended listing", () => {
    const genuine = show({}, [intake("REVIEWED"), screening()])
    expect(step(genuine, "VERIFICATION").state).toBe("COMPLETED")
    expect(step(genuine, "VERIFICATION").title).toBe("Preliminary business, profile and contact screening")
    expect(step(genuine, "VERIFICATION").whoMustAct).toMatch(/not formal business authority/)
    expect(step(genuine, "VERIFICATION").known.join(" ")).toMatch(/not a verified purchasing establishment/)
    const noWebsite = show({}, [intake("REVIEWED"), screening({ website: "NONE" })])
    expect(step(noWebsite, "VERIFICATION").state).toBe("COMPLETED")
    expect(step(noWebsite, "VERIFICATION").known.join(" ")).toMatch(/website is not required/)
    const suspended = show({}, [intake("REVIEWED"), screening({ listing: "SUSPENDED_OR_MISSING" })])
    expect(step(suspended, "VERIFICATION").state).toBe("COMPLETED")
    expect(step(suspended, "VERIFICATION").known.join(" ")).toMatch(/not a verified listing/)
    expect(step(suspended, "VERIFICATION").known.join(" ")).toMatch(/does not block assessment/)
  })

  it("keeps unverified email, and verified email without authority, from being rewritten by the screening record", () => {
    const unverified = show(
      { authorization: authorization({ customerEmailVerified: false, businessAuthorityVerified: false }) },
      [intake("REVIEWED"), screening()],
    )
    expect(step(unverified, "VERIFICATION").state).toBe("COMPLETED")
    expect(step(unverified, "VERIFICATION").known.join(" ")).toMatch(/Verified customer email is not recorded/)
    const emailOnly = show(
      { authorization: authorization({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "pending" }) },
      [intake("REVIEWED"), screening()],
    )
    expect(step(emailOnly, "VERIFICATION").state).toBe("COMPLETED")
    expect(step(emailOnly, "VERIFICATION").known.join(" ")).toMatch(/Business authority is not recorded/)
    expect(step(emailOnly, "VERIFICATION").known.join(" ")).toMatch(/not authority/)
  })

  it("does not complete screening for a duplicate, an unavailable listing outcome, a discrepancy, or a revoked membership", () => {
    expect(step(show({}, [screening({ outcome: "DUPLICATE_REVIEW" })]), "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(show({}, [screening({ outcome: "LISTING_UNAVAILABLE", listing: "SUSPENDED_OR_MISSING" })]), "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(show({}, [screening({ outcome: "FURTHER_INFORMATION" })]), "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(show({}, [screening({ outcome: "ESCALATE", discrepancy: true })]), "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(show({}, [screening({ discrepancy: true })]), "VERIFICATION").state).not.toBe("COMPLETED")
    const revoked = show(
      { authorization: authorization({ membershipStatus: "revoked", businessAuthorityVerified: false }) },
      [screening()],
    )
    expect(step(revoked, "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(revoked, "VERIFICATION").missing.join(" ")).toMatch(/checkbox cannot override/)
    const conflict = show({}, [intake("REVIEWED"), screening()], { recordConflict: true })
    expect(step(conflict, "VERIFICATION").state).toBe("NEEDS_ATTENTION")
    expect(step(conflict, "VERIFICATION").missing.join(" ")).toMatch(/disagree/)
    const emailGap = show({}, [intake("REVIEWED"), screening()], { emailRecordsDisagree: true })
    expect(step(emailGap, "VERIFICATION").state).toBe("NEEDS_ATTENTION")
    const authorityGap = show({}, [intake("REVIEWED"), screening()], { authorityRecordsDisagree: true })
    expect(step(authorityGap, "VERIFICATION").state).toBe("NEEDS_ATTENTION")
    expect(step(show({}, [screening()]), "VERIFICATION").state).not.toBe("COMPLETED")
    const reopened = show({}, [intake("REVIEWED", PAST), { event: "reopen", createdAt: NOW, details: {} }, screening({}, NOW)])
    expect(step(reopened, "VERIFICATION").state).not.toBe("COMPLETED")
  })

  it("leaves a later-stage case readable without inventing an intake review", () => {
    const journey = show({
      technicalStage: "ASSESSMENT_READY",
      evidence: {
        requests: [request({ status: "FULFILLED" })],
        versions: [upload({ reviewStatus: "ACCEPTED" })],
      },
      communications: [delivered()],
    })
    expect(step(journey, "CASE_RECEIVED").state).not.toBe("COMPLETED")
    expect(step(journey, "VERIFICATION").state).not.toBe("COMPLETED")
    expect(step(journey, "EVIDENCE_REVIEW").state).toBe("COMPLETED")
  })
})

describe("assessment completion", () => {
  const approved: AssessmentJudgement = { phase: "approved", pathway: "GUIDED", versionNumber: 1 }
  const ready = {
    technicalStage: "ASSESSMENT_READY" as const,
    evidence: reviewedEvidence,
    communications: [delivered()],
  }

  it("completes only a current Guided or Managed approval, and not from the service track", () => {
    const journey = show(ready, [], { assessment: approved })
    const assessment = step(journey, "ASSESSMENT")
    expect(assessment.state).toBe("COMPLETED")
    expect(assessment.known.join(" ")).toMatch(/recommends Guided/)
    expect(assessment.known.join(" ")).toMatch(/not an accepted agreement/)
    expect(assessment.missing.join(" ")).not.toMatch(/accessible|listing verification/)
    expect(journey.serviceTrack).toBe("UNDECIDED")
    expect(step(show({ ...ready, serviceTrack: "GUIDED" }), "ASSESSMENT").state).not.toBe("COMPLETED")
    expect(step(show(ready, [], { assessment: { phase: "draft", pathway: "GUIDED", versionNumber: 1 } }), "ASSESSMENT").state).not.toBe("COMPLETED")
    expect(step(show(ready, [], { assessment: { phase: "reviewed", pathway: "MANAGED", versionNumber: 1 } }), "ASSESSMENT").state).not.toBe("COMPLETED")
    expect(step(show(ready, [], { assessment: { phase: "approved", pathway: "UNDECIDED", versionNumber: 1 } }), "ASSESSMENT").state).not.toBe("COMPLETED")
  })

  it("keeps a stale or reopened approval in attention after the focus has moved on", () => {
    const later = {
      ...ready,
      technicalStage: "SERVICE_SELECTION" as const,
      serviceTrack: "GUIDED" as const,
      commercial: { complete: true, quotes: [quote()] },
    }
    const stale = show(later, [], { assessment: { phase: "stale", pathway: "GUIDED", versionNumber: 1 } })
    const reopened = show(later, [], { assessment: { phase: "reopened", pathway: "MANAGED", versionNumber: 2 } })
    expect(step(stale, "ASSESSMENT").state).toBe("NEEDS_ATTENTION")
    expect(step(stale, "ASSESSMENT").known.join(" ")).toMatch(/no longer matches/)
    expect(step(reopened, "ASSESSMENT").state).toBe("NEEDS_ATTENTION")
    expect(step(reopened, "ASSESSMENT").known.join(" ")).toMatch(/reopened/)
    expect(completed(stale)).not.toContain("ASSESSMENT")
    expect(completed(reopened)).not.toContain("ASSESSMENT")
  })

  it("does not repair an approval that disagrees with the evidence projection", () => {
    const journey = show(
      { technicalStage: "ASSESSMENT_READY", evidence: { requests: [], versions: [] } },
      [],
      { assessment: approved },
    )
    expect(step(journey, "ASSESSMENT").state).toBe("NEEDS_ATTENTION")
    expect(step(journey, "ASSESSMENT").known.join(" ")).toMatch(/disagree/)
    expect(step(journey, "ASSESSMENT").state).not.toBe("COMPLETED")
  })
})

describe("quote acceptance", () => {
  const approved: AssessmentJudgement = { phase: "approved", pathway: "GUIDED", versionNumber: 1 }
  const atQuote = {
    technicalStage: "SERVICE_SELECTION" as const,
    serviceTrack: "GUIDED" as const,
  }

  it("finishes only from one accepted quote on a complete list", () => {
    const accepted = show({
      ...atQuote,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    })
    expect(step(accepted, "QUOTE_ACCEPTANCE").state).toBe("COMPLETED")
    expect(step(accepted, "QUOTE_ACCEPTANCE").known.join(" ")).toMatch(/does not activate the service/)
    expect(step(accepted, "QUOTE_ACCEPTANCE").known.join(" ")).toMatch(/does not take a payment/)
    expect(step(accepted, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")

    const declined = show({ ...atQuote, commercial: { complete: true, quotes: [quote({ status: "DECLINED" })] } })
    const expired = show({ ...atQuote, commercial: { complete: true, quotes: [quote({ status: "EXPIRED" })] } })
    expect(step(declined, "QUOTE_ACCEPTANCE").state).toBe("NEEDS_ATTENTION")
    expect(step(expired, "QUOTE_ACCEPTANCE").state).toBe("NEEDS_ATTENTION")
    expect(completed(declined)).not.toContain("QUOTE_ACCEPTANCE")
    expect(completed(expired)).not.toContain("QUOTE_ACCEPTANCE")
    expect(step(declined, "QUOTE_ACCEPTANCE").missing.join(" ")).toMatch(/purchasing establishment/)
    expect(step(expired, "QUOTE_ACCEPTANCE").missing.join(" ")).toMatch(/tax eligibility/)

    const tied = show({
      ...atQuote,
      commercial: {
        complete: true,
        quotes: [
          quote({ status: "ACCEPTED", orderId: "order-1" }),
          quote({ id: "quote-2", status: "ACCEPTED", orderId: "order-2" }),
        ],
      },
    })
    expect(step(tied, "QUOTE_ACCEPTANCE").state).toBe("NEEDS_ATTENTION")
    expect(step(tied, "QUOTE_ACCEPTANCE").state).not.toBe("COMPLETED")
    expect(step(tied, "QUOTE_ACCEPTANCE").known.join(" ")).toMatch(/same relevance/)
  })

  it("shows the approved pathway and does not treat it as acceptance or a track change", () => {
    const journey = show({
      ...atQuote,
      serviceTrack: "UNDECIDED",
      commercial: { complete: true, quotes: [quote()] },
    }, [], { assessment: approved })
    const quoteStep = step(journey, "QUOTE_ACCEPTANCE")
    expect(quoteStep.state).not.toBe("COMPLETED")
    expect(quoteStep.known.join(" ")).toMatch(/recommends Guided/)
    expect(quoteStep.known.join(" ")).toMatch(/not the customer's agreement/)
    expect(quoteStep.known.join(" ")).toMatch(/does not change the selected service track/)
    expect(journey.serviceTrack).toBe("UNDECIDED")
    expect(quoteStep.missing.join(" ")).toMatch(/tax eligibility/)
    expect(journey.blockers.find(item => item.code === "SERVICE_TRACK_UNDECIDED")?.explanation).toMatch(/does not select the track/)
    expect(journey.blockers.find(item => item.code === "SERVICE_TRACK_UNDECIDED")?.explanation).not.toMatch(/Nothing commercial can be raised/)

    const stale = show({
      ...atQuote,
      commercial: { complete: true, quotes: [] },
    }, [], { assessment: { phase: "stale", pathway: "GUIDED", versionNumber: 1 } })
    expect(step(stale, "QUOTE_ACCEPTANCE").known.join(" ")).not.toMatch(/recommends Guided/)
    expect(step(stale, "QUOTE_ACCEPTANCE").state).not.toBe("COMPLETED")
  })
})

describe("an accepted order before the stored track is updated", () => {
  it("keeps Step 10 locked and names the accepted service on Step 7", () => {
    const journey = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "UNDECIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order()] },
    })
    expect(step(journey, "QUOTE_ACCEPTANCE").state).toBe("COMPLETED")
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("CURRENT")
    expect(step(journey, "SERVICE_ACTIVATION").whoMustAct).toMatch(/already chosen/)
    expect(step(journey, "SERVICE_ACTIVATION").whoMustAct).not.toMatch(/still have to choose/)
    expect(step(journey, "OUTCOME_BILLING").state).toBe("LOCKED")
    expect(step(journey, "OUTCOME_BILLING").state).not.toBe("NEEDS_ATTENTION")
    expect(journey.serviceTrack).toBe("UNDECIDED")
    expect(journey.projectedService).toEqual({
      persisted: false,
      model: "UPFRONT",
      summary: "An accepted upfront order is on file. The stored service track has not been updated.",
    })
  })

  it("opens Continue from Initial Review once the earlier steps are already complete", () => {
    const journey = show({
      technicalStage: "INITIAL_REVIEW",
      serviceTrack: "UNDECIDED",
      caseStatus: "RECEIVED",
      evidence: reviewedEvidence,
      communications: [delivered()],
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order()] },
    }, [intake("REVIEWED"), screening()], { assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 } })
    expect(completed(journey)).toEqual([
      "CASE_RECEIVED",
      "VERIFICATION",
      "REQUEST_DOCUMENTS",
      "EVIDENCE_REVIEW",
      "ASSESSMENT",
      "QUOTE_ACCEPTANCE",
    ])
    expect(journey.focusStepId).toBe("SERVICE_ACTIVATION")
    expect(step(journey, "SERVICE_ACTIVATION").state).toBe("CURRENT")
    expect(step(journey, "SERVICE_ACTIVATION").whoMustAct).toMatch(/already chosen/)
    expect(step(journey, "OUTCOME_BILLING").state).toBe("LOCKED")
    expect(journey.serviceTrack).toBe("UNDECIDED")
    expect(journey.projectedService?.persisted).toBe(false)
  })

  it("still marks Step 10 when the undecided case does not have one coherent order", () => {
    const several = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "UNDECIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order(), order({ orderId: "order-2" })] },
    })
    expect(step(several, "OUTCOME_BILLING").state).toBe("NEEDS_ATTENTION")
    const unpaidReceipt = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "UNDECIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ obligationState: "PAID", receiptRecorded: false })] },
    })
    expect(step(unpaidReceipt, "OUTCOME_BILLING").state).toBe("NEEDS_ATTENTION")
  })
})

describe("service activation", () => {
  const guidedPaid = {
    technicalStage: "PREPARATION" as const,
    serviceTrack: "GUIDED" as const,
    commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    payment: { complete: true, orders: [order({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] },
  }

  it("settles Guided activation only from a paid accepted order with a receipt", () => {
    const settled = show(guidedPaid)
    expect(step(settled, "SERVICE_ACTIVATION").state).toBe("COMPLETED")
    expect(step(settled, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/receipt/)
    const noReceipt = show({
      ...guidedPaid,
      payment: { complete: true, orders: [order({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT" })] },
    })
    const failed = show({
      ...guidedPaid,
      technicalStage: "PAYMENT_REQUIRED",
      payment: { complete: true, orders: [order({ obligationState: "FAILED" })] },
    })
    const quoteOnly = show({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
    })
    expect(step(noReceipt, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(failed, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(quoteOnly, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(completed(noReceipt)).not.toContain("SERVICE_ACTIVATION")
    expect(completed(failed)).not.toContain("SERVICE_ACTIVATION")
  })

  it("keeps a reopened Guided case settled only while the payment record still is", () => {
    const reopened = show({ ...guidedPaid, reopened: true })
    expect(step(reopened, "SERVICE_ACTIVATION").state).toBe("COMPLETED")
    expect(step(reopened, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/reopened/)
    const conflict = show(guidedPaid, [], { recordConflict: true })
    expect(step(conflict, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(conflict, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/disagree/)
  })

  it("does not activate Managed work from a saved card, an expired link, or a revoked permission", () => {
    const base = {
      technicalStage: "AUTHORIZATION_REQUIRED" as const,
      serviceTrack: "MANAGED" as const,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true })] },
    }
    const cardOnly = show(base)
    const expired = show({
      ...base,
      customerActions: [{ id: "action-1", kind: "AGREEMENT_ACCEPTANCE", agreementKind: "SERVICE_AGREEMENT", status: "OPEN", expiresAt: PAST }],
    })
    const revoked = show({
      ...base,
      authorization: fullyAuthorised({ membershipStatus: "revoked", businessAuthorityVerified: false, authorizationReady: false }),
    })
    expect(step(cardOnly, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(step(cardOnly, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/saved card is not an activation requirement/i)
    expect(step(expired, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(expired, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/expired link is not acceptance/)
    expect(step(revoked, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(completed(cardOnly)).not.toContain("SERVICE_ACTIVATION")
    expect(completed(expired)).not.toContain("SERVICE_ACTIVATION")
    expect(completed(revoked)).not.toContain("SERVICE_ACTIVATION")
  })

  it("does not activate when the accepted quote names a different order", () => {
    const paidGuided = {
      ...guidedPaid,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-2" })] },
    }
    const guidedMismatch = show(paidGuided)
    expect(step(guidedMismatch, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(guidedMismatch, "SERVICE_ACTIVATION").state).not.toBe("COMPLETED")
    expect(step(guidedMismatch, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/records disagree/)
    expect(step(guidedMismatch, "SERVICE_ACTIVATION").whoMustAct).toMatch(/reconciles the quote and the service order/)
    expect(completed(guidedMismatch)).not.toContain("SERVICE_ACTIVATION")

    const guidedMissing = show({
      ...guidedPaid,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: null })] },
    })
    expect(step(guidedMissing, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(guidedMissing, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/records disagree/)
    expect(completed(guidedMissing)).not.toContain("SERVICE_ACTIVATION")

    const guidedSeveral = show({
      ...guidedPaid,
      payment: { complete: true, orders: [
        order({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true }),
        order({ orderId: "order-2", obligationState: "DUE" }),
      ] },
    })
    expect(step(guidedSeveral, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(guidedSeveral, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/More than one upfront order/)
    expect(completed(guidedSeveral)).not.toContain("SERVICE_ACTIVATION")

    const managedBase = {
      technicalStage: "AUTHORIZATION_REQUIRED" as const,
      serviceTrack: "MANAGED" as const,
      payment: { complete: true, orders: [order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
      authorization: fullyAuthorised(),
    }
    const managedMismatch = show({
      ...managedBase,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-2" })] },
    })
    expect(step(managedMismatch, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(managedMismatch, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/do not refer to the same order/)
    expect(completed(managedMismatch)).not.toContain("SERVICE_ACTIVATION")

    const managedMissing = show({
      ...managedBase,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: null })] },
    })
    expect(step(managedMissing, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(completed(managedMissing)).not.toContain("SERVICE_ACTIVATION")

    const managedSeveral = show({
      ...managedBase,
      commercial: { complete: true, quotes: [quote({ status: "ACCEPTED", orderId: "order-1" })] },
      payment: { complete: true, orders: [
        order({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null }),
        order({ orderId: "order-2", paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null }),
      ] },
    })
    expect(step(managedSeveral, "SERVICE_ACTIVATION").state).toBe("NEEDS_ATTENTION")
    expect(step(managedSeveral, "SERVICE_ACTIVATION").known.join(" ")).toMatch(/More than one success-fee order/)
    expect(completed(managedSeveral)).not.toContain("SERVICE_ACTIVATION")

    const stillSettled = show(guidedPaid)
    expect(step(stillSettled, "SERVICE_ACTIVATION").state).toBe("COMPLETED")
  })
})
