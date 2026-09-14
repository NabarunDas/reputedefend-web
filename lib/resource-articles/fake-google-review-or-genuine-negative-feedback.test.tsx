/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  fakeOrGenuineNegativeFeedbackSlug,
  fakeOrGenuineNegativeFeedbackSources,
} from "@/lib/resource-articles/fake-google-review-or-genuine-negative-feedback"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(fakeOrGenuineNegativeFeedbackSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(fakeOrGenuineNegativeFeedbackSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceFakeEngagement,
      sourceMapsUgcPolicy,
      sourceReportInappropriateReviews,
      sourceManageCustomerReviews,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "google-review-bombing",
    ])
  })

  it("renders the dedicated assessment view, evidence framework, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Don't decide from one signal" })).toBeInTheDocument()
    expect(screen.getByText("Evidence points towards a genuine experience")).toBeInTheDocument()
    expect(screen.getByText("The evidence is inconclusive")).toBeInTheDocument()
    expect(screen.getByText("Evidence points towards a possible policy issue")).toBeInTheDocument()
    expect(container.textContent).toContain(
      "These are ProfileRelaunch assessment categories, not Google review statuses.",
    )

    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Plausibility" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Business records" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Specific details" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Relationships" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Patterns" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "An unfamiliar reviewer name is only one piece of information",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check whether the experience described is even possible" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Can the review be connected to a genuine interaction?" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Detail and vagueness can both mislead you" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A factual disagreement is not the same as a fake experience",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A real conflict of interest changes the assessment" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Several reviews can reveal a pattern that one review cannot",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A sudden cluster is not automatically review bombing" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not use the reviewer's Google profile as a shortcut",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Direct evidence is stronger than suspicion" })).toBeInTheDocument()

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
        name: /Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once/,
      }),
    ).toHaveAttribute("href", "/resources/google-review-bombing")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceProhibitedRestrictedContent.url,
      sourceFakeEngagement.url,
      sourceMapsUgcPolicy.url,
      sourceReportInappropriateReviews.url,
      sourceManageCustomerReviews.url,
    ])
    expect(sourceLinks).toHaveLength(5)

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
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/fake-google-review-or-genuine-negative-feedback",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–5 on their approved dedicated views", () => {
    const suspension = getPublishedResourceBySlug("google-business-profile-suspended-before-appeal")
    const suspensionBody = getResourceBody("google-business-profile-suspended-before-appeal")
    const { unmount: unmount1 } = render(
      <ResourceArticleView resource={suspension!} body={suspensionBody!} />,
    )
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
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
    const { unmount: unmount4 } = render(
      <ResourceArticleView resource={verification!} body={verificationBody!} />,
    )
    expect(screen.getByRole("heading", { name: "What is Google actually showing you?" })).toBeInTheDocument()
    unmount4()

    const removal = getPublishedResourceBySlug("can-a-google-review-be-removed")
    const removalBody = getResourceBody("can-a-google-review-be-removed")
    render(<ResourceArticleView resource={removal!} body={removalBody!} />)
    expect(
      screen.getByRole("heading", { name: "Which situation are you actually dealing with?" }),
    ).toBeInTheDocument()
  })

  it("leaves another Resource on the legacy template", () => {
    const other = getPublishedResourceBySlug("offered-to-remove-google-reviews-for-money")
    const otherBody = getResourceBody("offered-to-remove-google-reviews-for-money")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
