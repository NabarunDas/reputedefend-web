import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
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
import { guardPrice } from "@/lib/guard-offer"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"

const pageSource = readFileSync(fileURLToPath(new URL("../app/page.tsx", import.meta.url)), "utf8")
const homepageSource = readFileSync(fileURLToPath(new URL("../components/homepage.tsx", import.meta.url)), "utf8")

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
    expect(homepageHero.secondaryCta).toBe("Explore monitoring")
    expect(homepageHero.secondaryHref).toBe("/relaunch-guard")
    expect(homepageHero.lead).toContain("If your profile is running smoothly, Relaunch Guard helps you keep an eye on it.")
    expect(homepageHero.supportLine).toContain("Human-reviewed")
    expect(homepageHero.supportLine.toLowerCase()).not.toContain("independent of google")
    expect(copy).not.toContain("/start-monitoring")
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
    expect(homepagePricingPreview.items[3].label).toBe("Relaunch Guard")
    expect(homepagePricingPreview.items[3].figure).toBe(`${guardPrice}/month`)
    expect(homepagePricingPreview.items[3].figure).toBe("£9.99/month")
    expect(homepagePricingPreview.items[3].detail).toBe("Per location. Limited introductory price. Two manual checks a day.")
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
    expect(questions).toMatch(/without a recovery case/)
    const cost = homepageFaqs.find((item) => item.q === "How much does support cost?")?.a
    expect(cost).toContain(`Relaunch Guard starts at ${guardPrice} per month, per location, at a limited introductory price.`)
    expect(cost).toContain("Google makes final platform decisions.")
    const direct = homepageFaqs.find((item) => item.q === "Can I use Relaunch Guard without a recovery case?")
    expect(direct?.a).toContain("Sending a setup request does not start monitoring or take payment.")
    expect(JSON.stringify(homepageFaqs)).not.toContain("ReputeDefend")
    expect(homepageFaqs.some((item) => item.q.includes("ProfileRelaunch"))).toBe(true)
    expect(copy.toLowerCase()).not.toMatch(/100% success|guaranteed/)
  })

  it("names both specialist services and points healthy businesses to Relaunch Guard", () => {
    expect(homepageServices.title).toBe("Help with profile problems, reviews and everyday monitoring.")
    expect(homepageServices.lead).toContain("explore Relaunch Guard below")
    expect(homepageServices.profile.title).toBe("Profile Recovery")
    expect(homepageServices.profile.href).toBe("/business-profile-recovery")
    expect(homepageServices.review.title).toBe("Review Protection")
    expect(homepageServices.review.href).toBe("/review-protection")
    expect(homepageServices.review.limit.toLowerCase()).toContain("google decides")
    expect(homepageGuard.eyebrow).toBe("Relaunch Guard")
    expect(homepageGuard.price).toBe(`${guardPrice} per month, per location`)
    expect(homepageGuard.priceNote).toBe("Limited introductory price.")
    expect(homepageGuard.boundary).toContain("does not prevent suspensions or guarantee instant detection")
    expect(homepageGuard.cta).toBe("Explore Relaunch Guard")
    expect(homepageGuard.href).toBe("/relaunch-guard")
    expect(homepageGuard.points).toEqual([
      "Two manual checks a day",
      "Email alerts after a human review",
      "Available without a recovery or review case",
    ])
    expect(pageSource).toMatch(/<HomeServices \/>\s*<HomeGuard \/>\s*<HomeProcess \/>/)
    expect(pageSource.match(/<HomeGuard \/>/g)).toEqual(["<HomeGuard />"])
    expect(pageSource).toContain("homepageFaqs.map(({ q, a }) => ({ q, a }))")
    expect(homepageSource).toContain("homepageGuard.boundary")
    expect(homepageSource).toContain("homepageGuard.priceNote")
    expect(homepageProblems.eyebrow).toBe("Common profile & review issues")
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
    expect(homepageSeo.description.toLowerCase()).toContain("google business profile recovery")
    expect(homepageSeo.description.toLowerCase()).toContain("review protection")
    expect(homepageSeo.description.toLowerCase()).toContain("suspended")
    expect(homepageSeo.description.toLowerCase()).toContain("review")
    expect(homepageSeo.description.toLowerCase()).not.toMatch(/uk businesses|uk-only/)
    expect(homepageTrustStrip).toContain("UK-based independent service")
    expect(homepageConversion.primaryHref).toBe("/get-help")
    expect(homepageConversion.secondaryHref).toBe("/pricing")
  })
})
