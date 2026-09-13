/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewBombingSlug,
  googleReviewBombingSources,
  googleReviewBombingUrgentCallout,
} from "@/lib/resource-articles/google-review-bombing"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceConsumerAlerts,
  sourceFakeEngagement,
  sourcePostingRestrictions,
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

const ARTICLE_TITLE =
  "Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once"

describe("Article #8 Google review bombing", () => {
  const resource = getPublishedResourceBySlug(googleReviewBombingSlug)
  const body = getResourceBody(googleReviewBombingSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleReviewBombingSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(true)
    expect(resource?.slug).toBe(googleReviewBombingSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("review-abuse-scams")
    expect(resource?.description).toBe(
      "If several suspicious Google reviews arrive at once, preserve the pattern, assess each review against Google's policies and use the correct reporting and appeal process.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(googleReviewBombingSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(googleReviewBombingSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceFakeEngagement,
      sourceReportInappropriateReviews,
      sourceReportUserProfiles,
      sourcePostingRestrictions,
      sourceConsumerAlerts,
      sourceReviewExtortion,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Prohibited and restricted content",
      "Fake engagement",
      "Report inappropriate reviews on your Business Profile",
      "Report inappropriate user profiles",
      "Posting restrictions",
      "Consumer Alerts",
      "Report negative review extortion scams on your Business Profile",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceProhibitedRestrictedContent,
      sourceReportInappropriateReviews,
    ])
    expect(body?.googleSays?.sources).toHaveLength(2)
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.googleSays?.sources).not.toContain(sourceReviewExtortion)
    expect(body?.urgentCallout).toBe(googleReviewBombingUrgentCallout)
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ])
  })

  it("renders approved copy, related Articles #7 and #6, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByLabelText("Urgent situation")).toHaveTextContent(googleReviewBombingUrgentCallout)
    expect(container.textContent).toContain(
      "“Review bombing” describes a pattern, not a single Google status",
    )
    expect(container.textContent).toContain(
      "A sudden spike tells you to investigate — it does not prove manipulation",
    )
    expect(container.textContent).toContain(
      "There is no published merchant “review bombing” shortcut",
    )
    expect(
      screen.getByRole("heading", {
        name: "Treat the pattern as evidence, not as the verdict",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(within(googleSays as HTMLElement).getByText("Prohibited and restricted content")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Report inappropriate reviews on your Business Profile"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Fake engagement")).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Consumer Alerts")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(
      screen.getByText("Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Fake Google Review or Genuine Negative Feedback? How to Tell the Difference"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
