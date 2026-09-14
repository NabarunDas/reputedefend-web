/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  lostAccessToGoogleBusinessProfileSlug,
  lostAccessToGoogleBusinessProfileSources,
} from "@/lib/resource-articles/lost-access-to-google-business-profile"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
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
  sourceRemoveBusinessProfile,
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(lostAccessToGoogleBusinessProfileSources).toHaveLength(8)
    expect(body?.sourcesUsed).toEqual(lostAccessToGoogleBusinessProfileSources)
    expect(body?.sourcesUsed).toEqual([
      sourceRequestOwnership,
      sourceOwnersManagers,
      sourceTransferPrimaryOwnership,
      sourceDuplicateOwnershipIssues,
      sourceProtectBusinessProfile,
      sourceFindBusiness,
      sourceVerifyBusiness,
      sourceRemoveBusinessProfile,
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-verification-stuck-or-rejected",
    ])
  })

  it("renders the dedicated access-recovery view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "Which access problem do you actually have?" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Wrong Google Account" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Business account login lost" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "You still have manager access" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Another owner controls the profile" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Access returned but Google asks for verification" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Access works, but the profile is suspended or restricted" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Do not start by creating another profile" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "First confirm that the existing Business Profile still exists" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check the legitimate Google Accounts the business has used" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "If you can open the profile, check People and access" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Primary owner" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Owner" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Manager" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Being a manager is not the same as being an owner" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "You can edit the Business Profile" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "You cannot change who has access" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not recover access by sharing somebody else's Google login",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If the original business Google Account cannot be opened, recover the account first",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If somebody else controls the verified profile, use Google's ownership process",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Storefront or hybrid business" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Service-area business without a customer-facing location" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "The current owner normally has three days to respond" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Approved" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Denied" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "No response" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: '"May" is important' })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Ownership recovery can still lead to verification" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not create a duplicate profile as an access workaround" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "A permanent ownership change is different from adding a manager" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "New owners and managers can face a seven-day restriction" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep business control when an agency manages the profile" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Never give an access-recovery provider your OTP or PIN" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Lost access and suspension are different problems" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep a simple ownership record after recovery" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile ownership, access and security guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("Start your Review Protection assessment")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your access case reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: "See how Profile Recovery works" })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Verification Stuck or Rejected: What to Check/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-verification-stuck-or-rejected")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      sourceRequestOwnership.url,
      sourceOwnersManagers.url,
      sourceTransferPrimaryOwnership.url,
      sourceDuplicateOwnershipIssues.url,
      sourceProtectBusinessProfile.url,
      sourceFindBusiness.url,
      sourceVerifyBusiness.url,
      sourceRemoveBusinessProfile.url,
    ])
    expect(sourceLinks).toHaveLength(8)

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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Verification & Access")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/lost-access-to-google-business-profile",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–12 on their approved dedicated views", () => {
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
    const other = getPublishedResourceBySlug("google-reviews-missing-or-disappeared")
    const otherBody = getResourceBody("google-reviews-missing-or-disappeared")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
