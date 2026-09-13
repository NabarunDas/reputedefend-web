/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  appealEvidenceChecklistSlug,
  appealEvidenceChecklistSources,
} from "@/lib/resource-articles/google-business-profile-appeal-evidence-checklist"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceAppealRestrictions,
  sourceEditBusinessProfile,
  sourceFixSuspended,
} from "@/lib/resource-sources/google-business-profile"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Business Profile Appeal Evidence Checklist"

describe("Article #2 appeal evidence checklist", () => {
  const resource = getPublishedResourceBySlug(appealEvidenceChecklistSlug)
  const body = getResourceBody(appealEvidenceChecklistSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(appealEvidenceChecklistSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.slug).toBe(appealEvidenceChecklistSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.description).toBe(
      "Preparing a Google Business Profile appeal? Use this evidence checklist to organise the right records before Google's time-limited evidence step.",
    )
    expect(resource?.readingMinutes).toBe(11)
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(appealEvidenceChecklistSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(appealEvidenceChecklistSources)
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Fix suspended or disabled profiles",
      "Appeal Business Profile content and profile restrictions",
      "Edit your Business Profile",
      "Business eligibility and ownership guidelines",
      "Manage your service areas for service-area & hybrid businesses",
      "Manage your business address",
    ])
    expect(body?.googleSays?.sources).toEqual([sourceFixSuspended, sourceAppealRestrictions])
    expect(body?.googleSays?.sources).not.toContain(sourceEditBusinessProfile)
    expect(related.map((item) => item.slug)).toContain("google-business-profile-suspended-before-appeal")
    expect(related.map((item) => item.slug)).not.toContain(
      "google-business-profile-verification-stuck-or-rejected",
    )
  })

  it("renders approved copy, related Article #1, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain(
      "Good appeal evidence is not the same thing as a large pile of documents.",
    )
    expect(container.textContent).toContain("give every document a job")
    expect(container.textContent).toContain(
      "The objective is truthful consistency, not visual similarity at any cost.",
    )
    expect(screen.getByRole("heading", { name: "A good evidence pack tells one consistent story" })).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ })).toHaveLength(
      2,
    )
    expect(within(googleSays as HTMLElement).queryByText("Edit your Business Profile")).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ })).toHaveLength(
      6,
    )

    expect(screen.getByText("Google Business Profile Suspended: What to Do Before You Appeal")).toBeInTheDocument()
    expect(
      screen.queryByText("Google Business Profile Verification Stuck or Rejected: What to Check"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
