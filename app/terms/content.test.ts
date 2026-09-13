import { describe, expect, it } from "vitest"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"
import { termsPricing, termsSeo } from "./content"

const copy = JSON.stringify({ termsPricing, termsSeo }).toLowerCase()
const recoveryGuided = pricingGroups[0].items[0]
const recoveryManaged = pricingGroups[0].items[1]
const reviewGuided = pricingGroups[1].items[0]
const reviewManaged = pricingGroups[1].items[1]
const guard = pricingGroups[2].items[0]

describe("Terms commercial copy", () => {
  it("no longer claims the website does not publish a price list", () => {
    expect(copy).not.toContain("does not publish a price list")
    expect(termsPricing.intro).toContain(earlyAccessLabel)
    expect(termsPricing.noCheckout.toLowerCase()).toContain("does not currently process checkout")
    expect(termsPricing.contract.toLowerCase()).toContain("does not create a paid contract")
    expect(termsPricing.contract.toLowerCase()).toContain("these website terms do not invent that definition")
    expect(termsPricing.google.toLowerCase()).toContain("google controls the platform outcome")
  })

  it("locks Early Access prices from lib/pricing.ts", () => {
    const items = termsPricing.items.join(" ")
    expect(items).toContain(recoveryGuided.price)
    expect(items).toContain(recoveryManaged.price)
    expect(items).toContain(reviewGuided.price)
    expect(items).toContain(reviewManaged.price)
    expect(items).toContain(guard.price)
    expect(items).toContain("£99")
    expect(items).toContain("£299")
    expect(items).toContain("£59")
    expect(items).toContain("£149")
    expect(items).toContain("£9.99")
    expect(copy).not.toContain("£399")
    expect(copy).not.toContain("£17.99")
    expect(copy).not.toMatch(/30 days free|self-service dashboard|24\/7/)
    expect(copy).toContain("not automatically included")
  })

  it("does not imply a UK-only service", () => {
    expect(copy).not.toMatch(/for uk businesses|uk-only|uk customers only/)
  })
})
