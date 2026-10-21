import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { catalogueSeed } from "../catalogue-seed"
import { discountedSubtotalMinor, quoteAmounts } from "../money"
import { customerFacingTaxNote, customerPriceBoundary, customerPriceLine, pricingGroups, pricingNote } from "../pricing"
import {
  advertisedGrossAmount,
  grossAdvertisedPrices,
  grossCustomerTotal,
  grossPriceTaxProposal,
  proposalCoversEveryService,
} from "./gross-price-tax"
import { scopeServiceCodes } from "./scope-templates"

describe("gross advertised prices", () => {
  it("matches the catalogue seed and does not change it", () => {
    expect(proposalCoversEveryService()).toBe(true)
    expect(catalogueSeed.map(item => item.serviceCode)).toEqual([...scopeServiceCodes])
    for (const code of scopeServiceCodes) {
      const seeded = catalogueSeed.find(item => item.serviceCode === code)
      expect(seeded?.amountMinor).toBe(grossAdvertisedPrices[code].minor)
      expect(seeded?.taxBehaviour).toBe("UNCONFIRMED")
      expect(seeded?.currency).toBe("GBP")
    }
    expect(pricingGroups[0].items[0].price).toBe("£99")
    expect(pricingGroups[0].items[1].price).toBe("£299")
    expect(pricingGroups[1].items[0].price).toBe("£59")
    expect(pricingGroups[1].items[1].price).toBe("£149")
    expect(pricingGroups[2].items[0].price).toBe("£9.99")
  })

  it("keeps the customer total equal to the advertised amount when no tax is added", () => {
    for (const code of scopeServiceCodes) {
      const gross = grossCustomerTotal(code, "NOT_APPLICABLE")
      expect(gross.taxAmountMinor).toBe(0)
      expect(gross.totalAmountMinor).toBe(advertisedGrossAmount(code).minor)
      const unconfirmed = grossCustomerTotal(code, "UNCONFIRMED")
      expect(unconfirmed.totalAmountMinor).toBe(gross.totalAmountMinor)
    }
  })

  it("shows why exclusive tax is not the treatment for these prices", () => {
    const added = quoteAmounts(9900, 0, "EXCLUSIVE", 2000)
    expect(added.taxAmountMinor).toBeGreaterThan(0)
    expect(added.totalAmountMinor).toBeGreaterThan(9900)
    expect(added.totalAmountMinor).toBe(11880)
    expect(grossPriceTaxProposal.addTaxOnTop).toBe(false)
    expect(grossPriceTaxProposal.inventTaxRateBps).toBe(false)
    expect(grossPriceTaxProposal.quoteTaxForVerifiedUkNotVatRegistered).toBe("NOT_APPLICABLE")
    expect(grossPriceTaxProposal.ukDetermination).toBe("UK_DOMESTIC_NOT_VAT_REGISTERED")
    expect(grossPriceTaxProposal.sellerPosition).toBe("NOT_VAT_REGISTERED")
    expect(grossPriceTaxProposal.catalogueTaxBehaviour).toBe("UNCONFIRMED")
    expect(grossPriceTaxProposal.unconfirmedStillBlocksOffer).toBe(true)
    expect(grossPriceTaxProposal.eligibilityGateRemains).toBe(true)
    expect(grossPriceTaxProposal.applied).toBe(false)
    expect(grossPriceTaxProposal.appliedToDev).toBe(false)
    expect(grossPriceTaxProposal.appliedToProduction).toBe(false)
    expect(grossPriceTaxProposal.migration).toBe("20261021210000_gross_customer_price_v1.sql")
    expect(grossPriceTaxProposal.productionChange).toBe(false)
    expect(grossPriceTaxProposal.stripeCharge).toBe(false)
    expect(grossPriceTaxProposal.priceChange).toBe(false)
  })

  it("keeps a Guard discount inside the published gross and charges that total", () => {
    expect(discountedSubtotalMinor(29900, 2000)).toBe(23920)
    expect(discountedSubtotalMinor(14900, 2000)).toBe(11920)
    const managed = quoteAmounts(29900, 2000, "NOT_APPLICABLE")
    expect(managed.totalAmountMinor).toBe(23920)
    expect(managed.taxAmountMinor).toBe(0)
    const review = quoteAmounts(14900, 2000, "INCLUSIVE", 2000)
    expect(review.quotedSubtotalMinor).toBe(11920)
    expect(review.totalAmountMinor).toBe(11920)
    expect(review.taxAmountMinor).toBeGreaterThan(0)
    expect(review.taxAmountMinor).toBeLessThan(11920)
    expect(customerFacingTaxNote("NOT_APPLICABLE")).toBe(`${customerPriceLine} ${customerPriceBoundary}`)
    expect(customerFacingTaxNote("INCLUSIVE")).toBe(customerFacingTaxNote("NOT_APPLICABLE"))
    expect(customerFacingTaxNote("EXCLUSIVE")).toBe("The total shown is the amount recorded on this quote.")
    expect(customerFacingTaxNote("UNCONFIRMED")).toBe("This quote is not ready to accept.")
    expect(pricingNote).toContain(customerPriceLine)
    expect(pricingNote).toContain(customerPriceBoundary)
    expect(customerFacingTaxNote("NOT_APPLICABLE")).not.toMatch(/VAT not charged|including VAT|basis points|NOT_APPLICABLE/)
    const eligibility = readFileSync(new URL("../../supabase/migrations/20261015140000_commercial_eligibility_gate_v1.sql", import.meta.url), "utf8")
    expect(eligibility).toContain("country = 'GB' AND p_tax = 'NOT_APPLICABLE' AND seller = 'NOT_VAT_REGISTERED'")
    expect(eligibility).toContain("'source', 'uk_not_vat_registered'")
    const stripe = readFileSync(new URL("../payments/stripe.ts", import.meta.url), "utf8")
    expect(stripe).toContain("unit_amount: input.amountMinor")
    expect(stripe).not.toContain("unit_amount: input.amountMinor +")
    const grossSql = readFileSync(new URL("../../supabase/migrations/20261021210000_gross_customer_price_v1.sql", import.meta.url), "utf8")
    expect(grossSql).toContain("gross_price:exclusive_adds_tax")
    expect(grossSql).toContain("OLD.status IS DISTINCT FROM NEW.status")
    expect(grossSql).toContain("NEW.status IN ('OFFERED', 'ACCEPTED')")
    expect(grossSql).toContain("provider_operations_binding_gross_price")
    expect(grossSql).toContain("Do not apply this file to DEV or Production")
  })
})