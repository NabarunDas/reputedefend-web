/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewExtortionSlug,
  googleReviewExtortionSources,
} from "@/lib/resource-articles/google-review-extortion"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleReviewExtortionSources).toHaveLength(4)
    expect(body?.sourcesUsed).toEqual(googleReviewExtortionSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReviewExtortion,
      sourceReviewRatingScams,
      sourceReportInappropriateReviews,
      sourceFakeEngagement,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-bombing",
      "customer-threatening-bad-google-review",
      "offered-to-remove-google-reviews-for-money",
    ])
  })

  it("renders the dedicated extortion view, urgent actions, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(
      screen.getByRole("heading", { name: "If this is happening now, do these four things first" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not pay or bargain" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Preserve the demand" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Save the review evidence" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Use Google's dedicated extortion route" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The demand is the key fact" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not pay to make the reviews disappear" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Preserve the demand before messages or accounts change" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Save direct links to the reviews connected to the demand" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Put the incident into a simple timeline" })).toBeInTheDocument()
    expect(screen.getByText("First suspicious review appears")).toBeInTheDocument()
    expect(screen.getByText("Demand is made")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Explain why you believe the demand and reviews are connected",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Use Google's dedicated merchant extortion route" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Extortion reporting and ordinary review reporting are different routes",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A sudden review spike is a warning sign, not the whole case",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Money being mentioned does not automatically make a customer dispute extortion",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep account credentials out of the conversation" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Watch for signs that the incident is part of a wider review scam",
      }),
    ).toBeInTheDocument()

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
        name: /Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once/,
      }),
    ).toHaveAttribute("href", "/resources/google-review-bombing")
    expect(
      screen.getByRole("link", {
        name: /A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them/,
      }),
    ).toHaveAttribute("href", "/resources/customer-threatening-bad-google-review")
    expect(
      screen.getByRole("link", {
        name: /Someone Offered to Remove My Google Reviews for Money: What Should I Check\?/,
      }),
    ).toHaveAttribute("href", "/resources/offered-to-remove-google-reviews-for-money")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Maps Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceReviewExtortion.url,
      sourceReportInappropriateReviews.url,
      sourceReviewRatingScams.url,
      sourceFakeEngagement.url,
    ])
    expect(sourceLinks).toHaveLength(4)

    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review-extortion, review and Maps content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-13"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-14"')
  })

  it("emits Article and Breadcrumb JSON-LD with valid dates and publisher", () => {
    const article = resourceArticleJsonLd(resource!)
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Review Abuse & Scams")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-13")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-review-extortion")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–6 on their approved dedicated views", () => {
    const checks = [
      ["google-business-profile-suspended-before-appeal", "Before you appeal"],
      ["google-business-profile-appeal-evidence-checklist", "Build the pack before the clock starts"],
      ["google-business-profile-appeal-rejected-what-next", "First, check what status Google actually shows"],
      ["google-business-profile-verification-stuck-or-rejected", "What is Google actually showing you?"],
      ["can-a-google-review-be-removed", "Which situation are you actually dealing with?"],
      ["fake-google-review-or-genuine-negative-feedback", "Don't decide from one signal"],
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
    const other = getPublishedResourceBySlug("google-review-bombing")
    const otherBody = getResourceBody("google-review-bombing")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
