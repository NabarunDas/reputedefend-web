import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { resourceRegistry } from "@/lib/resources"

describe("sitemap resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("includes the Resources hub and published articles, never unpublished drafts", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain(`${brandSiteUrl}/resources`)
    expect(urls).toContain(
      `${brandSiteUrl}/resources/google-business-profile-suspended-before-appeal`,
    )
    expect(urls).toContain(`${brandSiteUrl}/resources/can-a-google-review-be-removed`)
    expect(urls).toContain(
      `${brandSiteUrl}/resources/fake-google-review-or-genuine-negative-feedback`,
    )
    expect(urls).toContain(`${brandSiteUrl}/resources/google-review-extortion`)
    expect(urls).toContain(`${brandSiteUrl}/resources/google-review-bombing`)
    const draftUrls = resourceRegistry
      .filter((resource) => !resource.published)
      .map((resource) => `${brandSiteUrl}/resources/${resource.slug}`)
    expect(draftUrls.length).toBeGreaterThan(0)
    for (const url of draftUrls) {
      expect(urls).not.toContain(url)
    }
  })

  it("emits no sitemap outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
  })
})
