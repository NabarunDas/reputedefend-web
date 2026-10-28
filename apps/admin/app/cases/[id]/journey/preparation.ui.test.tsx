// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { buildJourneyPreparationPanel } from "@/lib/case-journey/preparation"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { PreparedPack, PreparedPackCase } from "@/lib/packs/model"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const VERSION_ID = "66666666-6666-4666-8666-666666666666"

const brief = {
  message: "The listing was suspended.",
  reviewUrl: null,
  openedAt: "2026-09-01T00:00:00.000Z",
  submittedAtLabel: null,
  customerName: "Alex",
  email: "alex@example.com",
  phone: null,
  customerId: "11111111-1111-4111-8111-111111111111",
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
} as JourneyIntakeBrief

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
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
    payment: { complete: true, orders: [{ orderId: "88888888-8888-4888-8888-888888888888", paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: true }] },
    evidence: { requests: [], versions: [{ documentId: "77777777-7777-4777-8777-777777777777", versionId: VERSION_ID, evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED" }] },
    packs: { packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: 1 }], eligibleCount: 0 },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function draft(overrides: Partial<PreparedPack> = {}): PreparedPack {
  return {
    id: "pack-1",
    packNumber: 1,
    status: "DRAFT",
    approvalNote: "",
    createdAt: "2026-06-01T12:00:00.000Z",
    approvedAt: null,
    recordVersion: 3,
    published: false,
    items: [{
      id: "item-1",
      documentId: "77777777-7777-4777-8777-777777777777",
      versionId: VERSION_ID,
      position: 1,
      documentTitle: "Invoice",
      originalFilename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1200,
      versionNumber: 1,
      customerVisible: true,
    }],
    ...overrides,
  }
}

function show(source: CaseFlowFacts, packs: PreparedPackCase | null, options: { recordsConflict?: boolean; mailRecovery?: boolean } = {}) {
  const now = "2026-10-03T12:00:00.000Z"
  const panel = buildJourneyPreparationPanel({ facts: source, packs, recordsConflict: !!options.recordsConflict, mailRecovery: options.mailRecovery })
  const journey = presentCaseJourney(source, now, [], {
    ...(packs !== null && panel.headline === "Pack records disagree" ? { packRecordsDisagree: true } : {}),
    ...(options.recordsConflict ? { authorityRecordsDisagree: true } : {}),
  })
  const locked = journey.steps.find(step => step.id === "PREPARATION")?.state === "LOCKED"
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId="PREPARATION"
    brief={brief}
    version={3}
    documents={null}
    preparation={locked ? null : panel}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided case preparation", () => {
  it("keeps a locked step free of pack commands", () => {
    show(facts({ technicalStage: "INITIAL_REVIEW", allowedTransitions: ["ASSESSMENT_READY"], packs: { packs: [], eligibleCount: 0 } }), null)
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Case preparation stays closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create new draft pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve prepared pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
  })

  it("approves a draft without publishing it or submitting to Google", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The prepared pack has been approved. This does not confirm payment, permission or submission to Google." }) })
    vi.stubGlobal("fetch", fetchMock)
    show(facts(), { caseId: CASE_ID, packs: [draft()], eligible: [] })
    expect(document.querySelector("[data-step='PREPARATION']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getByText("Pack #1: Draft.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    fireEvent.click(screen.getByText("Approve pack"))
    fireEvent.change(screen.getByRole("textbox", { name: /Approval note/ }), { target: { value: "The invoice is the selected evidence." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /exact evidence selection/i, hidden: true }))
    fireEvent.submit(screen.getByRole("button", { name: "Approve prepared pack" }).closest("form")!)
    expect(await screen.findByText(/The prepared pack has been approved/)).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("approve")
    expect(payload.packId).toBe("pack-1")
    expect(payload.operation).not.toBe("publish")
    expect(document.querySelector("[data-step='PREPARATION']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("publishes an approved pack without a Google submission", () => {
    show(facts({
      packs: { packs: [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: false, everPublished: false, itemCount: 1 }], eligibleCount: 0 },
    }), { caseId: CASE_ID, packs: [draft({ status: "APPROVED", approvedAt: "2026-06-02T12:00:00.000Z", approvalNote: "Selected evidence only." })], eligible: [] })
    expect(screen.getByRole("button", { name: "Publish pack", hidden: true })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve prepared pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    expect(document.querySelector("[data-step='PREPARATION']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("shows a stale pack as unfinished and keeps a conflicting record free of commands", () => {
    show(facts({
      packs: { packs: [{ id: "pack-1", packNumber: 1, status: "STALE", published: false, everPublished: true, itemCount: 1 }], eligibleCount: 0 },
    }), { caseId: CASE_ID, packs: [draft({ status: "STALE" })], eligible: [] })
    expect(screen.getByText(/Pack stale/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    expect(document.querySelector("[data-step='PREPARATION']")).not.toHaveAttribute("data-state", "COMPLETED")

    cleanup()
    show(facts({
      packs: { packs: [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }], eligibleCount: 0 },
    }), { caseId: CASE_ID, packs: [draft({ status: "DRAFT" })], eligible: [] })
    expect(screen.getAllByText(/records disagree/).length).toBeGreaterThan(0)
    expect(document.querySelector("[data-step='PREPARATION']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.queryByRole("button", { name: "Create new draft pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve prepared pack" })).toBeNull()
  })

  it("agrees the step, the headline and the controls for published and conflicting packs", () => {
    const published = draft({ status: "APPROVED", published: true, approvedAt: "2026-06-02T12:00:00.000Z", approvalNote: "Selected evidence only." })
    const row = { id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }
    const noCommands = () => {
      for (const name of ["Create new draft pack", "Approve prepared pack", "Publish pack", "Unpublish pack"]) {
        expect(screen.queryByRole("button", { name, hidden: true })).toBeNull()
      }
      expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    }

    show(facts({ packs: { packs: [row], eligibleCount: 0 } }), { caseId: CASE_ID, packs: [published], eligible: [] })
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-preparation]")).toHaveAttribute("data-preparation", "Available in portal; email not sent")
    expect(screen.getByText(/Publication: Met/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Unpublish pack", hidden: true })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send pack-ready email" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    cleanup()
    show(facts({ packs: { packs: [row], eligibleCount: 0 } }), { caseId: CASE_ID, packs: [published], eligible: [] }, { mailRecovery: true })
    expect(screen.getByRole("button", { name: "Send pack-ready email" })).toBeTruthy()

    cleanup()
    show(facts({
      packs: { packs: [row, { ...row, id: "pack-2", packNumber: 2 }], eligibleCount: 0 },
    }), { caseId: CASE_ID, packs: [published, { ...published, id: "pack-2", packNumber: 2 }], eligible: [] })
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-preparation]")).toHaveAttribute("data-preparation", "Another pack is still published")
    expect(screen.getAllByText(/evidence workspace/).length).toBeGreaterThan(0)
    noCommands()

    cleanup()
    show(facts({
      packs: {
        packs: [
          { ...row, id: "pack-old", status: "SUPERSEDED", published: false },
          { ...row, id: "pack-2", packNumber: 2 },
        ],
        eligibleCount: 0,
      },
    }), {
      caseId: CASE_ID,
      packs: [
        { ...published, id: "pack-old", status: "SUPERSEDED", published: false },
        { ...published, id: "pack-2", packNumber: 2 },
      ],
      eligible: [],
    })
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-preparation]")).toHaveAttribute("data-preparation", "Available in portal; email not sent")
    expect(screen.getByText(/This approved history is read-only/)).toBeTruthy()

    cleanup()
    show(
      facts({ packs: { packs: [row], eligibleCount: 0 } }),
      { caseId: CASE_ID, packs: [published], eligible: [] },
      { recordsConflict: true },
    )
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-preparation]")).toHaveAttribute("data-preparation", "Case records disagree")
    expect(screen.getAllByText(/authority records/).length).toBeGreaterThan(0)
    noCommands()
  })
})

const STAFF_VERSION = "da34e42a-64eb-4bec-9e83-2cd4f0c8788f"
const STAFF_DOCUMENT = "99999999-9999-4999-8999-999999999991"
const CUSTOMER_VERSION = "99999999-9999-4999-8999-999999999992"
const CUSTOMER_DOCUMENT = "99999999-9999-4999-8999-999999999993"

function accepted(overrides: Partial<CaseFlowFacts["evidence"]["versions"][number]> = {}): CaseFlowFacts["evidence"]["versions"][number] {
  return {
    documentId: STAFF_DOCUMENT,
    versionId: STAFF_VERSION,
    evidenceRequestId: null,
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "ACCEPTED",
    submissionSource: "ADMIN",
    ...overrides,
  }
}

function offer(versionId: string, documentId: string, filename: string, title: string) {
  return {
    documentId,
    versionId,
    versionNumber: 1,
    documentTitle: title,
    originalFilename: filename,
    contentType: filename.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf",
    sizeBytes: 1200,
  }
}

describe("Step 8 eligible accepted evidence", () => {
  function open(versions: CaseFlowFacts["evidence"]["versions"], eligible: ReturnType<typeof offer>[], items: PreparedPack["items"] = []) {
    const listed = facts({
      evidence: { requests: [{ id: "request-1", status: "FULFILLED", dueAt: null, createdAt: "2026-05-01T12:00:00.000Z" }], versions },
      packs: { packs: [{ id: "pack-1", packNumber: 1, status: "DRAFT", published: false, everPublished: false, itemCount: items.length }], eligibleCount: eligible.length },
    })
    show(listed, {
      caseId: CASE_ID,
      packs: [draft({ items })],
      eligible,
    })
  }

  it("shows a staff upload with no request and a linked customer upload, and can add the staff file", () => {
    open(
      [
        accepted(),
        accepted({
          documentId: CUSTOMER_DOCUMENT,
          versionId: CUSTOMER_VERSION,
          evidenceRequestId: "request-1",
          submissionSource: "CUSTOMER",
        }),
      ],
      [
        offer(STAFF_VERSION, STAFF_DOCUMENT, "How to submit.docx", "How to submit"),
        offer(CUSTOMER_VERSION, CUSTOMER_DOCUMENT, "ownership.pdf", "Ownership letter"),
      ],
    )
    expect(screen.getByRole("heading", { name: "Eligible accepted evidence" })).toBeTruthy()
    expect(screen.getByText(/How to submit\.docx/)).toBeTruthy()
    expect(screen.getByText(/ownership\.pdf/)).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Add to pack" })).toHaveLength(2)
    expect(screen.queryByText(/A listed file is not an accepted, validated, clean version/)).toBeNull()
  })

  it("does not offer a file that is already in the draft, or a file that fails the evidence checks", () => {
    open(
      [accepted()],
      [offer(STAFF_VERSION, STAFF_DOCUMENT, "How to submit.docx", "How to submit")],
      [{
        id: "item-staff",
        documentId: STAFF_DOCUMENT,
        versionId: STAFF_VERSION,
        position: 1,
        documentTitle: "How to submit",
        originalFilename: "How to submit.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 1200,
        versionNumber: 1,
        customerVisible: true,
      }],
    )
    expect(screen.getByText("No further accepted, clean and valid versions are available to add.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Add to pack" })).toBeNull()
    expect(screen.queryByText(/A listed file is not an accepted, validated, clean version/)).toBeNull()

    cleanup()
    open(
      [
        accepted(),
        accepted({
          documentId: "99999999-9999-4999-8999-999999999994",
          versionId: "99999999-9999-4999-8999-999999999995",
          submissionSource: null,
          evidenceRequestId: null,
        }),
      ],
      [
        offer(STAFF_VERSION, STAFF_DOCUMENT, "How to submit.docx", "How to submit"),
        offer("99999999-9999-4999-8999-999999999995", "99999999-9999-4999-8999-999999999994", "unlinked.pdf", "Unlinked"),
      ],
    )
    expect(screen.getByText(/How to submit\.docx/)).toBeTruthy()
    expect(screen.queryByText(/unlinked\.pdf/)).toBeNull()
    expect(screen.getAllByRole("button", { name: "Add to pack" })).toHaveLength(1)
    expect(screen.getByText(/A listed file is not an accepted, validated, clean version/)).toBeTruthy()
  })
})
