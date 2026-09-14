/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileScamsSlug,
  googleBusinessProfileScamsSources,
} from "@/lib/resource-articles/google-business-profile-scams"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import {
  getPublishedResourceArticle,
  getPublishedResourceBySlug,
  isPublicResource,
  relatedPublishedResources,
} from "@/lib/resources"
import {
  sourceBusinessProfileThirdPartyPolicies,
  sourceFraudulentCallsTexts,
  sourceOwnersManagers,
  sourceProtectBusinessProfile,
  sourceSecureCompromisedGoogleAccount,
  sourceTransferPrimaryOwnership,
  sourceVerifyBusiness,
  sourceWorkingWithThirdParties,
} from "@/lib/resource-sources/google-business-profile"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

afterEach(() => {
  cleanup()
})

const ARTICLE_TITLE =
  "Google Business Profile Scams: Passwords, OTPs, Fake Calls and Manager Access Requests"

describe("Article #18 Google Business Profile scams", () => {
  const resource = getPublishedResourceBySlug(googleBusinessProfileScamsSlug)
  const body = getResourceBody(googleBusinessProfileScamsSlug)
  const related = resource ? relatedPublishedResources(resource) : []

  it("is publish-ready with approved metadata and eight official sources", () => {
    expect(resource).toBeDefined()
    expect(body).toBeDefined()
    expect(getPublishedResourceArticle(googleBusinessProfileScamsSlug)).toEqual({ resource, body })
    expect(isPublicResource(resource!, body)).toBe(true)
    expect(resource?.published).toBe(true)
    expect(resource?.featured).toBe(false)
    expect(resource?.urgent).toBe(false)
    expect(resource?.slug).toBe("google-business-profile-scams")
    expect(resource?.title).toBe(ARTICLE_TITLE)
    expect(resource?.seoTitle).toBe(ARTICLE_TITLE)
    expect(resource?.category).toBe("review-abuse-scams")
    expect(resource?.description).toBe(
      "Learn how to recognise Google Business Profile scams involving fake support calls, passwords, OTPs, verification codes, manager requests and third-party impersonation.",
    )
    expect(resource?.readingMinutes).toBe(12)
    expect(resource?.author).toBe("ProfileRelaunch")
    expect(resource?.commercialRoute).toBe("review-protection")
    expect(resource?.datePublished).toBe("2026-09-14")
    expect(resource?.dateReviewed).toBe("2026-09-14")
    expect(resource?.dateModified).toBe("2026-09-14")
    expect(googleBusinessProfileScamsSources).toHaveLength(8)
    expect(body?.sourcesUsed).toEqual(googleBusinessProfileScamsSources)
    expect(body?.sourcesUsed).toEqual([
      sourceProtectBusinessProfile,
      sourceFraudulentCallsTexts,
      sourceOwnersManagers,
      sourceVerifyBusiness,
      sourceWorkingWithThirdParties,
      sourceBusinessProfileThirdPartyPolicies,
      sourceSecureCompromisedGoogleAccount,
      sourceTransferPrimaryOwnership,
    ])
    expect(body?.sourcesUsed.map((source) => source.title)).toEqual([
      "Help protect your Google Business Profile",
      "Help protect against fraudulent calls and texts",
      "Manage your Business Profile owners & managers",
      "Verify your business on Google",
      "Tips for working with third parties to manage your Business Profile",
      "Business Profile third-party policies",
      "Secure a hacked or compromised Google Account",
      "Transfer primary ownership of a Business Profile",
    ])
    expect(body?.urgentCallout).toBeUndefined()
    expect(resource?.relatedResourceSlugs).toEqual([
      "offered-to-remove-google-reviews-for-money",
      "lost-access-to-google-business-profile",
    ])
    expect(related.map((item) => item.slug)).toEqual([
      "offered-to-remove-google-reviews-for-money",
      "lost-access-to-google-business-profile",
    ])
  })

  it("uses the approved titles and URLs for the two new sources", () => {
    expect(sourceFraudulentCallsTexts).toEqual({
      name: "Google Business Profile Help",
      title: "Help protect against fraudulent calls and texts",
      url: "https://support.google.com/business/answer/6212928?hl=en-GB",
    })
    expect(sourceSecureCompromisedGoogleAccount).toEqual({
      name: "Google Account Help",
      title: "Secure a hacked or compromised Google Account",
      url: "https://support.google.com/accounts/answer/6294825?hl=en-GB",
    })
  })

  it("renders the dedicated request-diagnostic view, CTAs and structured data", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read")).toBeInTheDocument()
    expect(screen.getByText("Last reviewed 14 September 2026 · 12 min read").textContent).not.toContain(
      "ProfileRelaunch",
    )

    expect(screen.getByRole("heading", { name: "What is the person asking you to do?" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Password, OTP or security code" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Owner or Manager access" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Payment$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Urgent Google warning" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "You already shared something" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Never trade account security for urgency" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Google can genuinely call businesses" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Public Business Profile knowledge does not prove Google access",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Google says it will never ask for your OTP or PIN" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Keep Business Profile verification codes private too" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A legitimate Business Profile provider should not need your Google Account password",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "An Owner or Manager request grants real access" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Use the minimum appropriate Business Profile role" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Manager$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Owner$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Primary ownership should stay under deliberate business control",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not test an unknown requester by granting access" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A private service fee is different from a supposed mandatory Google fee",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Legitimate third-party commercial fee" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Supposed mandatory Google payment" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A legitimate third party should identify itself as a third party",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If somebody claims to work for Google, verify the claim independently",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Urgency does not justify handing over credentials" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Check what Google actually shows instead of trusting the caller's description",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review People and access regularly" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "A legitimate agency relationship should leave the business with control",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If you already shared a password, secure the Google Account first",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Secure the Google Account" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Review security activity" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Strengthen authentication" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Check Business Profile access" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If you shared an OTP or code, do not assume the risk ended when the code expired",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If suspicious Business Profile access was approved, inspect what changed",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "If you cannot remove suspicious access, check your own role first",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Google Account security and Business Profile access are related but separate",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Google Account$/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^Business Profile$/ })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Do not create a replacement Business Profile after a security incident",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Preserve suspicious-contact evidence without preserving authentication secrets",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Useful evidence" })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Do not store or forward as ordinary case evidence" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "ProfileRelaunch should never request authentication secrets",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        name: "Sometimes the first problem to solve is security, not reinstatement",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "About this guide" })).toBeInTheDocument()
    expect(container.textContent).toContain(
      "This guide is based on Google's publicly available Business Profile security, access, verification, third-party and Google Account guidance and was last reviewed on 14 September 2026. ProfileRelaunch is independent of Google.",
    )
    expect(container.textContent).toContain("Do not send a Business Profile verification code to ProfileRelaunch.")
    expect(container.textContent).not.toContain("How these guides are produced")
    expect(container.textContent).not.toContain("View official Google guidance")
    expect(container.textContent).not.toContain("Start your Profile Recovery assessment")

    const assessmentLinks = screen.getAllByRole("link", { name: "Start your Review Protection assessment" })
    expect(assessmentLinks).toHaveLength(2)
    for (const link of assessmentLinks) {
      expect(link).toHaveAttribute("href", "/get-help?service=review")
    }
    expect(screen.getByRole("link", { name: "Get the access request reviewed" })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
    expect(screen.getByRole("link", { name: "See how Review Protection works" })).toHaveAttribute(
      "href",
      "/review-protection",
    )

    expect(
      screen.getByRole("link", {
        name: /Someone Offered to Remove My Google Reviews for Money: What Should I Check\?/,
      }),
    ).toHaveAttribute("href", "/resources/offered-to-remove-google-reviews-for-money")
    expect(
      screen.getByRole("link", {
        name: /Lost Access to Your Google Business Profile: Ownership and Manager Options/,
      }),
    ).toHaveAttribute("href", "/resources/lost-access-to-google-business-profile")

    expect(screen.getByRole("heading", { name: "Official Google sources" })).toBeInTheDocument()
    expect(screen.getAllByText("Google Business Profile Help")).toHaveLength(1)
    expect(screen.getAllByText("Google Account Help")).toHaveLength(1)
    const sourceLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("target") === "_blank")
    expect(sourceLinks.map((link) => link.getAttribute("href"))).toEqual([
      "https://support.google.com/business/answer/14509283?hl=en-GB",
      "https://support.google.com/business/answer/6212928?hl=en-GB",
      "https://support.google.com/business/answer/3403100?hl=en-GB",
      "https://support.google.com/business/answer/7107242?hl=en-GB",
      "https://support.google.com/business/answer/7163406?hl=en-GB",
      "https://support.google.com/business/answer/7353941?hl=en-GB",
      "https://support.google.com/business/answer/3415281?hl=en-GB",
      "https://support.google.com/accounts/answer/6294825?hl=en-GB",
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
    const breadcrumbs = resourceBreadcrumbJsonLd(resource!, "Review Abuse & Scams")
    expect(article["@type"]).toBe("Article")
    expect(article.datePublished).toBe("2026-09-14")
    expect(article.dateModified).toBe("2026-09-14")
    expect(article.author).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(article.publisher).toMatchObject({ "@type": "Organization", name: "ProfileRelaunch" })
    expect(JSON.stringify(article)).not.toMatch(/FAQPage/)
    expect(JSON.stringify(article)).not.toMatch(/null/)
    expect(article.url).toBe("https://profilerelaunch.com/resources/google-business-profile-scams")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")
    expect(breadcrumbs.itemListElement).toHaveLength(3)
  })

  it("never asks customers for credentials", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )
    expect(container.textContent).toContain("Do not send a provider:")
    expect(container.textContent).toContain("Google Account password")
    expect(container.textContent).toContain("ProfileRelaunch should never request")
    expect(container.textContent).toContain("Do not send a Business Profile verification code to ProfileRelaunch.")
  })

  it("leaves Articles 1–17 on their approved dedicated views", () => {
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
      ["lost-access-to-google-business-profile", "Which access problem do you actually have?"],
      ["google-business-profile-name-rules", "Which kind of name wording are you dealing with?"],
      ["google-business-profile-address-and-service-area-rules", "Which location model matches the real business?"],
      ["google-business-profile-categories", "Put each business fact in the right category layer"],
      ["false-or-defamatory-google-reviews", "Which question are you actually trying to answer?"],
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
    const other = getPublishedResourceBySlug("google-business-profile-not-showing-on-google-or-maps")
    const otherBody = getResourceBody("google-business-profile-not-showing-on-google-or-maps")
    render(<ResourceArticleView resource={other!} body={otherBody!} />)
    expect(screen.getByRole("heading", { name: "The short version" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "What Google says" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "How these guides are produced" })).toBeInTheDocument()
  })
})
