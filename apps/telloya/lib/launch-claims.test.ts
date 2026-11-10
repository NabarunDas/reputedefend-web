import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { howItWorksContent, pricingContent, featuresContent, homepageContent, featureStageLabels } from "@/lib/content"
import { relaunchGuardAddon, telloyaPlans, overagePolicy } from "@/lib/pricing"

describe("Telloya capability claims", () => {
  it("does not present the customer dashboard as operational", () => {
    const delivered = howItWorksContent.journey.steps.find((step) => step.number === "05")
    expect(delivered?.description).toMatch(/agreed during setup/i)
    expect(`${delivered?.description} ${delivered?.detail}`).not.toMatch(/dashboard/i)
    const journey = howItWorksContent.journey.steps.map((step) => `${step.description} ${step.detail}`).join(" ")
    expect(journey).not.toMatch(/dashboard is available|appears in your dashboard/i)

    expect(featuresContent.features.map((feature) => feature.title as string)).not.toContain("Usage visibility")
    expect(featuresContent.features.every((feature) => feature.stage === "demonstrated")).toBe(true)
    const history = featuresContent.future.items.find((item) => item.title === "Customer call history")
    expect(history?.description).toMatch(/planned/i)
    expect(history?.description).toMatch(/not live/i)
    expect(history?.timeline).toMatch(/Planned/)

    for (const plan of pricingContent.plans) {
      if (plan.tier === "custom") continue
      expect(plan.features.join(" ")).toMatch(/agreed delivery method/i)
      expect(plan.features.join(" ")).not.toMatch(/planned|dashboard/i)
      expect(plan.features).not.toContain("Usage visibility")
    }
    expect(featureStageLabels.demonstrated).toBe("Tested in demonstration")
    expect(featureStageLabels.planned).toBe("Planned")

    const row = pricingContent.comparison.table.rows.find((entry) => entry[0] === "Usage visibility")
    expect(row?.slice(1)).toEqual(["Planned", "Planned", "Planned", "Planned"])
  })

  it("renders the approved homepage headline from the shared content", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).not.toContain("Never Misses a Call")
    expect(source).toContain("hero.headlineLead")
    expect(source).toContain("hero.headlineEmphasis")
    expect(homepageContent.hero.headlineLead).toBe("Don't Let Missed Calls")
    expect(homepageContent.hero.headlineEmphasis).toBe("Cost You Customers.")
    expect(`${homepageContent.hero.headlineLead} ${homepageContent.hero.headlineEmphasis}`).not.toContain("Never Misses a Call")
  })
})

describe("Telloya commercial statements", () => {
  it("publishes the approved GBP prices and does not promise local-currency checkout", () => {
    expect(telloyaPlans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth])).toEqual([
      ["basic", 49, 120],
      ["growth", 79, 300],
      ["pro", 120, 500],
      ["custom", null, null],
    ])
    expect(relaunchGuardAddon.pricePerLocationGbp).toBe(9.99)
    expect(overagePolicy.pricePerMinuteGbp).toBe(0.25)
    expect(overagePolicy.requiresOptIn).toBe(true)

    const commercial = [
      pricingContent.currency.note,
      ...pricingContent.international.points,
      pricingContent.international.note,
      ...pricingContent.faq.questions.map((item) => `${item.q} ${item.a}`),
      ...pricingContent.overage.points,
    ].join("\n")
    expect(commercial).toMatch(/GBP/)
    expect(commercial).toMatch(/confirmed before/i)
    expect(commercial).not.toMatch(/local currency|exchange rate|at checkout/i)
    expect(commercial).not.toMatch(/roll over|carry forward/i)
    expect(pricingContent.faq.questions.some((item) => /roll over/i.test(item.q))).toBe(false)
  })
})

describe("Telloya illustrative demo", () => {
  it("renders a page instead of redirecting to the enquiry form", () => {
    const source = readFileSync(resolve(process.cwd(), "app/demo/page.tsx"), "utf8")
    expect(source).not.toContain("redirect(")
    expect(source).toContain("DemoExperience")
    expect(source).toContain('canonical: "/demo"')
  })
})
