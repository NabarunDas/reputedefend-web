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
    expect(urls).toContain(
      `${brandSiteUrl}/resources/can-a-competitor-or-ex-employee-leave-a-google-review`,
    )
    expect(urls).toContain(
      `${brandSiteUrl}/resources/customer-threatening-bad-google-review`,
    )
    expect(urls).toContain(
      `${brandSiteUrl}/resources/offered-to-remove-google-reviews-for-money`,
    )
    expect(urls).toContain(`${brandSiteUrl}/resources/google-rejected-my-review-report`)
    expect(urls).toContain(`${brandSiteUrl}/resources/lost-access-to-google-business-profile`)
    expect(urls).toContain(`${brandSiteUrl}/resources/google-business-profile-name-rules`)
    expect(urls).toContain(
      `${brandSiteUrl}/resources/google-business-profile-address-and-service-area-rules`,
    )
    expect(urls).toContain(`${brandSiteUrl}/resources/google-business-profile-categories`)
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
  })

  it("emits no sitemap outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
  })
})
