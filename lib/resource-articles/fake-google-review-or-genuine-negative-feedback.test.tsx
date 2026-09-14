/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  fakeOrGenuineNegativeFeedbackSlug,
  fakeOrGenuineNegativeFeedbackSources,
} from "@/lib/resource-articles/fake-google-review-or-genuine-negative-feedback"
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
} from "@/lib/resource-sources/google-maps-reviews"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference"

describe("Article #6 fake review or genuine negative feedback", () => {
  const resource = getPublishedResourceBySlug(fakeOrGenuineNegativeFeedbackSlug)
  const body = getResourceBody(fakeOrGenuineNegativeFeedbackSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(fakeOrGenuineNegativeFeedbackSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe(fakeOrGenuineNegativeFeedbackSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "A suspicious Google review is not automatically fake. Use this evidence-based framework to distinguish possible fake engagement from genuine negative customer feedback.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(fakeOrGenuineNegativeFeedbackSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(fakeOrGenuineNegativeFeedbackSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceFakeEngagement,
      sourceMapsUgcPolicy,
      sourceReportInappropriateReviews,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Prohibited and restricted content",
      "Fake engagement",
      "Maps user-generated content policy",
      "Report inappropriate reviews on your Business Profile",
      "Manage customer reviews",
    ])
    expect(body?.googleSays?.sources).toEqual([sourceProhibitedRestrictedContent, sourceFakeEngagement])
    expect(body?.googleSays?.sources).not.toContain(sourceReportInappropriateReviews)
    expect(body?.googleSays?.sources).not.toContain(sourceManageCustomerReviews)
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "google-review-bombing",
    ])
  })

  it("renders approved copy, related Articles #5 and #8, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain("Start with Google's definition, not your instinct")
    expect(container.textContent).toContain(
      "An unfamiliar reviewer name is only one piece of information",
    )
    expect(container.textContent).toContain("A sudden cluster is not automatically review bombing")
    expect(
      screen.getByRole("heading", {
        name: "Suspicion starts the investigation — evidence decides the case",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(within(googleSays as HTMLElement).getByText("Prohibited and restricted content")).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Fake engagement")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Manage customer reviews"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(5)

    expect(
      screen.getByText("Can a Google Review Be Removed? What Google's Policy Actually Allows"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
