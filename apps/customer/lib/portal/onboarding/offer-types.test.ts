import { describe, expect, it } from "vitest"
import { parseCommercialOffer } from "./offer-types"

const agreement = {
  title: "Telloya service agreement",
  body: "This agreement covers Telloya for the named locations and no other service. Payment is collected by Stripe after a separate payment step.",
  cancellation: "Either party may cancel as stated in this agreement.",
  versionRef: "TELLOYA-TERMS-1",
  confirmations: [{ key: "business_authority", label: "I can accept this offer for the business." }],
}

const conditions = {
  tier: "Growth",
  includedMinutes: 300,
  minutesRollover: false,
  baseAmountMinor: 4900,
  guardIncluded: false,
  guardUnitMinor: null,
  guardQuantity: 0,
  overagePermitted: true,
  overageRateMinor: 25,
}

const ready = {
  status: "ready",
  offerRef: "VC-26-AB2347",
  offerVersion: 2,
  product: "Telloya",
  businessName: "Stripe Bakery",
  locations: ["Dock", "High Street"],
  guardLocations: [],
  services: ["Telloya"],
  priceMinor: 4900,
  currency: "GBP",
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: null,
  totalMinor: 4900,
  cadence: "MONTH",
  recurring: true,
  agreement,
  conditions,
  nextStep: "Accept the agreement to record this offer. Payment and service setup follow separately.",
}

describe("commercial offer parser", () => {
  it("keeps an eligible offer and an accepted record, and rejects a leaked field", () => {
    const parsed = parseCommercialOffer(ready)
    expect(parsed?.status).toBe("ready")
    if (parsed?.status === "ready") expect(parsed.businessName).toBe("Stripe Bakery")
    const { offerVersion: _version, ...accepted } = ready
    expect(parseCommercialOffer({
      ...accepted,
      status: "accepted",
      conditions: { ...conditions, overageOptIn: false, overageCapMinor: null },
      acceptedAt: "2026-11-03T12:00:00.000Z",
    })?.status).toBe("accepted")
    const withPayment = parseCommercialOffer({
      ...accepted,
      status: "accepted",
      guardLocations: [
        { locationId: "11111111-1111-4111-8111-111111111111", locationName: "Dock" },
        { locationId: "22222222-2222-4222-8222-222222222222", locationName: "High Street" },
      ],
      conditions: { ...conditions, guardIncluded: true, guardUnitMinor: 999, guardQuantity: 2, baseAmountMinor: 6902, overageOptIn: true, overageCapMinor: 2500 },
      priceMinor: 8900,
      totalMinor: 8900,
      acceptedAt: "2026-11-03T12:00:00.000Z",
      payment: { state: "preparing", cadence: "MONTH", totalMinor: 8900, guardChargeMinor: 1998 },
    })
    expect(withPayment?.status === "accepted" && withPayment.payment).toEqual({
      state: "preparing", cadence: "MONTH", totalMinor: 8900, guardChargeMinor: 1998,
    })
    expect(parseCommercialOffer({
      ...accepted,
      status: "accepted",
      conditions: { ...conditions, overageOptIn: false, overageCapMinor: null },
      acceptedAt: "2026-11-03T12:00:00.000Z",
      payment: { state: "started", cadence: "YEAR", totalMinor: 4900, guardChargeMinor: null },
    })).toBeNull()
    expect(parseCommercialOffer({ status: "unavailable" })).toEqual({ status: "unavailable" })
    const authority = parseCommercialOffer({
      status: "unavailable",
      reason: "authority",
      nextStep: "You are not authorised to review this offer.",
    })
    expect(authority?.status === "unavailable" && authority.reason).toBe("authority")
    expect(parseCommercialOffer({ ...ready, subscriptionId: "a032a000-0000-4000-8000-000000000031" })).toBeNull()
    expect(parseCommercialOffer({ ...ready, agreement: { ...agreement, contentHash: "ab".repeat(32) } })).toBeNull()
    expect(parseCommercialOffer({ ...ready, businessName: "cus_secret bakery" })).toBeNull()
    expect(parseCommercialOffer({ ...ready, conditions: { ...conditions, overageOptIn: true, overageCapMinor: 2000 } })).toBeNull()
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

  it("names paid Guard locations only when the count matches the covered Telloya locations", () => {
    const dock = { locationId: "11111111-1111-4111-8111-111111111111", locationName: "Dock" }
    const high = { locationId: "22222222-2222-4222-8222-222222222222", locationName: "High Street" }
    const priced = {
      ...ready,
      conditions: { ...conditions, guardIncluded: true, guardUnitMinor: 999, guardQuantity: 1, baseAmountMinor: 7900 },
      priceMinor: 8899,
      totalMinor: 8899,
      guardLocations: [high],
    }
    const one = parseCommercialOffer(priced)
    expect(one?.status === "ready" && one.guardLocations).toEqual([high])
    expect(one?.status === "ready" && one.priceMinor).toBe(8899)
    const two = parseCommercialOffer({
      ...priced,
      conditions: { ...priced.conditions, guardQuantity: 2 },
      priceMinor: 9898,
      totalMinor: 9898,
      guardLocations: [dock, high],
    })
    expect(two?.status === "ready" && two.guardLocations.map(location => location.locationName)).toEqual(["Dock", "High Street"])
    const none = parseCommercialOffer(ready)
    expect(none?.status === "ready" && none.guardLocations).toEqual([])
    const { offerVersion: _version, ...accepted } = priced
    const recorded = parseCommercialOffer({
      ...accepted,
      status: "accepted",
      acceptedAt: "2026-11-03T12:00:00.000Z",
      conditions: { ...priced.conditions, overageOptIn: false, overageCapMinor: null },
    })
    expect(recorded?.status === "accepted" && recorded.guardLocations).toEqual([high])
    expect(parseCommercialOffer({ ...priced, guardLocations: [dock, high] })).toBeNull()
    expect(parseCommercialOffer({ ...priced, guardLocations: [{ ...high, locationName: "Yard" }] })).toBeNull()
    expect(parseCommercialOffer({
      ...priced,
      conditions: { ...priced.conditions, guardQuantity: 2 },
      priceMinor: 9898,
      totalMinor: 9898,
      guardLocations: [high, { locationId: high.locationId, locationName: "Dock" }],
    })).toBeNull()
    expect(parseCommercialOffer({ ...ready, guardLocations: [high] })).toBeNull()
    const complete = parseCommercialOffer({
      ...ready,
      product: "Complete",
      services: ["Telloya", "Relaunch Guard"],
      conditions: { ...conditions, guardIncluded: true, guardUnitMinor: 999, guardQuantity: 1, baseAmountMinor: 8901 },
      priceMinor: 9900,
      totalMinor: 9900,
      guardLocations: [],
    })
    expect(complete?.status).toBe("ready")
    expect(parseCommercialOffer({
      ...ready,
      product: "Complete",
      services: ["Telloya", "Relaunch Guard"],
      conditions: { ...conditions, guardIncluded: true, guardUnitMinor: 999, guardQuantity: 2, baseAmountMinor: 7900 },
      priceMinor: 9898,
      totalMinor: 9898,
      guardLocations: [high],
    })).toBeNull()
  })
})
