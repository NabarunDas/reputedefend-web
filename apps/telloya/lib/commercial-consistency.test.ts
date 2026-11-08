import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  featuresContent,
  footerContent,
  homepageContent,
  howItWorksContent,
  industriesContent,
  pricingContent,
} from "@/lib/content"
import { cookiesOperator } from "@/app/cookies/content"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import { isSitePublic } from "@/lib/config"
import {
  commercialCopy,
  overagePolicy,
  relaunchGuardAddon,
  standardEntitlement,
  telloyaPlans,
} from "@/lib/pricing"

const marketing = [
  JSON.stringify(homepageContent),
  JSON.stringify(howItWorksContent),
  JSON.stringify(featuresContent),
  JSON.stringify(industriesContent),
  JSON.stringify(pricingContent),
  footerContent.note,
  cookiesOperator.paragraphs.join("\n"),
].join("\n")

describe("approved commercial offer", () => {
  it("keeps the canonical prices, minutes and standard entitlement", () => {
    expect(telloyaPlans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth])).toEqual([
      ["basic", 49, 120],
      ["growth", 79, 300],
      ["pro", 120, 500],
      ["custom", null, null],
    ])
    expect(standardEntitlement).toEqual({ operatingLocations: 1, receptionistNumbers: 1 })
    expect(relaunchGuardAddon.pricePerLocationGbp).toBe(9.99)
    expect(overagePolicy).toEqual({ pricePerMinuteGbp: 0.25, requiresOptIn: true, requiresSpendingCap: true })

    for (const plan of pricingContent.plans) {
      if (plan.tier === "custom") {
        expect(plan.features).toEqual([
          "Operating locations by quotation",
          "Receptionist numbers by quotation",
          "Minute allowance by quotation",
          "Voice, accent and language preferences, subject to the voice provider",
          "Configuration by quotation",
        ])
        continue
      }
      expect(plan.features).toContain("One operating location")
      expect(plan.features).toContain("One receptionist telephone number")
      expect(plan.monthlyPriceGbp).toBe(telloyaPlans.find((entry) => entry.tier === plan.tier)?.monthlyPriceGbp)
      expect(plan.minutesPerMonth).toBe(telloyaPlans.find((entry) => entry.tier === plan.tier)?.minutesPerMonth)
    }

    expect(pricingContent.comparison.table.rows).toContainEqual(["Operating locations", "1", "1", "1", "Quotation"])
    expect(pricingContent.comparison.table.rows).toContainEqual(["Receptionist numbers", "1", "1", "1", "Quotation"])
    expect(marketing).toContain(commercialCopy.standardEntitlement)
    expect(marketing).toContain(commercialCopy.extraReceptionist)
    expect(marketing).toContain(commercialCopy.standardSetup)
    expect(marketing).toContain(commercialCopy.complexSetup)
  })

  it("prices Guard independently of receptionist entitlements", () => {
    expect(marketing).toContain(commercialCopy.guardPriceBasis)
    expect(marketing).toContain(commercialCopy.guardOnly)
    expect(pricingContent.guard.features).toContain("Does not add a receptionist location or number")
    expect(pricingContent.guard.quantityNote).toContain("£9.99")
    expect(pricingContent.guard.quantityNote).toContain(commercialCopy.guardOnly)
    expect(pricingContent.guard.examples.map((example) => example.locations)).toEqual([1, 1, 1])
  })

  it("requires a separate overage opt-in and a customer-defined cap", () => {
    expect(marketing).toContain(commercialCopy.overageOptIn)
    expect(marketing).toContain(commercialCopy.overageEnquiry)
    expect(pricingContent.overage.points).toContain("Requires a customer-defined monthly spending cap")
    expect(marketing).not.toMatch(/roll over|carry forward|unused minutes/i)
    expect(marketing).not.toMatch(/money-back|refund within|14-day|cancellation period|VAT is charged/i)
  })
})

describe("international and voice wording", () => {
  it("does not present Telloya as UK-only or as supported by every carrier", () => {
    expect(marketing).not.toMatch(/Most UK providers|UK telephone providers|UK-only|outside the UK/i)
    expect(marketing).toContain(commercialCopy.international)
    expect(pricingContent.currency.note).toMatch(/does not offer local-currency checkout or conversion/i)
    expect(pricingContent.international.points.join(" ")).toMatch(/does not list countries, carriers or languages/i)
    expect(marketing).not.toMatch(/local currency|exchange rate|at checkout/i)
  })

  it("treats voice, accent and language as preferences", () => {
    expect(marketing).toContain(commercialCopy.voicePreference)
    expect(marketing).toContain(commercialCopy.voiceProvider)
    expect(marketing).not.toMatch(/Retell|OpenAI|GPT-|Anthropic|in partnership with/i)
    expect(featuresContent.future.items.map((item) => item.title)).not.toContain("Multi-language support")
    const history = featuresContent.future.items.find((item) => item.title === "Customer call history")
    expect(history?.description).toMatch(/not live/i)
  })
})

describe("capability boundaries", () => {
  it("keeps call history planned and does not promise emergency dispatch or successful answering", () => {
    expect(featuresContent.features.map((feature) => feature.title as string)).not.toContain("Usage visibility")
    const history = featuresContent.future.items.find((item) => item.title === "Customer call history")
    expect(history?.description).toMatch(/planned/i)
    expect(history?.description).toMatch(/not live/i)
    expect(marketing).not.toMatch(/Never miss a boiler|Handle emergency calls|dispatch an engineer or provide an emergency response is included/i)
    expect(industriesContent.hero.lead).toMatch(/You assess the enquiry and decide what happens next/i)
    expect(industriesContent.industries.map((industry) => industry.tagline).join(" ")).not.toMatch(/Never miss|emergency calls/i)
    const examples = industriesContent.industries.flatMap((industry) => industry.scenarios.map((scenario) => scenario.telletoyaHelps)).join(" ")
    expect(examples).not.toMatch(/not urgent|assesses|determines|arranges|books an appointment|dispatches/i)
    expect(howItWorksContent.limitations.points.join(" ")).toMatch(/send an engineer/i)
    expect(howItWorksContent.limitations.points.join(" ")).not.toMatch(/every call is answered|cannot guarantee/i)
    expect(howItWorksContent.limitations.points.join(" ")).toMatch(/does not start the service/i)
  })

  it("keeps the approved homepage headline in shared content and off the old claim", () => {
    const source = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).not.toContain("Never Misses a Call")
    expect(homepageContent.hero.headlineLead).toBe("Don't Let Missed Calls")
    expect(homepageContent.hero.headlineEmphasis).toBe("Cost You Customers.")
    expect(homepageContent.hero.supporting).toContain("captures the details you need to follow up")
  })
})

describe("launch and legal controls", () => {
  it("leaves public launch and enquiry submission disabled by default", () => {
    expect(getEnquiryCapabilities({})).toEqual({ submissionEnabled: false })
    expect(getEnquiryCapabilities({ TELLOYA_ENQUIRY_ENABLED: "false" }).submissionEnabled).toBe(false)
    for (const value of ["", "false", "FALSE", "True", "TRUE", "1", "yes", "on"]) {
      expect(getEnquiryCapabilities({ TELLOYA_ENQUIRY_ENABLED: value }).submissionEnabled).toBe(false)
      expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: value })).toBe(false)
    }
    expect(getEnquiryCapabilities({ TELLOYA_ENQUIRY_ENABLED: " true " }).submissionEnabled).toBe(true)
    for (const environment of [undefined, "", "preview", "development", "staging", "Production"]) {
      expect(isSitePublic({ VERCEL_ENV: environment, TELLOYA_LAUNCHED: "true" })).toBe(false)
    }
    expect(isSitePublic({})).toBe(false)
    expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" })).toBe(false)
    expect(pricingContent.plans.map((plan) => plan.href)).toEqual([
      "/enquire?plan=basic",
      "/enquire?plan=growth",
      "/enquire?plan=pro",
      "/enquire?plan=custom",
    ])
  })

  it("separates company notices from unpublished Telloya service terms", () => {
    expect(footerContent.legal.map((item) => item.href)).toEqual([
      "/cookies",
      "https://profilerelaunch.com/privacy",
      "https://profilerelaunch.com/terms",
    ])
    expect(footerContent.note).toMatch(/company-wide website notices/)
    expect(footerContent.note).toMatch(/not Telloya service terms/)
    expect(footerContent.note).toMatch(/still await approval/)
    expect(cookiesOperator.paragraphs.join(" ")).toMatch(/awaiting approval/)
  })
})
