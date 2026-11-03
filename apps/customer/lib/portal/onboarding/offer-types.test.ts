import { describe, expect, it } from "vitest"
import { parseCommercialOffer } from "./offer-types"

const agreement = {
  title: "Telloya service agreement",
  body: "This agreement covers Telloya for the named locations and no other service.",
  cancellation: "Either party may cancel as stated in this agreement.",
  versionRef: "TELLOYA-TERMS-1",
  confirmations: [{ key: "business_authority", label: "I can accept this offer for the business." }],
}

const ready = {
  status: "ready",
  offerRef: "VC-26-AB2347",
  offerVersion: 2,
  product: "Telloya",
  businessName: "Harbour Bakery",
  locations: ["Dock", "High Street"],
  services: ["Telloya"],
  priceMinor: 4900,
  currency: "GBP",
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: null,
  totalMinor: 4900,
  cadence: "MONTH",
  recurring: true,
  agreement,
  nextStep: "Accept the agreement to record this offer. Payment and service setup follow separately.",
}

describe("commercial offer parser", () => {
  it("keeps an eligible offer and an accepted record, and rejects a leaked field", () => {
    expect(parseCommercialOffer(ready)?.status).toBe("ready")
    const { offerVersion: _version, ...accepted } = ready
    expect(parseCommercialOffer({
      ...accepted,
      status: "accepted",
      acceptedAt: "2026-11-03T12:00:00.000Z",
    })?.status).toBe("accepted")
    expect(parseCommercialOffer({ status: "unavailable" })).toEqual({ status: "unavailable" })
    const authority = parseCommercialOffer({
      status: "unavailable",
      reason: "authority",
      nextStep: "You are not authorised to review this offer.",
    })
    expect(authority?.status === "unavailable" && authority.reason).toBe("authority")
    expect(parseCommercialOffer({ ...ready, subscriptionId: "a032a000-0000-4000-8000-000000000031" })).toBeNull()
    expect(parseCommercialOffer({ ...ready, agreement: { ...agreement, contentHash: "ab".repeat(32) } })).toBeNull()
    expect(parseCommercialOffer({ ...ready, totalMinor: 1 })).toBeNull()
    expect(parseCommercialOffer({ ...ready, recurring: false })).toBeNull()
    expect(parseCommercialOffer(null)).toBeNull()
  })

  it("keeps a pending agreement distinct from a withdrawn offer", () => {
    expect(parseCommercialOffer({
      status: "terms_pending",
      offerRef: "VC-26-AB2347",
      product: "Complete",
      businessName: "North Yard",
      locations: ["Yard Gate"],
      nextStep: "The agreement for this offer is not available yet. It cannot be accepted until that agreement is approved.",
    })?.status).toBe("terms_pending")
    expect(parseCommercialOffer({
      status: "withdrawn",
      offerRef: "VC-26-AB2347",
      product: "Telloya",
      businessName: "Harbour Bakery",
      nextStep: "This offer has been withdrawn. It cannot be accepted.",
    })?.status).toBe("withdrawn")
    expect(parseCommercialOffer({
      status: "terms_pending",
      offerRef: "VC-26-AB2347",
      product: "Telloya",
      businessName: "Harbour Bakery",
      locations: ["High Street"],
      nextStep: "The agreement is not available.",
      priceMinor: 4900,
    })).toBeNull()
  })
})
