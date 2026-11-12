import { describe, expect, it } from "vitest"
import { migrationHead, pendingMigrations } from "../recovery/manifest"
import { absentTelloyaDemo, transitionTelloyaDemo, type TelloyaDemoCommand } from "./telloya-demo-status"
import { prepareTelloyaCheckout, classifyStoredTelloyaInvoice, telloyaCheckoutReturn, verifyTelloyaProviderEvent } from "./telloya-checkout"
import { telloyaJourneyProgress } from "./telloya-admin-journey"
import { acceptTelloyaOffer, queueTelloyaOfferEmail, requestTelloyaAmendment, resolveTelloyaAmendment, telloyaOfferMessage } from "./telloya-offer-delivery"
import { prepareTelloyaOffer, sendTelloyaOffer, telloyaCataloguePence, type TelloyaOfferInput } from "./telloya-offer"
import { requestTelloyaCancellation, telloyaServiceView, telloyaVoiceAllowed } from "./telloya-operations"
import { telloyaSetupChecklist } from "./telloya-setup"

const approval = { agreementStatus: "APPROVED", taxApproval: "APPROVED" }

function demo(overrides: Partial<TelloyaDemoCommand> = {}): TelloyaDemoCommand {
  return {
    enquiryPresent: true,
    role: "staff",
    actorId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 0,
    status: "BOOKED",
    at: "2026-11-20T15:00:00.000Z",
    timezone: "Europe/London",
    note: "Offline.",
    idempotencyKey: "journey-book-0001",
    enabled: true,
    migrationApplied: true,
    ...overrides,
  }
}

function growth(overrides: Partial<TelloyaOfferInput> = {}): TelloyaOfferInput {
  return {
    demoStatus: "COMPLETED",
    businessAuthorityVerified: true,
    exceptionRequested: false,
    planCode: "growth",
    planStatus: "APPROVED",
    planVersionId: "TELLOYA-TEST-GROWTH",
    amountPence: 7900,
    includedMinutes: 300,
    guardLocations: 2,
    voiceLocations: 1,
    phoneNumbers: 1,
    overageOptIn: false,
    overageCapPence: null,
    fixture: false,
    ...overrides,
  }
}

describe("Telloya admin preview journey", () => {
  it("walks a synthetic Growth enquiry through a blocked go-live", () => {
    expect(telloyaJourneyProgress({ source: "telloya", requestIntent: "personalised-demo", planTier: "growth" })?.current).toBe("demo")
    const booked = transitionTelloyaDemo(absentTelloyaDemo(), demo())
    const completed = transitionTelloyaDemo(booked.record, demo({
      expectedVersion: 1,
      status: "COMPLETED",
      at: "2026-11-20T16:00:00.000Z",
      idempotencyKey: "journey-done-0001",
    }))
    expect(completed.record.status).toBe("COMPLETED")

    const fixture = prepareTelloyaOffer([], growth({ fixture: true, planStatus: "MISSING", planVersionId: null }))
    expect(sendTelloyaOffer(fixture.versions, approval).result).toBe("send_closed")

    const draft = prepareTelloyaOffer([], growth())
    expect(draft.versions[0].monthlyTotalPence).toBe(9898)
    expect(sendTelloyaOffer(draft.versions, { agreementStatus: "DRAFT", taxApproval: "UNAPPROVED" }).result).toBe("legal_or_tax_unapproved")
    const sent = sendTelloyaOffer(draft.versions, approval)
    const message = telloyaOfferMessage({
      enquiryRef: "TY-26-ABCDEF",
      customerId: "customer-1",
      selector: "offer-selector-1",
      version: sent.versions[0],
    })
    const queued = queueTelloyaOfferEmail([], sent.versions[0], message)
    expect(queued.result).toBe("queued")
    expect(queueTelloyaOfferEmail(queued.messages, sent.versions[0], message).result).toBe("duplicate")

    const amendment = requestTelloyaAmendment({
      versions: sent.versions,
      amendments: [],
      version: 1,
      message: "Please keep one Guard location.",
      categories: ["guard"],
      businessMatches: true,
      emailVerified: true,
    })
    const revised = resolveTelloyaAmendment({
      versions: amendment.versions,
      amendments: amendment.amendments,
      decision: "accepted",
      replacement: { ...sent.versions[0], version: 2, guardLocations: 1, guardAmountPence: 999, monthlyTotalPence: 8899, termsHash: "revised-growth" },
    })
    expect(acceptTelloyaOffer({
      versions: revised.versions,
      amendments: revised.amendments,
      version: 1,
      identityVerified: true,
      businessMatches: true,
      agreementHash: "test-agreement",
      recurringConsent: true,
    }).result).toBe("stale_version")
    const accepted = acceptTelloyaOffer({
      versions: revised.versions,
      amendments: revised.amendments,
      version: 2,
      identityVerified: true,
      businessMatches: true,
      agreementHash: "test-agreement",
      recurringConsent: true,
    })
    const checkout = prepareTelloyaCheckout(accepted.versions.find(version => version.current), {
      agreementStatus: "APPROVED",
      agreementHash: "test-agreement",
      taxApproval: "APPROVED",
    })
    expect(checkout.intent).toMatchObject({ mode: "subscription", interval: "month", amountPence: 8899 })
    expect(telloyaCheckoutReturn().message).toBe("Payment being verified")
    const stored = { amountMinor: 8899, currency: "GBP" as const, stripeSubscriptionId: "sub_stored" }
    const verified = verifyTelloyaProviderEvent("{\"id\":\"evt_test_invoice\"}", "signed", "secret", (raw, signature) => {
      if (signature !== "signed" || !raw.includes("evt_test_invoice")) throw new Error("signature mismatch")
      return { id: "evt_test_invoice", type: "invoice.paid", livemode: false, data: { object: { amount_paid: 8899, currency: "gbp", subscription: "sub_stored", billing_reason: "subscription_create" } } }
    })
    expect(classifyStoredTelloyaInvoice(stored, verified)).toBe("matches_initial_invoice")
    expect(classifyStoredTelloyaInvoice({ ...stored, amountMinor: 1 }, verified)).toBe("amount_mismatch")

    const setup = telloyaSetupChecklist({ initialInvoicePaid: true, completed: ["preferences", "ai", "number", "forwarding"] })
    expect(setup.customerLabel).toBe("Preparing your receptionist")
    expect(setup.goLive).toBe("blocked")
    expect(telloyaSetupChecklist({ initialInvoicePaid: false, completed: [] }).customerStatus).toBe("not_started")
    const view = telloyaServiceView({ offer: accepted.versions.find(version => version.current) ?? null, billing: "initial_paid", renewalDate: "2026-12-20" })
    expect(view.usage).toMatch(/not available/)
    expect(telloyaVoiceAllowed("initial_paid")).toBe(false)
    expect(requestTelloyaCancellation("initial_paid").billing).toBe("cancel_at_period_end")
    expect(migrationHead.filename).toBe("20261112223000_telloya_approve_send_offer_v1.sql")
    expect(migrationHead.appliedToDev).toBe(false)
    expect(pendingMigrations().map(entry => entry.filename)).toEqual(["20261112223000_telloya_approve_send_offer_v1.sql"])
  })

  it("covers the other catalogue choices and the closed paths", () => {
    expect(telloyaCataloguePence("basic")).toEqual({ amountPence: 4900, includedMinutes: 120 })
    expect(telloyaCataloguePence("pro")).toEqual({ amountPence: 12000, includedMinutes: 500 })
    expect(prepareTelloyaOffer([], growth({ planCode: "custom", amountPence: null, includedMinutes: null })).result).toBe("custom_requires_owner_approval")
    expect(telloyaJourneyProgress({ source: "telloya" })?.planLabel).toBe("Plan to be confirmed")
    expect(prepareTelloyaOffer([], growth({ overageOptIn: true, overageCapPence: null })).result).toBe("overage_cap_required")
    expect(prepareTelloyaOffer([], growth({ guardLocations: -1 })).result).toBe("invalid_guard_locations")
    expect(prepareTelloyaOffer([], growth({ voiceLocations: 2 })).result).toBe("standard_tier_location_limit")
    expect(prepareTelloyaOffer([], growth({ amountPence: 100 })).result).toBe("price_not_approved")
    expect(transitionTelloyaDemo(absentTelloyaDemo(), demo({ role: "customer" })).result).toBe("forbidden")
    expect(requestTelloyaAmendment({
      versions: [],
      amendments: [],
      version: 1,
      message: "Change it",
      categories: ["other"],
      businessMatches: false,
      emailVerified: false,
    }).result).toBe("forbidden")
    expect(() => verifyTelloyaProviderEvent("{}", "bad", "secret", () => { throw new Error("signature mismatch") })).toThrow(/signature mismatch/)
  })
})
