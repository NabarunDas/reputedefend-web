import { describe, expect, it } from "vitest"
import type { CaseFlowEvidenceVersionFact, CaseFlowFacts } from "../case-flow/model"
import type { EligiblePackVersion, PreparedPack, PreparedPackCase } from "../packs/model"
import { buildJourneyPreparationPanel } from "./preparation"

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const VERSION_ID = "66666666-6666-4666-8666-666666666666"
const DOCUMENT_ID = "77777777-7777-4777-8777-777777777777"

function version(overrides: Partial<CaseFlowEvidenceVersionFact> = {}): CaseFlowEvidenceVersionFact {
  return {
    documentId: DOCUMENT_ID,
    versionId: VERSION_ID,
    evidenceRequestId: "request-1",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "ACCEPTED",
    ...overrides,
  }
}

function facts(packs: CaseFlowFacts["packs"], versions: CaseFlowEvidenceVersionFact[] = [version()]): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "PREPARATION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["READY_TO_SUBMIT"],
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
    evidence: { requests: [], versions },
    packs,
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
  }
}

function item(versionId = VERSION_ID) {
  return {
    id: "item-1",
    documentId: DOCUMENT_ID,
    versionId,
    position: 1,
    documentTitle: "Invoice",
    originalFilename: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    versionNumber: 1,
    customerVisible: true,
  }
}

function pack(overrides: Partial<PreparedPack> = {}): PreparedPack {
  return {
    id: "pack-1",
    packNumber: 1,
    status: "DRAFT",
    approvalNote: "",
    createdAt: "2026-06-01T12:00:00.000Z",
    approvedAt: null,
    recordVersion: 2,
    published: false,
    items: [item()],
    ...overrides,
  }
}

function eligible(overrides: Partial<EligiblePackVersion> = {}): EligiblePackVersion {
  return {
    documentId: DOCUMENT_ID,
    versionId: VERSION_ID,
    versionNumber: 1,
    documentTitle: "Invoice",
    originalFilename: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    ...overrides,
  }
}

function loaded(packs: PreparedPack[], versions: EligiblePackVersion[] = []): PreparedPackCase {
  return { caseId: CASE_ID, packs, eligible: versions }
}

describe("prepared pack panel", () => {
  it("offers the existing commands only when the pack record matches the projection", () => {
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1 }], eligibleCount: 1 }),
      packs: loaded([pack()], [eligible()]),
      recordsConflict: false,
    })
    expect(view.headline).toBe("Prepared pack needs approval")
    expect(view.commands?.packs[0]?.id).toBe("pack-1")
    expect(view.commands?.eligible).toHaveLength(1)
    expect(view.requirements.find(item => item.label === "Approval")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Publication")?.state).toBe("Not met")
    expect(view.detail).toMatch(/does not submit anything to Google/)
  })

  it("drops unscanned, rejected, superseded and unlinked files", () => {
    const unsafe = [
      eligible({ versionId: "scan", documentId: "document-scan" }),
      eligible({ versionId: "rejected", documentId: "document-rejected" }),
      eligible({ versionId: "replaced", documentId: "document-replaced" }),
      eligible({ versionId: "unlinked", documentId: "document-unlinked" }),
      eligible(),
    ]
    const view = buildJourneyPreparationPanel({
      facts: facts(
        { packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1 }], eligibleCount: unsafe.length },
        [
          version({ versionId: "scan", documentId: "document-scan", scanStatus: "PENDING" }),
          version({ versionId: "rejected", documentId: "document-rejected", reviewStatus: "REJECTED" }),
          version({ versionId: "replaced", documentId: "document-replaced", reviewStatus: "SUPERSEDED" }),
          version({ versionId: "unlinked", documentId: "document-unlinked", evidenceRequestId: null }),
          version(),
        ],
      ),
      packs: loaded([pack()], unsafe),
      recordsConflict: false,
    })
    expect(view.commands?.eligible.map(item => item.versionId)).toEqual([VERSION_ID])
    expect(view.notices.join(" ")).toMatch(/not offered/)
  })

  it("withholds commands when the pack record is missing or does not match", () => {
    const projected = { packs: [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }], eligibleCount: 0 }
    const missing = buildJourneyPreparationPanel({ facts: facts(projected), packs: null, recordsConflict: false })
    expect(missing.commands).toBeNull()
    expect(missing.headline).toBe("Pack records disagree")

    const otherStatus = buildJourneyPreparationPanel({
      facts: facts(projected),
      packs: loaded([pack({ status: "STALE", items: [item()] })]),
      recordsConflict: false,
    })
    expect(otherStatus.commands).toBeNull()
    expect(otherStatus.notices.join(" ")).toMatch(/records disagree/)
    expect(otherStatus.who).toMatch(/reconciles the pack records/)
  })

  it("keeps a stale pack unfinished and a superseded pack as history", () => {
    const stale = buildJourneyPreparationPanel({
      facts: facts({ packs: [{ id: "pack-1", packNumber: 1, status: "STALE", published: false, everPublished: true, itemCount: 1 }], eligibleCount: 0 }),
      packs: loaded([pack({ status: "STALE", approvedAt: "2026-06-02T12:00:00.000Z" })]),
      recordsConflict: false,
    })
    expect(stale.headline).toBe("Prepared pack is stale")
    expect(stale.commands).not.toBeNull()
    expect(stale.requirements.find(item => item.label === "Current pack")?.detail).toMatch(/replaced by a new draft/)

    const history = buildJourneyPreparationPanel({
      facts: facts({
        packs: [
          { id: "pack-1", packNumber: 1, status: "SUPERSEDED", published: false, everPublished: true, itemCount: 1 },
          { id: "pack-2", packNumber: 2, status: "APPROVED", published: true, everPublished: true, itemCount: 1 },
        ],
        eligibleCount: 0,
      }),
      packs: loaded([
        pack({ status: "SUPERSEDED", published: false }),
        pack({ id: "pack-2", packNumber: 2, status: "APPROVED", published: true, approvedAt: "2026-06-03T12:00:00.000Z" }),
      ]),
      recordsConflict: false,
    })
    expect(history.headline).toBe("Prepared pack is current")
    expect(history.packs.map(item => item.state)).toEqual(["Superseded", "Published"])
    expect(history.packs[0]?.history).toBe(true)
  })
})
