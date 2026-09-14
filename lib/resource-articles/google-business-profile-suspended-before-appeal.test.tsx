/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourcesHub } from "@/app/resources/resources-hub"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  sourceAllPolicies,
  sourceAppealRestrictions,
  sourceBusinessAddress,
  sourceEligibility,
  sourceFixSuspended,
  sourceServiceAreas,
  suspensionBeforeAppealSlug,
  suspensionBeforeAppealSources,
} from "@/lib/resource-articles/google-business-profile-suspended-before-appeal"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceBySlug,
  getPublishedResources,
  isPublicResource,
} from "@/lib/resources"
import { primaryNav } from "@/lib/site-nav"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE = "Google Business Profile Suspended: What to Do Before You Appeal"

describe("Article #1 suspension pre-appeal guide", () => {
  const resource = getPublishedResourceBySlug(suspensionBeforeAppealSlug)
  const body = getResourceBody(suspensionBeforeAppealSlug)

  it("is a public production resource with approved metadata", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(true)
    expect(resource?.urgent).toBe(false)
    expect(resource?.readingMinutes).toBe(10)
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.description).toBe(
      "If your Google Business Profile has been suspended, check the restriction, eligibility, profile details and evidence before you submit an appeal.",
    )
    expect(isPublicResource(resource!, body)).toBe(true)
  })

  it("uses exactly six official Google Help sources and two What Google says cards", () => {
    expect(suspensionBeforeAppealSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(suspensionBeforeAppealSources)
    expect(body?.googleSays?.sources).toEqual([sourceFixSuspended, sourceAppealRestrictions])
    expect(suspensionBeforeAppealSources.map((source) => source.title)).toEqual([
      "Fix suspended or disabled profiles",
      "Appeal Business Profile content and profile restrictions",
      "Business eligibility and ownership guidelines",
      "Manage your service areas for service-area & hybrid businesses",
      "Manage your business address",
      "All Business Profile policies & guidelines",
    ])
    expect(
      suspensionBeforeAppealSources.every((source) => source.url.startsWith("https://support.google.com/")),
    ).toBe(true)
    expect(body?.googleSays?.sources).not.toContain(sourceEligibility)
    expect(body?.googleSays?.sources).not.toContain(sourceServiceAreas)
    expect(body?.googleSays?.sources).not.toContain(sourceBusinessAddress)
    expect(body?.googleSays?.sources).not.toContain(sourceAllPolicies)
  })

  it("renders the approved article, sources, CTA and no draft related cards", () => {
    const { container } = render(<ResourceArticleView resource={resource!} body={body!} />)

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.getByText("60-minute evidence window")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What comes directly from Google" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(screen.getByText("I don't know why Google suspended my profile")).toBeInTheDocument()

    expect(container.textContent).toContain("While an appeal is pending")
    expect(container.textContent).toContain("Prepare first and appeal second.")
    expect(container.textContent).not.toContain("View official Google guidance")
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(screen.getAllByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveLength(3)
    expect(screen.getByRole("link", { name: /See how Profile Recovery works/ })).toHaveAttribute("href", "/business-profile-recovery")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual(suspensionBeforeAppealSources.map((source) => source.url))
    expect(screen.getByText("Google Business Profile Help")).toBeInTheDocument()

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).not.toMatch(/null/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-13"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-14"')
  })

  it("emits Article and Breadcrumb JSON-LD with valid non-null dates", () => {
    const article = resourceArticleJsonLd(resource!)
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-13")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article).not.toHaveProperty("image")
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/google-business-profile-suspended-before-appeal",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("appears as the featured Profile Recovery guide on the Resources hub", () => {
    render(<ResourcesHub published={getPublishedResources()} />)
    expect(screen.getByRole("heading", { level: 2, name: ARTICLE_TITLE })).toBeInTheDocument()
    const guideLinks = screen.getAllByRole("link", { name: /read guide/i })
    expect(guideLinks[0]).toHaveAttribute(
      "href",
      "/resources/google-business-profile-suspended-before-appeal",
    )
    const publishedHrefs = getPublishedResources().map((item) => `/resources/${item.slug}`)
    for (const link of guideLinks) {
      expect(publishedHrefs).toContain(link.getAttribute("href"))
    }
  })

  it("keeps Resources out of the primary header", () => {
    expect(primaryNav.map((item) => item.href)).not.toContain("/resources")
    expect(primaryNav.map((item) => item.label)).not.toContain("Resources")
  })
})
