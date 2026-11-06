import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  telloyaCatalogueProposal,
  telloyaDraftAgreement,
  telloyaDraftMarker,
  telloyaLocationPolicy,
  telloyaProposedMonthlyMinor,
  telloyaTaxDecision,
} from "./telloya-catalogue-proposal"

const agreementDoc = readFileSync(new URL("../../../../docs/telloya/phase-c/draft-customer-agreement.md", import.meta.url), "utf8")
const proposalDoc = readFileSync(new URL("../../../../docs/telloya/phase-c/catalogue-proposal.md", import.meta.url), "utf8")

describe("Telloya catalogue proposal", () => {
  it("records the approved prices and leaves location and tax undecided", () => {
    expect(telloyaCatalogueProposal.prices).toEqual({
      basicMinor: 4900,
      basicMinutes: 120,
      growthMinor: 7900,
      growthMinutes: 300,
      proMinor: 12000,
      proMinutes: 500,
      guardLocationMinor: 999,
      overagePerMinuteMinor: 25,
    })
    expect(telloyaCatalogueProposal.currency).toBe("GBP")
    expect(telloyaLocationPolicy.status).toBe("PROPOSED")
    expect(telloyaLocationPolicy.proposedStandardLocations).toBe(1)
    expect(telloyaLocationPolicy.alternatives.map(item => item.id)).toEqual([
      "one-location-standard",
      "several-locations-same-price",
      "price-per-location",
      "unlimited-locations",
    ])
    expect(telloyaTaxDecision.status).toBe("OWNER DECISION REQUIRED")
    expect(telloyaTaxDecision.productionTaxBehaviour).toBeNull()
    expect(telloyaTaxDecision.localDraftPlaceholder).toBe("EXCLUSIVE")
    expect(telloyaTaxDecision.statement).not.toContain("NOT_APPLICABLE is the production")
  })

  it("prices Guard per confirmed location and does not price a Custom quotation", () => {
    expect(telloyaProposedMonthlyMinor("BASIC", 0)).toBe(4900)
    expect(telloyaProposedMonthlyMinor("GROWTH", 0)).toBe(7900)
    expect(telloyaProposedMonthlyMinor("GROWTH", 1)).toBe(8899)
    expect(telloyaProposedMonthlyMinor("GROWTH", 2)).toBe(9898)
    expect(telloyaProposedMonthlyMinor("PRO", 1)).toBe(12999)
    expect(() => telloyaProposedMonthlyMinor("GROWTH", 1.5)).toThrow(/whole number/)
  })

  it("keeps the draft agreement out of the rehearsal fixture", () => {
    expect(telloyaDraftAgreement.body.startsWith(telloyaDraftMarker)).toBe(true)
    expect(telloyaDraftAgreement.body).not.toContain("TEST ONLY")
    expect(telloyaDraftAgreement.body).toContain("do not roll over")
    expect(telloyaDraftAgreement.body).toContain("£0.25 per minute")
    expect(telloyaDraftAgreement.body).toContain("£9.99")
    expect(telloyaDraftAgreement.confirmations.map(item => item.key)).toEqual([
      "business_authority",
      "recurring_payment",
      "forwarding_duty",
    ])
    expect(agreementDoc).toContain(telloyaDraftAgreement.body)
    expect(agreementDoc).toContain("not approved for a customer")
    expect(proposalDoc).toContain("20261106003939")
    expect(proposalDoc).toContain("112")
    expect(proposalDoc).toContain("OWNER DECISION REQUIRED")
    expect(proposalDoc).toContain("Do not insert the `TELLOYA-TEST-` fixture")
  })
})
