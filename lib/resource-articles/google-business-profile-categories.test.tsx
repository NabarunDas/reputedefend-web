/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileCategoriesSlug,
  googleBusinessProfileCategoriesSources,
} from "@/lib/resource-articles/google-business-profile-categories"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceAllPolicies,
  sourceEditBusinessProfile,
  sourceLocalRanking,
  sourceManageBusinessCategory,
  sourceOverviewBusinessProfilePolicies,
  sourceRepresentBusinessGuidelines,
} from "@/lib/resource-sources/google-business-profile"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Business Profile Categories: What You Should and Shouldn't Change"

describe("Article #16 Google Business Profile categories", () => {
  const resource = getPublishedResourceBySlug(googleBusinessProfileCategoriesSlug)
  const body = getResourceBody(googleBusinessProfileCategoriesSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and six official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleBusinessProfileCategoriesSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-business-profile-categories")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.description).toBe(
      "Choose Google Business Profile categories that describe what your business actually is. Learn how primary and additional categories work and when changing them deserves caution.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleBusinessProfileCategoriesSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(googleBusinessProfileCategoriesSources)
    expect(body?.sourcesUsed).toEqual([
      sourceManageBusinessCategory,
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
      sourceLocalRanking,
      sourceOverviewBusinessProfilePolicies,
      sourceAllPolicies,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Manage your business category",
      "Guidelines for representing your business on Google",
      "Edit your Business Profile",
      "Tips to improve your local ranking on Google",
      "Overview of Google Business Profile policies",
      "All Business Profile policies & guidelines",
    ])
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-address-and-service-area-rules",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-address-and-service-area-rules",
    ])
  })

  it("uses the approved Google Business Profile Help titles for the two new sources", () => {
    expect(sourceManageBusinessCategory).toEqual({
      name: "Google Business Profile Help",
      title: "Manage your business category",
      url: "https://support.google.com/business/answer/7249669?hl=en-GB",
    })
    expect(sourceLocalRanking).toEqual({
      name: "Google Business Profile Help",
      title: "Tips to improve your local ranking on Google",
      url: "https://support.google.com/business/answer/7091?hl=en-GB",
    })
  })

  it("renders the dedicated category-layer view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Put each business fact in the right category layer" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: /^Primary category$/ })).toHaveLength(2)
    expect(screen.getAllByRole("heading", { name: /^Additional categories$/ })).toHaveLength(2)
    expect(screen.getByRole("heading", { name: "Services, products and amenities" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: 'Ask "what is the business?", not "what searches do we want?"',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Choose the primary category for what the business actually is" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Be specific when the specific category genuinely fits" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "You cannot create your own Google category" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "The primary category carries a different job from additional categories",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google currently allows up to nine additional categories" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("up to nine additional categories")
    expect(container.textContent).toContain("That is a maximum.")
    expect(container.textContent).toContain("It is not a target.")
    expect(screen.getByRole("heading", { name: "Do not add a category for every service" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Category$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Service$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: '"What the business has" is different from "what the business is"',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Additional categories can describe genuine secondary parts of the same business",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A separately operated business is not simply another category" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Categories can affect which Business Profile features appear" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Categories can affect relevance, but they are not the whole local-ranking system",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Relevance$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Distance$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Prominence$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not promise a ranking increase from a category change" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A top-ranking competitor does not choose your category for you" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Changing the primary category can be a meaningful profile edit" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A genuine operational change can justify a category change" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Adding or editing a category might require verification again" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("might")
    expect(
      screen.getByRole("heading", { name: "A verification request is not the same as a suspension" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Verification requested" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Category edit pending" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Category edit rejected" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Profile suspended or restricted" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not keep switching categories while Google is reviewing changes",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Comparable locations should usually follow the same real business classification",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Category is only one part of Business Profile compliance" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not create a new profile because a category edit was rejected",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review the category structure in this order" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Core business" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google category availability" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Secondary business functions" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Services and amenities" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Change risk" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile category, editing and local-ranking guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("Start your Review Protection assessment")
    expect(container.textContent).not.toContain("View official Google guidance")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your category setup reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: "See how Profile Recovery works" })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    expect(screen.getByRole("link", { name: /Google Business Profile Name Rules Explained/ })).toHaveAttribute(
      "href",
      "/resources/google-business-profile-name-rules",
    )
    expect(
      screen.getByRole("link", { name: /Google Business Profile Address and Service-Area Rules Explained/ }),
    ).toHaveAttribute("href", "/resources/google-business-profile-address-and-service-area-rules")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/7249669?hl=en-GB",
      "https://support.google.com/business/answer/3038177?hl=en-GB",
      "https://support.google.com/business/answer/3039617?hl=en-GB",
      "https://support.google.com/business/answer/7091?hl=en-GB",
      "https://support.google.com/business/answer/13762416?hl=en-GB",
      "https://support.google.com/business/answer/7667250?hl=en-GB",
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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-business-profile-categories")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–15 on their approved dedicated views", () => {
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
    const other = getPublishedResourceBySlug("false-or-defamatory-google-reviews")
    const otherBody = getResourceBody("false-or-defamatory-google-reviews")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
