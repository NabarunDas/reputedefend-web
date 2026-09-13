import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { resourceRegistry } from "@/lib/resources"

describe("sitemap resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("includes the Resources hub and the one published article, never the 17 drafts", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain(`${brandSiteUrl}/resources`)
    expect(urls).toContain(
      `${brandSiteUrl}/resources/google-business-profile-suspended-before-appeal`,
    )
    const draftUrls = resourceRegistry
      .filter((resource) => resource.slug !== "google-business-profile-suspended-before-appeal")
      .map((resource) => `${brandSiteUrl}/resources/${resource.slug}`)
    expect(draftUrls).toHaveLength(17)
    for (const url of draftUrls) {
      expect(urls).not.toContain(url)
    }
  })

  it("emits no sitemap outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
  })
})
