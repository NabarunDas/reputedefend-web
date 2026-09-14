/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileCategoriesSlug,
  googleBusinessProfileCategoriesSources,
} from "@/lib/resource-articles/google-business-profile-categories"
import { getResourceBody } from "@/lib/resource-content"
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
    expect(resource?.commercialRoute).toBe("profile-recovery")
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
    expect(body?.googleSays?.sources).toEqual([
      sourceManageBusinessCategory,
      sourceRepresentBusinessGuidelines,
      sourceEditBusinessProfile,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceLocalRanking)
    expect(body?.googleSays?.sources).not.toContain(sourceOverviewBusinessProfilePolicies)
    expect(body?.googleSays?.sources).not.toContain(sourceAllPolicies)
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

  it("renders approved copy, related Articles #14 and #15, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain(
      "Choose the primary category for what the business actually is",
    )
    expect(container.textContent).toContain("Google currently allows up to nine additional categories")
    expect(container.textContent).toContain(
      "Categories affect relevance and local ranking — but they are not the whole ranking system",
    )
    expect(
      screen.getByRole("heading", {
        name: "Use categories to describe the business — not to chase every search",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Manage your business category"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Guidelines for representing your business on Google"),
    ).toBeInTheDocument()
    expect(within(googleSays as HTMLElement).getByText("Edit your Business Profile")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Tips to improve your local ranking on Google"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("All Business Profile policies & guidelines"),
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
      within(relatedSection as HTMLElement).getByText("Google Business Profile Name Rules Explained"),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Address and Service-Area Rules Explained",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
