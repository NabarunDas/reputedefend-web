import { existsSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { listResourceBodySlugs } from "@/lib/resource-content"
import { conversionForCommercialRoute, resourceCommercialHrefs } from "@/lib/resource-links"
import {
  createResourceIndex,
  formatResourceMonthYear,
  getFeaturedPublishedResource,
  getPublishedResourceBySlug,
  getPublishedResources,
  isPublicResource,
  pickFeaturedResource,
  publishedCountForCategory,
  publishedResourceSitemapEntries,
  relatedPublishedResources,
  resourceCategories,
  resourceRegistry,
  reviewExtortionUrgentCallout,
} from "@/lib/resources"
import { resourceArticleJsonLd, resourceArticleMetadata, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { brandName, brandSiteUrl } from "@/lib/brand"
import { footerExploreExtra, primaryNav } from "@/lib/site-nav"
import {
  fixtureBodyLookup,
  fixtureOfficialSource,
  publishedRelatedFixture,
  publishedResourceFixture,
  publishedWithoutBodyFixture,
  unpublishedRelatedFixture,
} from "@/lib/resource-test-fixtures"

describe("resource registry", () => {
  it("registers the planned titles as unpublished metadata only", () => {
    expect(resourceRegistry).toHaveLength(18)
    expect(resourceRegistry.every((item) => item.published === false)).toBe(true)
    expect(resourceRegistry.every((item) => item.author === "ProfileRelaunch")).toBe(true)
    expect(resourceRegistry.every((item) => item.datePublished === null)).toBe(true)
    expect(listResourceBodySlugs()).toEqual([])
    expect(getPublishedResources()).toEqual([])
    expect(getFeaturedPublishedResource()).toBeNull()
  })

  it("keeps draft slugs out of public helpers, related lists and the sitemap", () => {
    const extortion = resourceRegistry.find((item) => item.slug === "google-review-extortion")
    expect(extortion?.urgent).toBe(true)
    expect(getPublishedResourceBySlug("google-review-extortion")).toBeUndefined()
    expect(relatedPublishedResources(extortion!)).toEqual([])
    expect(publishedResourceSitemapEntries().map((entry) => entry.url)).toEqual([])
    expect(resourceRegistry.map((item) => item.slug)).toContain("google-review-extortion")
    expect(resourceRegistry.map((item) => item.slug)).toContain(
      "google-business-profile-suspended-before-appeal",
    )
  })

  it("defines the five resource categories including Review Abuse & Scams", () => {
    expect(resourceCategories.map((item) => item.title)).toEqual([
      "Profile Recovery",
      "Verification & Access",
      "Reviews & Reputation",
      "Review Abuse & Scams",
      "Google Policy Updates",
    ])
    const abuse = resourceCategories.find((item) => item.id === "review-abuse-scams")
    expect(abuse?.urgentLabel).toBe("Urgent situations")
    expect(publishedCountForCategory("review-abuse-scams")).toBe(0)
  })

  it("does not create mass placeholder article routes or a policy-updates index", () => {
    const resourceFiles = readdirSync(new URL("../app/resources", import.meta.url))
    expect(resourceFiles).toContain("page.tsx")
    expect(resourceFiles).toContain("[slug]")
    expect(resourceFiles).not.toContain("google-review-extortion")
    expect(resourceFiles).not.toContain("policy-updates")
    expect(existsSync(new URL("../app/resources/policy-updates/page.tsx", import.meta.url))).toBe(false)
    expect(existsSync(new URL("../app/blog", import.meta.url))).toBe(false)
  })
})

describe("publish-ready public resources", () => {
  const index = createResourceIndex(
    [
      publishedResourceFixture,
      publishedRelatedFixture,
      unpublishedRelatedFixture,
      publishedWithoutBodyFixture,
    ],
    fixtureBodyLookup,
  )

  it("does not expose published=true records that have no article body", () => {
    expect(publishedWithoutBodyFixture.published).toBe(true)
    expect(isPublicResource(publishedWithoutBodyFixture, fixtureBodyLookup(publishedWithoutBodyFixture.slug))).toBe(
      false,
    )
    expect(index.getPublishedBySlug("published-without-body")).toBeUndefined()
    expect(index.published().map((item) => item.slug)).toEqual([
      "test-published-guide",
      "test-related-published-guide",
    ])
    expect(relatedPublishedResources(publishedResourceFixture, index).map((item) => item.slug)).toEqual([
      "test-related-published-guide",
    ])
    expect(publishedResourceSitemapEntries(index, brandSiteUrl).map((entry) => entry.url)).toEqual([
      `${brandSiteUrl}/resources/test-published-guide`,
      `${brandSiteUrl}/resources/test-related-published-guide`,
    ])
    expect(getPublishedResources(index).map((item) => item.slug)).not.toContain("published-without-body")
  })

  it("lists only publish-ready resources and can feature one", () => {
    expect(index.getPublishedBySlug("test-unpublished-related")).toBeUndefined()
    expect(pickFeaturedResource(index.published())?.slug).toBe("test-published-guide")
    expect(formatResourceMonthYear("2026-09-13")).toBe("Sep 2026")
  })

  it("rejects published records that lack dates, reading time or sources", () => {
    const body = { sourcesUsed: [fixtureOfficialSource] }
    expect(isPublicResource({ ...publishedResourceFixture, datePublished: null }, body)).toBe(false)
    expect(isPublicResource({ ...publishedResourceFixture, dateReviewed: null }, body)).toBe(false)
    expect(isPublicResource({ ...publishedResourceFixture, readingMinutes: 0 }, body)).toBe(false)
    expect(isPublicResource(publishedResourceFixture, { sourcesUsed: [] })).toBe(false)
    expect(isPublicResource(publishedResourceFixture, body)).toBe(true)
  })

  it("emits article and breadcrumb structured data only with real dates", () => {
    const article = resourceArticleJsonLd(publishedResourceFixture)
    const breadcrumbs = resourceBreadcrumbJsonLd(publishedResourceFixture, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-01")
    expect(article.dateModified).toBe("2026-09-13")
    expect(article.author).toEqual({
      "@type": "Organization",
      name: brandName,
      url: brandSiteUrl,
    })
    expect(article.publisher.name).toBe(brandName)
    expect(article).not.toHaveProperty("image")
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(breadcrumbs.itemListElement).toHaveLength(3)
    expect(() => resourceArticleJsonLd(unpublishedRelatedFixture)).toThrow(/publication dates/)
    expect(() => resourceArticleMetadata(unpublishedRelatedFixture)).toThrow(/publication dates/)
  })
})

describe("resource conversion routes", () => {
  it("routes Profile Recovery, Review Protection and general assessments correctly", () => {
    expect(conversionForCommercialRoute("profile-recovery").href).toBe(
      resourceCommercialHrefs.profileAssessment,
    )
    expect(conversionForCommercialRoute("review-protection").href).toBe(
      resourceCommercialHrefs.reviewAssessment,
    )
    expect(conversionForCommercialRoute("general").href).toBe(resourceCommercialHrefs.getHelp)
    expect(conversionForCommercialRoute("profile-recovery").cta).toContain("Profile Recovery")
    expect(conversionForCommercialRoute("review-protection").cta).toContain("Review Protection")
  })

  it("keeps the extortion callout as architecture, not published advice", () => {
    expect(reviewExtortionUrgentCallout).toContain("preserve the messages and review links")
    expect(getPublishedResourceBySlug("google-review-extortion")).toBeUndefined()
  })
})

describe("resources navigation", () => {
  it("keeps Resources out of the primary header and in the footer only", () => {
    expect(primaryNav.map((item) => item.href)).not.toContain("/resources")
    expect(primaryNav.map((item) => item.label)).not.toContain("Resources")
    expect(footerExploreExtra).toEqual([{ label: "Resources", href: "/resources" }])
  })
})
