import { describe, expect, it } from "vitest"
import { brandName, brandSiteUrl } from "@/lib/brand"
import { organizationSchema, serviceSchema } from "@/lib/organization-schema"
import { earlyAccessLabel, pricingGroups } from "@/lib/pricing"
import { primaryNav, sitemapPaths } from "@/lib/site-nav"

describe("organization schema", () => {
  it("identifies ProfileRelaunch on profilerelaunch.com without invented claims", () => {
    const schema = organizationSchema()
    expect(schema.name).toBe(brandName)
    expect(schema.url).toBe(brandSiteUrl)
    expect(schema.logo).toBe(`${brandSiteUrl}/icon.png`)
    expect(schema.legalName).toBe("Saswati Das")
    expect(schema.email).toBe("contact@reputedefend.com")
    expect(schema.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "6 Bradford Road, Old Town",
      addressLocality: "Swindon",
      postalCode: "SN1 4FE",
      addressCountry: "GB",
    })
    expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|ratingValue|vatID|taxID|foundingDate|numberOfEmployees|Google Partner/)
  })

  it("keeps Service schema on the public domain", () => {
    const schema = serviceSchema({
      name: "Google Business Profile Recovery",
      description: "Support for profile recovery.",
      path: "/business-profile-recovery",
    })
    expect(schema.url).toBe(`${brandSiteUrl}/business-profile-recovery`)
    expect(schema.provider).toEqual({
      "@type": "Organization",
      name: "ProfileRelaunch",
      url: brandSiteUrl,
    })
  })
})

describe("pricing", () => {
  it("publishes the approved Early Access fees only", () => {
    expect(earlyAccessLabel).toBe("Early Access pricing")
    const prices = pricingGroups.flatMap((group) => group.items.map((item) => `${item.name}:${item.price}`))
    expect(prices).toEqual([
      "Guided Relaunch:£99",
      "Managed Relaunch:£299",
      "Guided Review:£59",
      "Managed Review:£149",
      "Profile + Review monitoring:£9.99",
    ])
    expect(JSON.stringify(pricingGroups)).not.toMatch(/£399|£17\.99|was £|usually £/)
  })
})

describe("navigation", () => {
  it("includes Pricing in the shared primary nav and sitemap", () => {
    expect(primaryNav.map((item) => item.href)).toEqual([
      "/business-profile-recovery",
      "/review-protection",
      "/how-it-works",
      "/pricing",
      "/about",
    ])
    expect(sitemapPaths).toContain("/pricing")
  })
})
