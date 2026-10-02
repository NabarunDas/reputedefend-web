import { describe, expect, it } from "vitest"
import { evidenceActions, reviewStatuses, scanStatuses, uploadStatuses, validationStatuses } from "../evidence/model"
import {
  contactAwaitingProvider,
  contactReachedCustomer,
  evidenceContactState,
  evidenceContactStates,
  evidenceRequestViews,
  evidenceVersionState,
  summariseEvidence,
} from "./evidence"
import type { CaseFlowCommunicationFact, CaseFlowEvidenceVersionFact } from "./model"

function version(overrides: Partial<CaseFlowEvidenceVersionFact> = {}): CaseFlowEvidenceVersionFact {
  return {
    documentId: "doc",
    versionId: "ver",
    evidenceRequestId: "req",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "UNREVIEWED",
    ...overrides,
  }
}

function message(overrides: Partial<CaseFlowCommunicationFact> = {}): CaseFlowCommunicationFact {
  return {
    id: "msg",
    templateKey: "EVIDENCE_REQUEST",
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    draftedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("evidence version state", () => {
  it("distinguishes an unfinished upload from a failed one", () => {
    expect(evidenceVersionState(version({ uploadStatus: "PENDING_UPLOAD", scanStatus: "PENDING", validationStatus: "PENDING" }))).toBe("UPLOAD_PENDING")
    expect(evidenceVersionState(version({ uploadStatus: "FAILED", scanStatus: "PENDING", validationStatus: "PENDING" }))).toBe("UPLOAD_FAILED")
  })

  it("puts the malware scan ahead of everything else", () => {
    expect(evidenceVersionState(version({ scanStatus: "PENDING", validationStatus: "PENDING" }))).toBe("SCAN_PENDING")
    expect(evidenceVersionState(version({ scanStatus: "THREATS_FOUND" }))).toBe("THREAT_BLOCKED")
    expect(evidenceVersionState(version({ scanStatus: "THREATS_FOUND", reviewStatus: "ACCEPTED" }))).toBe("THREAT_BLOCKED")
  })

  it("separates a scan that could not run from a file that is not valid", () => {
    for (const scan of ["FAILED", "UNSUPPORTED", "ACCESS_DENIED"]) {
      expect(evidenceVersionState(version({ scanStatus: scan })), scan).toBe("SCAN_UNAVAILABLE")
    }
    expect(evidenceVersionState(version({ validationStatus: "INVALID" }))).toBe("CONTENT_INVALID")
    expect(evidenceVersionState(version({ validationStatus: "ERROR" }))).toBe("CONTENT_INVALID")
    expect(evidenceVersionState(version({ validationStatus: "PENDING" }))).toBe("CHECK_NEEDED")
  })

  it("reports review only once the file is clean and valid", () => {
    expect(evidenceVersionState(version())).toBe("AWAITING_REVIEW")
    expect(evidenceVersionState(version({ reviewStatus: "ACCEPTED" }))).toBe("ACCEPTED")
    expect(evidenceVersionState(version({ reviewStatus: "REJECTED" }))).toBe("REJECTED")
    expect(evidenceVersionState(version({ reviewStatus: "SUPERSEDED" }))).toBe("SUPERSEDED")
  })

  // The flow model and the evidence workspace must not be able to disagree
  // about what a file is doing, so the precedence is the workspace's own.
  it("never contradicts evidenceActions across every status combination", () => {
    for (const uploadStatus of uploadStatuses) {
      for (const scanStatus of scanStatuses) {
        for (const validationStatus of validationStatuses) {
          for (const reviewStatus of reviewStatuses) {
            const subject = version({ uploadStatus, scanStatus, validationStatus, reviewStatus })
            const state = evidenceVersionState(subject)
            const actions = evidenceActions({ ...subject, contentType: "application/pdf" })
            const label = `${uploadStatus}/${scanStatus}/${validationStatus}/${reviewStatus}`
            expect(state === "THREAT_BLOCKED", label).toBe(actions.threatBlocked)
            expect(state === "CONTENT_INVALID", label).toBe(actions.validationFailed)
            if (state === "ACCEPTED" || state === "REJECTED" || state === "AWAITING_REVIEW") {
              expect(actions.download, label).toBe(true)
            }
            if (state === "AWAITING_REVIEW") {
              expect(actions.accept && actions.reject, label).toBe(true)
            }
          }
        }
      }
    }
  })
})

describe("evidence contact state", () => {
  it("says nothing has been prepared when no request message exists", () => {
    expect(evidenceContactState([])).toBe("NOT_PREPARED")
    expect(evidenceContactState([message({ templateKey: "CASE_UPDATE" })])).toBe("NOT_PREPARED")
  })

  it("follows the lifecycle up to queueing", () => {
    expect(evidenceContactState([message({ lifecycle: "DRAFT" })])).toBe("DRAFTED")
    expect(evidenceContactState([message({ lifecycle: "REVIEWED" })])).toBe("REVIEWED")
    expect(evidenceContactState([message({ lifecycle: "QUEUED" })])).toBe("QUEUED")
    expect(evidenceContactState([message({ lifecycle: "CANCELLED" })])).toBe("CANCELLED")
  })

  // Provider acceptance is not delivery, and the model never says it is.
  it("keeps provider acceptance separate from delivery", () => {
    expect(evidenceContactState([message({ lifecycle: "QUEUED", deliveryStatus: "PROVIDER_ACCEPTED" })])).toBe("PROVIDER_ACCEPTED")
    expect(evidenceContactState([message({ lifecycle: "QUEUED", deliveryStatus: "DELIVERED" })])).toBe("DELIVERED")
    expect(evidenceContactState([message({ lifecycle: "QUEUED", deliveryStatus: "ACCEPTANCE_UNKNOWN" })])).toBe("ACCEPTANCE_UNKNOWN")
  })

  // The whole point of the Step 11 contract: queued is not accepted,
  // accepted is not delivered, and only delivered is reaching somebody.
  it("counts only a confirmed delivery as having reached the customer", () => {
    for (const state of evidenceContactStates) {
      expect(contactReachedCustomer(state), state).toBe(state === "DELIVERED")
    }
  })

  it("treats queued and provider-accepted as a wait on the provider", () => {
    for (const state of evidenceContactStates) {
      expect(contactAwaitingProvider(state), state).toBe(state === "QUEUED" || state === "PROVIDER_ACCEPTED")
    }
  })

  // An unknown acceptance is neither reached nor a clean wait: nobody knows
  // whether the provider took the message at all.
  it("leaves an unknown provider outcome outside both", () => {
    expect(contactReachedCustomer("ACCEPTANCE_UNKNOWN")).toBe(false)
    expect(contactAwaitingProvider("ACCEPTANCE_UNKNOWN")).toBe(false)
  })

  it("treats every unsuccessful delivery outcome as not having reached anybody", () => {
    for (const delivery of ["BOUNCED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE", "COMPLAINED", "SUPPRESSED", "FAILED"]) {
      const state = evidenceContactState([message({ lifecycle: "QUEUED", deliveryStatus: delivery })])
      expect(state, delivery).toBe("FAILED")
      expect(contactReachedCustomer(state), delivery).toBe(false)
    }
  })

  it("reads the newest request message, not the first", () => {
    const state = evidenceContactState([
      message({ id: "old", lifecycle: "QUEUED", deliveryStatus: "BOUNCED", draftedAt: "2026-01-01T00:00:00.000Z" }),
      message({ id: "new", lifecycle: "QUEUED", deliveryStatus: "DELIVERED", draftedAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(state).toBe("DELIVERED")
  })

  it("does not read a legacy intake row as a sent request", () => {
    expect(evidenceContactState([message({ lifecycle: null, deliveryStatus: null, legacyStatus: "PENDING" })])).toBe("NOT_PREPARED")
    expect(evidenceContactState([message({ lifecycle: null, deliveryStatus: null, legacyStatus: "SENT" })])).toBe("PROVIDER_ACCEPTED")
  })
})

describe("evidence requests", () => {
  const request = { id: "req", status: "OPEN", dueAt: null, createdAt: "2026-01-01T00:00:00.000Z" }

  it("separates a request nobody has uploaded against from one in progress", () => {
    expect(evidenceRequestViews({ requests: [request], versions: [] })[0].state).toBe("OPEN_NOT_STARTED")
    expect(
      evidenceRequestViews({ requests: [request], versions: [version({ scanStatus: "PENDING" })] })[0].state,
    ).toBe("OPEN_IN_PROGRESS")
  })

  // Accepting a document does not close its request; somebody has to.
  it("keeps a satisfied request distinct from a fulfilled one", () => {
    const satisfied = evidenceRequestViews({
      requests: [request],
      versions: [version({ reviewStatus: "ACCEPTED" })],
    })
    expect(satisfied[0].state).toBe("OPEN_SATISFIED")
    expect(evidenceRequestViews({ requests: [{ ...request, status: "FULFILLED" }], versions: [] })[0].state).toBe("FULFILLED")
  })

  it("does not count rejected or superseded uploads as progress", () => {
    const views = evidenceRequestViews({
      requests: [request],
      versions: [version({ reviewStatus: "REJECTED" }), version({ reviewStatus: "SUPERSEDED" })],
    })
    expect(views[0].state).toBe("OPEN_NOT_STARTED")
  })
})

describe("evidence summary", () => {
  it("stops counting a problem somebody has already dealt with", () => {
    const summary = summariseEvidence(
      {
        requests: [{ id: "req", status: "OPEN", dueAt: null, createdAt: "2026-01-01T00:00:00.000Z" }],
        versions: [version({ scanStatus: "THREATS_FOUND", reviewStatus: "REJECTED" })],
      },
      [],
    )
    expect(summary.threatBlocked).toBe(0)
    expect(summary.rejected).toBe(1)
  })

  it("is complete only when every request is closed off", () => {
    const requests = [{ id: "req", status: "FULFILLED", dueAt: null, createdAt: "2026-01-01T00:00:00.000Z" }]
    expect(summariseEvidence({ requests, versions: [] }, []).complete).toBe(true)
    expect(summariseEvidence({ requests: [], versions: [] }, []).complete).toBe(false)
  })

  it("reports the earliest open due date", () => {
    const summary = summariseEvidence(
      {
        requests: [
          { id: "a", status: "OPEN", dueAt: "2026-03-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "b", status: "OPEN", dueAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
        versions: [],
      },
      [],
    )
    expect(summary.earliestOpenDueAt).toBe("2026-02-01T00:00:00.000Z")
  })
})
