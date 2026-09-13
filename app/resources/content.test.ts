import { describe, expect, it } from "vitest"
import { resourcesBrowse, resourcesFeaturedEmpty, resourcesHowProduced, resourcesHubHero, resourcesHubSeo, resourcesLibrary } from "./content"

const copy = JSON.stringify({
  resourcesBrowse,
  resourcesFeaturedEmpty,
  resourcesHowProduced,
  resourcesHubHero,
  resourcesHubSeo,
  resourcesLibrary,
}).toLowerCase()

describe("Resources hub copy", () => {
  it("uses Resources branding and the global policy-first positioning", () => {
    expect(resourcesHubSeo.titlePage).toBe("Google Business Profile Resources")
    expect(resourcesHubHero.eyebrow).toBe("Google Business Profile Resources")
    expect(resourcesHubHero.title).toBe("Understand the policy before you make the next move.")
    expect(resourcesHubHero.lead).toContain("written for business owners, not platform specialists")
    expect(resourcesHubHero.primaryCta).toBe("Browse resources")
    expect(resourcesHubHero.secondaryHref).toBe("/get-help")
    expect(copy).not.toMatch(/\bblog\b|newsroom|knowledge base|learning centre|learning center/)
    expect(copy).not.toMatch(/for uk businesses|uk businesses only|uk-only|serving only the uk/)
  })

  it("explains empty categories without fake article counts", () => {
    expect(resourcesBrowse.emptyCount).toBe("Guides in preparation")
    expect(resourcesFeaturedEmpty.copy).toContain("Practical guides are being prepared")
    expect(resourcesHowProduced.copy).toContain("distinguish Google's rules from our practical interpretation")
    expect(resourcesLibrary.empty).toBe(
      "No guides are published yet. Planned guides remain hidden until they have been researched, reviewed and released.",
    )
  })
})
