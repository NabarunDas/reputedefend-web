import { describe, expect, it } from "vitest"
import {
  getHelpHero,
  getHelpOutcome,
  getHelpProcess,
  getHelpRoutes,
  getHelpSecurity,
  getHelpSeo,
  getHelpTrustStrip,
} from "./content"

const copy = JSON.stringify({
  getHelpHero,
  getHelpOutcome,
  getHelpProcess,
  getHelpRoutes,
  getHelpSecurity,
  getHelpSeo,
  getHelpTrustStrip,
})

describe("Get Help page copy", () => {
  it("keeps a compact assessment hero without a huge marketing pitch", () => {
    expect(getHelpHero.eyebrow).toBe("Start your assessment")
    expect(getHelpHero.titleLines[0]).toBe("Tell us what happened.")
    expect(getHelpHero.supportLine).toContain("Human-reviewed")
    expect(getHelpHero.supportLine.toLowerCase()).toContain("perfect case file")
    expect(getHelpSeo.titlePage).toContain("Start Your Assessment")
    expect(getHelpSeo.description.toLowerCase()).toContain("human")
    expect(getHelpSeo.description.toLowerCase()).not.toMatch(/uk-only|uk businesses/)
  })

  it("marks Tell us what happened as live and Connect Google as Coming Soon only", () => {
    expect(getHelpRoutes.live.status).toBe("Available now")
    expect(getHelpRoutes.live.title).toBe("Tell us what happened")
    expect(getHelpRoutes.future.status).toBe("Coming soon")
    expect(getHelpRoutes.future.title).toBe("Connect Google")
    expect(copy.toLowerCase()).not.toMatch(/\bconnect now\b/)
    expect(copy.toLowerCase()).not.toMatch(/oauth|retrieved account/)
  })

  it("uses a conversion-useful trust strip and does not lead with Independent of Google", () => {
    expect(getHelpTrustStrip).toEqual([
      "Human-reviewed assessment",
      "Start with what you have",
      "No passwords or verification codes",
      "Clear recommendation before paid support",
    ])
    expect(copy.toLowerCase()).not.toContain("independent of google")
  })

  it("explains Guided or Managed as a later choice, not a score or upload", () => {
    expect(getHelpProcess.steps[3].title).toContain("Guided or Managed")
    expect(getHelpOutcome.copy.toLowerCase()).toContain("not pay for support yet")
    expect(copy.toLowerCase()).not.toMatch(/85%|ai score|eligibility meter|high confidence/)
    expect(copy.toLowerCase()).not.toMatch(/within 1 hour|same day|24 hours/)
    expect(getHelpSecurity.copy.toLowerCase()).toContain("passwords")
    expect(getHelpSecurity.copy.toLowerCase()).toContain("otp")
  })
})
