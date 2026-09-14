/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewExtortionSlug,
  googleReviewExtortionSources,
  googleReviewExtortionUrgentCallout,
} from "@/lib/resource-articles/google-review-extortion"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceFakeEngagement,
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
  "Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews"

describe("Article #7 Google review extortion", () => {
  const resource = getPublishedResourceBySlug(googleReviewExtortionSlug)
  const body = getResourceBody(googleReviewExtortionSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleReviewExtortionSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(true)
    expect(resource?.slug).toBe(googleReviewExtortionSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("review-abuse-scams")
    expect(resource?.description).toBe(
      "If someone demands money, goods, services or favours to remove negative Google reviews, do not pay. Preserve the evidence and use Google's dedicated extortion reporting route.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(googleReviewExtortionSources).toHaveLength(4)
    expect(body?.sourcesUsed).toEqual(googleReviewExtortionSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReviewExtortion,
      sourceReviewRatingScams,
      sourceReportInappropriateReviews,
      sourceFakeEngagement,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report negative review extortion scams on your Business Profile",
      "Identify scams on reviews & ratings",
      "Report inappropriate reviews on your Business Profile",
      "Fake engagement",
    ])
    expect(body?.googleSays?.sources).toEqual([sourceReviewExtortion, sourceReviewRatingScams])
    expect(body?.googleSays?.sources).toHaveLength(2)
    expect(body?.googleSays?.sources).not.toContain(sourceReportInappropriateReviews)
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.urgentCallout).toBe(googleReviewExtortionUrgentCallout)
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-bombing",
      "customer-threatening-bad-google-review",
      "offered-to-remove-google-reviews-for-money",
    ])
    expect(getPublishedResourceBySlug("google-review-bombing")).toBeDefined()
    expect(getPublishedResourceBySlug("customer-threatening-bad-google-review")).toBeDefined()
    expect(getPublishedResourceBySlug("offered-to-remove-google-reviews-for-money")).toBeDefined()
  })

  it("renders approved copy, urgent callout, hidden drafts, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByLabelText("Urgent situation")).toHaveTextContent(googleReviewExtortionUrgentCallout)
    expect(container.textContent).toContain("Start with the demand, not the star rating")
    expect(container.textContent).toContain(
      "Connect the reviews to the demand without overstating the evidence",
    )
    expect(container.textContent).toContain("A genuine customer dispute needs careful classification")
    expect(
      screen.getByRole("heading", {
        name: "Do not let urgency turn into payment",
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
    expect(within(googleSays as HTMLElement).getByText("Identify scams on reviews & ratings")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Report inappropriate reviews on your Business Profile"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Fake engagement")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(4)
    expect(
      within(bibliography as HTMLElement).getByText(
        "Report negative review extortion scams on your Business Profile",
      ),
    ).toBeInTheDocument()
    expect(
      within(bibliography as HTMLElement).getByText("Identify scams on reviews & ratings"),
    ).toBeInTheDocument()
    expect(
      within(bibliography as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(within(bibliography as HTMLElement).getByText("Fake engagement")).toBeInTheDocument()

    expect(
      screen.getByText("Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Someone Offered to Remove My Google Reviews for Money: What Should I Check?"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
