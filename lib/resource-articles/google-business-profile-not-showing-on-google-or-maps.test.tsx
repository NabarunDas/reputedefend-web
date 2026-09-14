/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileNotShowingSlug,
  googleBusinessProfileNotShowingSources,
} from "@/lib/resource-articles/google-business-profile-not-showing-on-google-or-maps"
import { getResourceBody } from "@/lib/resource-content"
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

  it("is publish-ready with approved metadata", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleBusinessProfileNotShowingSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
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
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBeNull()
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.author).toBe("ProfileRelaunch")
  })

  it("cites the eight approved official sources in the approved order", () => {
    expect(googleBusinessProfileNotShowingSources).toHaveLength(8)
    expect(body?.sourcesUsed).toEqual(googleBusinessProfileNotShowingSources)
    expect(body?.sourcesUsed[0]).toBe(sourceFindBusiness)
    expect(body?.sourcesUsed[1]).toBe(sourceLocalRanking)
    expect(body?.sourcesUsed[2]).toBe(sourceVerifyBusiness)
    expect(body?.sourcesUsed[3]).toBe(sourceFixSuspended)
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
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Find your business on Google",
      "Tips to improve your local ranking on Google",
      "Verify your business on Google",
      "Fix suspended or disabled profiles",
      "Business eligibility and ownership guidelines",
      "Guidelines for representing your business on Google",
      "Edit your Business Profile",
      "Resolve duplicate profiles and ownership issues",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceFindBusiness,
      sourceLocalRanking,
      sourceFixSuspended,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceVerifyBusiness)
    expect(body?.googleSays?.sources).not.toContain(sourceEligibility)
    expect(body?.googleSays?.sources).not.toContain(sourceRepresentBusinessGuidelines)
    expect(body?.googleSays?.sources).not.toContain(sourceEditBusinessProfile)
    expect(body?.googleSays?.sources).not.toContain(sourceDuplicateOwnershipIssues)
  })

  it("renders approved copy, related Articles #1, #4 and #13, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("First separate “not showing” from “not ranking”")
    expect(container.textContent).toContain(
      "A new Business Profile may need time before ranking appears",
    )
    expect(container.textContent).toContain(
      "There is no way to request or pay Google for a better organic local ranking",
    )
    expect(
      screen.getByRole("heading", {
        name: "Find out what “not showing” actually means before you fix it",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Find your business on Google"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Tips to improve your local ranking on Google"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Fix suspended or disabled profiles"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Verify your business on Google"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Edit your Business Profile"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Resolve duplicate profiles and ownership issues"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(8)

    expect(resource?.relatedResourceSlugs).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-verification-stuck-or-rejected",
      "lost-access-to-google-business-profile",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-verification-stuck-or-rejected",
      "lost-access-to-google-business-profile",
    ])
    const relatedSection = screen
      .getByRole("heading", { name: "Continue understanding your situation" })
      .closest("section")
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Suspended: What to Do Before You Appeal",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Google Business Profile Verification Stuck or Rejected: What to Check",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Lost Access to Your Google Business Profile: Ownership and Manager Options",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(
      screen.getByRole("link", { name: /Start your Profile Recovery assessment/ }),
    ).toHaveAttribute("href", "/get-help?service=profile-recovery")
  })

  it("keeps the approved ranking boundaries in the copy", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )
    expect(container.textContent).toContain(
      "Google says local results are mainly based on relevance, distance and prominence",
    )
    expect(container.textContent).toContain(
      "We cannot guarantee a Maps position or sell privileged control over Google",
    )
  })
})
