/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  appealEvidenceChecklistSlug,
  appealEvidenceChecklistSources,
} from "@/lib/resource-articles/google-business-profile-appeal-evidence-checklist"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"

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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
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
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-rejected-what-next",
    ])
  })

  it("renders the dedicated evidence view, sources, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.queryByText("Last reviewed: 14 September 2026")).not.toBeInTheDocument()
    expect(screen.queryByText("About 11 min read")).not.toBeInTheDocument()
    const meta = screen.getByText("Last reviewed 14 September 2026 · 11 min read")
    expect(meta.textContent).not.toContain("ProfileRelaunch")

    expect(screen.getByRole("heading", { name: "Build the pack before the clock starts" })).toBeInTheDocument()
    expect(screen.getByText("Confirm the right profile and account")).toBeInTheDocument()
    expect(screen.getByText("Save Google's restriction details")).toBeInTheDocument()
    expect(screen.getByText("Check the profile itself")).toBeInTheDocument()
    expect(screen.getByText("Match evidence to facts")).toBeInTheDocument()
    expect(screen.getByText("Open the evidence form when ready")).toBeInTheDocument()
    expect(screen.getByText("01")).toBeInTheDocument()
    expect(screen.getByText("05")).toBeInTheDocument()

    expect(screen.getByRole("heading", { name: "Official business registration" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Business licence" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Tax certificates" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Business utility bills" })).toBeInTheDocument()
    expect(container.textContent).toContain("Google gives examples such as electricity, phone and internet bills.")

    expect(screen.getByText("60-minute evidence window")).toBeInTheDocument()
    expect(container.textContent).toContain("Have the files ready first.")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Profile Recovery assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=profile-recovery")
    }
    expect(screen.getByRole("link", { name: "Get your case reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=profile-recovery",
    )
    expect(screen.getByRole("link", { name: "See how Profile Recovery works" })).toHaveAttribute(
      "href",
      "/business-profile-recovery",
    )

    expect(
      screen.getByRole("link", { name: /Google Business Profile Suspended: What to Do Before You Appeal/ }),
    ).toHaveAttribute("href", "/resources/google-business-profile-suspended-before-appeal")
    expect(
      screen.getByRole("link", {
        name: /Google Business Profile Appeal Rejected: What Can You Do Next\?/,
      }),
    ).toHaveAttribute("href", "/resources/google-business-profile-appeal-rejected-what-next")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual(
      appealEvidenceChecklistSources.map((source) => source.url),
    )
    expect(screen.getByRole("link", { name: "Fix suspended or disabled profiles" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/4569145?hl=en-GB",
    )
    expect(
      screen.getByRole("link", { name: "Appeal Business Profile content and profile restrictions" }),
    ).toHaveAttribute("href", "https://support.google.com/business/answer/13597551?hl=en-GB")
    expect(screen.getByRole("link", { name: "Edit your Business Profile" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/3039617?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Business eligibility and ownership guidelines" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/13763036?hl=en-GB",
    )
    expect(
      screen.getByRole("link", {
        name: "Manage your service areas for service-area & hybrid businesses",
      }),
    ).toHaveAttribute("href", "https://support.google.com/business/answer/9157481?hl=en-GB")
    expect(screen.getByRole("link", { name: "Manage your business address" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/2853879?hl=en-GB",
    )

    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("Good appeal evidence is not the same thing as a large pile of documents.")

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-13"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-14"')
    expect(jsonLd.join("")).toContain("ProfileRelaunch")
  })

  it("emits Article and Breadcrumb JSON-LD with valid dates and publisher", () => {
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
      "https://profilerelaunch.com/resources/google-business-profile-appeal-evidence-checklist",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Article 1 on the approved dedicated view", () => {
    const suspension = getPublishedResourceBySlug("google-business-profile-suspended-before-appeal")
    const suspensionBody = getResourceBody("google-business-profile-suspended-before-appeal")
    render(<ResourceArticleView resource={suspension!} body={suspensionBody!} />)
    expect(
      screen.getByRole("heading", { name: "Google Business Profile Suspended: What to Do Before You Appeal" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 10 min read")).toBeInTheDocument()
    expect(screen.queryByText("View official Google guidance")).not.toBeInTheDocument()
  })

  it("leaves another Resource on the legacy template", () => {
    const other = getPublishedResourceBySlug("google-business-profile-address-and-service-area-rules")
    const otherBody = getResourceBody("google-business-profile-address-and-service-area-rules")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
    expect(screen.getByText(/Last reviewed: 14 September 2026/)).toBeInTheDocument()
  })
})
