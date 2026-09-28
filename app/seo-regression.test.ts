import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { metadata as homeMetadata } from "@/app/page"
import { metadata as recoveryMetadata } from "@/app/business-profile-recovery/page"
import { metadata as reviewMetadata } from "@/app/review-protection/page"
import { metadata as guardMetadata } from "@/app/relaunch-guard/page"
import { metadata as recoveryHubMetadata } from "@/app/resources/google-business-profile-recovery/page"
import { metadata as verificationHubMetadata } from "@/app/resources/google-business-profile-verification-access/page"
import { metadata as reviewsHubMetadata } from "@/app/resources/google-reviews/page"
import { metadata as abuseHubMetadata } from "@/app/resources/google-review-abuse-scams/page"
import { brandSiteUrl } from "@/lib/brand"
import {
  RESOURCES_INDEX_PATH,
  resourceCategoryHubPaths,
  resourceCategoryHubs,
  resourceCategoryLinkPath,
} from "@/lib/resource-category-links"
import { resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { getPublishedResources, resourcePath, resourceRegistry } from "@/lib/resources"
import { publishedResourceFixture } from "@/lib/resource-test-fixtures"

function productionSitemapUrls() {
  vi.stubEnv("VERCEL_ENV", "production")
  return sitemap().map((entry) => entry.url)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("production sitemap coverage", () => {
  it("lists the commercial pages, the Resources index and every topic hub", () => {
    const urls = productionSitemapUrls()
    for (const path of [
      "/",
      "/business-profile-recovery",
      "/review-protection",
      "/relaunch-guard",
      "/resources",
      ...resourceCategoryHubPaths,
    ]) {
      expect(urls.filter((url) => url === `${brandSiteUrl}${path}`), path).toHaveLength(1)
    }
  })

  it("lists every currently published Resource article", () => {
    const urls = productionSitemapUrls()
    const published = getPublishedResources()
    expect(published.length).toBeGreaterThan(0)
    for (const resource of published) {
      expect(urls, resource.slug).toContain(`${brandSiteUrl}${resourcePath(resource.slug)}`)
    }
  })

  it("excludes admin, customer, API and unpublished Resource URLs", () => {
    const urls = productionSitemapUrls()
    const paths = urls.map((url) => url.replace(brandSiteUrl, ""))
    for (const prefix of ["/admin", "/customer", "/api"]) {
      expect(paths.filter((path) => path === prefix || path.startsWith(`${prefix}/`)), prefix).toEqual([])
    }
    const publishedSlugs = new Set(getPublishedResources().map((resource) => resource.slug))
    for (const resource of resourceRegistry) {
      if (publishedSlugs.has(resource.slug)) continue
      expect(urls, resource.slug).not.toContain(`${brandSiteUrl}${resourcePath(resource.slug)}`)
    }
    expect(urls).toHaveLength(new Set(urls).size)
  })

  it("keeps the sitemap empty outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
    vi.stubEnv("VERCEL_ENV", "development")
    expect(sitemap()).toEqual([])
    vi.stubEnv("VERCEL_ENV", "")
    expect(sitemap()).toEqual([])
  })
})

describe("robots", () => {
  it("allows public crawling in production but keeps /api/ out", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const rules = robots()
    expect(rules.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/"] })
    expect(rules.sitemap).toBe(`${brandSiteUrl}/sitemap.xml`)
  })

  it("keeps preview and development environments non-indexable", () => {
    for (const env of ["preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", env)
      const rules = robots()
      expect(rules.rules, env).toEqual({ userAgent: "*", allow: "/", disallow: ["/"] })
      expect(rules.sitemap, env).toBeUndefined()
    }
  })
})

describe("resource breadcrumb structured data", () => {
  it("points the category step at the real topic hub", () => {
    for (const [category, hubPath] of Object.entries(resourceCategoryHubs)) {
      const jsonLd = resourceBreadcrumbJsonLd(
        { ...publishedResourceFixture, category: category as keyof typeof resourceCategoryHubs },
        "Category",
      )
      expect(jsonLd.itemListElement[1].item, category).toBe(`${brandSiteUrl}${hubPath}`)
      expect(jsonLd.itemListElement[1].item, category).not.toContain("#category-")
    }
  })

  it("falls back to the Resources index for a category with no hub", () => {
    const jsonLd = resourceBreadcrumbJsonLd(
      { ...publishedResourceFixture, category: "policy-updates" },
      "Google Policy Updates",
    )
    expect(resourceCategoryLinkPath("policy-updates")).toBe(RESOURCES_INDEX_PATH)
    expect(jsonLd.itemListElement[1].item).toBe(`${brandSiteUrl}${RESOURCES_INDEX_PATH}`)
  })

  it("keeps the article itself as the final breadcrumb", () => {
    const jsonLd = resourceBreadcrumbJsonLd(publishedResourceFixture, "Profile Recovery")
    expect(jsonLd.itemListElement).toHaveLength(3)
    expect(jsonLd.itemListElement[0].item).toBe(`${brandSiteUrl}${RESOURCES_INDEX_PATH}`)
    expect(jsonLd.itemListElement[2].item).toBe(
      `${brandSiteUrl}${resourcePath(publishedResourceFixture.slug)}`,
    )
  })
})

describe("commercial and hub page titles", () => {
  it("publishes the approved commercial titles", () => {
    expect(homeMetadata.title).toEqual({
      absolute: "Google Business Profile Recovery & Review Support | ProfileRelaunch",
    })
    expect(recoveryMetadata.title).toEqual({
      absolute: "Google Business Profile Suspension & Reinstatement Help | ProfileRelaunch",
    })
    expect(reviewMetadata.title).toEqual({
      absolute: "Google Review Removal & Challenge Support | ProfileRelaunch",
    })
    expect(guardMetadata.title).toEqual({
      absolute: "Google Business Profile Monitoring | Relaunch Guard | ProfileRelaunch",
    })
  })

  it("gives every topic hub a unique canonical, title and description", () => {
    const hubs = [
      { metadata: recoveryHubMetadata, path: resourceCategoryHubs["profile-recovery"], title: "Google Business Profile Recovery & Suspension Guides" },
      { metadata: verificationHubMetadata, path: resourceCategoryHubs["verification-access"], title: "Google Business Profile Verification & Access Guides" },
      { metadata: reviewsHubMetadata, path: resourceCategoryHubs["reviews-reputation"], title: "Google Review Removal & Reputation Guides" },
      { metadata: abuseHubMetadata, path: resourceCategoryHubs["review-abuse-scams"], title: "Google Review Abuse, Extortion & Scam Guides" },
    ]
    for (const hub of hubs) {
      expect(hub.metadata.title, hub.path).toEqual({ absolute: `${hub.title} | ProfileRelaunch` })
      expect(hub.metadata.alternates, hub.path).toEqual({ canonical: hub.path })
      expect(typeof hub.metadata.description, hub.path).toBe("string")
    }
    expect(new Set(hubs.map((hub) => String(hub.metadata.description))).size).toBe(hubs.length)
    expect(new Set(hubs.map((hub) => JSON.stringify(hub.metadata.title))).size).toBe(hubs.length)
  })
})
