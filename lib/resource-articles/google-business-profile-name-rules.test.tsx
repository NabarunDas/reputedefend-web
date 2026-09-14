/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileNameRulesSlug,
  googleBusinessProfileNameRulesSources,
} from "@/lib/resource-articles/google-business-profile-name-rules"
import { getResourceBody } from "@/lib/resource-content"
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
    expect(resource?.commercialRoute).toBe("profile-recovery")
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
    expect(sourceOverviewBusinessProfilePolicies.name).toBe("Google Business Profile Help")
    expect(sourceOverviewBusinessProfilePolicies.title).toBe(
      "Overview of Google Business Profile policies",
    )
    expect(body?.googleSays?.sources).toEqual([
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
      sourceOverviewBusinessProfilePolicies,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceAllPolicies)
    expect(body?.googleSays?.sources).not.toContain(sourceFixSuspended)
    expect(body?.googleSays?.sources).not.toContain(sourceAppealRestrictions)
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-address-and-service-area-rules",
      "google-business-profile-categories",
    ])
    expect(
      getPublishedResourceBySlug("google-business-profile-address-and-service-area-rules"),
    ).toBeDefined()
    expect(getPublishedResourceBySlug("google-business-profile-categories")).toBeDefined()
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-address-and-service-area-rules",
      "google-business-profile-categories",
    ])
  })

  it("renders approved copy, related Articles #15 and #16, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("Start with the name customers recognise in the real world")
    expect(container.textContent).toContain("Your Business Profile name is not your service description")
    expect(container.textContent).toContain("A genuine rebrand is different from keyword stuffing")
    expect(
      screen.getByRole("heading", {
        name: "Make the Google name match the business — not the search query",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Guidelines for representing your business on Google"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Edit your Business Profile")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Overview of Google Business Profile policies"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("All Business Profile policies & guidelines"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Fix suspended or disabled profiles"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText(
        "Appeal Business Profile content and profile restrictions",
      ),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(6)

    const relatedSection = screen
      .getByRole("heading", { name: "Continue understanding your situation" })
      .closest("section")
    expect(
      within(relatedSection as HTMLElement).queryAllByRole("link", { name: /read guide/i }),
    ).toHaveLength(2)
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Address and Service-Area Rules Explained",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Categories: What You Should and Shouldn't Change",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
