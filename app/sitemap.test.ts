import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { resourceRegistry } from "@/lib/resources"
import { approvedPublishedResourceSlugs } from "@/lib/resource-test-fixtures"

describe("sitemap resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("includes the Resources hub and published articles, never unpublished drafts", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)
    // The hub is a fixed page; the article URLs must match the approved
    // publication allowlist exactly.
    expect(urls).toContain(`${brandSiteUrl}/resources`)
    const articleUrls = urls.filter(
      (url) => url.startsWith(`${brandSiteUrl}/resources/`) && url !== `${brandSiteUrl}/resources`,
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
    expect(urls).not.toContain(`${brandSiteUrl}/relaunch-guard`)
  })

  it("emits no sitemap outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
  })
})
