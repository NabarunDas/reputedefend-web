import { describe, expect, it } from "vitest"
import { acceptTelloyaOffer } from "./telloya-offer-delivery"
import { prepareTelloyaOffer, sendTelloyaOffer, type TelloyaOfferVersion } from "./telloya-offer"
import { applyTelloyaBillingEvent, emptyTelloyaBilling, prepareTelloyaCheckout, startTelloyaCheckout, telloyaCheckoutReturn } from "./telloya-checkout"

function acceptedOffer(): TelloyaOfferVersion {
  const draft = prepareTelloyaOffer([], {
    demoStatus: "COMPLETED",
    businessAuthorityVerified: true,
    exceptionRequested: false,
    planCode: "growth",
    planStatus: "APPROVED",
    planVersionId: "22222222-2222-4222-8222-222222222222",
    amountPence: 7900,
    includedMinutes: 300,
    guardLocations: 2,
    voiceLocations: 1,
    phoneNumbers: 1,
    overageOptIn: false,
    overageCapPence: null,
    fixture: false,
  })
  const sent = sendTelloyaOffer(draft.versions, { agreementStatus: "APPROVED", taxApproval: "APPROVED" })
  const accepted = acceptTelloyaOffer({
    versions: sent.versions,
    amendments: [],
    version: 1,
    identityVerified: true,
    businessMatches: true,
    agreementHash: "agreement-hash",
    recurringConsent: true,
  })
  const offer = accepted.versions[0]
  if (!offer) throw new Error("missing offer")
  return offer
}

const approval = { agreementStatus: "APPROVED", agreementHash: "agreement-hash", taxApproval: "APPROVED" }

describe("Telloya monthly checkout", () => {
  it("prepares a subscription intent only from an accepted offer and never treats the return as payment", () => {
    const offer = acceptedOffer()
    const preview = { ...offer, fixture: true, status: "PREVIEW" as const }
    expect(prepareTelloyaCheckout(preview, approval).result).toBe("closed")
    expect(prepareTelloyaCheckout(offer, { ...approval, taxApproval: "UNAPPROVED" }).result).toBe("legal_or_tax_unapproved")
    const prepared = prepareTelloyaCheckout(offer, approval)
    expect(prepared.intent).toMatchObject({ mode: "subscription", interval: "month", currency: "GBP", amountPence: 9898 })
    expect(telloyaCheckoutReturn()).toEqual({ state: "verifying", message: "Payment being verified" })
    const started = startTelloyaCheckout(emptyTelloyaBilling(), prepared.intent!)
    expect(startTelloyaCheckout(started.record, prepared.intent!).result).toBe("duplicate")
  })

  it("ignores a spoofed or mismatched event and separates the first invoice from a later one", () => {
    const offer = acceptedOffer()
    let record = emptyTelloyaBilling()
    const spoofed = applyTelloyaBillingEvent(record, {
      id: "evt_spoof",
      type: "invoice.paid",
      signatureValid: false,
      livemode: false,
      amountPence: 9898,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
      billingReason: "subscription_create",
    })
    expect(spoofed.result).toBe("rejected")
    expect(spoofed.record.state).toBe("none")
    record = applyTelloyaBillingEvent(record, {
      id: "evt_return",
      type: "checkout.session.completed",
      signatureValid: true,
      livemode: false,
      amountPence: 9898,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
    }).record
    expect(record.state).toBe("verifying")
    const mismatch = applyTelloyaBillingEvent(record, {
      id: "evt_fx",
      type: "invoice.paid",
      signatureValid: true,
      livemode: false,
      amountPence: 9898,
      currency: "USD",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
      billingReason: "subscription_create",
    })
    expect(mismatch.result).toBe("currency_mismatch")
    expect(mismatch.record.state).toBe("verifying")
    record = applyTelloyaBillingEvent(record, {
      id: "evt_initial",
      type: "invoice.paid",
      signatureValid: true,
      livemode: false,
      amountPence: 9898,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
      billingReason: "subscription_create",
    }).record
    expect(record.state).toBe("initial_paid")
    expect(applyTelloyaBillingEvent(record, {
      id: "evt_initial",
      type: "invoice.paid",
      signatureValid: true,
      livemode: false,
      amountPence: 9898,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
      billingReason: "subscription_create",
    }).result).toBe("duplicate")
    record = applyTelloyaBillingEvent(record, {
      id: "evt_fail",
      type: "invoice.payment_failed",
      signatureValid: true,
      livemode: false,
      amountPence: 9898,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
    }).record
    expect(record.state).toBe("past_due")
    record = applyTelloyaBillingEvent(record, {
      id: "evt_cancel",
      type: "customer.subscription.updated",
      signatureValid: true,
      livemode: false,
      amountPence: null,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
      cancelAtPeriodEnd: true,
    }).record
    expect(record.state).toBe("cancel_at_period_end")
    const intent = prepareTelloyaCheckout(offer, approval).intent!
    expect(startTelloyaCheckout(record, intent).result).toBe("duplicate_checkout")
    record = applyTelloyaBillingEvent(record, {
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      signatureValid: true,
      livemode: false,
      amountPence: null,
      currency: "GBP",
      subscriptionId: "sub_test",
      expectedAmountPence: 9898,
    }).record
    expect(record.state).toBe("cancelled")
    expect(record.subscriptionId).toBeNull()
  })
})
