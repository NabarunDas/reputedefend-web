import { describe, expect, it } from "vitest"
import {
  RESOURCES_INDEX_PATH,
  hasResourceCategoryHub,
  resourceCategoryHubPath,
  resourceCategoryHubPaths,
  resourceCategoryHubs,
  resourceCategoryLinkPath,
} from "@/lib/resource-category-links"
import { RESOURCE_CATEGORY_IDS } from "@/lib/resources"
import { sitemapPaths } from "@/lib/site-nav"

describe("resource category hubs", () => {
  it("maps the four supported categories to their approved hub URLs", () => {
    expect(resourceCategoryHubs).toEqual({
      "profile-recovery": "/resources/google-business-profile-recovery",
      "verification-access": "/resources/google-business-profile-verification-access",
      "reviews-reputation": "/resources/google-reviews",
      "review-abuse-scams": "/resources/google-review-abuse-scams",
    })
    expect(resourceCategoryHubPaths).toEqual(Object.values(resourceCategoryHubs))
    expect(new Set(resourceCategoryHubPaths).size).toBe(resourceCategoryHubPaths.length)
  })

  it("has no hub for policy-updates", () => {
    expect(hasResourceCategoryHub("policy-updates")).toBe(false)
    expect(resourceCategoryHubPath("policy-updates")).toBeNull()
    expect(resourceCategoryLinkPath("policy-updates")).toBe(RESOURCES_INDEX_PATH)
  })

  it("resolves a link for every known category", () => {
    for (const category of RESOURCE_CATEGORY_IDS) {
      const link = resourceCategoryLinkPath(category)
      expect(link, category).toMatch(/^\/resources/)
      expect(resourceCategoryHubPath(category), category).toBe(
        category === "policy-updates" ? null : link,
      )
    }
  })

  it("registers every hub in the public sitemap paths exactly once", () => {
    for (const path of resourceCategoryHubPaths) {
      expect(sitemapPaths.filter((entry) => entry === path), path).toHaveLength(1)
    }
    expect(sitemapPaths).not.toContain("/resources/google-policy-updates")
    expect(sitemapPaths).not.toContain("/resources/policy-updates")
  })
})
