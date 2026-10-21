import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { homepageGuard, homepageProcess } from "../homepage-content"
import { customerPriceBoundary, customerPriceLine, pricingGroups, pricingNote } from "../pricing"
import { paidServiceAgreementBody } from "./paid-service-agreement"
import {
  SCOPE_EXCLUSIONS_TEMPLATE_VERSION,
  agreementTaxBoundary,
  finalCustomerPrice,
  preservedPaymentTiming,
  preservedQuoteWording,
  preservedSuccessDefinition,
  publishedGuardBoundary,
  publishedGuardLead,
  publishedGuardPoints,
  publishedGuidedCopy,
  publishedGuidedLine,
  publishedManagedCopy,
  publishedManagedLine,
  scopeServiceCodes,
  standardScopeExclusions,
  standardWordingVersionLine,
  templateVersionUsed,
} from "./scope-templates"

const guided = homepageProcess.models[0]
const managed = homepageProcess.models[1]

describe("standard scope and exclusions", () => {
  it("keeps the published website descriptions as the source of the templates", () => {
    expect(guided?.line).toBe(publishedGuidedLine)
    expect(guided?.copy).toBe(publishedGuidedCopy)
    expect(managed?.line).toBe(publishedManagedLine)
    expect(managed?.copy).toBe(publishedManagedCopy)
    expect(homepageGuard.lead).toBe(publishedGuardLead)
    expect(homepageGuard.points).toEqual([...publishedGuardPoints])
    expect(homepageGuard.boundary).toBe(publishedGuardBoundary)
  })

  it("provides a versioned template for each existing service", () => {
    expect(scopeServiceCodes).toEqual([
      "GUIDED_RELAUNCH",
      "MANAGED_RELAUNCH",
      "GUIDED_REVIEW",
      "MANAGED_REVIEW",
      "RELAUNCH_GUARD",
    ])
    const seen = new Set<string>()
    for (const code of scopeServiceCodes) {
      const wording = standardScopeExclusions(code)
      expect(wording?.version).toBe(SCOPE_EXCLUSIONS_TEMPLATE_VERSION)
      expect(wording?.scope.endsWith(standardWordingVersionLine())).toBe(true)
      expect(templateVersionUsed(wording?.scope || "")).toBe(SCOPE_EXCLUSIONS_TEMPLATE_VERSION)
      expect(wording?.scope.length).toBeGreaterThanOrEqual(10)
      expect(wording?.scope.length).toBeLessThanOrEqual(5000)
      expect(wording?.exclusions.length).toBeGreaterThanOrEqual(10)
      expect(wording?.exclusions.length).toBeLessThanOrEqual(5000)
      expect(wording?.exclusions).toContain(pricingNote)
      seen.add(`${wording?.scope}\n${wording?.exclusions}`)
    }
    expect(seen.size).toBe(scopeServiceCodes.length)
    expect(standardScopeExclusions("OTHER")).toBeNull()
  })

  it("uses the published price and the Guided or Managed meaning for that service", () => {
    const relaunch = pricingGroups[0].items
    const review = pricingGroups[1].items
    const guard = pricingGroups[2].items[0]
    const guidedRelaunch = standardScopeExclusions("GUIDED_RELAUNCH")
    const managedRelaunch = standardScopeExclusions("MANAGED_RELAUNCH")
    const guidedReview = standardScopeExclusions("GUIDED_REVIEW")
    const managedReview = standardScopeExclusions("MANAGED_REVIEW")
    const relaunchGuard = standardScopeExclusions("RELAUNCH_GUARD")

    expect(guidedRelaunch?.scope).toContain(`${relaunch[0].name} (${relaunch[0].price} ${relaunch[0].cadence}).`)
    expect(guidedRelaunch?.scope).toContain("The final customer price is £99 upfront.")
    expect(guidedRelaunch?.scope).toContain(publishedGuidedLine)
    expect(guidedRelaunch?.scope).toContain("ProfileRelaunch prepares the work and the customer submits it.")
    expect(guidedRelaunch?.scope).toContain(finalCustomerPrice)
    expect(guidedRelaunch?.scope).not.toContain("authorised permitted work")
    expect(guidedRelaunch?.exclusions).toContain("does not submit the prepared profile work")
    expect(guidedRelaunch?.exclusions).toContain(preservedSuccessDefinition.GUIDED_RELAUNCH)
    expect(guidedRelaunch?.exclusions).toContain(preservedPaymentTiming.UPFRONT)

    expect(managedRelaunch?.scope).toContain(`${relaunch[1].name} (${relaunch[1].price} ${relaunch[1].cadence}).`)
    expect(managedRelaunch?.scope).toContain("The final customer price is £299, payable only upon the contractually defined and verified successful restoration outcome, with no upfront service fee.")
    expect(managedRelaunch?.scope).toContain(relaunch[1].detail || "")
    expect(managedRelaunch?.scope).toContain(publishedManagedLine)
    expect(managedRelaunch?.scope).toContain(
      "ProfileRelaunch carries out the authorised permitted work, subject to the applicable success-fee terms.",
    )
    expect(managedRelaunch?.scope).toContain("at least 48 hours later")
    expect(managedRelaunch?.scope).not.toContain("You remain the person who files it with Google.")
    expect(managedRelaunch?.exclusions).toContain(preservedSuccessDefinition.MANAGED_RELAUNCH)
    expect(managedRelaunch?.exclusions).toContain(preservedPaymentTiming.SUCCESS_FEE)

    expect(guidedReview?.scope).toContain(`${review[0].name} (${review[0].price} ${review[0].cadence}).`)
    expect(guidedReview?.scope).toContain("The final customer price is £59 upfront.")
    expect(guidedReview?.scope).toContain("ProfileRelaunch prepares the work and the customer submits it.")
    expect(guidedReview?.exclusions).toContain("does not submit the prepared review work")
    expect(guidedReview?.exclusions).toContain(preservedSuccessDefinition.GUIDED_REVIEW)

    expect(managedReview?.scope).toContain(`${review[1].name} (${review[1].price} ${review[1].cadence}).`)
    expect(managedReview?.scope).toContain("The final customer price is £149, payable only on the contractually defined and verified successful removal, with no upfront service fee.")
    expect(managedReview?.scope).toContain(review[1].detail || "")
    expect(managedReview?.scope).toContain("two checks at least 48 hours apart")
    expect(managedReview?.exclusions).toContain(preservedSuccessDefinition.MANAGED_REVIEW)
    expect(managedReview?.exclusions).toContain(preservedPaymentTiming.SUCCESS_FEE)

    expect(relaunchGuard?.scope).toContain(`The final customer price is ${guard?.price} per month per location.`)
    expect(relaunchGuard?.scope).toContain(publishedGuardLead)
    expect(relaunchGuard?.scope).not.toContain("the customer submits it")
    expect(relaunchGuard?.scope).not.toContain("success-fee terms")
    expect(relaunchGuard?.exclusions).toContain(publishedGuardBoundary)
    expect(relaunchGuard?.exclusions).toContain(preservedSuccessDefinition.RELAUNCH_GUARD)
    expect(relaunchGuard?.exclusions).toContain(preservedPaymentTiming.RECURRING_MONTHLY)

    for (const code of scopeServiceCodes) {
      const wording = standardScopeExclusions(code)
      const text = `${wording?.scope}\n${wording?.exclusions}`
      expect(text).toContain(finalCustomerPrice)
      expect(text).toContain(customerPriceLine)
      expect(text).toContain(customerPriceBoundary)
      expect(text).not.toContain(agreementTaxBoundary)
      expect(text).not.toMatch(/\bVAT\b|including VAT|plus VAT|VAT not charged/i)
    }
  })

  it("uses the paid-service agreement and does not rewrite the stored success or payment text", () => {
    expect(paidServiceAgreementBody).toContain(agreementTaxBoundary)
    expect(paidServiceAgreementBody).toContain("Guided Relaunch is £99 upfront. Guided Review is £59 upfront. Managed Profile Recovery is a success fee of £299. Managed Review Protection is a success fee of £149. Relaunch Guard is £9.99 per month per location.")
    expect(paidServiceAgreementBody).toContain("The fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks.")
    expect(paidServiceAgreementBody).toContain("The fee is earned only when that specified review is absent at two checks at least 48 hours apart.")
    const sql = readFileSync(new URL("../../supabase/migrations/20260929233953_catalogue_quotes_orders_v1.sql", import.meta.url), "utf8")
    for (const sentence of [...Object.values(preservedSuccessDefinition), ...Object.values(preservedPaymentTiming)]) {
      expect(sql).toContain(sentence)
    }
  })

  it("preserves an existing quote version when the current template differs", () => {
    const stored = {
      scope: "Earlier final scope for this quote. Standard wording version SCOPE-2026-01-01.1.",
      exclusions: "Earlier final exclusions for this quote.",
    }
    const kept = preservedQuoteWording(stored)
    expect(kept).toEqual({
      scope: stored.scope,
      exclusions: stored.exclusions,
      templateVersion: "SCOPE-2026-01-01.1",
    })
    expect(kept.scope).not.toBe(standardScopeExclusions("GUIDED_RELAUNCH")?.scope)
    expect(kept.templateVersion).not.toBe(SCOPE_EXCLUSIONS_TEMPLATE_VERSION)

    const accepted = preservedQuoteWording({
      scope: "Accepted agreement scope without a template marker.",
      exclusions: "Accepted agreement exclusions.",
    })
    expect(accepted).toEqual({
      scope: "Accepted agreement scope without a template marker.",
      exclusions: "Accepted agreement exclusions.",
      templateVersion: null,
    })
    expect(templateVersionUsed("Standard wording version SCOPE-2026-10-21.2. Extra note.")).toBe("SCOPE-2026-10-21.2")
    expect(templateVersionUsed("No version was stored.")).toBeNull()
  })
})
