// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowCommunicationFact, CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { EvidenceCase, EvidenceDocument, EvidenceRequest, EvidenceVersionRow } from "@/lib/evidence/model"
import { buildEvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import type { PreparedPack, PreparedPackCase } from "@/lib/packs/model"
import { CaseJourneyView, type JourneyEvidenceReview } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const NOW = "2026-10-03T12:00:00.000Z"
const PAST = "2026-09-01T00:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"
const LOCATION_ID = "33333333-3333-4333-8333-333333333333"
const OWNERSHIP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const UTILITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const OWNERSHIP_DOC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const UTILITY_DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const CLEAN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const PENDING = "ffffffff-ffff-4fff-8fff-ffffffffffff"

const transitions: Record<string, string[]> = {
  INITIAL_REVIEW: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
  EVIDENCE_COLLECTION: ["ASSESSMENT_READY"],
  ASSESSMENT_READY: ["EVIDENCE_COLLECTION", "SERVICE_SELECTION"],
}

const brief: JourneyIntakeBrief = {
  message: "The listing was suspended.",
  reviewUrl: null,
  openedAt: PAST,
  submittedAtLabel: null,
  customerName: "Alex",
  email: "alex@example.com",
  phone: null,
  customerId: CUSTOMER_ID,
  emailControl: "not_recorded",
  emailSuppressed: null,
  businessName: "Bakery",
  website: null,
  locationName: null,
  country: "United Kingdom",
  profileUrl: null,
  duplicates: [],
  authority: "not_recorded",
  snapshot: null,
  conflicts: [],
}

const caseDetail = { id: CASE_ID, reference: "PR-1", client: "Alex", business: "Bakery" } as CaseDetail
const noPacks: PreparedPackCase = { caseId: CASE_ID, packs: [], eligible: [] }

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  const stage = overrides.technicalStage ?? "EVIDENCE_COLLECTION"
  return {
    caseId: CASE_ID,
    reference: "PR-1",
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

function request(id: string, overrides: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    id, title: id === UTILITY ? "Utility bill" : "Proof of ownership",
    requestText: "Upload the document that answers this request.",
    status: "OPEN", dueAt: null, createdAt: PAST, fulfilledAt: null, version: 1, ...overrides,
  }
}

function version(id: string, overrides: Partial<EvidenceVersionRow> = {}): EvidenceVersionRow {
  return {
    id, versionNumber: 1, originalFilename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 2048,
    uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", validationError: null,
    reviewStatus: "UNREVIEWED", reviewNote: null, customerVisible: false,
    createdAt: PAST, uploadedAt: PAST, validatedAt: PAST, reviewedAt: null, recordVersion: 1, ...overrides,
  }
}

function doc(id: string, versions: EvidenceVersionRow[], evidenceRequestId: string | null, title: string): EvidenceDocument {
  return { id, title, evidenceRequestId, createdAt: PAST, updatedAt: PAST, version: 1, versions }
}

function message(overrides: Partial<CaseFlowCommunicationFact> = {}): CaseFlowCommunicationFact {
  return {
    id: "99999999-9999-4999-8999-999999999999", templateKey: "EVIDENCE_REQUEST", lifecycle: "QUEUED",
    deliveryStatus: "PROVIDER_ACCEPTED", legacyStatus: null, draftedAt: PAST, ...overrides,
  }
}

function projectionFrom(
  item: EvidenceCase,
  communications: CaseFlowCommunicationFact[],
  versions?: CaseFlowFacts["evidence"]["versions"],
) {
  return facts({
    evidence: {
      requests: item.requests.map(row => ({ id: row.id, status: row.status, dueAt: row.dueAt, createdAt: row.createdAt })),
      versions: versions ?? item.documents.flatMap(row => row.versions.map(file => ({
        documentId: row.id,
        versionId: file.id,
        evidenceRequestId: row.evidenceRequestId,
        uploadStatus: file.uploadStatus,
        scanStatus: file.scanStatus,
        validationStatus: file.validationStatus,
        reviewStatus: file.reviewStatus,
      }))),
    },
    communications,
  })
}

function show(item: EvidenceCase, communications: CaseFlowCommunicationFact[] = [message()], options: {
  selected?: string
  passReview?: boolean
  versions?: ReturnType<typeof projectionFrom>["evidence"]["versions"]
  packs?: PreparedPackCase
  stage?: CaseFlowFacts["technicalStage"]
} = {}) {
  const projected = projectionFrom(item, communications, options.versions)
  if (options.stage) {
    projected.technicalStage = options.stage
    projected.allowedTransitions = transitions[options.stage] ?? []
  }
  const journey = presentCaseJourney(projected, NOW)
  const model = buildEvidenceWorkspaceModel({
    evidence: item,
    evidenceFacts: options.versions
      ? { requests: projected.evidence.requests, versions: options.versions }
      : projected.evidence,
    communications,
    primaryAction: null,
    now: NOW,
    hasPack: false,
  })
  const review: JourneyEvidenceReview = { caseDetail, evidence: item, packs: options.packs ?? noPacks, model }
  const selected = options.selected ?? "EVIDENCE_REVIEW"
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId={selected}
    brief={brief}
    version={1}
    documents={null}
    evidenceReview={options.passReview === false ? null : review}
  />)
}

afterEach(() => cleanup())

function stepState(id: string): string | null {
  return document.querySelector(`[data-step="${id}"]`)?.getAttribute("data-state") ?? null
}

describe("guided evidence review", () => {
  it("reviews several requests before delivery is confirmed and leaves the document request unfinished", () => {
    show(evidenceCase([
      request(OWNERSHIP),
      request(UTILITY),
    ], [
      doc(OWNERSHIP_DOC, [version(CLEAN, { originalFilename: "ownership.pdf", submissionSource: "CUSTOMER" })], OWNERSHIP, "Ownership letter"),
      doc(UTILITY_DOC, [version(PENDING, { scanStatus: "PENDING", validationStatus: "PENDING", validatedAt: null, originalFilename: "utility-bill.pdf" })], UTILITY, "Premises bill"),
    ]))
    expect(screen.getByRole("heading", { name: "Evidence Review" })).toBeTruthy()
    expect(stepState("REQUEST_DOCUMENTS")).not.toBe("COMPLETED")
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("LOCKED")
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("COMPLETED")
    expect(screen.getByRole("heading", { name: "Proof of ownership" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Utility bill" })).toBeTruthy()
    expect(screen.getByText(/A submitted file can be reviewed before delivery is confirmed/)).toBeTruthy()
    expect(screen.getByText(/does not record the email as delivered/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/recorded delivery status of DELIVERED/)
    expect(screen.getByRole("button", { name: "Accept Ownership letter, version 1" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "View Ownership letter, version 1" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Refresh scan status for Premises bill, version 1" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "View Premises bill, version 1" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Accept Utility bill/ })).toBeNull()
    expect(screen.getAllByText(/Who must act/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("heading", { name: "Prepared submission pack" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Create request" })).toBeNull()
    expect(screen.queryByText("Assessment actions are not available in this preview.")).toBeNull()
  })

  it("keeps an accepted file short of fulfilment", () => {
    show(evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [version(CLEAN, { reviewStatus: "ACCEPTED", reviewNote: "Matches the account.", reviewedAt: PAST })], OWNERSHIP, "Ownership letter")],
    ), [message({ deliveryStatus: "DELIVERED" })])
    expect(screen.getByText("Accepted evidence received — this request is still open.")).toBeTruthy()
    expect(screen.getByText("Accepted.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark fulfilled Proof of ownership" })).toBeTruthy()
    expect(screen.getByText("1 request can now be marked fulfilled")).toBeTruthy()
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("COMPLETED")
    expect(screen.getAllByText(/request marked fulfilled/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Customer visibility")).toBeNull()
    expect(document.body.textContent).not.toMatch(/automatically fulfil/)
  })

  it("keeps a rejected file and asks for a replacement without dropping the original", () => {
    const rejected = version("abababab-abab-4aba-8aba-abababababab", {
      versionNumber: 1, reviewStatus: "REJECTED", reviewNote: "Wrong business.", originalFilename: "old.pdf",
    })
    const replacement = version(CLEAN, { versionNumber: 2, originalFilename: "replacement.pdf" })
    show(evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [rejected, replacement], OWNERSHIP, "Ownership letter")],
    ))
    expect(screen.getByText(/replacement\.pdf/)).toBeTruthy()
    expect(screen.getByText("Version history (1)")).toBeTruthy()
    expect(screen.getAllByText(/This version stays rejected/).length).toBeGreaterThan(0)
    expect(screen.getByText("Review note: Wrong business.")).toBeTruthy()
    expect(document.getElementById("evidence-version-abababab-abab-4aba-8aba-abababababab")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Accept Ownership letter, version 2" })).toBeTruthy()
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("COMPLETED")
    expect(screen.getByText(/Uploading a file does not accept it/)).toBeTruthy()
  })

  it("blocks view and review while a threat, a failed validation or a missing scan is outstanding", () => {
    const { unmount } = show(evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [version(CLEAN, { scanStatus: "THREATS_FOUND", validationStatus: "PENDING", validatedAt: null, originalFilename: "risky.pdf" })], OWNERSHIP, "Risky file")],
    ))
    expect(screen.getAllByText("Threat detected — file blocked.").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /View/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    expect(stepState("EVIDENCE_REVIEW")).toBe("NEEDS_ATTENTION")
    unmount()

    show(evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [version(CLEAN, { validationStatus: "INVALID", validationError: "The PDF has no pages." })], OWNERSHIP, "Broken file")],
    ))
    expect(screen.getByText(/This is not a malware result\. The PDF has no pages\./)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Refresh scan status/ })).toBeTruthy()
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("COMPLETED")
  })

  it("withholds review when the scan itself needs refreshing", () => {
    show(evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [version(CLEAN, { scanStatus: "UNSUPPORTED", validationStatus: "PENDING", validatedAt: null })], OWNERSHIP, "Ownership letter")],
    ))
    expect(screen.getAllByText("Security scan needs refreshing.").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Refresh scan status/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    expect(screen.getByRole("button", { name: /View Ownership letter/ })).toBeDisabled()
  })

  it("says a case with no evidence needs a separate decision and does not complete the step", () => {
    show(evidenceCase([], []), [])
    expect(screen.getAllByText(/separately recorded decision that no documents are required/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Silence is not that decision/).length).toBeGreaterThan(0)
    expect(stepState("EVIDENCE_REVIEW")).not.toBe("COMPLETED")
    expect(screen.queryByRole("button", { name: /complete|waiver|no documents required/i })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Create request" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
  })

  it("keeps a file on the stored request when the projections disagree", () => {
    const item = evidenceCase([
      request(OWNERSHIP),
      request(UTILITY),
    ], [
      doc(OWNERSHIP_DOC, [version(CLEAN, { originalFilename: "utility-bill.pdf" })], OWNERSHIP, "Ownership letter"),
    ])
    const drifted = item.documents.flatMap(row => row.versions.map(file => ({
      documentId: row.id,
      versionId: file.id,
      evidenceRequestId: UTILITY,
      uploadStatus: file.uploadStatus,
      scanStatus: file.scanStatus,
      validationStatus: file.validationStatus,
      reviewStatus: file.reviewStatus,
    })))
    show(item, [message()], { versions: drifted })
    expect(screen.getByRole("heading", { name: "Evidence records disagree" })).toBeTruthy()
    expect(screen.getByText(new RegExp(CLEAN))).toBeTruthy()
    const ownership = document.getElementById(`evidence-request-${OWNERSHIP}`)
    const utility = document.getElementById(`evidence-request-${UTILITY}`)
    expect(ownership?.textContent).toMatch(/utility-bill\.pdf/)
    expect(utility?.textContent).not.toMatch(/utility-bill\.pdf/)
    expect(screen.getByText(/Nothing was attached by filename/)).toBeTruthy()
  })

  it("shows the fulfilled record without offering another fulfilment", () => {
    show(evidenceCase(
      [request(OWNERSHIP, { status: "FULFILLED", fulfilledAt: PAST })],
      [doc(OWNERSHIP_DOC, [version(CLEAN, { reviewStatus: "ACCEPTED" })], OWNERSHIP, "Ownership letter")],
    ), [message({ deliveryStatus: "DELIVERED" })])
    expect(stepState("EVIDENCE_REVIEW")).toBe("COMPLETED")
    expect(screen.getByRole("heading", { name: "Completed requests" })).toBeTruthy()
    expect(screen.getByText("Ownership letter")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Mark fulfilled/ })).toBeNull()
    expect(screen.queryByText("What remains outstanding")).toBeNull()
  })

  it("does not open evidence commands on a locked step or on a later step", () => {
    const item = evidenceCase(
      [request(OWNERSHIP)],
      [doc(OWNERSHIP_DOC, [version(CLEAN)], OWNERSHIP, "Ownership letter")],
    )
    const lockedJourney = presentCaseJourney(facts({ technicalStage: "INITIAL_REVIEW", evidence: { requests: [], versions: [] }, communications: [] }), NOW)
    const { unmount } = render(<CaseJourneyView
      reference="PR-1" customer="Alex" business="Bakery" caseId={CASE_ID}
      journey={lockedJourney} selectedId="EVIDENCE_REVIEW" brief={brief} version={1} documents={null}
      evidenceReview={{
        caseDetail,
        evidence: item,
        packs: noPacks,
        model: buildEvidenceWorkspaceModel({
          evidence: item,
          evidenceFacts: projectionFrom(item, []).evidence,
          communications: [],
          primaryAction: null,
          now: NOW,
          hasPack: false,
        }),
      }}
    />)
    expect(stepState("EVIDENCE_REVIEW")).toBe("LOCKED")
    expect(screen.getByText(/Evidence review stays closed/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    unmount()

    show(item, [message({ deliveryStatus: "DELIVERED" })], { selected: "ASSESSMENT" })
    expect(screen.getByRole("heading", { name: "Assessment & Recommended Path" })).toBeTruthy()
    expect(screen.getByText("Assessment actions are not available in this preview.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Open evidence requests" })).toBeNull()
  })

  it("leaves pack preparation off this step even when a pack exists", () => {
    const stale: PreparedPack = {
      id: "12121212-1212-4121-8121-121212121212", packNumber: 1, status: "STALE",
      approvalNote: "Selected evidence only.", createdAt: PAST, approvedAt: PAST, recordVersion: 2, items: [],
    }
    show(
      evidenceCase([request(OWNERSHIP)], [doc(OWNERSHIP_DOC, [version(CLEAN)], OWNERSHIP, "Ownership letter")]),
      [message({ deliveryStatus: "DELIVERED" })],
      { packs: { caseId: CASE_ID, packs: [stale], eligible: [] } },
    )
    expect(screen.queryByRole("heading", { name: "Prepared submission pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Approve pack|Publish/ })).toBeNull()
  })
})

function evidenceCase(requests: EvidenceRequest[], documents: EvidenceDocument[]): EvidenceCase {
  return { caseId: CASE_ID, reference: "PR-1", requests, documents }
}
