/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  verificationStuckOrRejectedSlug,
  verificationStuckOrRejectedSources,
} from "@/lib/resource-articles/google-business-profile-verification-stuck-or-rejected"
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
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("profile-recovery")
    expect(resource?.datePublished).toBe("2026-09-13")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(verificationStuckOrRejectedSources).toHaveLength(6)
    expect(body?.sourcesUsed).toEqual(verificationStuckOrRejectedSources)
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Verify your business on Google",
      "Verify your business with a video recording",
      "Business eligibility and ownership guidelines",
      "Manage your service areas for service-area & hybrid businesses",
      "Request ownership of a Business Profile",
      "Resolve duplicate profiles and ownership issues",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "google-business-profile-suspended-before-appeal",
      "lost-access-to-google-business-profile",
    ])
  })

  it("renders the dedicated verification view, diagnostic states, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "What is Google actually showing you?" })).toBeInTheDocument()
    expect(screen.getByText("Verification is still under review")).toBeInTheDocument()
    expect(screen.getByText("Get verified has appeared again")).toBeInTheDocument()
    expect(screen.getByText("Your video says Review issues")).toBeInTheDocument()
    expect(screen.getByText("Google is asking you to re-verify")).toBeInTheDocument()
    expect(screen.getByText("No workable verification method appears")).toBeInTheDocument()
    expect(screen.getByText("Someone else already owns the profile")).toBeInTheDocument()
    expect(container.textContent).toContain("up to five working days")
    expect(container.textContent).toContain("Get verified")
    expect(container.textContent).toContain("Review issues")
    expect(container.textContent).toContain("at least 30 seconds long")
    expect(screen.getByText("Do not expose a private address just to pass verification")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "If Google offers phone, email or mail" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep verification codes and account access private" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Check whether this is really an ownership problem" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Verification and suspension are different problems" }),
    ).toBeInTheDocument()

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
        name: /Lost Access to Your Google Business Profile: Ownership and Manager Options/,
      }),
    ).toHaveAttribute("href", "/resources/lost-access-to-google-business-profile")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(container.textContent).not.toContain("View official Google guidance")
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual(
      verificationStuckOrRejectedSources.map((source) => source.url),
    )
    expect(sourceLinks).toHaveLength(6)
    expect(screen.getByRole("link", { name: "Verify your business on Google" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/7107242?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Verify your business with a video recording" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/14271705?hl=en-GB",
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
    expect(screen.getByRole("link", { name: "Request ownership of a Business Profile" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/4566671?hl=en-GB",
    )
    expect(screen.getByRole("link", { name: "Resolve duplicate profiles and ownership issues" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/answer/12756178?hl=en-GB",
    )

    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).not.toContain("How these guides are produced")

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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Verification & Access")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-13")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe(
      "https://profilerelaunch.com/resources/google-business-profile-verification-stuck-or-rejected",
    )
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("leaves Articles 1–3 on their approved dedicated views", () => {
    const suspension = getPublishedResourceBySlug("google-business-profile-suspended-before-appeal")
    const suspensionBody = getResourceBody("google-business-profile-suspended-before-appeal")
    const { unmount: unmount1 } = render(
      <ResourceArticleView resource={suspension!} body={suspensionBody!} />,
    )
    expect(screen.getByRole("heading", { name: "Before you appeal" })).toBeInTheDocument()
    expect(screen.queryByText("View official Google guidance")).not.toBeInTheDocument()
    unmount1()

    const evidence = getPublishedResourceBySlug("google-business-profile-appeal-evidence-checklist")
    const evidenceBody = getResourceBody("google-business-profile-appeal-evidence-checklist")
    const { unmount: unmount2 } = render(
      <ResourceArticleView resource={evidence!} body={evidenceBody!} />,
    )
    expect(screen.getByRole("heading", { name: "Build the pack before the clock starts" })).toBeInTheDocument()
    unmount2()

    const rejected = getPublishedResourceBySlug("google-business-profile-appeal-rejected-what-next")
    const rejectedBody = getResourceBody("google-business-profile-appeal-rejected-what-next")
    render(<ResourceArticleView resource={rejected!} body={rejectedBody!} />)
    expect(
      screen.getByRole("heading", { name: "First, check what status Google actually shows" }),
    ).toBeInTheDocument()
  })

  it("leaves the remaining redesigned Resource on its dedicated view", () => {
    const other = getPublishedResourceBySlug("google-reviews-missing-or-disappeared")
    const otherBody = getResourceBody("google-reviews-missing-or-disappeared")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "What happened before the review went missing?" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "The short version" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "How these guides are produced" })).not.toBeInTheDocument()
  })
})
