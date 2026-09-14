/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleReviewsMissingOrDisappearedSlug,
  googleReviewsMissingOrDisappearedSources,
} from "@/lib/resource-articles/google-reviews-missing-or-disappeared"
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
  sourceMissingDelayedReviews,
  sourceMoveReviewsAcrossProfiles,
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

const ARTICLE_TITLE = "Google Reviews Missing or Disappeared: Why It Happens and What You Can Do"

const DEDICATED_VIEWS = [
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
  ["false-or-defamatory-google-reviews", "Which question are you actually trying to answer?"],
  ["google-business-profile-scams", "What is the person asking you to do?"],
  ["google-business-profile-not-showing-on-google-or-maps", 'What does "not showing" actually mean?'],
  ["google-reviews-missing-or-disappeared", "What happened before the review went missing?"],
] as const

describe("Article #20 Google reviews missing or disappeared", () => {
  const resource = getPublishedResourceBySlug(googleReviewsMissingOrDisappearedSlug)
  const body = getResourceBody(googleReviewsMissingOrDisappearedSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and seven official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleReviewsMissingOrDisappearedSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-reviews-missing-or-disappeared")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.description).toBe(
      "Missing Google reviews can be delayed, removed for policy reasons or affected by profile changes. Learn what to check and when to contact Google support.",
    )
    expect(resource?.excerpt).toBe(
      "How to tell whether reviews are delayed, policy-removed, affected by a merge or move, or missing after Business Profile reinstatement.",
    )
    expect(resource?.category).toBe("reviews-reputation")
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleReviewsMissingOrDisappearedSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(googleReviewsMissingOrDisappearedSources)
    expect(body?.sourcesUsed).toEqual([
      sourceMissingDelayedReviews,
      sourceProhibitedRestrictedContent,
      sourceMoveReviewsAcrossProfiles,
      sourceReportInappropriateReviews,
      sourceMapsUgcPolicy,
      sourceFakeEngagement,
      sourceManageCustomerReviews,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "can-a-google-review-be-removed",
      "fake-google-review-or-genuine-negative-feedback",
      "google-business-profile-not-showing-on-google-or-maps",
    ])
  })

  it("renders the dedicated missing-review view, CTAs and structured data", () => {
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
      screen.getByRole("heading", { name: "What happened before the review went missing?" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "A new review never appeared" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "An older visible review disappeared" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Several reviews vanished after reinstatement" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Review count changed after profiles were merged" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Reviews are on another or older profile" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Customers cannot successfully leave reviews" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not promise restoration from the pattern alone" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "First identify what actually went missing" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A delayed review is not the same as a removed review" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Delayed" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Removed" })).toBeInTheDocument()
    expect(container.textContent).toContain("a few days")
    expect(
      screen.getByRole("heading", {
        name: "Google does not publish a guaranteed review-processing deadline",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Recently merged Business Profiles can temporarily show incomplete review totals",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Reviews removed for policy violations will not be restored" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google uses automated systems to detect review spam" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Google acknowledges that legitimate reviews can sometimes be removed by mistake",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Investigation route" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Restoration guarantee" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not try to beat Google's moderation by reposting variations",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Reviews missing after reinstatement have their own diagnostic clue",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Approximate is better than invented precision" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A business move can affect which profile holds the reviews",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not create another Business Profile merely because the business moved",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "An accidental duplicate can turn a missing-review problem into a transfer problem",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Not every business change qualifies for every old review to move",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A change of owner does not automatically erase the review history",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A minor legitimate business-name change does not automatically erase reviews",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Sometimes the customer-side submission is the problem" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Some profiles can temporarily have user-created content restricted",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A missing positive review is not the same problem as a visible review you want removed",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Missing-review case" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review-removal case" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Preserve evidence before contacting Google" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A screenshot proves history, not entitlement to restoration",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Delayed review appears" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Merged-profile reviews finish combining" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Eligible review transfer" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Possible mistaken removal investigated" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Policy removal remains removed" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not buy replacement reviews because genuine reviews disappeared",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not ask the same customer to keep reposting until one version survives",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "No independent provider can force reviews back into Google" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Diagnosis comes before selling recovery" }),
    ).toBeInTheDocument()
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
    expect(screen.getByRole("link", { name: "Get your missing-review case reviewed" })).toHaveAttribute(
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
        name: /Fake Google Review or Genuine Negative Feedback\? How to Tell the Difference/,
      }),
    ).toHaveAttribute("href", "/resources/fake-google-review-or-genuine-negative-feedback")
    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Not Showing on Google or Maps: What to Check/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-not-showing-on-google-or-maps")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Maps User Contributed Content Policy Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/10313341?hl=en-GB",
      "https://support.google.com/business/answer/3098204?hl=en-GB",
      "https://support.google.com/business/answer/4596773?hl=en-GB",
      "https://support.google.com/business/answer/3474050?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/7400114?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/7422880?hl=en-GB",
      "https://support.google.com/contributionpolicy/answer/11414422?hl=en-GB",
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
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/google-reviews-missing-or-disappeared",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("keeps all 20 redesigned Resources on their dedicated views", () => {
    expect(DEDICATED_VIEWS).toHaveLength(20)
    for (const [slug, heading] of DEDICATED_VIEWS) {
      const item = getPublishedResourceBySlug(slug)
      const itemBody = getResourceBody(slug)
      const { unmount } = render(<ResourceArticleView resource={item!} body={itemBody!} />)
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "The short version" })).not.toBeInTheDocument()
      unmount()
    }
  })
})
