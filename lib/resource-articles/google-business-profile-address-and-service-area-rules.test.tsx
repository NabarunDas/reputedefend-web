/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  addressAndServiceAreaRulesSlug,
  addressAndServiceAreaRulesSources,
} from "@/lib/resource-articles/google-business-profile-address-and-service-area-rules"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceBusinessAddress,
  sourceEditBusinessProfile,
  sourceEligibility,
  sourceOverviewBusinessProfilePolicies,
  sourceRepresentBusinessGuidelines,
  sourceServiceAreas,
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

const ARTICLE_TITLE = "Google Business Profile Address and Service-Area Rules Explained"

describe("Article #15 Google Business Profile address and service-area rules", () => {
  const resource = getPublishedResourceBySlug(addressAndServiceAreaRulesSlug)
  const body = getResourceBody(addressAndServiceAreaRulesSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and seven official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(addressAndServiceAreaRulesSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-business-profile-address-and-service-area-rules")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.description).toBe(
      "Learn when a Google Business Profile should show an address, when a service-area business should hide it, and how Google's storefront, virtual-office and service-area rules work.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(addressAndServiceAreaRulesSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(addressAndServiceAreaRulesSources)
    expect(body?.sourcesUsed).toEqual([
      sourceRepresentBusinessGuidelines,
      sourceBusinessAddress,
      sourceServiceAreas,
      sourceEditBusinessProfile,
      sourceEligibility,
      sourceVerifyBusiness,
      sourceOverviewBusinessProfilePolicies,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Guidelines for representing your business on Google",
      "Manage your business address",
      "Manage your service areas for service-area & hybrid businesses",
      "Edit your Business Profile",
      "Business eligibility and ownership guidelines",
      "Verify your business on Google",
      "Overview of Google Business Profile policies",
    ])
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-categories",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-categories",
    ])
  })

  it("renders the dedicated location-model view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Which location model matches the real business?" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Storefront$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Service-area business$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Hybrid$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "The location model should follow the business" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "First decide whether customers genuinely visit the location" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A storefront needs a genuine customer-facing location" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "A service-area business goes to the customer" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If customers are not served at the address, do not present it as a storefront",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A home-based business is not automatically ineligible" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "A genuine hybrid business does both" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Use the real physical business address" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Receiving post somewhere does not make it a business location" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "PO box" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Remote mailbox" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "A virtual office is not a shortcut into another city" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "A co-working space needs more than a membership" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "If the address is shown, permanent signage matters" })).toBeInTheDocument()
    expect(container.textContent).toContain("Digitally add signage to a photograph")
    expect(screen.getByRole("heading", { name: "Use the map pin to identify the real location" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Service areas describe where the business travels to customers" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google currently allows up to 20 service areas" })).toBeInTheDocument()
    expect(container.textContent).toContain("up to 20 service areas")
    expect(
      screen.getByRole("heading", { name: "Current service areas are not configured as a radius" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep the overall service area operationally realistic" }),
    ).toBeInTheDocument()
    expect(container.textContent).toContain("generally")
    expect(container.textContent).toContain("about")
    expect(screen.getByRole("heading", { name: "A service area does not create a physical office" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Physical location$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Service area$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "One business base does not justify a profile for every town served" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Genuinely separate staffed locations can be different" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Some age-restricted businesses have additional service-area limits" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Moving a verified business can require verification again" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A move usually does not require a second Business Profile" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "An address edit can be under review without the profile being suspended",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit submitted" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit under review or awaiting further action" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit not accepted or profile restricted" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Hiding an address does not mean inventing a location-free business" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not redesign the location setup purely for ranking" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Correct location problems before a suspension appeal" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile address, service-area, eligibility and verification guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("Start your Review Protection assessment")
    expect(container.textContent).not.toContain("View official Google guidance")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your location setup reviewed" })).toHaveAttribute(
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
      screen.getByRole("link", {
        name: /Google Business Profile Categories: What You Should and Shouldn't Change/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-categories")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/3038177?hl=en-GB",
      "https://support.google.com/business/answer/2853879?hl=en-GB",
      "https://support.google.com/business/answer/9157481?hl=en-GB",
      "https://support.google.com/business/answer/3039617?hl=en-GB",
      "https://support.google.com/business/answer/13763036?hl=en-GB",
      "https://support.google.com/business/answer/7107242?hl=en-GB",
      "https://support.google.com/business/answer/13762416?hl=en-GB",
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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/google-business-profile-address-and-service-area-rules",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–14 on their approved dedicated views", () => {
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
    const other = getPublishedResourceBySlug("google-business-profile-categories")
    const otherBody = getResourceBody("google-business-profile-categories")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
