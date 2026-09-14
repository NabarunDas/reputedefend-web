/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileNotShowingSlug,
  googleBusinessProfileNotShowingSources,
} from "@/lib/resource-articles/google-business-profile-not-showing-on-google-or-maps"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceDuplicateOwnershipIssues,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceFindBusiness,
  sourceFixSuspended,
  sourceLocalRanking,
  sourceRepresentBusinessGuidelines,
  sourceVerifyBusiness,
} from "@/lib/resource-sources/google-business-profile"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Business Profile Not Showing on Google or Maps: What to Check"

describe("Article #19 Business Profile not showing", () => {
  const resource = getPublishedResourceBySlug(googleBusinessProfileNotShowingSlug)
  const body = getResourceBody(googleBusinessProfileNotShowingSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and eight official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleBusinessProfileNotShowingSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-business-profile-not-showing-on-google-or-maps")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.description).toBe(
      "Can't find your Google Business Profile on Search or Maps? Check verification, suspension, profile status, recent changes and local ranking before assuming the listing has disappeared.",
    )
    expect(resource?.excerpt).toBe(
      "How to tell whether your Business Profile is actually missing, suspended, unverified or simply not ranking for the search you tried.",
    )
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleBusinessProfileNotShowingSources).toHaveLength(8)
    expect(body?.sourcesUsed).toEqual(googleBusinessProfileNotShowingSources)
    expect(body?.sourcesUsed).toEqual([
      sourceFindBusiness,
      sourceLocalRanking,
      sourceVerifyBusiness,
      sourceFixSuspended,
      sourceEligibility,
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
      sourceDuplicateOwnershipIssues,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-verification-stuck-or-rejected",
      "lost-access-to-google-business-profile",
    ])
  })

  it("renders the dedicated visibility diagnostic view, CTAs and structured data", () => {
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
      screen.getByRole("heading", { name: 'What does "not showing" actually mean?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Found by exact business name" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Profile is public, but you cannot manage it" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google asks for verification" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google shows suspension or disablement" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "The profile is new or was edited recently" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Profile is healthy but weak in generic searches" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: '"Not showing" is a symptom' })).toBeInTheDocument()

    expect(
      screen.getByRole("heading", { name: 'First separate "not showing" from "not ranking"' }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Profile not publicly available" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Profile exists but generic search does not show it" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Search the exact business name first" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check Google Search and Google Maps separately" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Sign into the Google Account that should manage the profile" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Public visibility and management access are separate questions",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Public profile" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Management access" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check whether Google is asking for verification" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A verification request is not automatically a suspension" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Verification state" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Suspension / disabled state" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check for an actual suspension or disabled-profile notice" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not create a replacement profile while dealing with a suspension",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A new Business Profile may need time before ranking appears",
      }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to a month")
    expect(
      screen.getByRole("heading", { name: "This is timing guidance, not a ranking promise" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("Every new business will rank after one month")
    expect(
      screen.getByRole("heading", { name: "Recent business-information edits can take time to appear" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to three days")
    expect(container.textContent).toContain("Every visibility problem resolves within three days.")
    expect(
      screen.getByRole("heading", {
        name: "Do not keep changing the profile while Google is processing an accurate edit",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If the exact profile exists, broad-search visibility may be a ranking question",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Relevance is about how well the profile matches the search" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Distance means different searchers can see different results" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Prominence is another part of local visibility" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Think about local ranking as three different inputs" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "There is no way to request or pay Google for a better organic local ranking",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Complete and accurate information helps Google understand the business",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Check whether the business still qualifies for a Business Profile",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A legitimate business can still have a non-compliant Business Profile",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A hidden service-area address does not mean the profile disappeared",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Address hidden" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Profile hidden" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Duplicate or ownership problems can make the correct profile difficult to identify",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not diagnose local ranking from one manual search" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not keyword-stuff the business name to force visibility" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not keep changing category because one search did not show the profile",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "When Google confirms suspension, switch from ranking analysis to recovery",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "When customers can see the profile but the business cannot manage it, switch to access recovery",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A verified, public and compliant profile may simply have a visibility problem",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Not every low-ranking Business Profile needs a reinstatement service",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Match the next action to the actual profile state" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Verification required" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Suspended or disabled" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Public but inaccessible" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Recent accurate edit / new verified profile" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Verified, public and healthy" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile visibility, verification, local-ranking and policy guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("View official Google guidance")
    expect(container.textContent).not.toContain("Start your Review Protection assessment")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your visibility case reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: "See how Profile Recovery works" })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Suspended: What to Do Before You Appeal/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-suspended-before-appeal")
    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Verification Stuck or Rejected: What to Check/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-verification-stuck-or-rejected")
    expect(
      screen.getByRole("link", {
        name: /Lost Access to Your Google Business Profile: Ownership and Manager Options/,
      }),
    ).toHaveAttribute("href", "/resources/lost-access-to-google-business-profile")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/145585?hl=en-GB",
      "https://support.google.com/business/answer/7091?hl=en-GB",
      "https://support.google.com/business/answer/7107242?hl=en-GB",
      "https://support.google.com/business/answer/4569145?hl=en-GB",
      "https://support.google.com/business/answer/13763036?hl=en-GB",
      "https://support.google.com/business/answer/3038177?hl=en-GB",
      "https://support.google.com/business/answer/3039617?hl=en-GB",
      "https://support.google.com/business/answer/12756178?hl=en-GB",
    ])
    expect(sourceLinks).toHaveLength(8)

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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/google-business-profile-not-showing-on-google-or-maps",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–18 on their approved dedicated views", () => {
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
      ["false-or-defamatory-google-reviews", "Which question are you actually trying to answer?"],
      ["google-business-profile-scams", "What is the person asking you to do?"],
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
