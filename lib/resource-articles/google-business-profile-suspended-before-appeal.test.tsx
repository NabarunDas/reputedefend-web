/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
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
    expect(resource?.dateReviewed).toBe("2026-09-13")
    expect(resource?.dateModified).toBeNull()
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.description).toBe(
      "If your Google Business Profile is suspended, do not rush the appeal. Check eligibility, profile accuracy and evidence before using Google's appeals tool.",
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
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What this means for your business" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you act" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Practical checklist" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Where businesses commonly go wrong" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Official sources" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "I don't know why Google suspended my profile" }),
    ).toBeInTheDocument()

    expect(container.textContent).toContain("speed and haste are not the same thing")
    expect(container.textContent).toContain(
      "use evidence to demonstrate facts, not to overwhelm the reviewer",
    )
    expect(container.textContent).toContain(
      "not speculation about Google's internal enforcement systems",
    )
    expect(container.textContent).toContain(
      "The goal is accuracy, not finding a configuration that appears easier to approve.",
    )

    expect(screen.queryByText("Google Partner")).not.toBeInTheDocument()
    expect(screen.queryByText(/Google-certified/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Coming soon/i)).not.toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(googleSays).not.toBeNull()
    expect(within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ })).toHaveLength(
      2,
    )
    expect(within(googleSays as HTMLElement).getByText("Fix suspended or disabled profiles")).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Appeal Business Profile content and profile restrictions"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Business eligibility and ownership guidelines"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(bibliography).not.toBeNull()
    const bibLinks = within(bibliography as HTMLElement).getAllByRole("link", {
      name: /View official Google guidance/,
    })
    expect(bibLinks).toHaveLength(6)
    expect(bibLinks.map((link) => link.getAttribute("href"))).toEqual(
      suspensionBeforeAppealSources.map((source) => source.url),
    )
    bibLinks.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    })

    expect(screen.getByRole("link", { name: /Start your Profile Recovery assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: /Explore Profile Recovery/ })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).not.toMatch(/null/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-13"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-13"')
  })

  it("emits Article and Breadcrumb JSON-LD with valid non-null dates", () => {
    const article = resourceArticleJsonLd(resource!)
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Profile Recovery")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-13")
    expect(article.dateModified).toBe("2026-09-13")
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
    expect(
      screen.queryByText("Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once"),
    ).not.toBeInTheDocument()
  })

  it("keeps Resources out of the primary header", () => {
    expect(primaryNav.map((item) => item.href)).not.toContain("/resources")
    expect(primaryNav.map((item) => item.label)).not.toContain("Resources")
  })
})
