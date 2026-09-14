/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  competitorOrExEmployeeReviewSlug,
  competitorOrExEmployeeReviewSources,
} from "@/lib/resource-articles/can-a-competitor-or-ex-employee-leave-a-google-review"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
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
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "false-or-defamatory-google-reviews",
    ])
  })

  it("renders the dedicated conflict view, relationship routes, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Start with the relationship" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Current or former employee" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Industry competitor" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Other professional or personal connection" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Independent customer" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Conflict of interest is different from fake engagement" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Fake-engagement question" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Conflict-of-interest question" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Current and former employment can be relevant" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Negative conflicted review" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Positive conflicted review" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Competitor relationships can be especially relevant" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Facts about the relationship are stronger than guesses about motive",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A conflicted reviewer can still use a real account" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "What if the reviewer was also a genuine customer?" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Genuine interaction" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Existing conflicted relationship" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Employees and competitors are not the only possible conflicts",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Familial relationships")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review evidence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Relationship evidence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Build a simple relationship record" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Identification basis" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Keep private employment information out of the public reply",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("Confidential HR correspondence")
    expect(
      screen.getByRole("heading", { name: "Do not counter one conflicted review with several more" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Decision pending")).toBeInTheDocument()
    expect(screen.getByText("Report reviewed - no policy violation")).toBeInTheDocument()
    expect(screen.getByText("Escalated - check your email for updates")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If Google finds no violation, the one-time appeal may be the next step",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Reporting the reviewer's whole profile is a separate decision",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A genuine independent customer complaint is different" }),
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
    expect(screen.getByRole("link", { name: "Get your review checked" })).toHaveAttribute(
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
        name: /False or Defamatory Google Reviews: Policy Removal vs Legal Options/,
      }),
    ).toHaveAttribute("href", "/resources/false-or-defamatory-google-reviews")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceProhibitedRestrictedContent.url,
      sourceFakeEngagement.url,
      sourceMapsUgcPolicy.url,
      sourceReportUserProfiles.url,
      sourceReportInappropriateReviews.url,
      sourceManageCustomerReviews.url,
    ])
    expect(sourceLinks).toHaveLength(6)

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
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/can-a-competitor-or-ex-employee-leave-a-google-review",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–8 on their approved dedicated views", () => {
    const checks = [
      ["google-business-profile-suspended-before-appeal", "Before you appeal"],
      ["google-business-profile-appeal-evidence-checklist", "Build the pack before the clock starts"],
      ["google-business-profile-appeal-rejected-what-next", "First, check what status Google actually shows"],
      ["google-business-profile-verification-stuck-or-rejected", "What is Google actually showing you?"],
      ["can-a-google-review-be-removed", "Which situation are you actually dealing with?"],
      ["fake-google-review-or-genuine-negative-feedback", "Don't decide from one signal"],
      ["google-review-extortion", "If this is happening now, do these four things first"],
      ["google-review-bombing", "If suspicious reviews are arriving now, do these five things first"],
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
