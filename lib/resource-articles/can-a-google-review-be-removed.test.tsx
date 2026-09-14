/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  canAGoogleReviewBeRemovedSlug,
  canAGoogleReviewBeRemovedSources,
} from "@/lib/resource-articles/can-a-google-review-be-removed"
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
  sourceLegalRemovals,
  sourceMapsPrivacy,
  sourceMapsUgcPolicy,
  sourceProhibitedRestrictedContent,
  sourceReportInappropriateReviews,
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

const ARTICLE_TITLE = "Can a Google Review Be Removed? What Google's Policy Actually Allows"

describe("Article #5 can a Google review be removed", () => {
  const resource = getPublishedResourceBySlug(canAGoogleReviewBeRemovedSlug)
  const body = getResourceBody(canAGoogleReviewBeRemovedSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(canAGoogleReviewBeRemovedSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe(canAGoogleReviewBeRemovedSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "Google does not remove reviews simply because they are negative. Learn which policy violations can qualify for removal, how to report a review and when a one-time appeal is available.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(canAGoogleReviewBeRemovedSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(canAGoogleReviewBeRemovedSources)
    expect(body?.sourcesUsed).toEqual([
      sourceReportInappropriateReviews,
      sourceProhibitedRestrictedContent,
      sourceMapsUgcPolicy,
      sourceFakeEngagement,
      sourceMapsPrivacy,
      sourceLegalRemovals,
      sourceReviewExtortion,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Report inappropriate reviews on your Business Profile",
      "Prohibited and restricted content",
      "Maps user-generated content policy",
      "Fake engagement",
      "Privacy",
      "Legal removals",
      "Report negative review extortion scams on your Business Profile",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "fake-google-review-or-genuine-negative-feedback",
      "google-rejected-my-review-report",
      "google-reviews-missing-or-disappeared",
    ])
  })

  it("renders the dedicated review-removal view, decision routes, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Which situation are you actually dealing with?" })).toBeInTheDocument()
    expect(screen.getByText("Genuine negative feedback")).toBeInTheDocument()
    expect(screen.getByText("Possible policy violation")).toBeInTheDocument()
    expect(screen.getByText("Google found no policy violation")).toBeInTheDocument()
    expect(screen.getByText("Extortion or a legal issue")).toBeInTheDocument()

    expect(
      screen.getByRole("heading", { name: "Negative does not automatically mean removable" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "May remain live" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "May need policy assessment" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Fake engagement" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Paid or manipulated reviews" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Conflicts of interest" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "An unfamiliar Google display name can be useful context, but it does not by itself prove that no genuine experience occurred.",
    )
    expect(
      screen.getByRole("heading", { name: "Report the review against the policy that actually applies" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Decision pending")).toBeInTheDocument()
    expect(screen.getByText("Report reviewed - no policy violation")).toBeInTheDocument()
    expect(screen.getByText("Escalated - check your email for updates")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google currently provides a one-time review appeal" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to 10 eligible reviews")
    expect(
      screen.getByRole("heading", { name: "Sometimes the correct outcome is that the review stays live" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Review extortion uses a different Google route" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Legal removal is separate from Google's normal review-policy process",
      }),
    ).toBeInTheDocument()

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
        name: /Fake Google Review or Genuine Negative Feedback\? How to Tell the Difference/,
      }),
    ).toHaveAttribute("href", "/resources/fake-google-review-or-genuine-negative-feedback")
    expect(
      screen.getByRole("link", { name: /Google Rejected My Review Report: What Can You Do Next\?/ }),
    ).toHaveAttribute("href", "/resources/google-rejected-my-review-report")
    expect(
      screen.getByRole("link", {
        name: /Google Reviews Missing or Disappeared: Why It Happens and What You Can Do/,
      }),
    ).toHaveAttribute("href", "/resources/google-reviews-missing-or-disappeared")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceReportInappropriateReviews.url,
      sourceReviewExtortion.url,
      sourceProhibitedRestrictedContent.url,
      sourceMapsUgcPolicy.url,
      sourceFakeEngagement.url,
      sourceMapsPrivacy.url,
      sourceLegalRemovals.url,
    ])
    expect(sourceLinks).toHaveLength(7)
    expect(screen.getByRole("link", { name: "Report inappropriate reviews on your Business Profile" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/4596773?hl=en-GB",
    )
    expect(
      screen.getByRole("link", { name: "Report negative review extortion scams on your Business Profile" }),
    ).toHaveAttribute("href", "https://support.google.com/business/answer/16404809?hl=en-GB")
    expect(screen.getByRole("link", { name: "Prohibited and restricted content" })).toHaveAttribute(
      "href",
      "https://support.google.com/contributionpolicy/answer/7400114?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Maps user-generated content policy" })).toHaveAttribute(
      "href",
      "https://support.google.com/contributionpolicy/answer/7422880?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Fake engagement" })).toHaveAttribute(
      "href",
      "https://support.google.com/contributionpolicy/answer/11414422?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://support.google.com/contributionpolicy/answer/7401426?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Legal removals" })).toHaveAttribute(
      "href",
      "https://support.google.com/contributionpolicy/answer/16426540?hl=en-GB",
    )

    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review and Maps content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Reviews & Reputation")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-13")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe("https://profilerelaunch.com/resources/can-a-google-review-be-removed")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–4 on their approved dedicated views", () => {
    const suspension = getPublishedResourceBySlug("google-business-profile-suspended-before-appeal")
    const suspensionBody = getResourceBody("google-business-profile-suspended-before-appeal")
    const { unmount: unmount1 } = render(
      <ResourceArticleView resource={suspension!} body={suspensionBody!} />,
    )
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.queryByText("View official Google guidance")).not.toBeInTheDocument()
    unmount1()

    const evidence = getPublishedResourceBySlug("google-business-profile-appeal-evidence-checklist")
    const evidenceBody = getResourceBody("google-business-profile-appeal-evidence-checklist")
    const { unmount: unmount2 } = render(
      <ResourceArticleView resource={evidence!} body={evidenceBody!} />,
    )
    expect(screen.getByRole("heading", { name: "Build the pack before the clock starts" })).toBeInTheDocument()
    unmount2()

    const rejected = getPublishedResourceBySlug("google-business-profile-appeal-rejected-what-next")
    const rejectedBody = getResourceBody("google-business-profile-appeal-rejected-what-next")
    const { unmount: unmount3 } = render(
      <ResourceArticleView resource={rejected!} body={rejectedBody!} />,
    )
    expect(
      screen.getByRole("heading", { name: "First, check what status Google actually shows" }),
    ).toBeInTheDocument()
    unmount3()

    const verification = getPublishedResourceBySlug("google-business-profile-verification-stuck-or-rejected")
    const verificationBody = getResourceBody("google-business-profile-verification-stuck-or-rejected")
    render(<ResourceArticleView resource={verification!} body={verificationBody!} />)
    expect(screen.getByRole("heading", { name: "What is Google actually showing you?" })).toBeInTheDocument()
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
