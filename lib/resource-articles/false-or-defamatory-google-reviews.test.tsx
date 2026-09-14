/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  falseOrDefamatoryGoogleReviewsSlug,
  falseOrDefamatoryGoogleReviewsSources,
} from "@/lib/resource-articles/false-or-defamatory-google-reviews"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceLegalRemovals,
  sourceManageCustomerReviews,
  sourceMapsPrivacy,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
} from "@/lib/resource-sources/google-maps-reviews"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "False or Defamatory Google Reviews: What Google Can — and Can't — Decide"

describe("Article #17 false or defamatory Google reviews", () => {
  const resource = getPublishedResourceBySlug(falseOrDefamatoryGoogleReviewsSlug)
  const body = getResourceBody(falseOrDefamatoryGoogleReviewsSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and seven official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(falseOrDefamatoryGoogleReviewsSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("false-or-defamatory-google-reviews")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "A Google review can feel false or defamatory without automatically qualifying for removal. Learn the difference between Google's content policies and separate legal-removal questions.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(falseOrDefamatoryGoogleReviewsSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(falseOrDefamatoryGoogleReviewsSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceMapsUgcPolicy,
      sourceReportInappropriateReviews,
      sourceLegalRemovals,
      sourceMapsPrivacy,
      sourceReportUserProfiles,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Prohibited and restricted content",
      "Maps user-generated content policy",
      "Report inappropriate reviews on your Business Profile",
      "Legal removals",
      "Privacy",
      "Report inappropriate user profiles",
      "Manage customer reviews",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceProhibitedRestrictedContent,
      sourceReportInappropriateReviews,
      sourceLegalRemovals,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceMapsUgcPolicy)
    expect(body?.googleSays?.sources).not.toContain(sourceMapsPrivacy)
    expect(body?.googleSays?.sources).not.toContain(sourceReportUserProfiles)
    expect(body?.googleSays?.sources).not.toContain(sourceManageCustomerReviews)
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "can-a-google-review-be-removed",
      "google-rejected-my-review-report",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "google-rejected-my-review-report",
    ])
  })

  it("renders approved copy, related Articles #5 and #12, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain(
      "“False”, “fake” and “defamatory” are not interchangeable",
    )
    expect(container.textContent).toContain(
      "Unsubstantiated allegations of criminal wrongdoing can raise a Google policy issue",
    )
    expect(container.textContent).toContain("A legal-removal request is a separate process")
    expect(
      screen.getByRole("heading", { name: "Separate the policy case from the legal accusation" }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Prohibited and restricted content"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Legal removals")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Maps user-generated content policy"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Privacy")).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Report inappropriate user profiles"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Manage customer reviews"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    const relatedSection = screen
      .getByRole("heading", { name: "Continue understanding your situation" })
      .closest("section")
    expect(
      within(relatedSection as HTMLElement).queryAllByRole("link", { name: /read guide/i }),
    ).toHaveLength(2)
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Can a Google Review Be Removed? What Google's Policy Actually Allows",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Rejected My Review Report: What Can You Do Next?",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
