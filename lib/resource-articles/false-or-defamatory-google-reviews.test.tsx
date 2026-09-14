/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  falseOrDefamatoryGoogleReviewsSlug,
  falseOrDefamatoryGoogleReviewsSources,
} from "@/lib/resource-articles/false-or-defamatory-google-reviews"
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
  sourceMapsPrivacy,
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

const ARTICLE_TITLE = "False or Defamatory Google Reviews: What Google Can — and Can't — Decide"

describe("Article #17 false or defamatory Google reviews", () => {
  const resource = getPublishedResourceBySlug(falseOrDefamatoryGoogleReviewsSlug)
  const body = getResourceBody(falseOrDefamatoryGoogleReviewsSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and seven official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(falseOrDefamatoryGoogleReviewsSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("false-or-defamatory-google-reviews")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.description).toBe(
      "A Google review can feel false or defamatory without automatically qualifying for removal. Learn the difference between Google's content policies and separate legal-removal questions.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(falseOrDefamatoryGoogleReviewsSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(falseOrDefamatoryGoogleReviewsSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProhibitedRestrictedContent,
      sourceMapsUgcPolicy,
      sourceReportInappropriateReviews,
      sourceLegalRemovals,
      sourceMapsPrivacy,
      sourceReportUserProfiles,
      sourceManageCustomerReviews,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Prohibited and restricted content",
      "Maps user-generated content policy",
      "Report inappropriate reviews on your Business Profile",
      "Legal removals",
      "Privacy",
      "Report inappropriate user profiles",
      "Manage customer reviews",
    ])
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "can-a-google-review-be-removed",
      "google-rejected-my-review-report",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "google-rejected-my-review-report",
    ])
  })

  it("renders the dedicated disagreement / policy / legal view, CTAs and structured data", () => {
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
      screen.getByRole("heading", { name: "Which question are you actually trying to answer?" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Ordinary disagreement or criticism" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google content-policy issue" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Separate legal question" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google's policy decision is not a court judgment" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain(
      "disagreement alone does not establish a Google policy violation",
    )
    expect(
      screen.getByRole("heading", {
        name: '"False", "fake" and "defamatory" are not interchangeable',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Fake review" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "False statement" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Defamatory statement" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Google's normal review process asks whether its content policies were violated",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Fake engagement is about genuine experience and manipulation",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: '"We cannot find this name" is not proof on its own' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A real customer can still make a statement the business says is false",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Not every factual disagreement becomes removable misrepresentation",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Separate opinion from factual allegation" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Primarily opinion" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Specific factual allegation" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Certain unsupported allegations of criminal or unethical conduct can raise a Google policy issue",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not answer a serious allegation with another unsupported accusation",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("You are committing fraud by posting this review.")
    expect(screen.getByRole("heading", { name: "Harassment is its own Google policy question" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Personal information can create a separate removal issue" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A review can contain ordinary criticism and one prohibited part",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Preserve the original review before building the case" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Keep the public review and the supporting business records separate",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review evidence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Business evidence" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "When identity is uncertain, say only what the records establish",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not manufacture evidence to make the review look false" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("Manufacture customer records")
    expect(
      screen.getByRole("heading", {
        name: "Use Google's normal review process for content-policy violations",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If Google finds no policy violation, use the one-time appeal carefully",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google's legal-removal process is separate" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google content-policy route" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Legal-removal route" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "ProfileRelaunch does not decide whether a review is legally defamatory",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("ProfileRelaunch does not provide legal advice")
    expect(
      screen.getByRole("heading", { name: "A legal allegation does not guarantee global removal" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Reporting the reviewer's profile is not another review appeal",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not use legal threats as an ordinary review-management tactic",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("Delete this or we will sue you.")
    expect(
      screen.getByRole("heading", {
        name: "If the review remains live, a professional response may be the right next step",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Sometimes the responsible recommendation is not to sell another removal attempt",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain(
      "There is no strong removal route we can responsibly recommend from the evidence provided.",
    )
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available review and Maps content guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("View official Google guidance")
    expect(container.textContent).not.toContain("Start your Profile Recovery assessment")

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
      screen.getByRole("link", { name: /Can a Google Review Be Removed\? What Google's Policy Actually Allows/ }),
    ).toHaveAttribute("href", "/resources/can-a-google-review-be-removed")
    expect(
      screen.getByRole("link", { name: /Google Rejected My Review Report: What Can You Do Next\?/ }),
    ).toHaveAttribute("href", "/resources/google-rejected-my-review-report")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/contributionpolicy/answer/7400114?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/7422880?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/16426540?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/7401426?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/9968060?hl=en-GB",
      "https://support.google.com/business/answer/4596773?hl=en-GB",
      "https://support.google.com/business/answer/3474050?hl=en-GB",
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
    expect(article.url).toBe("https://profilerelaunch.com/resources/false-or-defamatory-google-reviews")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–16 on their approved dedicated views", () => {
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
      ["google-rejected-my-review-report", "Start with the status Google actually shows"],
      ["lost-access-to-google-business-profile", "Which access problem do you actually have?"],
      ["google-business-profile-name-rules", "Which kind of name wording are you dealing with?"],
      ["google-business-profile-address-and-service-area-rules", "Which location model matches the real business?"],
      ["google-business-profile-categories", "Put each business fact in the right category layer"],
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
