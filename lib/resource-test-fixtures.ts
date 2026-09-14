import type { ResourceRecord } from "@/lib/resources"
import { resourceAuthor } from "@/lib/resources"
import type { OfficialSource } from "@/lib/resources"

/**
 * Test-only fixtures. Never import these into production pages or the
 * public resource registry — they would become indexable content.
 */

/**
 * Every Resource approved for publication, in production registry order.
 * Publishing a Resource must be a deliberate, reviewed change: the shared
 * tests compare the live published set against this list, so a Resource that
 * becomes public without being added here fails the suite.
 *
 * Test-only. Never import this into production code.
 */
export const approvedPublishedResourceSlugs = [
  "google-business-profile-suspended-before-appeal",
  "google-business-profile-appeal-evidence-checklist",
  "google-business-profile-appeal-rejected-what-next",
  "google-business-profile-verification-stuck-or-rejected",
  "can-a-google-review-be-removed",
  "fake-google-review-or-genuine-negative-feedback",
  "google-review-extortion",
  "google-review-bombing",
  "can-a-competitor-or-ex-employee-leave-a-google-review",
  "customer-threatening-bad-google-review",
  "offered-to-remove-google-reviews-for-money",
  "google-rejected-my-review-report",
  "lost-access-to-google-business-profile",
  "google-business-profile-name-rules",
  "google-business-profile-address-and-service-area-rules",
  "google-business-profile-categories",
  "false-or-defamatory-google-reviews",
  "google-business-profile-scams",
  "google-business-profile-not-showing-on-google-or-maps",
  "google-reviews-missing-or-disappeared",
] as const

export const fixtureOfficialSource: OfficialSource = {
  name: "Google Business Profile Help",
  title: "Test fixture help page",
  url: "https://support.google.com/business/answer/test-fixture",
}

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
}

/** Accidental `published: true` without a registered article body. */
export const publishedWithoutBodyFixture: ResourceRecord = {
  ...publishedResourceFixture,
  slug: "published-without-body",
  title: "Incomplete published record",
  featured: false,
  relatedResourceSlugs: [],
}

export function fixtureBodyLookup(slug: string) {
  if (slug === publishedWithoutBodyFixture.slug) return undefined
  if (slug === unpublishedRelatedFixture.slug) return undefined
  if (
    slug === publishedResourceFixture.slug ||
    slug === publishedRelatedFixture.slug ||
    slug === publishedReviewFixture.slug
  ) {
    return { sourcesUsed: [fixtureOfficialSource] }
  }
  return undefined
}
