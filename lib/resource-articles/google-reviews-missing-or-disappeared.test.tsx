/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewsMissingOrDisappearedSlug,
  googleReviewsMissingOrDisappearedSources,
} from "@/lib/resource-articles/google-reviews-missing-or-disappeared"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceFakeEngagement,
  sourceManageCustomerReviews,
  sourceMapsUgcPolicy,
  sourceMissingDelayedReviews,
  sourceMoveReviewsAcrossProfiles,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
} from "@/lib/resource-sources/google-maps-reviews"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Reviews Missing or Disappeared: Why It Happens and What You Can Do"

describe("Article #20 Google reviews missing or disappeared", () => {
  const resource = getPublishedResourceBySlug(googleReviewsMissingOrDisappearedSlug)
  const body = getResourceBody(googleReviewsMissingOrDisappearedSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleReviewsMissingOrDisappearedSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.slug).toBe("google-reviews-missing-or-disappeared")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.description).toBe(
      "Missing Google reviews can be delayed, removed for policy reasons or affected by profile changes. Learn what to check and when to contact Google support.",
    )
    expect(resource?.excerpt).toBe(
      "How to tell whether reviews are delayed, policy-removed, affected by a merge or move, or missing after Business Profile reinstatement.",
    )
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBeNull()
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.author).toBe("ProfileRelaunch")
  })

  it("cites the seven approved official sources in the approved order", () => {
    expect(googleReviewsMissingOrDisappearedSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(googleReviewsMissingOrDisappearedSources)
    expect(body?.sourcesUsed[0]).toBe(sourceMissingDelayedReviews)
    expect(body?.sourcesUsed[1]).toBe(sourceProhibitedRestrictedContent)
    expect(body?.sourcesUsed[2]).toBe(sourceMoveReviewsAcrossProfiles)
    expect(body?.sourcesUsed).toEqual([
      sourceMissingDelayedReviews,
      sourceProhibitedRestrictedContent,
      sourceMoveReviewsAcrossProfiles,
      sourceReportInappropriateReviews,
      sourceMapsUgcPolicy,
      sourceFakeEngagement,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "About missing or delayed reviews",
      "Prohibited and restricted content",
      "Move your reviews across Business Profiles",
      "Report inappropriate reviews on your Business Profile",
      "Maps user-generated content policy",
      "Fake engagement",
      "Manage customer reviews",
    ])
    expect(sourceMissingDelayedReviews).toEqual({
      name: "Google Business Profile Help",
      title: "About missing or delayed reviews",
      url: "https://support.google.com/business/answer/10313341?hl=en-GB",
    })
    expect(sourceMoveReviewsAcrossProfiles).toEqual({
      name: "Google Business Profile Help",
      title: "Move your reviews across Business Profiles",
      url: "https://support.google.com/business/answer/3098204?hl=en-GB",
    })
    expect(body?.googleSays?.sources).toEqual([
      sourceMissingDelayedReviews,
      sourceProhibitedRestrictedContent,
      sourceMoveReviewsAcrossProfiles,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceReportInappropriateReviews)
    expect(body?.googleSays?.sources).not.toContain(sourceMapsUgcPolicy)
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.googleSays?.sources).not.toContain(sourceManageCustomerReviews)
  })

  it("renders approved copy, related Articles #5, #6 and #19, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("First identify what actually went missing")
    expect(container.textContent).toContain("A delayed review is not the same as a removed review")
    expect(container.textContent).toContain(
      "Google acknowledges legitimate reviews can sometimes be removed by mistake",
    )
    expect(container.textContent).toContain("Missing reviews after reinstatement have their own clue")
    expect(
      screen.getByRole("heading", {
        name: "Work out whether the review is delayed, removed or attached to the wrong profile",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("Reviews removed for policy violations will not be restored")
    expect(container.textContent).toContain("We cannot directly restore a Google review")

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("About missing or delayed reviews"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Prohibited and restricted content"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Move your reviews across Business Profiles"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Report inappropriate reviews on your Business Profile"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Maps user-generated content policy"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Fake engagement")).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Manage customer reviews"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(resource?.relatedResourceSlugs).toEqual([
      "can-a-google-review-be-removed",
      "fake-google-review-or-genuine-negative-feedback",
      "google-business-profile-not-showing-on-google-or-maps",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "fake-google-review-or-genuine-negative-feedback",
      "google-business-profile-not-showing-on-google-or-maps",
    ])
    const relatedSection = screen
      .getByRole("heading", { name: "Continue understanding your situation" })
      .closest("section")
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Can a Google Review Be Removed? What Google's Policy Actually Allows",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Not Showing on Google or Maps: What to Check",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(
      screen.getByRole("link", { name: /Start your Review Protection assessment/ }),
    ).toHaveAttribute("href", "/get-help?service=review")
  })
})
