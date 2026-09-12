import { describe, expect, it } from "vitest"
import {
  homepageConversion,
  homepageFaqs,
  homepageGuard,
  homepageHero,
  homepagePricingPreview,
  homepageProblems,
  homepageProcess,
  homepageSeo,
  homepageServices,
  homepageTrustStrip,
  homepageWhy,
} from "@/lib/homepage-content"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"

const copy = JSON.stringify({
  homepageFaqs,
  homepageHero,
  homepagePricingPreview,
  homepageProcess,
  homepageServices,
  homepageGuard,
  homepageWhy,
  homepageConversion,
  homepageSeo,
})

describe("homepage commercial copy", () => {
  it("keeps the locked hero meaning, CTAs and support line", () => {
    expect(homepageHero.eyebrow).toBe("Google Business Profile Recovery & Review Protection")
    expect(homepageHero.titleLines).toEqual([
      "Restore your Google visibility.",
      "Protect your reputation.",
    ])
    expect(homepageHero.primaryCta).toBe("Start your assessment")
    expect(homepageHero.primaryHref).toBe("/get-help")
    expect(homepageHero.secondaryCta).toBe("View how it works")
    expect(homepageHero.secondaryHref).toBe("/how-it-works")
    expect(homepageHero.supportLine).toContain("Human-reviewed")
    expect(homepageHero.supportLine.toLowerCase()).not.toContain("independent of google")
  })

  it("states Guided and Managed as the commercial model", () => {
    const models = homepageProcess.models.map((model) => `${model.name} ${model.line}`).join(" ")
    expect(models).toContain("Guided")
    expect(models).toContain("We prepare it. You submit it.")
    expect(models).toContain("Managed")
    expect(models).toContain("You authorise us. We manage the case.")
    expect(homepageProcess.steps[3].title).toBe("Choose how you want to proceed")
    expect(copy.toLowerCase()).not.toContain("further support may be available")
  })

  it("shows Early Access prices from the shared pricing module", () => {
    expect(homepagePricingPreview.eyebrow).toBe(earlyAccessLabel)
    expect(homepagePricingPreview.items[0].figure).toBe(`From ${pricingGroups[0].items[0].price}`)
    expect(homepagePricingPreview.items[1].figure).toBe(`From ${pricingGroups[1].items[0].price}`)
    expect(homepagePricingPreview.items[2].figure).toBe("£0 today")
    expect(homepagePricingPreview.items[3].figure).toContain(pricingGroups[2].items[0].price)
    expect(copy).not.toContain("£399")
    expect(copy).not.toContain("£17.99")
    expect(copy.toLowerCase()).not.toMatch(/was £|save £|crossed/)
  })

  it("covers the required homepage FAQ subjects without guarantees", () => {
    const questions = homepageFaqs.map((item) => item.q).join(" ")
    expect(questions).toMatch(/suspended/i)
    expect(questions).toMatch(/already submitted an appeal/i)
    expect(questions).toMatch(/remove a negative/i)
    expect(questions).toMatch(/Guided vs Managed/)
    expect(questions).toMatch(/affiliated with Google/)
    expect(questions).toMatch(/How much does support cost/)
    expect(JSON.stringify(homepageFaqs)).not.toContain("ReputeDefend")
    expect(homepageFaqs.some((item) => item.q.includes("ProfileRelaunch"))).toBe(true)
    expect(copy.toLowerCase()).not.toMatch(/100% success|guaranteed|guarantee/)
  })

  it("names both specialist services and Relaunch Guard as Profile + Review monitoring", () => {
    expect(homepageServices.profile.title).toBe("Profile Recovery")
    expect(homepageServices.profile.href).toBe("/business-profile-recovery")
    expect(homepageServices.review.title).toBe("Review Protection")
    expect(homepageServices.review.href).toBe("/review-protection")
    expect(homepageServices.review.limit.toLowerCase()).toContain("google decides")
    expect(homepageGuard.lead).toContain("Profile + Review monitoring")
    expect(homepageGuard.lead.toLowerCase()).toContain("no self-serve dashboard")
    expect(homepageProblems.title).toBe("Has your Google presence suddenly changed?")
    expect(homepageTrustStrip).toHaveLength(4)
    expect(homepageWhy.principles.map((item) => item.title)).toEqual([
      "Human assessment",
      "Evidence before action",
      "Clear recommendation",
      "Guided or Managed support",
      "Transparent pricing",
    ])
  })

  it("keeps homepage metadata on recovery, suspension help and review protection", () => {
    expect(homepageSeo.titlePage).toContain("Google Business Profile Recovery")
    expect(homepageSeo.titlePage).toContain("Review Protection")
    expect(homepageSeo.description.toLowerCase()).toContain("suspended")
    expect(homepageSeo.description.toLowerCase()).toContain("review")
    expect(homepageConversion.primaryHref).toBe("/get-help")
    expect(homepageConversion.secondaryHref).toBe("/pricing")
  })
})
