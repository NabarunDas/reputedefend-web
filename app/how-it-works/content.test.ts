import { describe, expect, it } from "vitest"
import {
  howAssess,
  howAuth,
  howChoice,
  howClose,
  howFaqs,
  howGuard,
  howHelpHref,
  howHero,
  howOutcomes,
  howPricing,
  howSeo,
  howStart,
  howTimeline,
  howTrustStrip,
  howValue,
} from "./content"
import { pricingGroups } from "@/lib/pricing"

const copy = JSON.stringify({
  howAssess,
  howAuth,
  howChoice,
  howClose,
  howFaqs,
  howGuard,
  howHero,
  howOutcomes,
  howPricing,
  howSeo,
  howStart,
  howTimeline,
  howValue,
})

describe("How It Works page copy", () => {
  it("keeps the live Tell us what happened route and /get-help CTA", () => {
    expect(howHero.eyebrow).toBe("How ProfileRelaunch works")
    expect(howHero.titleLines[0]).toContain("what happened")
    expect(howHero.primaryCta).toBe("Start your assessment")
    expect(howHero.primaryHref).toBe("/get-help")
    expect(howHelpHref).toBe("/get-help")
    expect(howHero.secondaryHref).toBe("/pricing")
    expect(howStart.live.status).toBe("Available now")
    expect(howStart.live.title).toBe("Tell us what happened")
    expect(howStart.live.href).toBe("/get-help")
    expect(howClose.primaryHref).toBe("/get-help")
  })

  it("marks Google connection as unavailable without a fake integration", () => {
    expect(howStart.title).toBe("Start by telling us what happened.")
    expect(howStart.future.status).toBe("Not available yet")
    expect(howStart.future.title).toBe("Connect your Google Business Profile")
    expect(howStart.future.note).toContain("no confirmed date for Google connection")
    expect(howStart.future.note.toLowerCase()).toContain("never ask for your google password")
    expect(copy.toLowerCase()).not.toMatch(/\bconnect now\b/)
    expect(copy.toLowerCase()).not.toMatch(/oauth|retrieved account|connect your google now/)
    expect(copy.toLowerCase()).not.toMatch(/coming soon/)
    const connectFaq = howFaqs.find((item) => item.q === "Can I connect my Google account?")
    expect(connectFaq?.a).toContain("You can send an enquiry without connecting Google")
    expect(connectFaq?.a).toContain("There is no confirmed date for Google connection")
  })

  it("promises human assessment rather than an automated score", () => {
    expect(howAssess.title).toContain("A person reviews the case")
    expect(howAssess.lead.toLowerCase()).toContain("human")
    expect(copy.toLowerCase()).not.toMatch(/\bai analysis\b|confidence score|%\s*fit|100%/)
    expect(howOutcomes.title.toLowerCase()).toContain("not a score")
    expect(howOutcomes.lead.toLowerCase()).toContain("not statistical")
  })

  it("makes Step 4 an explicit Guided vs Managed commercial choice", () => {
    expect(howChoice.eyebrow).toBe("Step 4")
    expect(howChoice.title).toBe("Choose how you want us to help.")
    expect(howTimeline.steps[3].title).toBe("Choose how you want us to help")
    expect(howChoice.guided.line).toBe("We prepare it. You submit it.")
    expect(howChoice.managed.line).toBe("You authorise us. We manage the case.")
    expect(copy.toLowerCase()).not.toContain("further support may be available")
    expect(howValue.title).toContain("direction")
    expect(howValue.holds.items.some((item) => item.toLowerCase().includes("complete appeal wording"))).toBe(true)
  })

  it("locks published prices including £0 today and Relaunch Guard", () => {
    const recoveryGuided = pricingGroups[0].items[0]
    const recoveryManaged = pricingGroups[0].items[1]
    const reviewGuided = pricingGroups[1].items[0]
    const reviewManaged = pricingGroups[1].items[1]
    const guard = pricingGroups[2].items[0]
    expect(howChoice.guided.prices[0].figure).toBe("£99")
    expect(howChoice.guided.prices[0].figure).toBe(recoveryGuided.price)
    expect(howChoice.guided.prices[1].figure).toBe("£59")
    expect(howChoice.guided.prices[1].figure).toBe(reviewGuided.price)
    expect(howChoice.managed.prices[0].figure).toBe("£0 today")
    expect(howChoice.managed.prices[0].cadence).toContain("£299")
    expect(howChoice.managed.prices[1].figure).toBe("£0 today")
    expect(howChoice.managed.prices[1].cadence).toContain("£149")
    expect(howGuard.figure).toBe("£9.99")
    expect(howGuard.figure).toBe(guard.price)
    expect(howGuard.cadence).toBe(guard.cadence)
    expect(howGuard.eyebrow).toBe("Relaunch Guard")
    expect(howGuard.title).toBe("Keep an eye on your profile, with or without a case.")
    expect(howGuard.lead).toContain("running normally")
    expect(howGuard.model).toContain("Checks are scheduled, not continuous")
    expect(howGuard.cta).toBe("Explore Relaunch Guard")
    expect(howGuard.href).toBe("/relaunch-guard")
    expect(howTimeline.steps[6].title).toBe("Optional ongoing monitoring")
    expect(howTimeline.steps[6].body).toBe(
      "You can add Relaunch Guard after recovery. It is also available on its own, without a recovery or review case.",
    )
    expect(copy).toContain(recoveryManaged.price)
    expect(copy).toContain(reviewManaged.price)
    expect(copy).not.toContain("£399")
    expect(copy.toLowerCase()).not.toMatch(/was £|save £|crossed|standard price/)
    expect(howTrustStrip).toContain("Pricing")
  })

  it("explains authorisation without requesting passwords or OTPs", () => {
    expect(howAuth.title).toContain("does not mean handing over your Google password")
    expect(howAuth.never.toLowerCase()).toContain("never ask for passwords")
    expect(howAuth.never.toLowerCase()).toContain("otp")
    expect(copy.toLowerCase()).not.toMatch(/send us your password|enter your otp|share your verification code/)
  })

  it("keeps How It Works SEO geographically neutral", () => {
    expect(howSeo.titlePage).toMatch(/How It Works/)
    expect(howSeo.description).toBe(
      "See how ProfileRelaunch handles profile and review enquiries, explains Guided and Managed support, and sets up optional Relaunch Guard monitoring.",
    )
    expect(howSeo.description.toLowerCase()).toContain("profile and review")
    expect(howSeo.description.toLowerCase()).toContain("relaunch guard")
    expect(copy.toLowerCase()).not.toMatch(/uk businesses|uk-only|uk google business profile service/)
    expect(howSeo.description.toLowerCase()).not.toMatch(/uk businesses|uk-only/)
  })
})
