import { afterEach, describe, expect, it, vi } from "vitest"
import sitemap from "@/app/sitemap"
import { brandSiteUrl } from "@/lib/brand"
import { resourceRegistry } from "@/lib/resources"

describe("sitemap resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("includes the Resources hub in production and never includes draft article URLs", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain(`${brandSiteUrl}/resources`)
    for (const resource of resourceRegistry) {
      expect(urls).not.toContain(`${brandSiteUrl}/resources/${resource.slug}`)
    }
  })

  it("emits no sitemap outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(sitemap()).toEqual([])
  })
})
