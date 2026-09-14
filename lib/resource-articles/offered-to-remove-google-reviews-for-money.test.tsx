/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  offeredToRemoveGoogleReviewsForMoneySlug,
  offeredToRemoveGoogleReviewsForMoneySources,
} from "@/lib/resource-articles/offered-to-remove-google-reviews-for-money"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceBusinessProfileThirdPartyPolicies,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceWorkingWithThirdParties,
} from "@/lib/resource-sources/google-business-profile"
import {
  sourceFakeEngagement,
  sourceReportInappropriateReviews,
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
  "Someone Offered to Remove My Google Reviews for Money: What Should I Check?"

describe("Article #11 offered to remove Google reviews for money", () => {
  const resource = getPublishedResourceBySlug(offeredToRemoveGoogleReviewsForMoneySlug)
  const body = getResourceBody(offeredToRemoveGoogleReviewsForMoneySlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(offeredToRemoveGoogleReviewsForMoneySlug)).toEqual({
      resource,
      body,
    })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("offered-to-remove-google-reviews-for-money")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("review-abuse-scams")
    expect(resource?.description).toBe(
      "A paid Google review-removal service is not automatically a scam. Check what the provider actually promises, how it accesses your profile and whether its process follows Google's policies.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(offeredToRemoveGoogleReviewsForMoneySources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(offeredToRemoveGoogleReviewsForMoneySources)
    expect(body?.sourcesUsed).toEqual([
      sourceReportInappropriateReviews,
      sourceBusinessProfileThirdPartyPolicies,
      sourceWorkingWithThirdParties,
      sourceProtectBusinessProfile,
      sourceOwnersManagers,
      sourceReviewRatingScams,
      sourceFakeEngagement,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report inappropriate reviews on your Business Profile",
      "Business Profile third-party policies",
      "Tips for working with third parties to manage your Business Profile",
      "Help protect your Google Business Profile",
      "Manage your Business Profile owners & managers",
      "Identify scams on reviews & ratings",
      "Fake engagement",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceBusinessProfileThirdPartyPolicies,
      sourceReportInappropriateReviews,
      sourceProtectBusinessProfile,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceWorkingWithThirdParties)
    expect(body?.googleSays?.sources).not.toContain(sourceOwnersManagers)
    expect(body?.googleSays?.sources).not.toContain(sourceReviewRatingScams)
    expect(body?.googleSays?.sources).not.toContain(sourceFakeEngagement)
    expect(body?.urgentCallout).toBeUndefined()
    expect(related.map((item) => item.slug)).toEqual(["google-review-extortion"])
    expect(getPublishedResourceBySlug("google-review-extortion")).toBeDefined()
    expect(getPublishedResourceBySlug("google-business-profile-scams")).toBeUndefined()
  })

  it("renders approved copy, related Article #7 only, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain(
      "Paying for professional help is not automatically the problem",
    )
    expect(container.textContent).toContain("Nobody should sell you certainty that belongs to Google")
    expect(container.textContent).toContain(
      "A success fee is not the same thing as a guaranteed outcome",
    )
    expect(
      screen.getByRole("heading", {
        name: "Pay for expertise — not a promise of control over Google",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Business Profile third-party policies"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText(
        "Report inappropriate reviews on your Business Profile",
      ),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Help protect your Google Business Profile"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText(
        "Tips for working with third parties to manage your Business Profile",
      ),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Manage your Business Profile owners & managers"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Identify scams on reviews & ratings"),
    ).not.toBeInTheDocument()
    expect(within(googleSays as HTMLElement).queryByText("Fake engagement")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(
      screen.getByText("Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "Google Business Profile Scams: Passwords, OTPs, Fake Calls and Manager Access Requests",
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })
})
