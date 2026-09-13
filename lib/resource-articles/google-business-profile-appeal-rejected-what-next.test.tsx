/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  appealRejectedWhatNextSlug,
  appealRejectedWhatNextSources,
} from "@/lib/resource-articles/google-business-profile-appeal-rejected-what-next"
import { getResourceBody } from "@/lib/resource-content"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceAppealRestrictions,
  sourceFixSuspended,
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

const ARTICLE_TITLE = "Google Business Profile Appeal Rejected: What Can You Do Next?"

describe("Article #3 rejected appeal next steps", () => {
  const resource = getPublishedResourceBySlug(appealRejectedWhatNextSlug)
  const body = getResourceBody(appealRejectedWhatNextSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(appealRejectedWhatNextSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.slug).toBe(appealRejectedWhatNextSlug)
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.description).toBe(
      "If Google rejected your Business Profile appeal, check the decision, review the underlying policy issue and prepare genuinely useful evidence before requesting additional review.",
    )
    expect(resource?.readingMinutes).toBe(10)
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(appealRejectedWhatNextSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(appealRejectedWhatNextSources)
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Fix suspended or disabled profiles",
      "Appeal Business Profile content and profile restrictions",
      "Guidelines for representing your business on Google",
      "Business eligibility and ownership guidelines",
      "All Business Profile policies & guidelines",
    ])
    expect(body?.googleSays?.sources).toEqual([sourceFixSuspended, sourceAppealRestrictions])
    expect(body?.googleSays?.sources).not.toContain(sourceRepresentBusinessGuidelines)
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-evidence-checklist",
    ])
    expect(related.map((item) => item.slug)).not.toContain(
      "google-business-profile-verification-stuck-or-rejected",
    )
  })

  it("renders approved copy, related published guides, and the Profile Recovery CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.textContent).toContain(
      "A rejected appeal should trigger a diagnosis before it triggers another submission.",
    )
    expect(container.textContent).toContain("What did the first appeal fail to establish?")
    expect(container.textContent).not.toContain("Keep Article #1's principle")
    expect(container.textContent).toContain("additional review as guaranteed")
    expect(
      screen.getByRole("heading", {
        name: "A rejected appeal needs a better diagnosis, not a louder appeal",
      }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ })).toHaveLength(
      2,
    )
    expect(
      within(googleSays as HTMLElement).queryByText("Guidelines for representing your business on Google"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ })).toHaveLength(
      5,
    )

    expect(screen.getByText("Google Business Profile Suspended: What to Do Before You Appeal")).toBeInTheDocument()
    expect(screen.getByText("Google Business Profile Appeal Evidence Checklist")).toBeInTheDocument()
    expect(
      screen.queryByText("Google Business Profile Verification Stuck or Rejected: What to Check"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
  })
})
