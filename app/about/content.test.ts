import { describe, expect, it } from "vitest"
import { brandName, brandTagline } from "@/lib/brand"
import { isSoleTrader, legalIdentity, tradingAsLine } from "@/lib/legal"
import {
  aboutBrandLine,
  aboutClose,
  aboutControl,
  aboutHero,
  aboutHold,
  aboutHowHref,
  aboutHuman,
  aboutIdentityPlate,
  aboutOperator,
  aboutPrinciples,
  aboutRecoveryHref,
  aboutReviewHref,
  aboutSeo,
  aboutServices,
  aboutSupport,
  aboutWhy,
} from "./content"

const operator = aboutOperator()
const copy = JSON.stringify({
  aboutBrandLine,
  aboutClose,
  aboutControl,
  aboutHero,
  aboutHold,
  aboutHuman,
  aboutIdentityPlate,
  operator,
  aboutPrinciples,
  aboutSeo,
  aboutServices,
  aboutSupport,
  aboutWhy,
}).toLowerCase()

describe("About page copy", () => {
  it("names ProfileRelaunch and explains why the service exists", () => {
    expect(aboutSeo.titlePage).toContain("About ProfileRelaunch")
    expect(aboutSeo.titlePage).toContain("Google Business Profile Recovery")
    expect(aboutSeo.description.toLowerCase()).toContain("human-reviewed")
    expect(aboutSeo.description.toLowerCase()).toContain("internationally")
    expect(aboutHero.eyebrow).toBe("About ProfileRelaunch")
    expect(aboutWhy.title).toBe("Why ProfileRelaunch exists.")
    expect(aboutWhy.lead.toLowerCase()).toContain("legitimate business")
    expect(aboutWhy.close.toLowerCase()).toContain("not to beat google")
    expect(aboutWhy.chain.map((step) => step.title)).toEqual([
      "Understand",
      "Organise",
      "Recommend",
      "Prepare / manage",
    ])
  })

  it("uses verified operator and sole-trader identity", () => {
    expect(legalIdentity.legalName).toBe("Saswati Das")
    expect(isSoleTrader()).toBe(true)
    expect(operator.lead).toContain(tradingAsLine())
    expect(operator.lead.toLowerCase()).toContain("uk sole trader")
    expect(aboutIdentityPlate.name).toBe(brandName)
    expect(aboutIdentityPlate.operatedBy).toContain("Saswati Das")
    expect(copy).not.toMatch(/ltd|limited company|companies house|vat number|company registration/)
  })

  it("positions the operator as UK-based and the service as international", () => {
    expect(operator.positioning).toMatch(/UK-based/i)
    expect(operator.positioning.toLowerCase()).toContain("internationally")
    expect(aboutIdentityPlate.lines).toEqual(["UK-based", "Global service", "Independent specialist support"])
    expect(copy).not.toMatch(/for uk businesses|uk businesses only|uk-only service|serving only the uk|serving uk businesses|uk google business profile service/)
    expect(aboutSeo.description.toLowerCase()).not.toMatch(/uk-only|for uk businesses/)
  })

  it("explains human-reviewed work without a fake AI score", () => {
    expect(aboutHuman.title).toBe("What human-reviewed means here.")
    expect(aboutHuman.lead.toLowerCase()).toContain("not produced as a fake probability score")
    expect(aboutHuman.tools).toContain("reviewed by a person")
    expect(copy).not.toMatch(/ai-powered|confidence score|85%|eligibility meter|leveraging ai/)
  })

  it("keeps evidence-led operating principles and the option not to pay yet", () => {
    expect(aboutPrinciples.items.map((item) => item.label)).toEqual([
      "Understand before acting",
      "Evidence before assertion",
      "Recommend the appropriate route",
      "Make the work concrete",
      "Keep the customer in control",
    ])
    expect(aboutHold.title.toLowerCase()).toContain("not to pay us yet")
    expect(aboutHold.lead.toLowerCase()).toContain("paid execution support is not justified yet")
  })

  it("links Profile Recovery, Review Protection, Get Help and How It Works", () => {
    expect(aboutServices.recovery.title).toBe("Profile Recovery")
    expect(aboutServices.recovery.href).toBe(aboutRecoveryHref)
    expect(aboutServices.review.title).toBe("Review Protection")
    expect(aboutServices.review.href).toBe(aboutReviewHref)
    expect(aboutHero.primaryHref).toBe("/get-help")
    expect(aboutHero.primaryCta).toBe("Start your assessment")
    expect(aboutHero.secondaryHref).toBe(aboutHowHref)
    expect(aboutClose.primaryHref).toBe("/get-help")
    expect(aboutClose.secondaryHref).toBe("/how-it-works")
    expect(aboutSupport.guided.line).toBe("We prepare it. You submit it.")
    expect(aboutSupport.managed.line).toContain("You authorise us")
  })

  it("does not invent social proof, partnership or inflated claims", () => {
    expect(copy).not.toMatch(/testimonial|trusted by thousands|success rate|google partner|preferred provider/)
    expect(copy).not.toMatch(/award|certification|years in business|hundreds of businesses|thousands of cases/)
    expect(copy).not.toMatch(/industry-leading|world-class|revolutionary|best-in-class/)
    expect(aboutControl.independence.toLowerCase()).toContain("not google")
    expect(aboutControl.security.title.toLowerCase()).toContain("passwords")
    expect(aboutBrandLine.tagline).toBe(brandTagline)
  })
})
