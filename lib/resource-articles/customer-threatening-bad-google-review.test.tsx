/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  customerThreateningReviewSlug,
  customerThreateningReviewSources,
} from "@/lib/resource-articles/customer-threatening-bad-google-review"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(customerThreateningReviewSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(customerThreateningReviewSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReviewExtortion,
      sourceProhibitedRestrictedContent,
      sourceReportInappropriateReviews,
      sourceManageCustomerReviews,
      sourceReviewRatingScams,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ])
  })

  it("renders the dedicated dispute view, two-lane visual, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Separate the two questions first" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The customer dispute" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The review condition" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not trade one decision for the other" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A genuine customer can still leave a negative review" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A refund request on its own is not the same as review extortion",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Customer dispute" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review-linked condition" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not offer a benefit in exchange for changing the review" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not say" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If a refund is genuinely appropriate, keep it independent of the review",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Save the exact message before the conversation changes" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Put the dispute and the review activity on one timeline" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Purchase or service")).toBeInTheDocument()
    expect(screen.getByText("Review statement")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Assess a posted review on its own content" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A direct demand tied to review removal may use Google's extortion route",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Keep Google's review process separate from legal conclusions",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("ProfileRelaunch does not provide legal advice.")
    expect(
      screen.getByRole("heading", { name: "Do not prolong the argument just to create more evidence" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not respond to review pressure with your own threats" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Keep private dispute evidence out of the public review reply",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A refund does not mean the customer owes you review deletion",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "The customer may independently update the review later" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Use ordinary review reporting for a separate content-policy violation",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If there is a direct review-removal demand, keep the case narrow",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Resolving the dispute does not guarantee that Google will remove the review",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review, scam and Maps content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Review Protection assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=review")
    }
    expect(screen.getByRole("link", { name: "Get your case reviewed" })).toHaveAttribute(
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
        name: /Fake Google Review or Genuine Negative Feedback\? How to Tell the Difference/,
      }),
    ).toHaveAttribute("href", "/resources/fake-google-review-or-genuine-negative-feedback")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Maps Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceReviewExtortion.url,
      sourceReportInappropriateReviews.url,
      sourceManageCustomerReviews.url,
      sourceProhibitedRestrictedContent.url,
      sourceReviewRatingScams.url,
    ])
    expect(sourceLinks).toHaveLength(5)

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
      "https://profilerelaunch.com/resources/customer-threatening-bad-google-review",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–9 on their approved dedicated views", () => {
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
    ] as const

    for (const [slug, heading] of checks) {
      const item = getPublishedResourceBySlug(slug)
      const itemBody = getResourceBody(slug)
      const { unmount } = render(<ResourceArticleView resource={item!} body={itemBody!} />)
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
      unmount()
    }
  })

  it("leaves the remaining redesigned Resource on its dedicated view", () => {
    const other = getPublishedResourceBySlug("google-reviews-missing-or-disappeared")
    const otherBody = getResourceBody("google-reviews-missing-or-disappeared")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "What happened before the review went missing?" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "The short version" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "How these guides are produced" })).not.toBeInTheDocument()
  })
})
