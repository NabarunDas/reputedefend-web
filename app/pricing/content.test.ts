import { describe, expect, it } from "vitest"
import { guardFaqs } from "@/app/relaunch-guard/content"
import { guardOffer, guardPrice } from "@/lib/guard-offer"
import { pricingGroups } from "@/lib/pricing"
import {
  pricingClarity,
  pricingClose,
  pricingCompare,
  pricingFaqs,
  pricingGuard,
  pricingGuardHref,
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

function faq(question: string) {
  const item = pricingFaqs.find((entry) => entry.q === question)
  expect(item, `Missing pricing FAQ: ${question}`).toBeDefined()
  return item!
}

function guardSourceAnswer(question: string) {
  const item = guardFaqs.find((entry) => entry.q === question)
  const answer = item?.a.join(" ").trim()
  expect(answer, `Missing Guard FAQ answer: ${question}`).toBeTruthy()
  return answer!
}

describe("Pricing page copy", () => {
  it("keeps the assessment CTA, pricing label and monitoring route", () => {
    expect(pricingHero.eyebrow).toBe("Pricing")
    expect(pricingVisual.chrome).toEqual(["Commercial model", "Pricing"])
    expect(pricingHero.titleLines[0]).toBe("Clear pricing.")
    expect(pricingHero.primaryCta).toBe("Start your assessment")
    expect(pricingHero.primaryHref).toBe("/get-help")
    expect(pricingHelpHref).toBe("/get-help")
    expect(pricingHero.secondaryCta).toBe("Explore monitoring")
    expect(pricingHero.secondaryHref).toBe("/relaunch-guard")
    expect(pricingGuardHref).toBe("/relaunch-guard")
    expect(pricingClose.primaryHref).toBe("/get-help")
    expect(pricingClose.secondaryHref).toBe("/how-it-works")
    expect(pricingHero.supportLine).toBe("Prices in GBP • Clear fees • No obligation to proceed")
    expect(pricingHero.lead).toContain("start with an assessment")
    expect(pricingHero.lead).toContain("Relaunch Guard monitoring on its own")
    expect(pricingTrustStrip[0]).toBe("Clear service options")
    expect(pricingStart.eyebrow).toBe("For profile and review problems")
    expect(pricingVisual.assessment.label).toBe("For profile and review problems")
    expect(pricingVisual.assessment.note).toBe("We review the problem before you choose paid case support.")
    expect(pricingVisual.ariaLabel).toBe("Prices for Profile Recovery, Review Protection and Relaunch Guard")
    expect(pricingSeo.description).toBe(
      "Compare Profile Recovery, Review Protection and Relaunch Guard monitoring. See what each service includes, what it costs and when you pay. Prices shown in GBP.",
    )
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

  it("uses the shared Guard price and sends Guard links to the sales page", () => {
    expect(pricingGuard.figure).toBe(guardPrice)
    expect(pricingGuard.figure).toBe("£9.99")
    expect(pricingGuard.cadence).toBe("per month, per location")
    expect(pricingGuard.spoken).toBe(`${guardPrice} per month, per location.`)
    expect(pricingGuard.kicker).toBe("Profile and review monitoring")
    expect(pricingGuard.title).toBe("Monitoring for your Google Business Profile")
    expect(pricingGuard.lead).toContain("Our team checks")
    expect(pricingGuard.points[0]).toBe("Two manual checks a day")
    expect(pricingGuard.supporting).toContain("not continuous")
    expect(pricingVisual.guard.figure).toBe(`${guardPrice}/month`)
    expect(pricingVisual.guard.cadence).toBe("Per location")
    expect(pricingTiming.items[2].title).toBe(`${guardPrice} per month, per location`)
    expect(pricingTiming.items[2].copy).toContain("Sending a setup request does not take payment")
    expect(copy).toContain(`${guardPrice}/month`)
    expect(copy).not.toContain("/month/location")
    expect(copy.toLowerCase()).not.toContain("30 days free")
    expect(copy.toLowerCase()).not.toContain("automatic subscription")
    expect(pricingGuard.href).toBe("/relaunch-guard")
    expect(pricingGuard.cta).toBe("Explore Relaunch Guard")
    expect(pricingGuard.secondaryCta).toBe("Get help with an existing problem")
    expect(pricingGuard.secondaryHref).toBe("/get-help")
    expect(pricingHero.secondaryHref).toBe("/relaunch-guard")
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

  it("keeps included Guard optional, discount exclusions visible and Guard FAQs sourced", () => {
    const included = faq("Is Relaunch Guard included?")
    expect(included.a).toContain(`${guardOffer.includedRecoveryDays} days of Guard`)
    expect(included.a).toContain("The period starts when monitoring is activated")
    expect(included.a).toContain("paid monitoring starts only if you choose to continue")
    expect(included.a).toContain("does not apply to Guided recovery or review services")

    const subscription = faq("Is Relaunch Guard a subscription?")
    expect(subscription.a).toBe(
      `Yes. Guard costs ${guardPrice} per month, per location. You can subscribe without a recovery or review case. We confirm your permission, Manager access and the profile’s starting condition before arranging payment and confirming activation.`,
    )

    const discount = faq("Do Guard members receive a discount on case work?")
    expect(discount.a).toContain(`${guardOffer.managedDiscountPercent}% off`)
    expect(discount.a).toContain("pre-existing problems are excluded")
    expect(discount.a).toContain("does not apply to Guided support, Guard subscriptions, custom or bulk quotations")
    expect(discount.a).toContain(`included ${guardOffer.includedRecoveryDays}-day period`)
    expect(discount.a).toContain("It cannot be combined with another offer")

    expect(faq("How do I cancel Guard?").a).toBe(guardSourceAnswer("How do I cancel?"))
    expect(faq("Can my monthly price change?").q).toBe("Can my monthly price change?")
    expect(faq("Can my monthly price change?").a).toBe(guardSourceAnswer("Can the introductory price change?"))
    expect(faq("Can my monthly price change?").a).toContain("at least 30 days")
    expect(faq("Can my monthly price change?").a).toContain("accept the change before charging the higher price")
    expect(faq("Can my monthly price change?").a).toContain("subscription ends before that renewal")

    expect(faq("Are prices shown in GBP?").a).toBe(
      "Yes. All prices on this page are shown in pounds sterling (GBP). We confirm the total before you agree to paid work. If you pay from an account in another currency, your payment provider may apply its own conversion rate or fees.",
    )
  })

  it("does not present Early Access, introductory, VAT or UK-only claims on the pricing page", () => {
    expect(copy).not.toMatch(/Early Access/i)
    expect(copy).not.toMatch(/introductory/i)
    expect(copy).not.toMatch(/\bbeta\b/i)
    expect(copy).not.toMatch(/\bpilot\b/i)
    expect(copy).not.toMatch(/launch pricing/i)
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
    expect(questions).toMatch(/discount on case work/)
    expect(questions).toMatch(/cancel Guard/)
    expect(questions).toMatch(/monthly price change/)
    expect(pricingFaqs.find((item) => item.q.includes("switch"))?.a.toLowerCase()).not.toMatch(/\bcredit|\brefund|price-offset/)
  })
})
