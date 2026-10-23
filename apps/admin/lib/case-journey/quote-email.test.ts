import { describe, expect, it } from "vitest"
import type { CaseCommunicationRead, CaseCommunicationRow } from "../communications/model"
import { emptyQuoteEmail, projectQuoteEmail } from "./quote-email"

const ACTION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const COMM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function row(overrides: Partial<CaseCommunicationRow> = {}): CaseCommunicationRow {
  return {
    id: COMM,
    caseId: "55555555-5555-4555-8555-555555555555",
    caseReference: "PR-1",
    evidenceRequestId: null,
    communicationType: "QUOTE_OFFER",
    templateKey: "QUOTE_OFFER",
    templateVersion: 1,
    lifecycle: "QUEUED",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Your ProfileRelaunch quotation",
    bodyText: `https://customer.example/action/${ACTION}`,
    bodyHtml: `<a href="https://customer.example/action/${ACTION}">Review and accept quotation</a>`,
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: true,
    contentVersion: 1,
    version: 1,
    draftedAt: "2026-10-03T12:00:00.000Z",
    reviewedAt: null,
    queuedAt: "2026-10-03T12:00:00.000Z",
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    events: [],
    eventsTruncated: false,
    canReplace: false,
    ...overrides,
  }
}

function read(rows: CaseCommunicationRow[], complete = true): CaseCommunicationRead {
  return {
    status: "success",
    complete,
    total: rows.length,
    returned: rows.length,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications: rows,
  }
}

describe("projectQuoteEmail", () => {
  it("treats a missing or incomplete history as unconfirmed", () => {
    expect(projectQuoteEmail(null, ACTION)).toEqual({ phase: "unavailable", communicationId: null, canProcessPending: false })
    expect(projectQuoteEmail(read([row()], false), ACTION).phase).toBe("unavailable")
  })

  it("does not invent a quotation email when the offered quote has no communication", () => {
    expect(projectQuoteEmail(read([]), null)).toEqual(emptyQuoteEmail)
  })

  it("keeps a queued quotation email distinct from sent or delivered", () => {
    expect(projectQuoteEmail(read([row()]), ACTION, { devSend: true })).toEqual({
      phase: "queued",
      communicationId: COMM,
      canProcessPending: true,
    })
    expect(projectQuoteEmail(read([row()]), ACTION, { devSend: false }).canProcessPending).toBe(false)
  })

  it("does not offer another provider call after an attempt or unknown acceptance", () => {
    expect(projectQuoteEmail(read([row({ deliveryStatus: "ACCEPTANCE_UNKNOWN", firstProviderAttemptAt: "2026-10-03T12:05:00.000Z" })]), ACTION, { devSend: true })).toMatchObject({
      phase: "attention",
      canProcessPending: false,
    })
    expect(projectQuoteEmail(read([row({ firstProviderAttemptAt: "2026-10-03T12:05:00.000Z" })]), ACTION, { devSend: true }).canProcessPending).toBe(false)
  })

  it("does not call provider acceptance delivery", () => {
    expect(projectQuoteEmail(read([row({ deliveryStatus: "PROVIDER_ACCEPTED", providerAcceptedAt: "2026-10-03T12:05:00.000Z" })]), ACTION).phase).toBe("submitted")
    expect(projectQuoteEmail(read([row({ deliveryStatus: "DELIVERED", deliveredAt: "2026-10-03T12:06:00.000Z" })]), ACTION).phase).toBe("delivered")
  })

  it("does not treat a manual link with no matching email as emailed", () => {
    expect(projectQuoteEmail(read([]), ACTION)).toEqual(emptyQuoteEmail)
    expect(projectQuoteEmail(read([row({ bodyText: `https://customer.example/action/${OTHER}`, bodyHtml: null })]), ACTION)).toEqual(emptyQuoteEmail)
  })

  it("fails closed when the quotation email cannot be bound to one action", () => {
    const ambiguous = row({
      bodyText: `https://customer.example/action/${ACTION} https://customer.example/action/${OTHER}`,
      bodyHtml: null,
    })
    expect(projectQuoteEmail(read([ambiguous]), ACTION).phase).toBe("unavailable")
    expect(projectQuoteEmail(read([row(), row({ id: OTHER })]), ACTION).phase).toBe("unavailable")
    expect(projectQuoteEmail(read([row({ bodyText: null, bodyHtml: null })]), ACTION).phase).toBe("unavailable")
  })

  it("does not hide an in-flight quotation email when the open link is gone", () => {
    expect(projectQuoteEmail(read([row()]), null)).toMatchObject({ phase: "attention", canProcessPending: false })
  })
})
