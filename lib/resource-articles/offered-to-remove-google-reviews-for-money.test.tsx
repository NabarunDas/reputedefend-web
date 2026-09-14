/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  offeredToRemoveGoogleReviewsForMoneySlug,
  offeredToRemoveGoogleReviewsForMoneySources,
} from "@/lib/resource-articles/offered-to-remove-google-reviews-for-money"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
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
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-extortion",
      "google-business-profile-scams",
    ])
  })

  it("renders the dedicated provider-check view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Check these six things before you pay" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Policy basis" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Process" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Outcome promise" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Account access" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Pricing" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "If Google says no" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The fee is not the deciding factor" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Paying for professional help is not automatically the problem" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Ask which Google policy the review allegedly violates" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Ask what the provider will actually do" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Nobody should sell you certainty that belongs to Google" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A success fee is not the same thing as a guaranteed outcome",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Upfront fee" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Success-based fee" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Mixed model" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Be cautious of anyone claiming to be Google" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A provider's service fee is not a Google deletion fee" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Never hand over your Google password or security codes" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Keep control of your Business Profile" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Get the scope and charges in writing" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Be cautious of pressure designed to stop you checking the offer",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not let the provider solve one review problem by creating another",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not authorise a provider to threaten reviewers for you" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Ask what the provider does when there is no strong removal case",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check the provider's ordinary business details" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Unusual payment requests deserve extra caution" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If the seller claims to control the bad reviews, stop and reassess the situation",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A problem with the provider is separate from the original review",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Understand the normal Google review process before buying a service",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A provider can add value without pretending to control Google",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review, Business Profile and third-party guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Review Protection assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=review")
    }
    expect(screen.getByRole("link", { name: "Get the offer reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
    expect(screen.getByRole("link", { name: "See how Review Protection works" })).toHaveAttribute(
      "href",
      "/review-protection",
    )

    expect(
      screen.getByRole("link", {
        name: /Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews/,
      }),
    ).toHaveAttribute("href", "/resources/google-review-extortion")
    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Scams: Passwords, OTPs, Fake Calls and Manager Access Requests/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-scams")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Maps Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceReportInappropriateReviews.url,
      sourceBusinessProfileThirdPartyPolicies.url,
      sourceWorkingWithThirdParties.url,
      sourceProtectBusinessProfile.url,
      sourceOwnersManagers.url,
      sourceReviewRatingScams.url,
      sourceFakeEngagement.url,
    ])
    expect(sourceLinks).toHaveLength(7)

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-14"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-14"')
  })

  it("emits Article and Breadcrumb JSON-LD with valid dates and publisher", () => {
    const article = resourceArticleJsonLd(resource!)
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Review Abuse & Scams")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/offered-to-remove-google-reviews-for-money",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–10 on their approved dedicated views", () => {
    const checks = [
      ["google-business-profile-suspended-before-appeal", "Before you appeal"],
      ["google-business-profile-appeal-evidence-checklist", "Build the pack before the clock starts"],
      ["google-business-profile-appeal-rejected-what-next", "First, check what status Google actually shows"],
      ["google-business-profile-verification-stuck-or-rejected", "What is Google actually showing you?"],
      ["can-a-google-review-be-removed", "Which situation are you actually dealing with?"],
      ["fake-google-review-or-genuine-negative-feedback", "Don't decide from one signal"],
      ["google-review-extortion", "If this is happening now, do these four things first"],
      ["google-review-bombing", "If suspicious reviews are arriving now, do these five things first"],
      ["can-a-competitor-or-ex-employee-leave-a-google-review", "Start with the relationship"],
      ["customer-threatening-bad-google-review", "Separate the two questions first"],
    ] as const

    for (const [slug, heading] of checks) {
      const item = getPublishedResourceBySlug(slug)
      const itemBody = getResourceBody(slug)
      const { unmount } = render(<ResourceArticleView resource={item!} body={itemBody!} />)
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
      unmount()
    }
  })

  it("leaves another Resource on the legacy template", () => {
    const other = getPublishedResourceBySlug("google-business-profile-address-and-service-area-rules")
    const otherBody = getResourceBody("google-business-profile-address-and-service-area-rules")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
