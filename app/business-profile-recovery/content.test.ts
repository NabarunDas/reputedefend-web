import { describe, expect, it } from "vitest"
import {
  recoveryFaqs,
  recoveryHelpHref,
  recoveryHero,
  recoveryModels,
  recoveryPricing,
  recoveryProcess,
  recoverySeo,
  recoverySituations,
  recoveryTrustStrip,
} from "./content"
import { pricingGroups } from "@/lib/pricing"

const copy = JSON.stringify({
  recoveryFaqs,
  recoveryHero,
  recoveryModels,
  recoveryPricing,
  recoveryProcess,
  recoverySeo,
})

describe("Profile Recovery page copy", () => {
  it("keeps the recovery hero, CTAs and intake preselection", () => {
    expect(recoveryHero.eyebrow).toBe("Google Business Profile Recovery")
    expect(recoveryHero.titleLines[0]).toContain("Your profile is down")
    expect(recoveryHero.primaryCta).toBe("Start your assessment")
    expect(recoveryHero.primaryHref).toBe("/get-help?service=profile-recovery")
    expect(recoveryHelpHref).toBe("/get-help?service=profile-recovery")
    expect(recoveryHero.secondaryHref).toBe("/pricing")
  })

  it("states Guided and Managed with locked published prices", () => {
    const guided = pricingGroups[0].items[0]
    const managed = pricingGroups[0].items[1]
    expect(recoveryModels.guided.price).toBe(guided.price)
    expect(recoveryModels.guided.line).toBe("We prepare it. You submit it.")
    expect(recoveryModels.managed.price).toBe(managed.price)
    expect(recoveryModels.managed.today).toBe("£0 today")
    expect(recoveryModels.managed.line).toBe("You authorise us. We manage the case.")
    expect(recoveryModels.managed.copy.toLowerCase()).toContain("agreed case work")
    expect(copy).not.toContain("£399")
    expect(copy).not.toContain("£149")
    expect(copy.toLowerCase()).not.toMatch(/was £|save £/)
  })

  it("covers recovery situations, process and FAQ without fake guarantees", () => {
    expect(recoverySituations.items).toEqual(expect.arrayContaining([
      "Profile suspended",
      "Verification stuck",
      "Lost owner or manager access",
      "Appeal already submitted",
    ]))
    expect(recoveryProcess.steps).toHaveLength(6)
    expect(recoveryProcess.steps[5].title).toMatch(/Google makes the final platform decision/)
    expect(recoveryTrustStrip).toContain("Pricing")
    const questions = recoveryFaqs.map((item) => item.q).join(" ")
    expect(questions).toMatch(/Why was my .* suspended/)
    expect(questions).toMatch(/exactly why Google/)
    expect(questions).toMatch(/evidence/)
    expect(questions).toMatch(/appeal was rejected/)
    expect(questions).toMatch(/How long does reinstatement/)
    expect(questions).toMatch(/Guided vs Managed/)
    expect(questions).toMatch(/guarantee reinstatement/)
    expect(questions).toMatch(/Managed success/)
    expect(copy.toLowerCase()).not.toMatch(/100% success/)
    expect(JSON.stringify(recoveryFaqs)).not.toContain("ReputeDefend")
  })

  it("keeps recovery metadata geographically neutral and on the recovery intent", () => {
    expect(recoverySeo.titlePage).toContain("Google Business Profile Recovery")
    expect(recoverySeo.description.toLowerCase()).toContain("suspended")
    expect(recoverySeo.description.toLowerCase()).toContain("verification")
    expect(recoverySeo.description.toLowerCase()).toContain("reinstatement")
    expect(recoverySeo.description.toLowerCase()).not.toMatch(/uk businesses|uk-only/)
    expect(recoveryPricing.items[0].figure).toBe("£99")
  })
})
