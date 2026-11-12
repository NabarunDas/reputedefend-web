import { describe, expect, it } from "vitest"
import { prepareTelloyaOffer, sendTelloyaOffer, type TelloyaOfferInput } from "./telloya-offer"
import { acceptTelloyaOffer, queueTelloyaOfferEmail, requestTelloyaAmendment, resolveTelloyaAmendment, telloyaOfferMessage } from "./telloya-offer-delivery"

function sentGrowth() {
  const input: TelloyaOfferInput = {
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
  }
  const draft = prepareTelloyaOffer([], input)
  const sent = sendTelloyaOffer(draft.versions, { agreementStatus: "APPROVED", taxApproval: "APPROVED" })
  return sent.versions
}

describe("Telloya offer delivery", () => {
  it("queues one personalised message and does not queue it twice", () => {
    const versions = sentGrowth()
    const message = telloyaOfferMessage({
      enquiryRef: "TY-26-ABCDEF",
      customerId: "customer-1",
      selector: "offer-selector-1",
      version: versions[0],
    })
    expect(message?.subject).toBe("Your Telloya proposal — TY-26-ABCDEF")
    expect(message?.text).toContain("Hello,")
    expect(message?.text).toContain("Telloya — a ProfileRelaunch company")
    expect(message?.text).toContain("Review your offer")
    expect(message?.reviewPath).toBe("/portal/onboarding/offer/offer-selector-1")
    expect(message?.text).toContain("This link is not a payment link.")
    expect(telloyaOfferMessage({
      enquiryRef: "TY-26-ABCDEF",
      customerId: "customer-1",
      selector: "offer-selector-1",
      version: versions[0],
      customerName: "Alex Owner",
    })?.text).toContain("Hello Alex Owner,")
    const first = queueTelloyaOfferEmail([], versions[0], message)
    const second = queueTelloyaOfferEmail(first.messages, versions[0], message)
    expect(first.result).toBe("queued")
    expect(first.messages[0].state).toBe("queued")
    expect(second.result).toBe("duplicate")
    expect(second.messages).toHaveLength(1)
  })

  it("uses the plan subject when Guard is not included", () => {
    const versions = sentGrowth()
    const version = { ...versions[0], planCode: "growth" as const, guardLocations: 0, guardAmountPence: 0 }
    expect(telloyaOfferMessage({
      enquiryRef: "TY-26-ABCDEF",
      customerId: "customer-1",
      selector: "offer-selector-1",
      version,
    })?.subject).toBe("Your Telloya proposal — TY-26-ABCDEF")
    expect(telloyaOfferMessage({
      enquiryRef: "TY-26-ABCDEF",
      customerId: "customer-1",
      selector: "offer-selector-1",
      version,
    })?.text).toContain("Plan: Growth")
  })

  it("keeps a sent offer unchanged when the customer requests an amendment", () => {
    const versions = sentGrowth()
    const requested = requestTelloyaAmendment({
      versions,
      amendments: [],
      version: 1,
      message: "Please remove one Guard location.",
      categories: ["guard"],
      businessMatches: true,
      emailVerified: true,
    })
    expect(requested.result).toBe("requested")
    expect(requested.versions[0].termsHash).toBe(versions[0].termsHash)
    expect(requested.versions[0].status).toBe("SENT")
    const raced = acceptTelloyaOffer({
      versions: requested.versions,
      amendments: requested.amendments,
      version: 1,
      identityVerified: true,
      businessMatches: true,
      agreementHash: "hash-1",
      recurringConsent: true,
    })
    expect(raced.result).toBe("amendment_open")
    const revised = resolveTelloyaAmendment({
      versions: requested.versions,
      amendments: requested.amendments,
      decision: "accepted",
      replacement: { ...versions[0], version: 2, guardLocations: 1, guardAmountPence: 999, monthlyTotalPence: 8899, termsHash: "revised-hash" },
    })
    expect(revised.result).toBe("revised")
    expect(revised.versions.find(version => version.version === 1)?.status).toBe("SUPERSEDED")
    expect(acceptTelloyaOffer({
      versions: revised.versions,
      amendments: revised.amendments,
      version: 1,
      identityVerified: true,
      businessMatches: true,
      agreementHash: "hash-1",
      recurringConsent: true,
    }).result).toBe("stale_version")
    expect(acceptTelloyaOffer({
      versions: revised.versions,
      amendments: revised.amendments,
      version: 2,
      identityVerified: false,
      businessMatches: false,
      agreementHash: "hash-1",
      recurringConsent: true,
    }).result).toBe("forbidden")
  })
})
