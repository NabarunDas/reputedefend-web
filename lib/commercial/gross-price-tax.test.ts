import { describe, expect, it } from "vitest"
import { catalogueSeed } from "../catalogue-seed"
import { quoteAmounts } from "../money"
import { pricingGroups } from "../pricing"
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
    expect(grossPriceTaxProposal.addTaxOnTop).toBe(false)
    expect(grossPriceTaxProposal.inventTaxRateBps).toBe(false)
    expect(grossPriceTaxProposal.quoteTaxForVerifiedUkNotVatRegistered).toBe("NOT_APPLICABLE")
    expect(grossPriceTaxProposal.catalogueTaxBehaviour).toBe("UNCONFIRMED")
    expect(grossPriceTaxProposal.unconfirmedStillBlocksOffer).toBe(true)
    expect(grossPriceTaxProposal.eligibilityGateRemains).toBe(true)
    expect(grossPriceTaxProposal.applied).toBe(false)
    expect(grossPriceTaxProposal.migration).toBe(false)
    expect(grossPriceTaxProposal.productionChange).toBe(false)
    expect(grossPriceTaxProposal.stripeCharge).toBe(false)
    expect(grossPriceTaxProposal.priceChange).toBe(false)
  })
})