/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  appealRejectedWhatNextSlug,
  appealRejectedWhatNextSources,
} from "@/lib/resource-articles/google-business-profile-appeal-rejected-what-next"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.category).toBe("profile-recovery")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(appealRejectedWhatNextSources).toHaveLength(5)
    expect(body?.sourcesUsed).toEqual(appealRejectedWhatNextSources)
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Fix suspended or disabled profiles",
      "Appeal Business Profile content and profile restrictions",
      "Guidelines for representing your business on Google",
      "Business eligibility and ownership guidelines",
      "All Business Profile policies & guidelines",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-evidence-checklist",
    ])
  })

  it("renders the dedicated rejected-appeal view, statuses, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 10 min read")).toBeInTheDocument()
    expect(screen.queryByText("Last reviewed: 14 September 2026")).not.toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 10 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(
      screen.getByRole("heading", { name: "First, check what status Google actually shows" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Submitted")).toBeInTheDocument()
    expect(screen.getByText("Approved")).toBeInTheDocument()
    expect(screen.getAllByText("Not approved").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Can't be appealed")).toBeInTheDocument()
    expect(screen.getByText("Eligible for appeal")).toBeInTheDocument()
    expect(screen.getByText("If your status still says Submitted")).toBeInTheDocument()
    expect(container.textContent).toContain("up to five working days")

    expect(
      screen.getByRole("heading", { name: "Were several profiles affected at the same time?" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: 'What does "additional review" mean?' })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: 'What if Google says "Can\'t be appealed"?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "If the business is in the EEA" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This section explains Google's published process. It is not legal advice.",
    )

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
    const evidenceLinks = screen.getAllByRole("link").filter(
      (link) => link.getAttribute("href") === "/resources/google-business-profile-appeal-evidence-checklist",
    )
    expect(evidenceLinks).toHaveLength(2)

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual(
      appealRejectedWhatNextSources.map((source) => source.url),
    )
    expect(sourceLinks).toHaveLength(5)
    expect(screen.getByRole("link", { name: "Fix suspended or disabled profiles" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/4569145?hl=en-GB",
    )
    expect(
      screen.getByRole("link", { name: "Appeal Business Profile content and profile restrictions" }),
    ).toHaveAttribute("href", "https://support.google.com/business/answer/13597551?hl=en-GB")
    expect(
      screen.getByRole("link", { name: "Guidelines for representing your business on Google" }),
    ).toHaveAttribute("href", "https://support.google.com/business/answer/3038177?hl=en-GB")
    expect(screen.getByRole("link", { name: "Business eligibility and ownership guidelines" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/13763036?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "All Business Profile policies & guidelines" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/7667250?hl=en-GB",
    )

    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain(
      "A rejected Google Business Profile appeal is not the moment to start sending the same case again and again.",
    )

    const jsonLd = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? "",
    )
    expect(jsonLd.some((item) => item.includes('"Article"'))).toBe(true)
    expect(jsonLd.some((item) => item.includes("BreadcrumbList"))).toBe(true)
    expect(jsonLd.join("")).not.toMatch(/FAQPage/)
    expect(jsonLd.join("")).toContain('"datePublished":"2026-09-13"')
    expect(jsonLd.join("")).toContain('"dateModified":"2026-09-14"')
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
      "https://profilerelaunch.com/resources/google-business-profile-appeal-rejected-what-next",
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
    expect(screen.queryByText("View official Google guidance")).not.toBeInTheDocument()
  })

  it("leaves Article 2 on the approved dedicated view", () => {
    const evidence = getPublishedResourceBySlug("google-business-profile-appeal-evidence-checklist")
    const evidenceBody = getResourceBody("google-business-profile-appeal-evidence-checklist")
    render(<ResourceArticleView resource={evidence!} body={evidenceBody!} />)
    expect(
      screen.getByRole("heading", { name: "Google Business Profile Appeal Evidence Checklist" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Build the pack before the clock starts" })).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 11 min read")).toBeInTheDocument()
    expect(screen.queryByText("View official Google guidance")).not.toBeInTheDocument()
  })

  it("leaves another Resource on the legacy template", () => {
    const other = getPublishedResourceBySlug("google-business-profile-not-showing-on-google-or-maps")
    const otherBody = getResourceBody("google-business-profile-not-showing-on-google-or-maps")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
