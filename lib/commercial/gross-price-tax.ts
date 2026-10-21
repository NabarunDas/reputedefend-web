/**
 * The five advertised prices are the final customer amounts.
 *
 * The catalogue seed stays `UNCONFIRMED`. Offering still stops until the
 * existing purchasing-establishment and tax eligibility checks pass. The
 * database rule is `20261021214813_gross_customer_price_v1.sql`. DEV already
 * applied that SQL as this ledger version. This module does not replay it,
 * set a tax rate, record a customer tax identifier, change a price, or apply
 * it to Production. The SQL file header still says source-only because an
 * applied file is not edited.
 */
import { catalogueSeed } from "../catalogue-seed"
import type { TaxBehaviour } from "../money"
import { quoteAmounts } from "../money"
import { scopeServiceCodes, type ScopeServiceCode } from "./scope-templates"

export const grossAdvertisedPrices = {
  GUIDED_RELAUNCH: { minor: 9900, label: "£99", when: "upfront" },
  MANAGED_RELAUNCH: { minor: 29900, label: "£299", when: "verified successful restoration, no upfront service fee" },
  GUIDED_REVIEW: { minor: 5900, label: "£59", when: "upfront" },
  MANAGED_REVIEW: { minor: 14900, label: "£149", when: "verified successful removal, no upfront service fee" },
  RELAUNCH_GUARD: { minor: 999, label: "£9.99", when: "per month per location" },
} as const satisfies Record<ScopeServiceCode, { minor: number; label: string; when: string }>

/**
 * Minimum treatment that keeps these gross prices without inventing a rate.
 * `EXCLUSIVE` adds tax on top and is not this treatment. `INCLUSIVE` requires
 * a real rate, which this proposal does not create. `UNCONFIRMED` remains the
 * catalogue seed and still blocks an offer.
 */
export const grossPriceTaxProposal = {
  status: "dev_ledger_aligned",
  applied: false,
  migration: "20261021214813_gross_customer_price_v1.sql",
  appliedToDev: true,
  appliedToProduction: false,
  productionChange: false,
  stripeCharge: false,
  priceChange: false,
  catalogueTaxBehaviour: "UNCONFIRMED",
  quoteTaxForVerifiedUkNotVatRegistered: "NOT_APPLICABLE",
  ukDetermination: "UK_DOMESTIC_NOT_VAT_REGISTERED",
  sellerPosition: "NOT_VAT_REGISTERED",
  eligibilityGateRemains: true,
  unconfirmedStillBlocksOffer: true,
  inventTaxRateBps: false,
  inventCustomerTaxInformation: false,
  describeUnchargeableAmountAsVat: false,
  addTaxOnTop: false,
} as const

export function advertisedGrossAmount(serviceCode: ScopeServiceCode) {
  const price = grossAdvertisedPrices[serviceCode]
  const seeded = catalogueSeed.find(item => item.serviceCode === serviceCode)
  if (!seeded || seeded.amountMinor !== price.minor || seeded.taxBehaviour !== "UNCONFIRMED") {
    throw new Error(`Catalogue seed no longer matches the advertised gross price for ${serviceCode}`)
  }
  return price
}

/** The customer total for an advertised price when nothing is added on top. */
export function grossCustomerTotal(serviceCode: ScopeServiceCode, behaviour: TaxBehaviour, taxRateBps: number | null = null) {
  const price = advertisedGrossAmount(serviceCode)
  return quoteAmounts(price.minor, 0, behaviour, taxRateBps)
}

export function proposalCoversEveryService(): boolean {
  return scopeServiceCodes.every(code => advertisedGrossAmount(code).minor > 0)
}
