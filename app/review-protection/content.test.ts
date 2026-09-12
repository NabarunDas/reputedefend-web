import { describe, expect, it } from "vitest"
import {
  reviewFaqs,
  reviewHelpHref,
  reviewHero,
  reviewJudgement,
  reviewModels,
  reviewPricing,
  reviewRoutes,
  reviewSeo,
  reviewTrustStrip,
} from "./content"
import { pricingGroups } from "@/lib/pricing"

const copy = JSON.stringify({
  reviewFaqs,
  reviewHero,
  reviewJudgement,
  reviewModels,
  reviewPricing,
  reviewRoutes,
  reviewSeo,
})

describe("Review Protection page copy", () => {
  it("keeps the review hero, intake route and support line", () => {
    expect(reviewHero.eyebrow).toBe("Google Review Protection")
    expect(reviewHero.titleLines[1]).toContain("rushed response")
    expect(reviewHero.primaryCta).toBe("Start your assessment")
    expect(reviewHero.primaryHref).toBe("/get-help?service=review")
    expect(reviewHelpHref).toBe("/get-help?service=review")
    expect(reviewHero.secondaryHref).toBe("/pricing")
    expect(reviewHero.supportLine.toLowerCase()).toContain("challenge or response")
  })

  it("locks Guided Review £59 and Managed Review £149 with £0 today", () => {
    const guided = pricingGroups[1].items[0]
    const managed = pricingGroups[1].items[1]
    expect(reviewModels.guided.price).toBe("£59")
    expect(reviewModels.guided.price).toBe(guided.price)
    expect(reviewModels.guided.line).toBe("We prepare it. You submit it.")
    expect(reviewModels.managed.price).toBe("£149")
    expect(reviewModels.managed.price).toBe(managed.price)
    expect(reviewModels.managed.today).toBe("£0 today")
    expect(reviewModels.managed.line).toBe("You authorise us. We manage the case.")
    expect(reviewModels.managed.copy).toContain("agreed review case work")
    expect(reviewModels.managed.copy).toContain("defined successful removal outcome")
    expect(reviewPricing.items[0].figure).toBe("£59")
    expect(reviewPricing.items[1].figure).toBe("£0 today")
    expect(copy).not.toContain("£399")
    expect(copy.toLowerCase()).not.toMatch(/was £|save £|crossed/)
  })

  it("distinguishes genuine negatives from policy issues and does not promise removal", () => {
    expect(reviewJudgement.title).toBe("Negative is not the same as policy-breaching.")
    expect(reviewRoutes.challenge.kicker.toLowerCase()).toContain("challenge")
    expect(reviewRoutes.response.kicker.toLowerCase()).toContain("professional response")
    expect(copy.toLowerCase()).not.toMatch(/guaranteed removal|100% success|google partner/)
    expect(JSON.stringify(reviewFaqs).toLowerCase()).toContain("google decides")
    expect(reviewFaqs.some((item) => item.q.includes("guarantee review removal"))).toBe(true)
    expect(reviewTrustStrip).toContain("Early Access pricing")
  })

  it("keeps Review Protection SEO geographically neutral", () => {
    expect(reviewSeo.titlePage).toMatch(/Google Review Protection/)
    expect(reviewSeo.description.toLowerCase()).toContain("google review protection")
    expect(reviewSeo.description.toLowerCase()).toContain("challenge")
    expect(reviewSeo.description.toLowerCase()).toMatch(/suspicious|policy/)
    expect(copy.toLowerCase()).not.toMatch(/uk businesses|uk-only|uk google review/)
    expect(reviewSeo.description.toLowerCase()).not.toMatch(/uk businesses|uk-only/)
  })
})
