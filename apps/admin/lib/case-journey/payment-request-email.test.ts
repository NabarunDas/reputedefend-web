import { describe, expect, it } from "vitest"
import type { CaseCommunicationRead, CaseCommunicationRow } from "../communications/model"
import { offerPaymentRequestSend, projectPaymentRequestEmail } from "./payment-request-email"

const CASE_REF = "PR-26-GHNLB9"
const URL = `https://customer.example/portal/cases/${CASE_REF}/payments`
const COMM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function row(overrides: Partial<CaseCommunicationRow> = {}): CaseCommunicationRow {
  return {
    id: COMM,
    caseId: "55555555-5555-4555-8555-555555555555",
    caseReference: CASE_REF,
    evidenceRequestId: null,
    communicationType: "GUIDED_PAYMENT_REQUEST",
    templateKey: "GUIDED_PAYMENT_REQUEST",
    templateVersion: 1,
    lifecycle: "QUEUED",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Pay for your ProfileRelaunch Guided Relaunch — SO-26-GHHRGY",
    bodyText: `Pay £99 securely\n${URL}`,
    bodyHtml: `<a href="${URL}">Pay £99 securely</a>`,
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

function read(communications: CaseCommunicationRow[]): CaseCommunicationRead {
  return {
    status: "success",
    complete: true,
    total: communications.length,
    returned: communications.length,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications,
  }
}

describe("Step 7 payment-request status", () => {
  it("shows no email until one is queued, then keeps provider states distinct from payment", () => {
    expect(projectPaymentRequestEmail(read([]), CASE_REF).phase).toBe("none")
    expect(offerPaymentRequestSend(projectPaymentRequestEmail(read([]), CASE_REF))).toBe(true)
    expect(offerPaymentRequestSend(projectPaymentRequestEmail(read([row()]), CASE_REF, { devSend: true }))).toBe(false)
    expect(projectPaymentRequestEmail(read([row()]), CASE_REF)).toMatchObject({ phase: "queued", canProcessPending: false })
    expect(projectPaymentRequestEmail(read([row()]), CASE_REF, { devSend: true }).canProcessPending).toBe(true)
    expect(projectPaymentRequestEmail(read([row({ deliveryStatus: "PROVIDER_ACCEPTED" })]), CASE_REF).phase).toBe("submitted")
    expect(projectPaymentRequestEmail(read([row({ deliveryStatus: "DELIVERED" })]), CASE_REF).phase).toBe("delivered")
    expect(projectPaymentRequestEmail(read([row({ deliveryStatus: "BOUNCED" })]), CASE_REF).phase).toBe("attention")
    expect(projectPaymentRequestEmail(read([row({ deliveryStatus: "ACCEPTANCE_UNKNOWN", firstProviderAttemptAt: "2026-10-03T12:05:00.000Z" })]), CASE_REF).canProcessPending).toBe(false)
    expect(offerPaymentRequestSend(projectPaymentRequestEmail(read([row({ deliveryStatus: "DELIVERED" })]), CASE_REF))).toBe(false)
  })

  it("does not treat a bearer link or a second email as the payment request", () => {
    const bearer = row({ bodyText: "https://customer.example/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa#t=secret", bodyHtml: "https://customer.example/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa#t=secret" })
    expect(projectPaymentRequestEmail(read([bearer]), CASE_REF).phase).toBe("unavailable")
    expect(projectPaymentRequestEmail(read([row(), row({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })]), CASE_REF).detail).toMatch(/More than one/)
    expect(projectPaymentRequestEmail(null, CASE_REF).phase).toBe("unavailable")
  })
})
