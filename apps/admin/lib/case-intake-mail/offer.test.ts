import { describe, expect, it } from "vitest"
import { intakeMailRetryOffer, isIntakeMailPublicRef, type StoredIntakeMail } from "./offer"

function row(type: string, overrides: Partial<StoredIntakeMail> = {}): StoredIntakeMail {
  return {
    communicationType: type,
    recipient: type === "CASE_RECEIVED_INTERNAL" ? "owner@example.com" : "alex@example.com",
    status: "FAILED",
    providerMessageId: null,
    metadata: {},
    ...overrides,
  }
}

const pair = [row("CASE_RECEIVED_CUSTOMER"), row("CASE_RECEIVED_INTERNAL")]

describe("intake mail retry offer", () => {
  it("offers both stored destinations when both initial emails are unsent", () => {
    expect(intakeMailRetryOffer(pair)).toEqual({
      destinations: [
        { role: "Customer acknowledgement", recipient: "alex@example.com", willSend: true },
        { role: "Internal notification", recipient: "owner@example.com", willSend: true },
      ],
    })
    expect(isIntakeMailPublicRef("PR-26-RZYCE4")).toBe(true)
  })

  it("keeps an already accepted destination visible and does not offer it for sending", () => {
    expect(intakeMailRetryOffer([
      row("CASE_RECEIVED_CUSTOMER", { status: "SENT", providerMessageId: "provider-1" }),
      row("CASE_RECEIVED_INTERNAL"),
    ])).toEqual({
      destinations: [
        { role: "Customer acknowledgement", recipient: "alex@example.com", willSend: false },
        { role: "Internal notification", recipient: "owner@example.com", willSend: true },
      ],
    })
  })

  it("hides the control when a row is in flight, unknown, or exhausted", () => {
    expect(intakeMailRetryOffer([
      row("CASE_RECEIVED_CUSTOMER", { metadata: { intakeState: "unknown", intakeClaim: "claim-1" } }),
      row("CASE_RECEIVED_INTERNAL"),
    ])).toBeNull()
    expect(intakeMailRetryOffer([
      row("CASE_RECEIVED_CUSTOMER", { metadata: { intakeState: "sending", intakeClaim: "claim-1" } }),
      row("CASE_RECEIVED_INTERNAL"),
    ])).toBeNull()
    expect(intakeMailRetryOffer([
      row("CASE_RECEIVED_CUSTOMER", { metadata: { intakeAttempts: 3, intakeState: "rejected" } }),
      row("CASE_RECEIVED_INTERNAL", { status: "SENT", providerMessageId: "provider-1" }),
    ])).toBeNull()
  })

  it("ignores a later communication and refuses an incomplete initial pair", () => {
    expect(intakeMailRetryOffer([
      ...pair,
      row("EVIDENCE_REQUEST", { recipient: "later@example.com", status: "PENDING" }),
    ])?.destinations).toHaveLength(2)
    expect(intakeMailRetryOffer([row("CASE_RECEIVED_CUSTOMER")])).toBeNull()
    expect(intakeMailRetryOffer([
      row("CASE_RECEIVED_CUSTOMER", { status: "SENT", providerMessageId: "provider-1" }),
      row("CASE_RECEIVED_INTERNAL", { status: "SENT", providerMessageId: "provider-2" }),
    ])).toBeNull()
  })
})
