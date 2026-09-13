import { describe, expect, it } from "vitest"
import { disclaimerHero, disclaimerInternational, disclaimerSeo } from "./content"

const copy = JSON.stringify({ disclaimerHero, disclaimerInternational, disclaimerSeo }).toLowerCase()

describe("Disclaimer copy", () => {
  it("keeps independence and no-guarantee limits without a UK-only restriction", () => {
    expect(disclaimerSeo.titlePage).toBe("Disclaimer")
    expect(disclaimerHero.lead.toLowerCase()).toContain("independent of google")
    expect(disclaimerHero.lead.toLowerCase()).toContain("not legal advice")
    expect(disclaimerInternational.toLowerCase()).toContain("internationally")
    expect(disclaimerInternational.toLowerCase()).toContain("does not mean every google process")
    expect(copy).not.toMatch(/for uk businesses|uk-only|uk customers only/)
  })
})
