import { describe, expect, it } from "vitest"
import { catalogueSeed } from "./catalogue-seed"
import { GUARD_MANAGED_DISCOUNT_BPS, discountMinor, formatGbp, formatMoney, quoteAmounts } from "./money"
import { pricingGroups } from "./pricing"

describe("integer pence arithmetic", () => {
  it("uses only integer minor units for the published catalogue", () => {
    expect(catalogueSeed.every(item => Number.isInteger(item.amountMinor))).toBe(true)
    expect(catalogueSeed.map(item => item.amountMinor)).toEqual([9900, 29900, 5900, 14900, 999])
  })

  it("produces the approved Guard Managed discounts exactly", () => {
    expect(discountMinor(29900, GUARD_MANAGED_DISCOUNT_BPS)).toBe(5980)
    expect(discountMinor(14900, GUARD_MANAGED_DISCOUNT_BPS)).toBe(2980)
    expect(quoteAmounts(29900, GUARD_MANAGED_DISCOUNT_BPS, "UNCONFIRMED")).toEqual({
      standardMinor: 29900,
      discountMinor: 5980,
      quotedSubtotalMinor: 23920,
      taxAmountMinor: 0,
      totalAmountMinor: 23920,
    })
    expect(quoteAmounts(14900, GUARD_MANAGED_DISCOUNT_BPS, "UNCONFIRMED")).toEqual({
      standardMinor: 14900,
      discountMinor: 2980,
      quotedSubtotalMinor: 11920,
      taxAmountMinor: 0,
      totalAmountMinor: 11920,
    })
    expect(formatGbp(23920)).toBe("£239.20")
    expect(formatGbp(11920)).toBe("£119.20")
    expect(formatMoney(29900, "GBP")).toBe("£299.00")
    expect(formatMoney(100, "USD")).toBe("$1.00")
    expect(formatMoney(0, "GBP")).toBe("£0.00")
  })

  it("rounds once at the minor-unit boundary for awkward values", () => {
    expect(discountMinor(999, 2000)).toBe(200)
    expect(discountMinor(1, 2000)).toBe(0)
    expect(discountMinor(5, 2000)).toBe(1)
    expect(quoteAmounts(1001, 3333, "EXCLUSIVE", 2000)).toEqual({
      standardMinor: 1001,
      discountMinor: 334,
      quotedSubtotalMinor: 667,
      taxAmountMinor: 133,
      totalAmountMinor: 800,
    })
    expect(quoteAmounts(10000, 0, "INCLUSIVE", 2000)).toEqual({
      standardMinor: 10000,
      discountMinor: 0,
      quotedSubtotalMinor: 10000,
      taxAmountMinor: 1667,
      totalAmountMinor: 10000,
    })
  })

  it("keeps the commercial seed aligned with published marketing prices", () => {
    const published = pricingGroups.flatMap(group => group.items.map(item => item.price))
    expect(published).toEqual(["£99", "£299", "£59", "£149", "£9.99"])
    expect(catalogueSeed.map(item => formatGbp(item.amountMinor))).toEqual(["£99.00", "£299.00", "£59.00", "£149.00", "£9.99"])
  })
})
