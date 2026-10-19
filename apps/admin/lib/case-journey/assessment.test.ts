import { describe, expect, it } from "vitest"
import {
  evidenceReadyForAssessment,
  judgeAssessment,
  parseAssessmentCommand,
  parseCaseAssessment,
  type AssessmentVersionView,
  type CaseAssessmentView,
} from "./assessment"

const caseId = "55555555-5555-4555-8555-555555555555"
const versionId = "77777777-7777-4777-8777-777777777777"

function version(overrides: Partial<AssessmentVersionView> = {}): AssessmentVersionView {
  return {
    id: versionId,
    versionNumber: 1,
    status: "DRAFT",
    recordVersion: 1,
    findings: "The profile was suspended and the ownership letter matches the account.",
    evidenceConsidered: "Accepted ownership letter on a fulfilled request.",
    profileIssue: "The listing is suspended.",
    policyConcerns: "",
    recommendedAction: "Recommend the Guided pathway.",
    servicePathway: "GUIDED",
    rationale: "The accepted evidence supports a guided recovery.",
    risks: "Google may still refuse the appeal.",
    outstandingInformation: "",
    draftedAt: "2026-06-01T12:00:00.000Z",
    reviewedAt: null,
    approvedAt: null,
    current: false,
    stale: false,
    staleReason: null,
    ...overrides,
  }
}

function view(versions: AssessmentVersionView[]): CaseAssessmentView {
  return { workflowVersion: 2, basisFingerprint: "a".repeat(32), reopenedAt: null, versions }
}

const draft = {
  recordVersion: 0,
  findings: "The profile was suspended and the ownership letter matches the account.",
  evidenceConsidered: "Accepted ownership letter on a fulfilled request.",
  profileIssue: "The listing is suspended.",
  policyConcerns: "",
  recommendedAction: "Recommend the Guided pathway.",
  servicePathway: "GUIDED",
  rationale: "The accepted evidence supports a guided recovery.",
  risks: "Google may still refuse the appeal.",
  outstandingInformation: "",
}

describe("assessment judgement", () => {
  it("treats a missing read, a draft and a review as unfinished", () => {
    expect(judgeAssessment(null).phase).toBe("none")
    expect(judgeAssessment(view([])).phase).toBe("none")
    expect(judgeAssessment(view([version()])).phase).toBe("draft")
    expect(judgeAssessment(view([version({ status: "REVIEWED", reviewedAt: "2026-06-02T12:00:00.000Z" })])).phase).toBe("reviewed")
  })

  it("keeps a current approval complete when a newer draft is open", () => {
    const judged = judgeAssessment(view([
      version({ versionNumber: 2, recordVersion: 1 }),
      version({
        id: "88888888-8888-4888-8888-888888888888",
        versionNumber: 1,
        status: "APPROVED",
        current: true,
        reviewedAt: "2026-06-02T12:00:00.000Z",
        approvedAt: "2026-06-03T12:00:00.000Z",
      }),
    ]))
    expect(judged).toMatchObject({ phase: "approved", pathway: "GUIDED", versionNumber: 1 })
  })

  it("does not treat a stale, reopened or undecided approval as current", () => {
    expect(judgeAssessment(view([version({
      status: "APPROVED", current: false, stale: true, staleReason: "facts", approvedAt: "2026-06-03T12:00:00.000Z", reviewedAt: "2026-06-02T12:00:00.000Z",
    })])).phase).toBe("stale")
    expect(judgeAssessment(view([version({
      status: "APPROVED", current: false, stale: true, staleReason: "reopened", approvedAt: "2026-06-03T12:00:00.000Z", reviewedAt: "2026-06-02T12:00:00.000Z",
    })])).phase).toBe("reopened")
    expect(judgeAssessment(view([version({
      status: "APPROVED", servicePathway: "UNDECIDED", current: true, approvedAt: "2026-06-03T12:00:00.000Z", reviewedAt: "2026-06-02T12:00:00.000Z",
    })])).phase).not.toBe("approved")
  })

  it("accepts fulfilled evidence and refuses an open request or a live unreviewed file", () => {
    expect(evidenceReadyForAssessment({
      requests: [{ id: "request", status: "FULFILLED", dueAt: null, createdAt: "2026-05-01T00:00:00.000Z" }],
      versions: [{
        documentId: "document", versionId: "version", evidenceRequestId: "request",
        uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED",
      }],
    })).toBe(true)
    expect(evidenceReadyForAssessment({
      requests: [{ id: "request", status: "OPEN", dueAt: null, createdAt: "2026-05-01T00:00:00.000Z" }],
      versions: [{
        documentId: "document", versionId: "version", evidenceRequestId: "request",
        uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED",
      }],
    })).toBe(false)
    expect(evidenceReadyForAssessment({ requests: [], versions: [] })).toBe(false)
  })

  it("rejects a caller-supplied actor and a short finding", () => {
    expect(parseAssessmentCommand({ caseId, version: 1, operation: "save_draft", data: draft, actor: "staff" })).toBeNull()
    expect(parseAssessmentCommand({ caseId, version: 1, operation: "save_draft", data: { ...draft, findings: "Too short" } })).toBeNull()
    expect(parseAssessmentCommand({ caseId, version: 1, operation: "approve", data: { recordVersion: 0 } })).toBeNull()
    expect(parseAssessmentCommand({ caseId, version: 1, operation: "approve", data: { recordVersion: 2 } })).toMatchObject({
      operation: "approve",
      data: { recordVersion: 2 },
    })
  })

  it("drops a read that is missing, malformed, or not a current boolean", () => {
    expect(parseCaseAssessment(null)).toBeNull()
    expect(parseCaseAssessment({ missing: true })).toBeNull()
    expect(parseCaseAssessment({ ...view([version()]), versions: [{ ...version(), current: "yes" }] })).toBeNull()
    expect(parseCaseAssessment(view([version()]))?.versions).toHaveLength(1)
  })
})
