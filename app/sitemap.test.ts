import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { resourceCategoryHubPaths } from "@/lib/resource-category-links"
import { resourceRegistry } from "@/lib/resources"
import { approvedPublishedResourceSlugs } from "@/lib/resource-test-fixtures"
import { sitemapPaths } from "@/lib/site-nav"

describe("sitemap resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("includes the Resources hub and published articles, never unpublished drafts", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SITE_LAUNCHED", "true")
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)
    // The hub is a fixed page; the article URLs must match the approved
    // publication allowlist exactly.
    expect(urls).toContain(`${brandSiteUrl}/resources`)
    const hubUrls = resourceCategoryHubPaths.map((path) => `${brandSiteUrl}${path}`)
    for (const url of hubUrls) {
      expect(urls.filter((entry) => entry === url)).toHaveLength(1)
    }
    const articleUrls = urls.filter(
      (url) =>
        url.startsWith(`${brandSiteUrl}/resources/`) &&
        url !== `${brandSiteUrl}/resources` &&
        !hubUrls.includes(url),
    )
    expect(articleUrls).toEqual(
      approvedPublishedResourceSlugs.map((slug) => `${brandSiteUrl}/resources/${slug}`),
    )
    // Derived, so this stays correct whether the registry has several
    // unpublished records or none at all. Synthetic unpublished coverage lives
    // in lib/resources.test.ts.
    const unpublishedUrls = resourceRegistry
      .filter((resource) => !resource.published)
      .map((resource) => `${brandSiteUrl}/resources/${resource.slug}`)
    for (const url of unpublishedUrls) {
      expect(urls).not.toContain(url)
    }
    expect(urls).toHaveLength(new Set(urls).size)
    expect(urls).not.toContain(`${brandSiteUrl}/start-monitoring`)
    for (const path of sitemapPaths) {
      expect(urls).toContain(`${brandSiteUrl}${path}`)
    }
    const guardUrl = `${brandSiteUrl}/relaunch-guard`
    expect(urls.filter((url) => url === guardUrl)).toHaveLength(1)
    expect(entries.find((entry) => entry.url === guardUrl)).toEqual({ url: guardUrl })
  })

  it("emits no sitemap outside production, even when the launch flag is set", () => {
    vi.stubEnv("SITE_LAUNCHED", "true")
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
    vi.stubEnv("VERCEL_ENV", "development")
    expect(sitemap()).toEqual([])
  })

  it("emits no sitemap in production before launch", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SITE_LAUNCHED", "false")
    expect(sitemap()).toEqual([])
    vi.stubEnv("SITE_LAUNCHED", "")
    expect(sitemap()).toEqual([])
  })
})
