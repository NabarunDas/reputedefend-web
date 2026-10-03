import { describe, expect, it } from "vitest"
import { actionCatalogue } from "../case-flow/actions"
import { caseDestination } from "../case-flow/destinations"
import type { CaseFlowCommunicationFact, CaseNextAction, CaseNextActionId } from "../case-flow/model"
import type { CaseCommunicationRead, CaseCommunicationRow, DeliveryStatus } from "../communications/model"
import type { CaseConversationRead, ConversationDetail } from "../conversations/model"
import { buildCommunicationsWorkspaceModel, type CommunicationsWorkspaceModel } from "./model"

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const OTHER = "66666666-6666-4666-8666-666666666666"
const COMM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const REQUEST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function action(id: CaseNextActionId, state: CaseNextAction["state"] = "ACTION_REQUIRED"): CaseNextAction {
  const defined = actionCatalogue[id]
  return {
    id,
    label: defined.label,
    description: defined.description,
    owner: defined.owner,
    state,
    priorityBand: defined.band,
    dueAt: null,
    overdue: false,
    destination: caseDestination("CASE_COMMUNICATIONS", CASE_ID),
    reasonCodes: [],
  }
}

function row(overrides: Partial<CaseCommunicationRow> = {}): CaseCommunicationRow {
  return {
    id: COMM,
    caseId: CASE_ID,
    caseReference: "PR-1001",
    evidenceRequestId: REQUEST,
    communicationType: "EVIDENCE_REQUEST",
    templateKey: "EVIDENCE_REQUEST",
    templateVersion: 1,
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Evidence needed",
    bodyText: "Please upload the document.",
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: false,
    contentVersion: 1,
    version: 1,
    draftedAt: "2026-10-01T12:00:00.000Z",
    reviewedAt: null,
    queuedAt: null,
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    canReplace: false,
    eventsTruncated: false,
    events: [],
    ...overrides,
  }
}

function history(rows: CaseCommunicationRow[], overrides: Partial<CaseCommunicationRead> = {}): CaseCommunicationRead {
  return {
    status: "success",
    complete: true,
    total: rows.length,
    returned: rows.length,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications: rows,
    ...overrides,
  }
}

function fact(message: CaseCommunicationRow): CaseFlowCommunicationFact {
  return {
    id: message.id,
    templateKey: message.templateKey,
    lifecycle: message.lifecycle,
    deliveryStatus: message.deliveryStatus,
    legacyStatus: message.legacyStatus,
    draftedAt: message.draftedAt,
  }
}

function model(options: {
  rows?: CaseCommunicationRow[]
  facts?: CaseFlowCommunicationFact[]
  primary?: CaseNextAction | null
  liveMail?: boolean
  caseStatus?: string
  historyOverrides?: Partial<CaseCommunicationRead>
  conversations?: CaseConversationRead | null
  selected?: ConversationDetail | null
  selectedId?: string | null
  requests?: Array<{ id: string; title: string; state: "OPEN_NOT_STARTED" | "OPEN_IN_PROGRESS" | "OPEN_SATISFIED" | "FULFILLED" | "CANCELLED" }>
  noHistory?: boolean
} = {}): CommunicationsWorkspaceModel {
  const rows = options.rows ?? []
  return buildCommunicationsWorkspaceModel({
    caseId: CASE_ID,
    caseStatus: options.caseStatus ?? "OPEN",
    customerId: "22222222-2222-4222-8222-222222222222",
    primaryAction: options.primary === undefined ? null : options.primary,
    flowCommunications: options.facts ?? rows.map(fact),
    history: options.noHistory ? null : history(rows, options.historyOverrides),
    conversations: options.conversations === undefined ? { status: "success", complete: true, total: 0, returned: 0, conversations: [] } : options.conversations,
    evidenceRequests: options.requests ?? [{ id: REQUEST, title: "Photo ID", state: "OPEN_NOT_STARTED" }],
    selectedConversationId: options.selectedId ?? null,
    selectedConversation: options.selected ?? null,
    liveMailEnabled: options.liveMail ?? false,
  })
}

function failed(status: DeliveryStatus, overrides: Partial<CaseCommunicationRow> = {}) {
  return row({
    lifecycle: "QUEUED",
    deliveryStatus: status,
    lastError: status === "BOUNCED" ? "Recipient address permanently bounced" : status === "COMPLAINED" ? "Recipient marked the message as spam" : status === "SUPPRESSED" ? "Recipient is suppressed" : "Provider rejected the message",
    failedAt: "2026-10-02T12:00:00.000Z",
    queuedAt: "2026-10-01T13:00:00.000Z",
    ...overrides,
  })
}

describe("communications workspace model", () => {
  it("walks draft, review and ready-to-queue without enabling send while mail is off", () => {
    const drafted = model({ rows: [row()], primary: action("PREPARE_EVIDENCE_REQUEST_MESSAGE") })
    expect(drafted.situation).toBe("Draft waiting for review")
    expect(drafted.commands.draftEvidenceRequest).toBe(false)
    const reviewing = model({ rows: [row()], primary: action("REVIEW_EVIDENCE_REQUEST_MESSAGE") })
    expect(reviewing.commands.reviewEvidenceRequest).toBe(true)
    expect(reviewing.commands.queueEvidenceRequest).toBe(false)
    const ready = model({
      rows: [row({ lifecycle: "REVIEWED", reviewedAt: "2026-10-01T12:30:00.000Z" })],
      primary: action("SEND_EVIDENCE_REQUEST", "BLOCKED"),
    })
    expect(ready.situation).toBe("Reviewed and ready to queue")
    expect(ready.commands.queueEvidenceRequest).toBe(false)
    expect(ready.sendBlocked).toBe(true)
    expect(ready.sendBlockedReason).toMatch(/does not turn sending on/)
  })

  it("offers the evidence-request draft only for open requests, by title", () => {
    const prepared = model({
      rows: [],
      primary: action("PREPARE_EVIDENCE_REQUEST_MESSAGE"),
      requests: [
        { id: REQUEST, title: "Photo ID", state: "OPEN_NOT_STARTED" },
        { id: OTHER, title: "Old bill", state: "FULFILLED" },
      ],
    })
    expect(prepared.situation).toBe("Message not prepared")
    expect(prepared.commands.draftEvidenceRequest).toBe(true)
    expect(prepared.evidenceRequests).toEqual([{ id: REQUEST, label: "Photo ID — Waiting for evidence" }])
    expect(JSON.stringify(prepared.evidenceRequests)).not.toMatch(/Evidence request ID|Case ID/)
  })

  it("treats a queued message as waiting and does not offer another send", () => {
    const queued = model({
      rows: [row({ lifecycle: "QUEUED", queuedAt: "2026-10-01T13:00:00.000Z" })],
      primary: action("WAIT_FOR_EMAIL_DELIVERY", "WAITING"),
      liveMail: true,
    })
    expect(queued.situation).toBe("Waiting for email provider")
    expect(queued.waitingNote).toMatch(/another send is not offered/i)
    expect(queued.commands.queueEvidenceRequest).toBe(false)
    expect(queued.commands.replaceDraft).toBe(false)
  })

  it("does not present provider acceptance as delivery", () => {
    const accepted = model({
      rows: [row({
        lifecycle: "QUEUED",
        deliveryStatus: "PROVIDER_ACCEPTED",
        providerAcceptedAt: "2026-10-01T14:00:00.000Z",
        providerMessageId: "msg_1",
        events: [{ eventType: "PROVIDER_ACCEPTED", occurredAt: "2026-10-01T14:00:00.000Z", summary: "Email provider accepted the message", providerMessageId: "msg_1" }],
      })],
      primary: action("WAIT_FOR_EMAIL_DELIVERY", "WAITING"),
    })
    expect(accepted.situation).toBe("Accepted by provider — delivery not confirmed")
    expect(accepted.situationNote).toMatch(/not delivery/)
    expect(accepted.communications[0].delivery).toBe("Accepted by email provider — delivery not yet confirmed")
    expect(accepted.communications[0].delivery).not.toMatch(/^Delivered|Email sent/)
    expect(accepted.communications[0].moments.map(moment => moment.label)).toContain("Provider accepted")
    expect(accepted.communications[0].moments.map(moment => moment.label)).not.toContain("Delivered")
  })

  it("presents confirmed delivery as delivered", () => {
    const delivered = model({
      rows: [row({
        lifecycle: "QUEUED",
        deliveryStatus: "DELIVERED",
        deliveredAt: "2026-10-02T09:00:00.000Z",
        events: [{ eventType: "DELIVERED", occurredAt: "2026-10-02T09:00:00.000Z", summary: "Provider reported delivery", providerMessageId: "msg_1" }],
      })],
    })
    expect(delivered.situation).toBe("Delivered to customer")
    expect(delivered.communications[0].delivery).toBe("Delivered")
    expect(delivered.communications[0].moments.map(moment => moment.label)).toContain("Delivered")
  })

  it("requires reconciliation for unknown acceptance and does not offer a resend", () => {
    const unknown = model({
      rows: [row({
        lifecycle: "QUEUED",
        deliveryStatus: "ACCEPTANCE_UNKNOWN",
        lastError: "Provider acceptance is unknown. Check the email provider before sending again.",
      })],
      primary: action("RECONCILE_EMAIL_DELIVERY"),
      liveMail: true,
    })
    expect(unknown.situation).toBe("Provider acceptance unknown — reconciliation required")
    expect(unknown.commands.reconcileAcceptance).toBe(true)
    expect(unknown.commands.queueEvidenceRequest).toBe(false)
    expect(unknown.commands.replaceDraft).toBe(false)
    expect(unknown.waitingNote).toMatch(/cannot mark the message delivered/)
    expect(unknown.waitingNote).toMatch(/does not send again/)
  })

  it.each([
    ["BOUNCED", "permanently bounced"],
    ["SUPPRESSED", "suppressed"],
    ["COMPLAINED", "spam"],
    ["FAILED", "rejected"],
  ] as const)("shows contact recovery for %s without changing the recipient snapshot", (status, reason) => {
    const message = failed(status)
    const recovered = model({
      rows: [message],
      primary: action("RECOVER_CUSTOMER_CONTACT"),
    })
    expect(recovered.situation).toBe("Delivery failed — contact recovery required")
    expect(recovered.recovery?.recipient).toBe("alex@example.com")
    expect(recovered.recovery?.reason).toMatch(new RegExp(reason, "i"))
    expect(recovered.recovery?.limitation).toMatch(/does not change the customer email/)
    expect(recovered.commands.replaceDraft).toBe(false)
    expect(recovered.communications[0].recipient).toBe("alex@example.com")
    expect(recovered.communications[0].role).toBe("current")
  })

  it("offers a replacement draft only after a different verified address is available, and keeps it a draft", () => {
    const same = model({
      rows: [failed("BOUNCED", { canReplace: false })],
      primary: action("RECOVER_CUSTOMER_CONTACT"),
    })
    expect(same.commands.replaceDraft).toBe(false)
    expect(same.recovery?.replacementNote).toMatch(/different verified/)
    const changed = model({
      rows: [failed("BOUNCED", { canReplace: true })],
      primary: action("RECOVER_CUSTOMER_CONTACT"),
      historyOverrides: { verifiedEmail: "alex.new@example.com" },
    })
    expect(changed.commands.replaceDraft).toBe(true)
    expect(changed.recovery?.verifiedEmail).toBe("alex.new@example.com")
    expect(changed.recovery?.replacementNote).toMatch(/has not been sent/)
    expect(changed.communications[0].recipient).toBe("alex@example.com")
  })

  it("drops a conversation that belongs to another case and fails a foreign selection closed", () => {
    const listed = model({
      conversations: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        conversations: [{
          id: OTHER,
          state: "OPEN",
          subject: "Someone else's mail",
          sender: "other@example.com",
          receivedAt: "2026-10-01T00:00:00.000Z",
          caseId: OTHER,
          caseReference: "PR-OTHER",
          senderMatch: "MATCHES_VERIFIED_CONTACT",
          hasAttachment: false,
          assignedAdminId: null,
          needsAttention: false,
          version: 1,
        }],
      },
    })
    expect(listed.conversations).toEqual([])
    expect(listed.notices.join(" ")).toMatch(/belongs to another case/)
    const foreign = model({
      selectedId: OTHER,
      selected: {
        status: "success",
        conversation: {
          id: OTHER,
          state: "OPEN",
          subject: "Secret thread",
          caseId: OTHER,
          caseReference: "PR-OTHER",
          assignedAdminId: null,
          needsAttention: false,
          replyAlias: "a".repeat(32),
          version: 1,
          recipientSuppressed: false,
        },
        entries: [{ id: "entry", kind: "INBOUND_EMAIL", bodyText: "private body", senderMatch: "MATCHES_VERIFIED_CONTACT" }],
      },
    })
    expect(foreign.selected.kind).toBe("foreign")
  })

  it("does not treat a sender match as authentication", () => {
    const linked = model({
      conversations: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        conversations: [{
          id: COMM,
          state: "OPEN",
          subject: "Hello",
          sender: "alex@example.com",
          receivedAt: "2026-10-01T00:00:00.000Z",
          caseId: CASE_ID,
          caseReference: "PR-1001",
          senderMatch: "MATCHES_VERIFIED_CONTACT",
          hasAttachment: true,
          assignedAdminId: null,
          needsAttention: true,
          version: 1,
        }],
      },
    })
    expect(linked.conversations[0].senderLabel).toBe("Matches a verified contact — not authentication")
    expect(linked.conversations[0].href).toBe(`/cases/${CASE_ID}/communications?conversation=${COMM}`)
  })

  it("says the history is unknown when the read is missing or truncated", () => {
    const missing = model({ noHistory: true, facts: [] })
    expect(missing.situation).toMatch(/could not be loaded/)
    expect(missing.situation).not.toBe("Message not prepared")
    expect(missing.commands.draftEvidenceRequest).toBe(false)
    const truncated = model({
      rows: [row({ deliveryStatus: "DELIVERED", lifecycle: "QUEUED" })],
      historyOverrides: { complete: false, total: 101, returned: 1 },
      primary: action("PREPARE_EVIDENCE_REQUEST_MESSAGE"),
    })
    expect(truncated.situation).toMatch(/incomplete/)
    expect(truncated.notices.join(" ")).toMatch(/not the full history/)
    expect(truncated.commands.draftEvidenceRequest).toBe(false)
    expect(truncated.currentCommunicationId).toBeNull()
    expect(truncated.communications[0].delivery).not.toBe("Not sent")
  })

  it("withholds journey commands on a closed case", () => {
    const closed = model({
      caseStatus: "CLOSED",
      rows: [row()],
      primary: action("REVIEW_EVIDENCE_REQUEST_MESSAGE"),
    })
    expect(closed.commands.reviewEvidenceRequest).toBe(false)
    expect(closed.commands.draftEvidenceRequest).toBe(false)
    expect(closed.commands.queueEvidenceRequest).toBe(false)
    expect(closed.commands.replaceDraft).toBe(false)
    expect(closed.caseUpdateAllowed).toBe(false)
  })

  it("flags a delivery event that contradicts the recorded status", () => {
    const conflicted = model({
      rows: [row({
        lifecycle: "QUEUED",
        deliveryStatus: "PROVIDER_ACCEPTED",
        events: [{ eventType: "DELIVERED", occurredAt: "2026-10-02T00:00:00.000Z", summary: "Provider reported delivery", providerMessageId: "msg_1" }],
      })],
      primary: action("RECONCILE_EMAIL_DELIVERY"),
    })
    expect(conflicted.notices.join(" ")).toMatch(/does not match the recorded delivery state/)
    expect(conflicted.commands.reconcileAcceptance).toBe(false)
  })
})
