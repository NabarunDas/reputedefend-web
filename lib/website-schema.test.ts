import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { brandName, brandSiteUrl } from "@/lib/brand"
import { websiteSchema } from "@/lib/website-schema"

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8")
}

describe("website schema", () => {
  it("identifies the ProfileRelaunch website at the canonical homepage", () => {
    expect(websiteSchema()).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ProfileRelaunch",
      alternateName: "profilerelaunch.com",
      url: "https://profilerelaunch.com/",
    })
  })

  it("derives its values from the brand constants", () => {
    const schema = websiteSchema()
    expect(schema.name).toBe(brandName)
    expect(schema.url).toBe(`${brandSiteUrl}/`)
    expect(schema.alternateName).toBe(new URL(brandSiteUrl).host)
  })

  it("advertises no site search", () => {
    const schema = websiteSchema() as Record<string, unknown>
    expect(schema.potentialAction).toBeUndefined()
    expect(schema.SearchAction).toBeUndefined()
    expect(JSON.stringify(schema)).not.toContain("SearchAction")
    expect(JSON.stringify(schema)).not.toContain("search")
  })

  it("renders on the homepage only, and leaves Organization in the root layout", () => {
    expect(source("../app/page.tsx")).toContain("<WebsiteStructuredData />")
    const layout = source("../app/layout.tsx")
    expect(layout).not.toContain("WebsiteStructuredData")
    expect(layout).toContain("<OrganizationStructuredData />")
  })
})
