/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewBombingSlug,
  googleReviewBombingSources,
} from "@/lib/resource-articles/google-review-bombing"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
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
    expect(related.map((item) => item.slug)).toEqual([
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ])
  })

  it("renders the dedicated cluster view, urgent actions, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(
      screen.getByRole("heading", {
        name: "If suspicious reviews are arriving now, do these five things first",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Save every review" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Build a timeline" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Check what happened offline" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Assess each review separately" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Record the wider pattern" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The pattern is evidence, not the verdict" })).toBeInTheDocument()
    expect(
      container.textContent,
    ).toContain("It does not automatically prove fake engagement, rating manipulation or coordination.")

    expect(
      screen.getByRole("heading", {
        name: '"Review bombing" describes a pattern, not a Google status',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A sudden spike tells you to investigate — it does not prove manipulation",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Record what is normal before calling the volume unusual" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Put the cluster on one timeline" })).toBeInTheDocument()
    expect(screen.getByText("Normal review activity")).toBeInTheDocument()
    expect(screen.getByText("First unusual review appears")).toBeInTheDocument()
    expect(screen.getByText("Peak review activity")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Assess the reviews at two levels" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Level 1 — Each individual review" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Level 2 — The wider pattern" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Fake engagement may be part of the case" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Unusual volume can matter when it points to rating manipulation",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Repeated wording can strengthen the pattern evidence" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A viral campaign can produce genuine reviews, fake reviews or both",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Review from somebody with a genuine experience",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Review from somebody reacting to the campaign without a genuine experience",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Check for genuine conflicts of interest" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Report policy-violating reviews through Google's normal review process",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: 'There is no published merchant "review bombing" shortcut',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Use the one-time appeal where the policy case supports it" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to 10 eligible reviews")
    expect(
      screen.getByRole("heading", { name: "Reporting a reviewer profile is a separate action" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Google may apply protections that businesses cannot switch on themselves",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Automated spam detection" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Posting restrictions" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Consumer alerts" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "Do not interpret the absence of a posting restriction or consumer alert as proof that the review activity is legitimate.",
    )
    expect(container.textContent).toContain(
      "Do not promise customers that reporting a cluster will automatically trigger these protections.",
    )
    expect(
      screen.getByRole("heading", {
        name: "If somebody demands money or favours, separate the extortion case",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not publicly fight the whole cluster" })).toBeInTheDocument()
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
    expect(screen.getByRole("link", { name: "Get your review cluster checked" })).toHaveAttribute(
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
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Generated Content Policy Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceProhibitedRestrictedContent.url,
      sourceFakeEngagement.url,
      sourceReportUserProfiles.url,
      sourcePostingRestrictions.url,
      sourceReportInappropriateReviews.url,
      sourceReviewExtortion.url,
      sourceConsumerAlerts.url,
    ])
    expect(sourceLinks).toHaveLength(7)

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
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-review-bombing")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–7 on their approved dedicated views", () => {
    const checks = [
      ["google-business-profile-suspended-before-appeal", "Before you appeal"],
      ["google-business-profile-appeal-evidence-checklist", "Build the pack before the clock starts"],
      ["google-business-profile-appeal-rejected-what-next", "First, check what status Google actually shows"],
      ["google-business-profile-verification-stuck-or-rejected", "What is Google actually showing you?"],
      ["can-a-google-review-be-removed", "Which situation are you actually dealing with?"],
      ["fake-google-review-or-genuine-negative-feedback", "Don't decide from one signal"],
      ["google-review-extortion", "If this is happening now, do these four things first"],
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
    const other = getPublishedResourceBySlug("google-business-profile-name-rules")
    const otherBody = getResourceBody("google-business-profile-name-rules")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
