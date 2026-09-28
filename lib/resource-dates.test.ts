import { describe, expect, it } from "vitest"
import { brandSiteUrl } from "@/lib/brand"
import { resourceArticleJsonLd, resourceArticleMetadata } from "@/lib/resource-schema"
import {
  createResourceIndex,
  publishedResourceSitemapEntries,
  resourceLastModifiedDate,
  resourcePath,
  resourceRegistry,
  type ResourceRecord,
} from "@/lib/resources"
import {
  fixtureBodyLookup,
  modifiedAfterReviewFixture,
  reviewedOnlyFixture,
} from "@/lib/resource-test-fixtures"

function sitemapLastModified(resource: ResourceRecord) {
  const index = createResourceIndex([resource], fixtureBodyLookup)
  const entries = publishedResourceSitemapEntries(index, brandSiteUrl)
  expect(entries).toHaveLength(1)
  expect(entries[0].url).toBe(`${brandSiteUrl}${resourcePath(resource.slug)}`)
  return entries[0].lastModified
}

function articleModifiedTime(resource: ResourceRecord) {
  const openGraph = resourceArticleMetadata(resource).openGraph as
    | { modifiedTime?: string; publishedTime?: string }
    | undefined
  return openGraph?.modifiedTime
}

describe("resource modification dates", () => {
  it("has a fixture where all three dates differ", () => {
    expect(modifiedAfterReviewFixture.datePublished).toBe("2026-09-01")
    expect(modifiedAfterReviewFixture.dateReviewed).toBe("2026-09-10")
    expect(modifiedAfterReviewFixture.dateModified).toBe("2026-09-20")
  })

  it("prefers dateModified when a guide was edited after its last review", () => {
    expect(resourceLastModifiedDate(modifiedAfterReviewFixture)).toBe("2026-09-20")
    expect(articleModifiedTime(modifiedAfterReviewFixture)).toBe("2026-09-20")
    expect(resourceArticleJsonLd(modifiedAfterReviewFixture).dateModified).toBe("2026-09-20")
    expect(sitemapLastModified(modifiedAfterReviewFixture)).toBe("2026-09-20")
  })

  it("keeps datePublished untouched by the modification date", () => {
    expect(resourceArticleJsonLd(modifiedAfterReviewFixture).datePublished).toBe("2026-09-01")
    const openGraph = resourceArticleMetadata(modifiedAfterReviewFixture).openGraph as {
      publishedTime?: string
    }
    expect(openGraph.publishedTime).toBe("2026-09-01")
  })

  it("falls back to dateReviewed when there is no dateModified", () => {
    expect(reviewedOnlyFixture.dateModified).toBeNull()
    expect(resourceLastModifiedDate(reviewedOnlyFixture)).toBe("2026-09-10")
    expect(articleModifiedTime(reviewedOnlyFixture)).toBe("2026-09-10")
    expect(resourceArticleJsonLd(reviewedOnlyFixture).dateModified).toBe("2026-09-10")
    expect(sitemapLastModified(reviewedOnlyFixture)).toBe("2026-09-10")
  })

  it("falls back to datePublished when neither review nor modification exists", () => {
    const publishedOnly: ResourceRecord = {
      ...reviewedOnlyFixture,
      slug: "test-published-only-guide",
      dateReviewed: null,
    }
    expect(resourceLastModifiedDate(publishedOnly)).toBe("2026-09-01")
  })

  it("does not backdate or inflate any live registry date", () => {
    // The precedence change must not silently rewrite published content dates.
    for (const resource of resourceRegistry) {
      if (!resource.dateModified || !resource.datePublished) continue
      expect(
        resource.dateModified >= resource.datePublished,
        resource.slug,
      ).toBe(true)
    }
  })
})
