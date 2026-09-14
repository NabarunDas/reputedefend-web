/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleRejectedMyReviewReportSlug,
  googleRejectedMyReviewReportSources,
} from "@/lib/resource-articles/google-rejected-my-review-report"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
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
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "false-or-defamatory-google-reviews",
    ])
  })

  it("renders the dedicated status-to-route view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Start with the status Google actually shows" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Decision pending" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Report reviewed - no policy violation" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Escalated - check your email for updates" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not call every live review a rejected appeal" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Decision pending is not a rejection" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: '"Report reviewed - no policy violation" is the decision that opens the appeal question',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not appeal only because the review is damaging" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Read the policy again before using the appeal" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Prepare the one-time appeal before you submit it" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("one-time appeal")
    expect(
      screen.getByRole("heading", {
        name: "Google currently allows up to 10 eligible reviews in an appeal",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to 10 eligible reviews")
    expect(screen.getByRole("heading", { name: "Keep facts separate from suspicion" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A rejected report is not a reason to manufacture a stronger story",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not repeatedly flag the same review while preparing the appeal",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: '"Escalated" does not mean removal approved' }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Escalated means" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What it does not mean" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google finds a policy violation" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google finds the review compliant" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not invent a second standard review appeal" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "User-profile report" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review extortion" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Legal removal" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Sometimes the responsible recommendation is to stop pursuing paid removal",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A professional response may be the better next step" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review and Maps content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Review Protection assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=review")
    }
    expect(screen.getByRole("link", { name: "Get your appeal checked" })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
    expect(screen.getByRole("link", { name: "See how Review Protection works" })).toHaveAttribute(
      "href",
      "/review-protection",
    )

    expect(
      screen.getByRole("link", {
        name: /Can a Google Review Be Removed\? What Google's Policy Actually Allows/,
      }),
    ).toHaveAttribute("href", "/resources/can-a-google-review-be-removed")
    expect(
      screen.getByRole("link", {
        name: /False or Defamatory Google Reviews: What Google Can — and Can't — Decide/,
      }),
    ).toHaveAttribute("href", "/resources/false-or-defamatory-google-reviews")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceReportInappropriateReviews.url,
      sourceReviewExtortion.url,
      sourceManageCustomerReviews.url,
      sourceProhibitedRestrictedContent.url,
      sourceMapsUgcPolicy.url,
      sourceReportUserProfiles.url,
      sourceLegalRemovals.url,
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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Reviews & Reputation")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-rejected-my-review-report")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–11 on their approved dedicated views", () => {
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
      ["offered-to-remove-google-reviews-for-money", "Check these six things before you pay"],
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
    const other = getPublishedResourceBySlug("google-business-profile-not-showing-on-google-or-maps")
    const otherBody = getResourceBody("google-business-profile-not-showing-on-google-or-maps")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
