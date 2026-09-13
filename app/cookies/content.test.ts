import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { cookiesAnalytics, cookiesChoice, cookiesHero, cookiesIntro, cookiesNecessary, cookiesSeo } from "./content"

const copy = JSON.stringify({
  cookiesAnalytics,
  cookiesChoice,
  cookiesHero,
  cookiesIntro,
  cookiesNecessary,
  cookiesSeo,
}).toLowerCase()

describe("Cookies page copy", () => {
  it("exists as an optional-analytics notice without advertising claims", () => {
    expect(cookiesSeo.titlePage).toBe("Cookies and analytics")
    expect(cookiesHero.title).toBe("Cookies and analytics")
    expect(cookiesSeo.description.toLowerCase()).toContain("optional")
    expect(copy).toContain("optional")
    expect(copy).toContain("accept")
    expect(copy).toContain("reject")
    expect(copy).toContain("cookie settings")
    expect(copy).toContain("not used for advertising")
    expect(copy).not.toMatch(/facebook pixel|hotjar|clarity/)
    expect(copy).not.toMatch(/expires in \d+ (days|months)|lifetime of \d+/)
    expect(copy).not.toMatch(/the following cookies are set: _gid|_gat/)
  })

  it("keeps a global consent model and UK-based operator language", () => {
    expect(cookiesIntro.join(" ")).toMatch(/UK-based/i)
    expect(cookiesIntro.join(" ").toLowerCase()).toContain("internationally")
    expect(copy).not.toMatch(/for uk businesses|uk-only|uk customers only/)
    expect(cookiesAnalytics.paragraphs.join(" ")).toContain("page path")
    expect(cookiesChoice.paragraphs.join(" ")).toContain("Cookie settings")
  })
})

describe("analytics source boundaries", () => {
  it("does not add advertising tags or form instrumentation", () => {
    const analytics = readFileSync(new URL("../../lib/analytics.ts", import.meta.url), "utf8")
    const ga = readFileSync(new URL("../../components/google-analytics.tsx", import.meta.url), "utf8")
    const consent = readFileSync(new URL("../../components/analytics-consent.tsx", import.meta.url), "utf8")
    const intake = readFileSync(new URL("../../components/case-intake-form.tsx", import.meta.url), "utf8")
    const contact = readFileSync(new URL("../../components/contact-form.tsx", import.meta.url), "utf8")
    const enquiry = readFileSync(new URL("../../components/enquiry-form.tsx", import.meta.url), "utf8")
    const combined = `${analytics}\n${ga}\n${consent}`
    expect(combined).not.toMatch(/facebook\.net|fbevents|hotjar|clarity\.ms|googlesyndication|AW-|gtag\('event', 'conversion'/)
    expect(intake).not.toMatch(/sendSanitizedPageView|gtag\(|GoogleAnalytics/)
    expect(contact).not.toMatch(/sendSanitizedPageView|gtag\(|GoogleAnalytics/)
    expect(enquiry).not.toMatch(/sendSanitizedPageView|gtag\(|GoogleAnalytics/)
  })
})
