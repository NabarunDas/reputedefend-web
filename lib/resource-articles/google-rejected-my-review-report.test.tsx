/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleRejectedMyReviewReportSlug,
  googleRejectedMyReviewReportSources,
} from "@/lib/resource-articles/google-rejected-my-review-report"
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
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReportUserProfiles,
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

const ARTICLE_TITLE = "Google Rejected My Review Report: What Can You Do Next?"

describe("Article #12 Google rejected my review report", () => {
  const resource = getPublishedResourceBySlug(googleRejectedMyReviewReportSlug)
  const body = getResourceBody(googleRejectedMyReviewReportSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleRejectedMyReviewReportSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-rejected-my-review-report")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "If Google says a reported review has no policy violation, check the status, prepare the one-time appeal carefully and understand what options remain after the final decision.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(googleRejectedMyReviewReportSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(googleRejectedMyReviewReportSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReportInappropriateReviews,
      sourceProhibitedRestrictedContent,
      sourceMapsUgcPolicy,
      sourceReportUserProfiles,
      sourceReviewExtortion,
      sourceLegalRemovals,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report inappropriate reviews on your Business Profile",
      "Prohibited and restricted content",
      "Maps user-generated content policy",
      "Report inappropriate user profiles",
      "Report negative review extortion scams on your Business Profile",
      "Legal removals",
      "Manage customer reviews",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceReportInappropriateReviews,
      sourceProhibitedRestrictedContent,
    ])
    expect(body?.googleSays?.sources).toHaveLength(2)
    expect(body?.googleSays?.sources).not.toContain(sourceReportUserProfiles)
    expect(body?.googleSays?.sources).not.toContain(sourceReviewExtortion)
    expect(body?.googleSays?.sources).not.toContain(sourceLegalRemovals)
    expect(body?.urgentCallout).toBeUndefined()
    expect(related.map((item) => item.slug)).toEqual(["can-a-google-review-be-removed"])
    expect(getPublishedResourceBySlug("can-a-google-review-be-removed")).toBeDefined()
    expect(getPublishedResourceBySlug("false-or-defamatory-google-reviews")).toBeUndefined()
  })

  it("renders approved copy, related Article #5 only, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("Decision pending is not a rejection")
    expect(container.textContent).toContain("Prepare the one-time appeal before you submit it")
    expect(container.textContent).toContain("Do not invent a second standard review appeal")
    expect(
      screen.getByRole("heading", {
        name: "Use the one-time appeal well — and know when the removal process ends",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(
      within(googleSays as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Prohibited and restricted content"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Report inappropriate user profiles"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Legal removals")).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Manage customer reviews")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(
      screen.getByText("Can a Google Review Be Removed? What Google's Policy Actually Allows"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("False or Defamatory Google Reviews: What Google Can — and Can't — Decide"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
