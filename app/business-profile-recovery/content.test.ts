import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  recoveryFaqs,
  recoveryGuides,
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
import { resourceCategoryHubs } from "@/lib/resource-category-links"
import { getPublishedResources, resourcePath } from "@/lib/resources"

const pageSource = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8")

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
    expect(recoveryHero.titleLines).toEqual([
      "Google Business Profile Suspension",
      "& Reinstatement Help",
    ])
    // The old H1 line stays visible as supporting copy rather than the heading.
    expect(recoveryHero.lead).toMatch(
      /^Your profile is down\. Your recovery plan shouldn't be guesswork\./,
    )
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

  it("links the recovery page to published guides and the Profile Recovery hub", () => {
    expect(recoveryGuides.title).toBe("Helpful guides before your next step")
    expect(recoveryGuides.links).toEqual([
      {
        label: "What to do before you appeal a suspension",
        href: "/resources/google-business-profile-suspended-before-appeal",
      },
      {
        label: "Google Business Profile appeal evidence checklist",
        href: "/resources/google-business-profile-appeal-evidence-checklist",
      },
      {
        label: "What to do after a rejected appeal",
        href: "/resources/google-business-profile-appeal-rejected-what-next",
      },
      {
        label: "Verification stuck or rejected",
        href: "/resources/google-business-profile-verification-stuck-or-rejected",
      },
    ])
    expect(recoveryGuides.hubLabel).toBe("Browse all Profile Recovery guides")
    expect(recoveryGuides.hubHref).toBe(resourceCategoryHubs["profile-recovery"])
    // Every anchor must reach a live published article, not a draft or 404.
    const published = new Set(getPublishedResources().map((resource) => resourcePath(resource.slug)))
    for (const link of recoveryGuides.links) {
      expect(published, link.href).toContain(link.href)
    }
    expect(pageSource).toMatch(/<RecoveryAppealed \/>\s*<RecoveryGuides \/>\s*<RecoveryFaq \/>/)
  })

  it("keeps recovery metadata geographically neutral and on the recovery intent", () => {
    expect(recoverySeo.titlePage).toBe("Google Business Profile Suspension & Reinstatement Help")
    expect(recoverySeo.description.toLowerCase()).toContain("suspended")
    expect(recoverySeo.description.toLowerCase()).toContain("verification")
    expect(recoverySeo.description.toLowerCase()).toContain("reinstatement")
    expect(recoverySeo.description.toLowerCase()).not.toMatch(/uk businesses|uk-only/)
    expect(recoveryPricing.items[0].figure).toBe("£99")
  })
})
