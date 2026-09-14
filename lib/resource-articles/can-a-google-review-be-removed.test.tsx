/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  canAGoogleReviewBeRemovedSlug,
  canAGoogleReviewBeRemovedSources,
} from "@/lib/resource-articles/can-a-google-review-be-removed"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceFakeEngagement,
  sourceLegalRemovals,
  sourceMapsPrivacy,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReviewExtortion,
} from "@/lib/resource-sources/google-maps-reviews"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Can a Google Review Be Removed? What Google's Policy Actually Allows"

describe("Article #5 can a Google review be removed", () => {
  const resource = getPublishedResourceBySlug(canAGoogleReviewBeRemovedSlug)
  const body = getResourceBody(canAGoogleReviewBeRemovedSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(canAGoogleReviewBeRemovedSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe(canAGoogleReviewBeRemovedSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "Google does not remove reviews simply because they are negative. Learn which policy violations can qualify for removal, how to report a review and when a one-time appeal is available.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(canAGoogleReviewBeRemovedSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(canAGoogleReviewBeRemovedSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReportInappropriateReviews,
      sourceProhibitedRestrictedContent,
      sourceMapsUgcPolicy,
      sourceFakeEngagement,
      sourceMapsPrivacy,
      sourceLegalRemovals,
      sourceReviewExtortion,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report inappropriate reviews on your Business Profile",
      "Prohibited and restricted content",
      "Maps user-generated content policy",
      "Fake engagement",
      "Privacy",
      "Legal removals",
      "Report negative review extortion scams on your Business Profile",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceReportInappropriateReviews,
      sourceProhibitedRestrictedContent,
    ])
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.googleSays?.sources).not.toContain(sourceReviewExtortion)
    expect(resource?.relatedResourceSlugs).toEqual([
      "fake-google-review-or-genuine-negative-feedback",
      "google-rejected-my-review-report",
      "google-reviews-missing-or-disappeared",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "fake-google-review-or-genuine-negative-feedback",
      "google-rejected-my-review-report",
      "google-reviews-missing-or-disappeared",
    ])
    expect(getPublishedResourceBySlug("google-rejected-my-review-report")).toBeDefined()
    expect(getPublishedResourceBySlug("google-reviews-missing-or-disappeared")).toBeDefined()
  })

  it("renders approved copy, published related guides, and uses the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain(
      "Google removes policy violations, not ordinary negative feedback",
    )
    expect(container.textContent).toContain(
      "Not finding the reviewer in your records does not automatically prove the review is fake",
    )
    expect(container.textContent).toContain("A compliant negative review may stay live")
    expect(
      screen.getByRole("heading", {
        name: "The right question is not “Can we get this review removed?”",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(
      within(googleSays as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Prohibited and restricted content")).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Fake engagement")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(
      screen.getByText("Fake Google Review or Genuine Negative Feedback? How to Tell the Difference"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Google Rejected My Review Report: What Can You Do Next?"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Google Reviews Missing or Disappeared: Why It Happens and What You Can Do",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
