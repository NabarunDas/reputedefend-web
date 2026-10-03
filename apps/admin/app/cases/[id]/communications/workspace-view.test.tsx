// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import { actionCatalogue } from "@/lib/case-flow/actions"
import { caseDestination } from "@/lib/case-flow/destinations"
import type { CaseNextAction, CaseNextActionId } from "@/lib/case-flow/model"
import type { CaseCommunicationRow } from "@/lib/communications/model"
import type { ConversationDetail } from "@/lib/conversations/model"
import { buildCommunicationsWorkspaceModel } from "@/lib/communications-workspace/model"
import { CommunicationsWorkspace } from "./workspace-view"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const OTHER = "66666666-6666-4666-8666-666666666666"
const COMM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const REQUEST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const caseDetail = { id: CASE_ID, reference: "PR-1001", client: "Alex", business: "Bakery" } as CaseDetail

function action(id: CaseNextActionId, state: CaseNextAction["state"] = "ACTION_REQUIRED"): CaseNextAction {
  const defined = actionCatalogue[id]
  return {
    id, label: defined.label, description: defined.description, owner: defined.owner, state,
    priorityBand: defined.band, dueAt: null, overdue: false,
    destination: caseDestination("CASE_COMMUNICATIONS", CASE_ID), reasonCodes: [],
  }
}

function message(overrides: Partial<CaseCommunicationRow> = {}): CaseCommunicationRow {
  return {
    id: COMM, caseId: CASE_ID, caseReference: "PR-1001", evidenceRequestId: REQUEST,
    communicationType: "EVIDENCE_REQUEST", templateKey: "EVIDENCE_REQUEST", templateVersion: 1,
    lifecycle: "REVIEWED", deliveryStatus: "NONE", legacyStatus: null, recipient: "alex@example.com",
    subject: "Evidence needed", bodyText: "Please upload the document.", provider: null, providerMessageId: null,
    lastError: null, contentLocked: true, contentVersion: 1, version: 2, draftedAt: "2026-10-01T12:00:00.000Z",
    reviewedAt: "2026-10-01T12:30:00.000Z", queuedAt: null, firstProviderAttemptAt: null, providerAcceptedAt: null,
    deliveredAt: null, failedAt: null, cancelledAt: null, supersededBy: null, canReplace: false,
    eventsTruncated: false, events: [], ...overrides,
  }
}

function show(options: Parameters<typeof buildCommunicationsWorkspaceModel>[0]) {
  cleanup()
  render(<CommunicationsWorkspace caseDetail={caseDetail} model={buildCommunicationsWorkspaceModel(options)} />)
}

function base(overrides: Partial<Parameters<typeof buildCommunicationsWorkspaceModel>[0]> = {}) {
  const rows = overrides.history?.communications ?? []
  return {
    caseId: CASE_ID,
    caseStatus: "OPEN",
    customerId: "22222222-2222-4222-8222-222222222222",
    primaryAction: null as CaseNextAction | null,
    flowCommunications: rows.map(row => ({
      id: row.id, templateKey: row.templateKey, lifecycle: row.lifecycle,
      deliveryStatus: row.deliveryStatus, legacyStatus: row.legacyStatus, draftedAt: row.draftedAt,
    })),
    history: { status: "success" as const, complete: true, total: rows.length, returned: rows.length, verifiedEmail: "alex@example.com", verifiedEmailSuppressed: false, communications: rows },
    conversations: { status: "success" as const, complete: true, total: 0, returned: 0, conversations: [] },
    evidenceRequests: [{ id: REQUEST, title: "Photo ID", state: "OPEN_NOT_STARTED" as const }],
    selectedConversationId: null,
    selectedConversation: null,
    liveMailEnabled: false,
    ...overrides,
  }
}

afterEach(() => cleanup())

describe("communications workspace view", () => {
  it("drafts an evidence request without asking for a case id or a request uuid", () => {
    show(base({
      primaryAction: action("PREPARE_EVIDENCE_REQUEST_MESSAGE"),
      evidenceRequests: [
        { id: REQUEST, title: "Photo ID", state: "OPEN_NOT_STARTED" },
        { id: OTHER, title: "Utility bill", state: "OPEN_IN_PROGRESS" },
      ],
    }))
    expect(screen.queryByRole("textbox", { name: /case id/i })).toBeNull()
    expect(screen.queryByLabelText(/evidence request id/i)).toBeNull()
    expect(screen.getByRole("option", { name: "Photo ID — Waiting for evidence" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Utility bill — Evidence received — checks or review still in progress" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Draft evidence request" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(REQUEST)
  })

  it("keeps a reviewed message unqueued while live sending is disabled", () => {
    show(base({
      history: {
        status: "success", complete: true, total: 1, returned: 1, verifiedEmail: "alex@example.com", verifiedEmailSuppressed: false,
        communications: [message()],
      },
      primaryAction: action("SEND_EVIDENCE_REQUEST", "BLOCKED"),
    }))
    expect(screen.getByText("Reviewed and ready to queue")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
    expect(screen.getByText(/does not turn sending on/)).toBeTruthy()
  })

  it("shows reconciliation without a way to mark delivery or resend", () => {
    show(base({
      history: {
        status: "success", complete: true, total: 1, returned: 1, verifiedEmail: "alex@example.com", verifiedEmailSuppressed: false,
        communications: [message({ lifecycle: "QUEUED", deliveryStatus: "ACCEPTANCE_UNKNOWN", queuedAt: "2026-10-01T13:00:00.000Z" })],
      },
      primaryAction: action("RECONCILE_EMAIL_DELIVERY"),
      liveMailEnabled: true,
    }))
    expect(screen.getByText("Provider acceptance unknown — reconciliation required")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Record provider acceptance" })).toBeTruthy()
    expect(screen.getByText(/does not mark it delivered/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /mark delivered|send again|resend/i })).toBeNull()
  })

  it("hides a conversation that belongs to another case", () => {
    const detail: ConversationDetail = {
      status: "success",
      conversation: {
        id: OTHER, state: "OPEN", subject: "Secret thread", caseId: OTHER, caseReference: "PR-OTHER",
        assignedAdminId: null, needsAttention: false, replyAlias: "a".repeat(32), version: 1, recipientSuppressed: false,
      },
      entries: [{ id: "entry-1", kind: "INBOUND_EMAIL", bodyText: "private body that must not render", senderMatch: "MATCHES_VERIFIED_CONTACT" }],
    }
    show(base({ selectedConversationId: OTHER, selectedConversation: detail }))
    expect(screen.getByText(/belongs to another case/i)).toBeTruthy()
    expect(screen.queryByText(/private body/)).toBeNull()
    expect(screen.queryByText(/not authentication/)).toBeNull()
  })

  it("does not treat a sender match or an attachment as authentication or accepted evidence", () => {
    const detail: ConversationDetail = {
      status: "success",
      conversation: {
        id: COMM, state: "OPEN", subject: "Hello", caseId: CASE_ID, caseReference: "PR-1001",
        assignedAdminId: null, needsAttention: true, replyAlias: "b".repeat(32), version: 3, recipientSuppressed: false,
      },
      entries: [{
        id: "entry-1",
        kind: "INBOUND_EMAIL",
        bodyText: "Here is the scan.",
        senderMatch: "MATCHES_VERIFIED_CONTACT",
        attachments: [{
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          filename: "scan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          scanStatus: "NO_THREATS_FOUND",
          validationStatus: "VALID",
          available: true,
          promotionState: "NONE",
        }],
      }, {
        id: COMM,
        kind: "OUTBOUND_EMAIL",
        bodyText: "Thanks, we have it.",
        lifecycle: "QUEUED",
        deliveryStatus: "PROVIDER_ACCEPTED",
        version: 4,
      }],
    }
    show(base({
      conversations: {
        status: "success", complete: true, total: 1, returned: 1,
        conversations: [{
          id: COMM, state: "OPEN", subject: "Hello", sender: "alex@example.com", receivedAt: "2026-10-01T00:00:00.000Z",
          caseId: CASE_ID, caseReference: "PR-1001", senderMatch: "MATCHES_VERIFIED_CONTACT", hasAttachment: true,
          assignedAdminId: null, needsAttention: true, version: 3,
        }],
      },
      selectedConversationId: COMM,
      selectedConversation: detail,
    }))
    expect(screen.getAllByText("Matches a verified contact — not authentication").length).toBeGreaterThan(0)
    expect(screen.getByText(/does not make it accepted evidence/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Record for evidence follow-up" })).toBeTruthy()
    expect(screen.getByText(/Accepted by email provider/)).toBeTruthy()
    expect(screen.getByText(/Delivery is not yet confirmed/)).toBeTruthy()
    expect(screen.queryByText(/^Email sent$/)).toBeNull()
  })
})
