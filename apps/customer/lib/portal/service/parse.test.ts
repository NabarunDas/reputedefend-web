import { describe, expect, it } from "vitest"
import { parseCaseService, type CustomerCaseService } from "./parse"

const selector = `ca-${"ab".repeat(32)}`
const validUntil = "2026-11-01T12:00:00.000Z"

function payload(overrides: Record<string, unknown> = {}) {
  return {
    found: true,
    case: {
      reference: "PR-26-ABCDEF",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      serviceTrack: "GUIDED",
    },
    quote: {
      reference: "QT-26-ABCDEF",
      serviceName: "Guided profile help",
      scope: "We prepare the profile relaunch for this location.",
      exclusions: "Directory listings outside this location are excluded.",
      successDefinition: "Success means the profile is submitted for reinstatement.",
      standardAmountMinor: 29900,
      discountAmountMinor: 0,
      quotedAmountMinor: 29900,
      taxAmountMinor: 0,
      totalAmountMinor: 29900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      paymentTiming: "You pay the quoted amount before work starts.",
      validUntil,
      termsReference: "The service terms sent with this quote apply.",
      status: "offered",
      orderReference: null,
      acceptedAt: null,
      paymentNext: null,
      canAccept: true,
    },
    serviceAgreement: null,
    casePermission: null,
    actions: [{ selector, kind: "quote", target: null }],
    ...overrides,
  }
}

describe("case service parser", () => {
  it("accepts the portal projection and rejects an unexpected key", () => {
    const parsed = parseCaseService(payload())
    expect(parsed).toMatchObject({ found: true, case: { reference: "PR-26-ABCDEF" } })
    expect(parseCaseService({ ...payload(), stripeCustomerId: "cus_secret" })).toBeNull()
    expect(parseCaseService({ ...payload(), quote: { ...(payload().quote as object), quoteId: "11111111-1111-4111-8111-111111111111" } })).toBeNull()
  })

  it("treats a bare not-found object as missing and anything richer as unavailable", () => {
    expect(parseCaseService({ found: false })).toBe("not_found")
    expect(parseCaseService({ found: false, reason: "not_owner" })).toBeNull()
    expect(parseCaseService({ found: true })).toBeNull()
  })

  it("fails closed on an unexpected status, a quote selector used as a revocation, and a raw action id", () => {
    const badStatus = payload()
    ;(badStatus.quote as { status: string }).status = "OFFERED"
    expect(parseCaseService(badStatus)).toBeNull()
    expect(parseCaseService(payload({
      actions: [{ selector, kind: "revocation", target: null }],
    }))).toBeNull()
    expect(parseCaseService(payload({
      actions: [{ selector: "11111111-1111-4111-8111-111111111111", kind: "quote", target: null }],
    }))).toBeNull()
  })

  it("keeps the parsed value free of internal identifiers", () => {
    const parsed = parseCaseService(payload()) as CustomerCaseService
    expect(JSON.stringify(parsed)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(parsed.actions[0]?.selector).toBe(selector)
  })
})
