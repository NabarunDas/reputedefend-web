import type { ResourceRecord } from "@/lib/resources"
import { resourceAuthor } from "@/lib/resources"

/**
 * Test-only fixtures. Never import these into production pages or the
 * public resource registry — they would become indexable content.
 */
export const publishedResourceFixture: ResourceRecord = {
  slug: "test-published-guide",
  title: "Test published guide for template checks",
  seoTitle: "Test published guide for template checks",
  description: "Fixture used only in automated tests. Not a public article.",
  category: "profile-recovery",
  excerpt: "A test-only excerpt for card and template rendering.",
  published: true,
  featured: true,
  urgent: false,
  datePublished: "2026-09-01",
  dateReviewed: "2026-09-13",
  dateModified: "2026-09-13",
  readingMinutes: 8,
  officialSources: [
    {
      name: "Google Business Profile Help",
      title: "Test fixture help page",
      url: "https://support.google.com/business/answer/test-fixture",
    },
  ],
  relatedResourceSlugs: ["test-related-published-guide", "test-unpublished-related", "google-review-extortion"],
  commercialRoute: "profile-recovery",
  author: resourceAuthor,
}

export const publishedRelatedFixture: ResourceRecord = {
  ...publishedResourceFixture,
  slug: "test-related-published-guide",
  title: "Related published guide",
  seoTitle: "Related published guide",
  featured: false,
  relatedResourceSlugs: ["test-published-guide"],
  officialSources: [],
}

export const unpublishedRelatedFixture: ResourceRecord = {
  ...publishedResourceFixture,
  slug: "test-unpublished-related",
  title: "Draft related guide",
  published: false,
  featured: false,
  datePublished: null,
  dateReviewed: null,
  dateModified: null,
  readingMinutes: null,
  officialSources: [
    {
      name: "Should never appear",
      title: "Fake bibliography",
      url: "https://example.com/fake-source",
    },
  ],
  relatedResourceSlugs: [],
}

export const publishedReviewFixture: ResourceRecord = {
  ...publishedResourceFixture,
  slug: "test-published-review-guide",
  title: "Test published review guide",
  category: "review-abuse-scams",
  commercialRoute: "review-protection",
  urgent: true,
  featured: false,
  relatedResourceSlugs: [],
  officialSources: [],
}
