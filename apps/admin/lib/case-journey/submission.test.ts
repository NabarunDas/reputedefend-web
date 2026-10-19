import { describe, expect, it } from "vitest"
import type { CaseFlowFacts } from "../case-flow/model"
import type { Submission } from "../cases/model"
import { buildJourneySubmissionPanel } from "./submission"

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const WHEN = "2026-06-01T12:00:00.000Z"

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "READY_TO_SUBMIT",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["WAITING_GOOGLE"],
    reopened: false,
    tasks: [],
    submissions: [],
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
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
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
    result: null,
    resultNote: null,
    ...overrides,
  }
}

function projected(overrides: Partial<CaseFlowFacts["submissions"][number]> = {}): CaseFlowFacts["submissions"][number] {
  return { id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: null, ...overrides }
}

describe("submission tracking", () => {
  it("offers a record command only when nothing has been submitted and the stage allows it", () => {
    const view = buildJourneySubmissionPanel({
      facts: facts(),
      submissions: [],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "READY_TO_SUBMIT",
    })
    expect(view.headline).toBe("Not submitted")
    expect(view.commands).toEqual({ record: true, resolveIds: [] })
    expect(view.requirements.find(item => item.label === "Submission attempt")?.state).toBe("Not met")
    expect(view.detail).toMatch(/does not submit anything to Google/)
    expect(view.who).toMatch(/customer has already completed/)
  })

  it("keeps an open attempt waiting and withholds another recording", () => {
    const view = buildJourneySubmissionPanel({
      facts: facts({ submissions: [projected()], technicalStage: "WAITING_GOOGLE" }),
      submissions: [attempt()],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "WAITING_GOOGLE",
    })
    expect(view.headline).toBe("Submitted, awaiting Google's decision")
    expect(view.attempts[0]).toMatchObject({ reference: "GOOGLE-123", party: "the customer", channel: "Google appeals tool" })
    expect(view.commands).toEqual({ record: false, resolveIds: ["submission-1"] })
    expect(view.requirements.find(item => item.label === "Decision or withdrawal")?.state).toBe("Not met")
  })

  it("treats a decision and a withdrawal as different finished results", () => {
    const decided = buildJourneySubmissionPanel({
      facts: facts({ submissions: [projected({ result: "DECIDED" })] }),
      submissions: [attempt({ result: "DECIDED", resultNote: "The listing was restored." })],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "OUTCOME_REVIEW",
    })
    expect(decided.headline).toBe("Decision recorded")
    expect(decided.commands).toEqual({ record: false, resolveIds: [] })
    expect(decided.who).toMatch(/later steps/)

    const withdrawn = buildJourneySubmissionPanel({
      facts: facts({ serviceTrack: "MANAGED", submissions: [projected({ actor: "ADMIN", result: "WITHDRAWN" })] }),
      submissions: [attempt({ actor: "ADMIN", track: "MANAGED", result: "WITHDRAWN", resultNote: "The customer stopped the attempt." })],
      status: "UNDER_REVIEW",
      track: "MANAGED",
      stage: "FURTHER_REVIEW",
    })
    expect(withdrawn.headline).toBe("Withdrawn")
    expect(withdrawn.attempts[0]?.party).toBe("ProfileRelaunch")
    expect(withdrawn.commands).toEqual({ record: true, resolveIds: [] })
    expect(withdrawn.who).toMatch(/withdrawn/)
  })

  it("does not finish while one of several attempts is still open", () => {
    const rows = [
      attempt({ result: "DECIDED", resultNote: "First decision." }),
      attempt({ id: "submission-2", reference: "GOOGLE-456", submittedAt: "2026-06-02T12:00:00.000Z" }),
    ]
    const view = buildJourneySubmissionPanel({
      facts: facts({
        submissions: [
          projected({ result: "DECIDED" }),
          projected({ id: "submission-2", submittedAt: "2026-06-02T12:00:00.000Z" }),
        ],
      }),
      submissions: rows,
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "FURTHER_REVIEW",
    })
    expect(view.headline).toBe("Submitted, awaiting Google's decision")
    expect(view.commands).toEqual({ record: false, resolveIds: ["submission-2"] })
    expect(view.requirements.find(item => item.label === "Decision or withdrawal")?.state).toBe("Not met")
  })

  it("withholds commands when the case record conflicts, the party is wrong, or the stage does not allow recording", () => {
    const conflict = buildJourneySubmissionPanel({
      facts: facts({ submissions: [projected({ result: "DECIDED" })] }),
      submissions: [attempt()],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "FURTHER_REVIEW",
    })
    expect(conflict.headline).toBe("Submission records disagree")
    expect(conflict.commands).toBeNull()
    expect(conflict.requirements.every(item => item.state === "Not met")).toBe(true)

    const party = buildJourneySubmissionPanel({
      facts: facts({ submissions: [projected({ actor: "ADMIN" })] }),
      submissions: [attempt({ actor: "ADMIN" })],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "FURTHER_REVIEW",
    })
    expect(party.commands).toBeNull()
    expect(party.notices.join(" ")).toMatch(/records disagree/)

    const early = buildJourneySubmissionPanel({
      facts: facts(),
      submissions: [],
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "PREPARATION",
    })
    expect(early.commands).toEqual({ record: false, resolveIds: [] })
    expect(early.notices.join(" ")).toMatch(/stages the case command already allows/)

    const undecided = buildJourneySubmissionPanel({
      facts: facts({ serviceTrack: "UNDECIDED" }),
      submissions: [],
      status: "UNDER_REVIEW",
      track: "UNDECIDED",
      stage: "READY_TO_SUBMIT",
    })
    expect(undecided.commands).toEqual({ record: false, resolveIds: [] })
    expect(undecided.notices.join(" ")).toMatch(/track is not selected/)

    const missing = buildJourneySubmissionPanel({
      facts: facts(),
      submissions: null,
      status: "UNDER_REVIEW",
      track: "GUIDED",
      stage: "READY_TO_SUBMIT",
    })
    expect(missing.commands).toBeNull()
    expect(missing.headline).toBe("Submission records disagree")
  })
})
