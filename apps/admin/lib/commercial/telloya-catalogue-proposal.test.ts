import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { pendingMigrations } from "../recovery/manifest"
import {
  telloyaCatalogueProposal,
  telloyaDraftAgreement,
  telloyaDraftMarker,
  telloyaLocationPolicy,
  telloyaProposedMonthlyMinor,
  telloyaTaxDecision,
  telloyaUnapprovedCustomRehearsal,
} from "./telloya-catalogue-proposal"

const agreementDoc = readFileSync(new URL("../../../../docs/telloya/phase-c/draft-customer-agreement.md", import.meta.url), "utf8")
const proposalDoc = readFileSync(new URL("../../../../docs/telloya/phase-c/catalogue-proposal.md", import.meta.url), "utf8")
const proposedSql = readFileSync(new URL("../../../../docs/telloya/phase-c/proposed-location-number-constraint.sql", import.meta.url), "utf8")
const migrations = readdirSync(new URL("../../../../supabase/migrations/", import.meta.url))

describe("Telloya catalogue proposal", () => {
  it("records the approved prices and the approved location policy", () => {
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
    expect(Object.values(telloyaCatalogueProposal.prices)).not.toContain(telloyaUnapprovedCustomRehearsal.amountMinor)
    expect(telloyaLocationPolicy.status).toBe("APPROVED")
    expect(telloyaLocationPolicy.approvedOn).toBe("2026-11-06")
    expect(telloyaLocationPolicy.standardLocations).toBe(1)
    expect(telloyaLocationPolicy.standardNumbers).toBe(1)
    expect(telloyaLocationPolicy.selectedAlternative).toBe("one-location-standard")
    expect(telloyaLocationPolicy.alternatives.map(item => item.id)).toEqual([
      "one-location-standard",
      "several-locations-same-price",
      "price-per-location",
      "unlimited-locations",
    ])
    expect(telloyaLocationPolicy.missingConstraints.map(item => item.id)).toEqual([
      "standard-tier-cap-not-checked-at-approval",
      "number-correction-keeps-previous-reservation",
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
    expect(telloyaUnapprovedCustomRehearsal).toMatchObject({
      status: "NOT AN APPROVED PRICE",
      locations: 2,
      numbers: 2,
      amountMinor: 25000,
    })
  })

  it("keeps the draft agreement and the constraint proposal out of the migration chain", () => {
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
    expect(proposalDoc).toContain("**Approved.**")
    expect(proposalDoc).toContain("standard-tier-cap-not-checked-at-approval")
    expect(proposalDoc).toContain("number-correction-keeps-previous-reservation")
    expect(proposalDoc).toContain(telloyaUnapprovedCustomRehearsal.statement)
    expect(proposedSql).toContain("must not be applied")
    expect(proposedSql).toContain("standard Telloya plan includes exactly one location")
    expect(proposedSql).toContain("one receptionist number per entitled location")
    expect(proposedSql).toContain("number-correction-keeps-previous-reservation")
    expect(migrations).not.toContain("proposed-location-number-constraint.sql")
    expect(pendingMigrations().map(entry => entry.filename)).toEqual([
      "20261106120000_admin_commercial_verify_agent_test_call_v1.sql",
    ])
  })
})
