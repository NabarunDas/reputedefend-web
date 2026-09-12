import { describe, expect, it } from "vitest"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"
import {
  pricingClarity,
  pricingClose,
  pricingCompare,
  pricingFaqs,
  pricingGuard,
  pricingHelpHref,
  pricingHero,
  pricingRecovery,
  pricingRecoveryHref,
  pricingReview,
  pricingReviewHref,
  pricingSeo,
  pricingStart,
  pricingSuccess,
  pricingTiming,
  pricingTrustStrip,
  pricingVisual,
} from "./content"

const copy = JSON.stringify({
  pricingClarity,
  pricingClose,
  pricingCompare,
  pricingFaqs,
  pricingGuard,
  pricingHero,
  pricingRecovery,
  pricingReview,
  pricingSeo,
  pricingStart,
  pricingSuccess,
  pricingTiming,
  pricingTrustStrip,
  pricingVisual,
})

const recoveryGuided = pricingGroups[0].items[0]
const recoveryManaged = pricingGroups[0].items[1]
const reviewGuided = pricingGroups[1].items[0]
const reviewManaged = pricingGroups[1].items[1]
const guardPlan = pricingGroups[2].items[0]

describe("Pricing page copy", () => {
  it("keeps the Early Access hero, assessment CTA and How It Works route", () => {
    expect(pricingHero.eyebrow).toBe(earlyAccessLabel)
    expect(pricingHero.eyebrow).toBe("Early Access pricing")
    expect(pricingHero.titleLines[0]).toBe("Clear pricing.")
    expect(pricingHero.primaryCta).toBe("Start your assessment")
    expect(pricingHero.primaryHref).toBe("/get-help")
    expect(pricingHelpHref).toBe("/get-help")
    expect(pricingHero.secondaryCta).toBe("See how it works")
    expect(pricingHero.secondaryHref).toBe("/how-it-works")
    expect(pricingClose.primaryHref).toBe("/get-help")
    expect(pricingClose.secondaryHref).toBe("/how-it-works")
    expect(pricingHero.supportLine).toContain("Prices shown in GBP")
    expect(pricingHero.supportLine).toContain("Early Access pricing")
    expect(pricingHero.supportLine).toContain("Clear payment timing")
  })

  it("locks Profile Recovery Guided £99 and Managed £299 with £0 today", () => {
    expect(pricingRecovery.guided.price).toBe("£99")
    expect(pricingRecovery.guided.price).toBe(recoveryGuided.price)
    expect(pricingRecovery.guided.cadence).toBe("upfront")
    expect(pricingRecovery.guided.line).toBe("We prepare it. You submit it.")
    expect(pricingRecovery.managed.price).toBe("£299")
    expect(pricingRecovery.managed.price).toBe(recoveryManaged.price)
    expect(pricingRecovery.managed.today).toBe("£0 today")
    expect(pricingRecovery.managed.cadence).toBe("on successful restoration")
    expect(pricingRecovery.managed.line).toBe("You authorise us. We manage the case.")
    expect(pricingRecovery.guided.href).toBe("/get-help?service=profile-recovery")
    expect(pricingRecoveryHref).toBe("/get-help?service=profile-recovery")
    expect(pricingRecovery.managed.href).toBe(pricingRecoveryHref)
  })

  it("locks Review Protection Guided £59 and Managed £149 with £0 today", () => {
    expect(pricingReview.guided.price).toBe("£59")
    expect(pricingReview.guided.price).toBe(reviewGuided.price)
    expect(pricingReview.guided.line).toBe("We prepare it. You submit it.")
    expect(pricingReview.managed.price).toBe("£149")
    expect(pricingReview.managed.price).toBe(reviewManaged.price)
    expect(pricingReview.managed.today).toBe("£0 today")
    expect(pricingReview.managed.cadence).toBe("on successful removal")
    expect(pricingReview.managed.line).toBe("You authorise us. We manage the case.")
    expect(pricingReview.guided.href).toBe("/get-help?service=review")
    expect(pricingReviewHref).toBe("/get-help?service=review")
    expect(pricingReview.managed.href).toBe(pricingReviewHref)
  })

  it("locks Relaunch Guard at £9.99/month/location without bundling it", () => {
    expect(pricingGuard.figure).toBe("£9.99")
    expect(pricingGuard.figure).toBe(guardPlan.price)
    expect(pricingGuard.cadence).toBe("/month/location")
    expect(pricingGuard.spoken).toContain("per month, per location")
    expect(pricingGuard.kicker).toBe("Profile + Review monitoring")
    expect(pricingGuard.model.toLowerCase()).toContain("early access managed monitoring")
    expect(copy).toContain("£9.99/month/location")
    expect(copy.toLowerCase()).not.toContain("30 days free")
    expect(copy.toLowerCase()).not.toContain("included with managed")
    expect(copy.toLowerCase()).not.toContain("automatic subscription")
    expect(pricingFaqs.find((item) => item.q.includes("Guard included"))?.a.toLowerCase()).toContain("not bundled")
    expect(pricingGuard.href).toBe("/get-help")
  })

  it("explains Guided vs Managed, success-fee timing and assessment-first value", () => {
    expect(pricingStart.title.toLowerCase()).toContain("assessment")
    expect(pricingStart.hold.title.toLowerCase()).toContain("direction")
    expect(pricingStart.points.some((point) => point.copy.toLowerCase().includes("no paid support"))).toBe(true)
    expect(pricingCompare.title).toContain("who carries the case forward")
    expect(pricingCompare.rows.some((row) => row.label === "Who submits")).toBe(true)
    expect(pricingCompare.rows.some((row) => row.label === "Success-fee model")).toBe(true)
    expect(pricingCompare.rows.find((row) => row.label === "Owner-only steps")?.managed).toContain("Customer still")
    expect(pricingSuccess.title).toContain("success fee")
    expect(pricingSuccess.recovery.copy).toContain("£299")
    expect(pricingSuccess.review.copy).toContain("£149")
    expect(pricingTiming.items[1].title).toBe("£0 today")
    expect(pricingTiming.items[1].copy.toLowerCase()).toContain("not a free service")
    expect(copy.toLowerCase()).not.toContain("no win no fee")
  })

  it("does not invent future prices, discounts, VAT claims or a UK-only restriction", () => {
    expect(copy).not.toContain("£399")
    expect(copy).not.toContain("£17.99")
    expect(copy.toLowerCase()).not.toMatch(/was £|save £|crossed-out|strikethrough/)
    expect(copy.toLowerCase()).not.toMatch(/\bvat\b|sales tax|tax included|tax excluded/)
    expect(copy.toLowerCase()).not.toMatch(/uk-only|uk businesses|uk customers only|united kingdom only/)
    expect(pricingHero.supportLine).toContain("GBP")
    expect(pricingFaqs.some((item) => item.q.includes("GBP"))).toBe(true)
    expect(pricingFaqs.some((item) => /outside the UK/i.test(item.q))).toBe(true)
    expect(pricingFaqs.find((item) => /outside the UK/i.test(item.q))?.a.toLowerCase()).toContain("internationally")
    expect(pricingSeo.description.toLowerCase()).toContain("gbp")
    expect(pricingSeo.description.toLowerCase()).not.toContain("uk-only")
    const questions = pricingFaqs.map((item) => item.q).join(" ")
    expect(questions).toMatch(/fee to submit an assessment/i)
    expect(questions).toMatch(/When do I pay for Guided/)
    expect(questions).toMatch(/When do I pay for Managed/)
    expect(questions).toMatch(/successful restoration/)
    expect(questions).toMatch(/successful removal/)
    expect(questions).toMatch(/does not reinstate/)
    expect(questions).toMatch(/does not remove the review/)
    expect(questions).toMatch(/no paid support/)
    expect(questions).toMatch(/switch from Guided to Managed/)
    expect(questions).toMatch(/Guard included/)
    expect(questions).toMatch(/Guard a subscription/)
    expect(pricingFaqs.find((item) => item.q.includes("switch"))?.a.toLowerCase()).not.toMatch(/\bcredit|\brefund|price-offset/)
  })
})
