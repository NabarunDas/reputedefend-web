import { describe, expect, it } from "vitest"
import { acceptTelloyaOffer } from "./telloya-offer-delivery"
import { prepareTelloyaOffer, sendTelloyaOffer, type TelloyaOfferVersion } from "./telloya-offer"
import { classifyStoredTelloyaInvoice, emptyTelloyaBilling, prepareTelloyaCheckout, startTelloyaCheckout, telloyaCheckoutReturn, verifyTelloyaProviderEvent, type VerifiedTelloyaEvent } from "./telloya-checkout"

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
    expect(startTelloyaCheckout(emptyTelloyaBilling(), prepared.intent!).result).toBe("not_created")
    expect(emptyTelloyaBilling().state).toBe("none")
  })

  it("compares a verified invoice with the stored subscription and rejects a spoofed signature", () => {
    const stored = { amountMinor: 9898, currency: "GBP" as const, stripeSubscriptionId: "sub_stored" }
    const construct = (raw: string, signature: string) => {
      if (signature !== "signed" || !raw.includes("evt_initial")) throw new Error("signature mismatch")
      return {
        id: "evt_initial",
        type: "invoice.paid",
        livemode: false,
        data: { object: { amount_paid: 9898, currency: "gbp", subscription: "sub_stored", billing_reason: "subscription_create" } },
      }
    }
    expect(() => verifyTelloyaProviderEvent("{}", "bad", "secret", construct)).toThrow(/signature mismatch/)
    const verified = verifyTelloyaProviderEvent("{\"id\":\"evt_initial\"}", "signed", "secret", construct)
    expect(classifyStoredTelloyaInvoice(stored, verified)).toBe("matches_initial_invoice")
    expect(classifyStoredTelloyaInvoice({ ...stored, amountMinor: 100 }, verified)).toBe("amount_mismatch")
    expect(classifyStoredTelloyaInvoice({ ...stored, stripeSubscriptionId: "sub_other" }, verified)).toBe("identity_mismatch")
    const renewal = { ...verified, billingReason: "subscription_cycle" } as VerifiedTelloyaEvent
    expect(classifyStoredTelloyaInvoice(stored, renewal)).toBe("matches_renewal_invoice")
    const live = { ...verified, livemode: true } as VerifiedTelloyaEvent
    expect(classifyStoredTelloyaInvoice(stored, live)).toBe("livemode_rejected")
  })
})
