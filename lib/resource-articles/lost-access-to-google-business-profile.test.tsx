/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  lostAccessToGoogleBusinessProfileSlug,
  lostAccessToGoogleBusinessProfileSources,
} from "@/lib/resource-articles/lost-access-to-google-business-profile"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceDuplicateOwnershipIssues,
  sourceFindBusiness,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceRequestOwnership,
  sourceTransferPrimaryOwnership,
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

const ARTICLE_TITLE = "Lost Access to Your Google Business Profile: Ownership and Manager Options"

describe("Article #13 lost access to a Google Business Profile", () => {
  const resource = getPublishedResourceBySlug(lostAccessToGoogleBusinessProfileSlug)
  const body = getResourceBody(lostAccessToGoogleBusinessProfileSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(lostAccessToGoogleBusinessProfileSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("lost-access-to-google-business-profile")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("verification-access")
    expect(resource?.description).toBe(
      "Lost access to your Google Business Profile? Identify whether the problem is your Google Account, another owner, manager access or verification before requesting ownership or creating anything new.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(lostAccessToGoogleBusinessProfileSources).toHaveLength(7)
    expect(body?.sourcesUsed).toEqual(lostAccessToGoogleBusinessProfileSources)
    expect(body?.sourcesUsed).toEqual([
      sourceRequestOwnership,
      sourceOwnersManagers,
      sourceTransferPrimaryOwnership,
      sourceDuplicateOwnershipIssues,
      sourceProtectBusinessProfile,
      sourceFindBusiness,
      sourceVerifyBusiness,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Request ownership of a Business Profile",
      "Manage your Business Profile owners & managers",
      "Transfer primary ownership of a Business Profile",
      "Resolve duplicate profiles and ownership issues",
      "Help protect your Google Business Profile",
      "Find your business on Google",
      "Verify your business on Google",
    ])
    expect(body?.googleSays?.sources).toEqual([
      sourceRequestOwnership,
      sourceOwnersManagers,
      sourceProtectBusinessProfile,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceTransferPrimaryOwnership)
    expect(body?.googleSays?.sources).not.toContain(sourceDuplicateOwnershipIssues)
    expect(body?.googleSays?.sources).not.toContain(sourceFindBusiness)
    expect(body?.googleSays?.sources).not.toContain(sourceVerifyBusiness)
    expect(body?.urgentCallout).toBeUndefined()
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-verification-stuck-or-rejected",
    ])
    expect(
      getPublishedResourceBySlug("google-business-profile-verification-stuck-or-rejected"),
    ).toBeDefined()
  })

  it("renders approved copy, related Article #4, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("Manager access is not the same as owner access")
    expect(container.textContent).toContain("The current owner normally has three days to respond")
    expect(container.textContent).toContain("New owners and managers have a seven-day limitation")
    expect(
      screen.getByRole("heading", {
        name: "Recover the existing profile before you create anything new",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Request ownership of a Business Profile"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Manage your Business Profile owners & managers"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Help protect your Google Business Profile"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Transfer primary ownership of a Business Profile"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Find your business on Google"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Verify your business on Google"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(7)

    expect(
      screen.getByText("Google Business Profile Verification Stuck or Rejected: What to Check"),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
