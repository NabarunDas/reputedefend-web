import { describe, expect, it } from "vitest"
import type { CaseFlowEvidenceVersionFact, CaseFlowFacts } from "../case-flow/model"
import type { EligiblePackVersion, PreparedPack, PreparedPackCase } from "../packs/model"
import { currentWorkingPack } from "../packs/roles"
import { buildJourneyPreparationPanel, packReadyNotification, preparationReadiness } from "./preparation"

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
    expect(view.headline).toBe("Choose one completed statement and one set of customer instructions")
    expect(view.who).toMatch(/Approval stays closed until those roles are set/)
    expect(view.commands?.packs[0]?.id).toBe("pack-1")
    expect(view.commands?.eligible).toHaveLength(1)
    expect(view.requirements.find(item => item.label === "Approval")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Publication")?.state).toBe("Not met")
    expect(view.detail).toMatch(/does not submit anything to Google/)
    expect(view.packs[0]?.history).toBe(false)
  })

  it("keeps approval available once a Guided draft has one statement and one set of instructions", () => {
    const statement = { ...item(), id: "item-1", role: "DELIVERABLE" as const }
    const instructions = { ...item("99999999-9999-4999-8999-999999999999"), id: "item-2", documentId: "88888888-8888-4888-8888-888888888888", documentTitle: "How to submit", originalFilename: "instructions.pdf", role: "INSTRUCTIONS" as const }
    const evidence = { ...item("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), id: "item-3", documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "EVIDENCE" as const }
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 3 }], eligibleCount: 0 }),
      packs: loaded([pack({ items: [statement, instructions, evidence] })]),
      recordsConflict: false,
    })
    expect(view.headline).toBe("Approve the completed pack")
    expect(view.guided).toBe(true)
    expect(view.commands).not.toBeNull()
  })

  it("does not apply Guided role counts to a Managed draft", () => {
    const view = buildJourneyPreparationPanel({
      facts: { ...facts({ packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1 }], eligibleCount: 0 }), serviceTrack: "MANAGED" },
      packs: loaded([pack()]),
      recordsConflict: false,
    })
    expect(view.headline).toBe("Approve the completed pack")
    expect(view.guided).toBe(false)
  })

  it("marks an older approved pack as history while a newer draft is current", () => {
    const view = buildJourneyPreparationPanel({
      facts: facts({
        packs: [
          { id: "pack-1", packNumber: 1, status: "APPROVED", published: false, everPublished: false, itemCount: 1 },
          { id: "pack-2", packNumber: 2, status: "DRAFT", published: false, everPublished: false, itemCount: 1 },
        ],
        eligibleCount: 0,
      }),
      packs: loaded([
        pack({ status: "APPROVED", approvedAt: "2026-06-02T12:00:00.000Z" }),
        pack({ id: "pack-2", packNumber: 2, status: "DRAFT", createdAt: "2026-06-03T12:00:00.000Z" }),
      ]),
      recordsConflict: false,
    })
    expect(view.headline).toBe("Choose one completed statement and one set of customer instructions")
    expect(view.packs.map(row => row.history)).toEqual([true, false])
    expect(currentWorkingPack(view.commands?.packs ?? [])?.id).toBe("pack-2")
  })

  it("keeps a newer stale pack current when an older pack is still approved", () => {
    const projected = [
      { id: "pack-1", packNumber: 1, status: "APPROVED" as const, published: false, everPublished: false, itemCount: 1 },
      { id: "pack-2", packNumber: 2, status: "STALE" as const, published: false, everPublished: true, itemCount: 1 },
    ]
    const rows = [
      pack({ status: "APPROVED", approvedAt: "2026-06-02T12:00:00.000Z" }),
      pack({ id: "pack-2", packNumber: 2, status: "STALE", createdAt: "2026-06-03T12:00:00.000Z" }),
    ]
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: projected, eligibleCount: 0 }),
      packs: loaded(rows),
      recordsConflict: false,
    })
    expect(view.headline).toBe("Replace the stale pack before sending it")
    expect(view.packs.map(row => [row.id, row.history])).toEqual([["pack-1", true], ["pack-2", false]])
    expect(preparationReadiness(projected).current?.id).toBe("pack-2")
    expect(currentWorkingPack(rows)?.id).toBe(preparationReadiness(projected).current?.id)
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
    expect(view.requirements.find(item => item.label === "Eligible evidence")?.detail).toMatch(/staff document does not need an evidence request/)
  })

  it("offers a staff document that has no evidence request", () => {
    const staff = eligible({ versionId: "staff-letter", documentId: "document-staff" })
    const view = buildJourneyPreparationPanel({
      facts: facts(
        { packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 0 }], eligibleCount: 1 },
        [version({ versionId: "staff-letter", documentId: "document-staff", evidenceRequestId: null, submissionSource: "ADMIN" })],
      ),
      packs: loaded([pack({ items: [] })], [staff]),
      recordsConflict: false,
    })
    expect(view.commands?.eligible.map(item => item.versionId)).toEqual(["staff-letter"])
    expect(view.headline).toBe("Add the statement, evidence and customer instructions")
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
    expect(stale.headline).toBe("Replace the stale pack before sending it")
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
    expect(history.headline).toBe("Available in portal; email not sent")
    expect(history.packs.map(item => item.state)).toEqual(["Superseded", "Published"])
    expect(history.packs[0]?.history).toBe(true)
  })

  it("does not call a pack current while another approved pack is still published", () => {
    const rows = [
      { id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 },
      { id: "pack-2", packNumber: 2, status: "APPROVED", published: true, everPublished: true, itemCount: 1 },
    ]
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: rows, eligibleCount: 0 }),
      packs: loaded([
        pack({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z" }),
        pack({ id: "pack-2", packNumber: 2, status: "APPROVED", published: true, approvedAt: "2026-06-03T12:00:00.000Z" }),
      ]),
      recordsConflict: false,
    })
    const readiness = preparationReadiness(rows)
    expect(readiness.ready).toBe(false)
    expect(readiness.otherPublished).toBe(true)
    expect(view.headline).toBe("Another pack is still published")
    expect(view.headline).not.toBe("The completed pack is available to the customer")
    expect(view.requirements.find(item => item.label === "Publication")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Current pack")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Current pack")?.detail).toMatch(/still published/)
    expect(view.notices.join(" ")).toMatch(/earlier pack is still published/)
    expect(view.who).toMatch(/evidence workspace/)
    expect(view.commands).toBeNull()
  })

  it("withholds pack commands when an earlier pack stays published beside a newer draft", () => {
    const rows = [
      { id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 },
      { id: "pack-2", packNumber: 2, status: "DRAFT", published: false, everPublished: false, itemCount: 1 },
    ]
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: rows, eligibleCount: 0 }),
      packs: loaded([
        pack({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z" }),
        pack({ id: "pack-2", packNumber: 2, status: "DRAFT" }),
      ]),
      recordsConflict: false,
    })
    expect(preparationReadiness(rows).ready).toBe(false)
    expect(view.headline).toBe("Another pack is still published")
    expect(view.commands).toBeNull()
    expect(view.who).toMatch(/evidence workspace/)
    expect(view.packs.map(row => row.history)).toEqual([true, false])
    expect(currentWorkingPack([
      pack({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z" }),
      pack({ id: "pack-2", packNumber: 2, status: "DRAFT" }),
    ])?.id).toBe("pack-2")
  })

  it("treats superseded history as read-only and a single published pack as current", () => {
    const current = { id: "pack-2", packNumber: 2, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }
    const rows = [
      { id: "pack-1", packNumber: 1, status: "SUPERSEDED", published: false, everPublished: true, itemCount: 1 },
      current,
    ]
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: rows, eligibleCount: 0 }),
      packs: loaded([
        pack({ status: "SUPERSEDED", published: false }),
        pack({ id: "pack-2", packNumber: 2, status: "APPROVED", published: true, approvedAt: "2026-06-03T12:00:00.000Z" }),
      ]),
      recordsConflict: false,
    })
    expect(preparationReadiness(rows).ready).toBe(true)
    expect(view.headline).toBe("Available in portal; email not sent")
    expect(view.who).toBe("Available in portal; email not sent.")
    expect(view.requirements.find(item => item.label === "Customer notification")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Publication")?.state).toBe("Met")
    expect(view.requirements.find(item => item.label === "Current pack")?.state).toBe("Met")
    expect(view.commands?.packs.map(item => item.id)).toEqual(["pack-1", "pack-2"])

    const alone = [current]
    const single = buildJourneyPreparationPanel({
      facts: facts({ packs: alone, eligibleCount: 0 }),
      packs: loaded([pack({ id: "pack-2", packNumber: 2, status: "APPROVED", published: true, approvedAt: "2026-06-03T12:00:00.000Z" })]),
      recordsConflict: false,
    })
    expect(preparationReadiness(alone).ready).toBe(true)
    expect(single.headline).toBe("Available in portal; email not sent")
    expect(single.commands).not.toBeNull()
  })

  it("withholds pack commands when authority records disagree", () => {
    const rows = [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }]
    const view = buildJourneyPreparationPanel({
      facts: facts({ packs: rows, eligibleCount: 0 }),
      packs: loaded([pack({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z" })]),
      recordsConflict: true,
    })
    expect(preparationReadiness(rows, { recordsConflict: true }).ready).toBe(false)
    expect(view.headline).toBe("Case records disagree")
    expect(view.headline).not.toBe("The completed pack is available to the customer")
    expect(view.requirements.find(item => item.label === "Publication")?.state).toBe("Not met")
    expect(view.requirements.find(item => item.label === "Current pack")?.state).toBe("Not met")
    expect(view.notices.join(" ")).toMatch(/authority records disagree/)
    expect(view.who).toMatch(/authority records/)
    expect(view.commands).toBeNull()
  })

  it("keeps publication separate from queued, accepted, delivered and unknown mail", () => {
    const rows = [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }]
    const packs = loaded([pack({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z" })])
    const show = (deliveryStatus: string | null, lifecycle = "QUEUED") => buildJourneyPreparationPanel({
      facts: {
        ...facts({ packs: rows, eligibleCount: 0 }),
        communications: [{
          id: "mail-1",
          templateKey: "GUIDED_PACK_READY",
          lifecycle,
          deliveryStatus,
          legacyStatus: null,
          draftedAt: "2026-06-02T12:00:00.000Z",
        }],
      },
      packs,
      recordsConflict: false,
    })
    expect(show("NONE").headline).toBe("Pack available; notification queued")
    expect(show("NONE").who).toBe("The notification is queued. Queued is not delivered.")
    expect(show("PROVIDER_ACCEPTED").headline).toBe("Pack available; the provider accepted the notification")
    expect(show("PROVIDER_ACCEPTED").requirements.find(item => item.label === "Customer notification")?.state).toBe("Not met")
    expect(show("DELIVERED").headline).toBe("Pack available; the provider reported delivery")
    expect(show("DELIVERED").who).toMatch(/not a download/)
    expect(show("BOUNCED").headline).toBe("Pack available; the notification was not delivered")
    expect(show("ACCEPTANCE_UNKNOWN").headline).toBe("Pack available; provider acceptance is unknown")
    expect(show("ACCEPTANCE_UNKNOWN").who).toMatch(/another copy was not sent/)
    expect(packReadyNotification([]).headline).toBe("Available in portal; email not sent")
  })
})

const ineligibleNotice = /A listed file is not an accepted, validated, clean version/

describe("eligible accepted evidence", () => {
  const draftPack = { id: "pack-1", packNumber: 1, status: "DRAFT" as const, published: false, everPublished: false, itemCount: 0 }

  function shown(versions: CaseFlowEvidenceVersionFact[], listed: EligiblePackVersion[]) {
    return buildJourneyPreparationPanel({
      facts: facts({ packs: [draftPack], eligibleCount: listed.length }, versions),
      packs: loaded([pack({ items: [] })], listed),
      recordsConflict: false,
    })
  }

  it("offers an accepted staff upload with no request and a customer upload linked to its request", () => {
    const staff = eligible({ versionId: "staff-letter", documentId: "document-staff", documentTitle: "How to submit", originalFilename: "How to submit.docx" })
    const customer = eligible({ versionId: "customer-letter", documentId: "document-customer", documentTitle: "Ownership letter", originalFilename: "ownership.pdf" })
    const view = shown(
      [
        version({ versionId: "staff-letter", documentId: "document-staff", evidenceRequestId: null, submissionSource: "ADMIN" }),
        version({ versionId: "customer-letter", documentId: "document-customer", evidenceRequestId: "request-1", submissionSource: "CUSTOMER" }),
      ],
      [staff, customer],
    )
    expect(view.commands?.eligible.map(item => item.originalFilename)).toEqual(["How to submit.docx", "ownership.pdf"])
    expect(view.notices.join(" ")).not.toMatch(ineligibleNotice)
    expect(view.requirements.find(item => item.label === "Eligible evidence")?.state).toBe("Met")
  })

  it("excludes unscanned, invalid, rejected, superseded, missing-source and incorrectly linked files", () => {
    const names = ["scan", "invalid", "rejected", "replaced", "missing-source", "unlinked-customer", "wrong-document"] as const
    const listed = names.map(name => eligible({ versionId: name, documentId: name === "wrong-document" ? "document-listed" : `document-${name}` }))
    const staff = eligible({ versionId: "staff-letter", documentId: "document-staff" })
    const view = shown(
      [
        version({ versionId: "scan", documentId: "document-scan", submissionSource: "ADMIN", evidenceRequestId: null, scanStatus: "PENDING" }),
        version({ versionId: "invalid", documentId: "document-invalid", submissionSource: "ADMIN", evidenceRequestId: null, validationStatus: "INVALID" }),
        version({ versionId: "rejected", documentId: "document-rejected", submissionSource: "ADMIN", evidenceRequestId: null, reviewStatus: "REJECTED" }),
        version({ versionId: "replaced", documentId: "document-replaced", submissionSource: "ADMIN", evidenceRequestId: null, reviewStatus: "SUPERSEDED" }),
        version({ versionId: "missing-source", documentId: "document-missing-source", submissionSource: null, evidenceRequestId: null }),
        version({ versionId: "unlinked-customer", documentId: "document-unlinked-customer", submissionSource: "CUSTOMER", evidenceRequestId: null }),
        version({ versionId: "wrong-document", documentId: "document-actual", submissionSource: "ADMIN", evidenceRequestId: null }),
        version({ versionId: "staff-letter", documentId: "document-staff", evidenceRequestId: null, submissionSource: "ADMIN" }),
      ],
      [...listed, staff],
    )
    expect(view.commands?.eligible.map(item => item.versionId)).toEqual(["staff-letter"])
    expect(view.notices.join(" ")).toMatch(ineligibleNotice)
  })

  it("warns about ineligible files only when a listed file fails the same checks", () => {
    const clean = shown(
      [version({ versionId: "staff-letter", documentId: "document-staff", evidenceRequestId: null, submissionSource: "ADMIN" })],
      [eligible({ versionId: "staff-letter", documentId: "document-staff" })],
    )
    expect(clean.notices.join(" ")).not.toMatch(ineligibleNotice)

    const mixed = shown(
      [
        version({ versionId: "staff-letter", documentId: "document-staff", evidenceRequestId: null, submissionSource: "ADMIN" }),
        version({ versionId: "scan", documentId: "document-scan", submissionSource: "ADMIN", evidenceRequestId: null, scanStatus: "PENDING" }),
      ],
      [
        eligible({ versionId: "staff-letter", documentId: "document-staff" }),
        eligible({ versionId: "scan", documentId: "document-scan" }),
      ],
    )
    expect(mixed.commands?.eligible.map(item => item.versionId)).toEqual(["staff-letter"])
    expect(mixed.notices.join(" ")).toMatch(ineligibleNotice)
  })
})
