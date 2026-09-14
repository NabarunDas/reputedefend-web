/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileNameRulesSlug,
  googleBusinessProfileNameRulesSources,
} from "@/lib/resource-articles/google-business-profile-name-rules"
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
  sourceAppealRestrictions,
  sourceEditBusinessProfile,
  sourceFixSuspended,
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

const ARTICLE_TITLE = "Google Business Profile Name Rules Explained"

describe("Article #14 Google Business Profile name rules", () => {
  const resource = getPublishedResourceBySlug(googleBusinessProfileNameRulesSlug)
  const body = getResourceBody(googleBusinessProfileNameRulesSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and six official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleBusinessProfileNameRulesSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-business-profile-name-rules")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.description).toBe(
      "Google Business Profile names should reflect the real-world name customers recognise. Learn what Google allows, what counts as name stuffing and what to check before changing your profile.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleBusinessProfileNameRulesSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(googleBusinessProfileNameRulesSources)
    expect(body?.sourcesUsed).toEqual([
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
      sourceOverviewBusinessProfilePolicies,
      sourceAllPolicies,
      sourceFixSuspended,
      sourceAppealRestrictions,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Guidelines for representing your business on Google",
      "Edit your Business Profile",
      "Overview of Google Business Profile policies",
      "All Business Profile policies & guidelines",
      "Fix suspended or disabled profiles",
      "Appeal Business Profile content and profile restrictions",
    ])
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-address-and-service-area-rules",
      "google-business-profile-categories",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-address-and-service-area-rules",
      "google-business-profile-categories",
    ])
  })

  it("renders the dedicated name-rules view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Which kind of name wording are you dealing with?" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Real-world name" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Needs context and evidence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Extra descriptive or promotional wording" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Start with identity, not SEO" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Start with the name customers recognise in the real world" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Keep information in the field designed for it" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Services and products do not automatically belong in the name" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A marketing slogan is not automatically part of the business name" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Opening hours and status belong in the hours fields" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Phone numbers and website addresses normally belong elsewhere" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "The legal company name and customer-facing name may differ" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Special characters are not automatically wrong" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A city or neighbourhood belongs in the name only when it genuinely belongs to the brand",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A competitor's listing is not evidence for your own name" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Build the name from evidence, not from one document" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Permanent signage can be useful evidence" })).toBeInTheDocument()
    expect(container.textContent).toContain("Create a temporary sign for a screenshot")
    expect(screen.getByRole("heading", { name: "Capitalisation should follow the genuine brand" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Internal store numbers do not automatically belong in the public name" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Multi-location businesses should follow the real brand structure" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A genuine rebrand is different from a Google-only keyword change" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A verified profile might need verification again after a name change" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("might")
    expect(
      screen.getByRole("heading", { name: "A materially different business may not be an ordinary name edit" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A rejected name edit is not automatically a suspended profile" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit accepted" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit pending or under review" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit not approved" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "If the profile is suspended, correct the naming issue before appealing" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If Google asks for evidence, make sure it supports the name you are asking Google to accept",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "The route for a rejected name edit can depend on the business location",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "UK or EEA" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Outside the UK or EEA" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not cycle through keyword variations while a decision is unresolved",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile naming, editing and appeal guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("Start your Review Protection assessment")
    expect(container.textContent).not.toContain("View official Google guidance")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your profile name reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: "See how Profile Recovery works" })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    expect(
      screen.getByRole("link", { name: /Google Business Profile Address and Service-Area Rules Explained/ }),
    ).toHaveAttribute("href", "/resources/google-business-profile-address-and-service-area-rules")
    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Categories: What You Should and Shouldn't Change/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-categories")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/3038177?hl=en-GB",
      "https://support.google.com/business/answer/3039617?hl=en-GB",
      "https://support.google.com/business/answer/13762416?hl=en-GB",
      "https://support.google.com/business/answer/7667250?hl=en-GB",
      "https://support.google.com/business/answer/4569145?hl=en-GB",
      "https://support.google.com/business/answer/13597551?hl=en-GB",
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
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-business-profile-name-rules")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–13 on their approved dedicated views", () => {
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
    const other = getPublishedResourceBySlug("google-business-profile-address-and-service-area-rules")
    const otherBody = getResourceBody("google-business-profile-address-and-service-area-rules")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
