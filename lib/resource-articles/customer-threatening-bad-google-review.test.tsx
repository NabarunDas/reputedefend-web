/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  customerThreateningReviewSlug,
  customerThreateningReviewSources,
} from "@/lib/resource-articles/customer-threatening-bad-google-review"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceManageCustomerReviews,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
  sourceReviewExtortion,
  sourceReviewRatingScams,
} from "@/lib/resource-sources/google-maps-reviews"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE =
  "A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them"

describe("Article #10 customer threatening a bad Google review", () => {
  const resource = getPublishedResourceBySlug(customerThreateningReviewSlug)
  const body = getResourceBody(customerThreateningReviewSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(customerThreateningReviewSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("customer-threatening-bad-google-review")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("review-abuse-scams")
    expect(resource?.description).toBe(
      "If a customer threatens a bad Google review unless you refund or compensate them, separate the genuine dispute from the review condition and preserve the exact evidence.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(customerThreateningReviewSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(customerThreateningReviewSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReviewExtortion,
      sourceProhibitedRestrictedContent,
      sourceReportInappropriateReviews,
      sourceManageCustomerReviews,
      sourceReviewRatingScams,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report negative review extortion scams on your Business Profile",
      "Prohibited and restricted content",
      "Report inappropriate reviews on your Business Profile",
      "Manage customer reviews",
      "Identify scams on reviews & ratings",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceReviewExtortion,
      sourceProhibitedRestrictedContent,
    ])
    expect(body?.googleSays?.sources).toHaveLength(2)
    expect(body?.googleSays?.sources).not.toContain(sourceReportInappropriateReviews)
    expect(body?.googleSays?.sources).not.toContain(sourceManageCustomerReviews)
    expect(body?.googleSays?.sources).not.toContain(sourceReviewRatingScams)
    expect(body?.urgentCallout).toBeUndefined()
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ])
    expect(getPublishedResourceBySlug("google-review-extortion")).toBeDefined()
    expect(getPublishedResourceBySlug("fake-google-review-or-genuine-negative-feedback")).toBeDefined()
  })

  it("renders approved copy, related Articles #7 and #6, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain(
      "First separate the customer dispute from the review threat",
    )
    expect(container.textContent).toContain("Do not pay for review deletion")
    expect(container.textContent).toContain(
      "If a refund is genuinely appropriate, keep it independent of the review",
    )
    expect(
      screen.getByRole("heading", {
        name: "Resolve the dispute — do not buy the review outcome",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(
      within(googleSays as HTMLElement).getByText(
        "Report negative review extortion scams on your Business Profile",
      ),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Prohibited and restricted content")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Report inappropriate reviews on your Business Profile"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Manage customer reviews")).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Identify scams on reviews & ratings"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(5)
    expect(
      within(bibliography as HTMLElement).getByText(
        "Report negative review extortion scams on your Business Profile",
      ),
    ).toBeInTheDocument()
    expect(within(bibliography as HTMLElement).getByText("Prohibited and restricted content")).toBeInTheDocument()
    expect(
      within(bibliography as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(within(bibliography as HTMLElement).getByText("Manage customer reviews")).toBeInTheDocument()
    expect(
      within(bibliography as HTMLElement).getByText("Identify scams on reviews & ratings"),
    ).toBeInTheDocument()

    expect(
      screen.getByText("Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Fake Google Review or Genuine Negative Feedback? How to Tell the Difference"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
