/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  addressAndServiceAreaRulesSlug,
  addressAndServiceAreaRulesSources,
} from "@/lib/resource-articles/google-business-profile-address-and-service-area-rules"
import { getResourceBody } from "@/lib/resource-content"
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
    expect(resource?.commercialRoute).toBe("profile-recovery")
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
    expect(body?.googleSays?.sources).toEqual([
      sourceRepresentBusinessGuidelines,
      sourceBusinessAddress,
      sourceServiceAreas,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceEditBusinessProfile)
    expect(body?.googleSays?.sources).not.toContain(sourceEligibility)
    expect(body?.googleSays?.sources).not.toContain(sourceVerifyBusiness)
    expect(body?.googleSays?.sources).not.toContain(sourceOverviewBusinessProfilePolicies)
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-categories",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-name-rules",
      "google-business-profile-categories",
    ])
    expect(getPublishedResourceBySlug("google-business-profile-name-rules")).toBeDefined()
    expect(getPublishedResourceBySlug("google-business-profile-categories")).toBeDefined()
  })

  it("renders approved copy, related Articles #14 and #16, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("First decide whether customers actually visit your location")
    expect(container.textContent).toContain("A virtual office is not a shortcut into another city")
    expect(container.textContent).toContain("Google currently allows up to 20 service areas")
    expect(
      screen.getByRole("heading", { name: "Show customers how the business really operates" }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Guidelines for representing your business on Google"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Manage your business address")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText(
        "Manage your service areas for service-area & hybrid businesses",
      ),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Business eligibility and ownership guidelines"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Overview of Google Business Profile policies"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(screen.getByText("Google Business Profile Name Rules Explained")).toBeInTheDocument()
    expect(
      screen.getByText("Google Business Profile Categories: What You Should and Shouldn't Change"),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
