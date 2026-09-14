/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  verificationStuckOrRejectedSlug,
  verificationStuckOrRejectedSources,
} from "@/lib/resource-articles/google-business-profile-verification-stuck-or-rejected"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceDuplicateOwnershipIssues,
  sourceEligibility,
  sourceRequestOwnership,
  sourceServiceAreas,
  sourceVerifyBusiness,
  sourceVideoVerification,
} from "@/lib/resource-sources/google-business-profile"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Business Profile Verification Stuck or Rejected: What to Check"

describe("Article #4 verification stuck or rejected", () => {
  const resource = getPublishedResourceBySlug(verificationStuckOrRejectedSlug)
  const body = getResourceBody(verificationStuckOrRejectedSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(verificationStuckOrRejectedSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe(verificationStuckOrRejectedSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("verification-access")
    expect(resource?.description).toBe(
      "If Google Business Profile verification is stuck or rejected, identify the exact verification state, check the requirements and follow the correct retry or support route.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(verificationStuckOrRejectedSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(verificationStuckOrRejectedSources)
    expect(body?.sourcesUsed).toEqual([
      sourceVerifyBusiness,
      sourceVideoVerification,
      sourceEligibility,
      sourceServiceAreas,
      sourceRequestOwnership,
      sourceDuplicateOwnershipIssues,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Verify your business on Google",
      "Verify your business with a video recording",
      "Business eligibility and ownership guidelines",
      "Manage your service areas for service-area & hybrid businesses",
      "Request ownership of a Business Profile",
      "Resolve duplicate profiles and ownership issues",
    ])
    expect(body?.googleSays?.sources).toEqual([sourceVerifyBusiness, sourceVideoVerification])
    expect(body?.googleSays?.sources).not.toContain(sourceEligibility)
    expect(body?.googleSays?.sources).not.toContain(sourceRequestOwnership)
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "lost-access-to-google-business-profile",
    ])
    expect(getPublishedResourceBySlug("lost-access-to-google-business-profile")).toBeDefined()
  })

  it("renders approved copy, related Articles #1 and #13, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain(
      "Google automatically determines which verification methods are available to a Business Profile.",
    )
    expect(container.textContent).toContain(
      "A waiting review, a rejected video and an ownership conflict require different next steps.",
    )
    expect(container.textContent).toContain(
      "Do not solve one compliance problem by creating another one.",
    )
    expect(
      screen.getByRole("heading", { name: "Fix the verification state you actually have" }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(2)
    expect(within(googleSays as HTMLElement).getByText("Verify your business on Google")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Verify your business with a video recording"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Request ownership of a Business Profile"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(6)

    expect(screen.getByText("Google Business Profile Suspended: What to Do Before You Appeal")).toBeInTheDocument()
    expect(
      screen.getByText("Lost Access to Your Google Business Profile: Ownership and Manager Options"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
