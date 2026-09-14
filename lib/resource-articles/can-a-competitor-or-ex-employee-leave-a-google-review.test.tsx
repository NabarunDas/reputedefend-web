/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  competitorOrExEmployeeReviewSlug,
  competitorOrExEmployeeReviewSources,
} from "@/lib/resource-articles/can-a-competitor-or-ex-employee-leave-a-google-review"
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

const ARTICLE_TITLE = "Can a Competitor or Ex-Employee Leave a Google Review?"

describe("Article #9 competitor or ex-employee Google review", () => {
  const resource = getPublishedResourceBySlug(competitorOrExEmployeeReviewSlug)
  const body = getResourceBody(competitorOrExEmployeeReviewSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(competitorOrExEmployeeReviewSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe(competitorOrExEmployeeReviewSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "Google's review policies restrict conflicts of interest, including some competitor and current or former employee reviews. Learn what evidence matters and how to report them.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(competitorOrExEmployeeReviewSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(competitorOrExEmployeeReviewSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceFakeEngagement,
      sourceMapsUgcPolicy,
      sourceReportInappropriateReviews,
      sourceReportUserProfiles,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Prohibited and restricted content",
      "Fake engagement",
      "Maps user-generated content policy",
      "Report inappropriate reviews on your Business Profile",
      "Report inappropriate user profiles",
      "Manage customer reviews",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceProhibitedRestrictedContent,
      sourceReportInappropriateReviews,
    ])
    expect(body?.googleSays?.sources).toHaveLength(2)
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.googleSays?.sources).not.toContain(sourceManageCustomerReviews)
    expect(related.map((item) => item.slug)).toEqual(["can-a-google-review-be-removed"])
    expect(getPublishedResourceBySlug("false-or-defamatory-google-reviews")).toBeUndefined()
  })

  it("renders approved copy, related Article #5 only, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain(
      "Google's policy is about independence as well as authenticity",
    )
    expect(container.textContent).toContain(
      "A former employee review is not best analysed as “we cannot find this customer”",
    )
    expect(container.textContent).toContain("Competitor reviews have an especially clear policy problem")
    expect(
      screen.getByRole("heading", {
        name: "Prove the relationship before you argue the conflict",
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
    expect(within(googleSays as HTMLElement).queryByText("Manage customer reviews")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(6)

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
