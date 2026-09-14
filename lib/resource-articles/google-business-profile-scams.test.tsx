/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import {
  googleBusinessProfileScamsSlug,
  googleBusinessProfileScamsSources,
} from "@/lib/resource-articles/google-business-profile-scams"
import { getResourceBody } from "@/lib/resource-content"
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
    expect(resource?.commercialRoute).toBe("review-protection")
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
    expect(body?.googleSays?.sources).toEqual([
      sourceProtectBusinessProfile,
      sourceFraudulentCallsTexts,
      sourceOwnersManagers,
    ])
    expect(body?.googleSays?.sources).toHaveLength(3)
    expect(body?.googleSays?.sources).not.toContain(sourceVerifyBusiness)
    expect(body?.googleSays?.sources).not.toContain(sourceWorkingWithThirdParties)
    expect(body?.googleSays?.sources).not.toContain(sourceBusinessProfileThirdPartyPolicies)
    expect(body?.googleSays?.sources).not.toContain(sourceSecureCompromisedGoogleAccount)
    expect(body?.googleSays?.sources).not.toContain(sourceTransferPrimaryOwnership)
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

  it("renders approved copy, related Articles #11 and #13, and the Review Protection CTA", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ARTICLE_TITLE)
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(screen.queryByLabelText("Urgent situation")).not.toBeInTheDocument()
    expect(container.textContent).toContain("Google can genuinely call businesses")
    expect(container.textContent).toContain("Google says it will never ask for your OTP or PIN")
    expect(container.textContent).toContain("An owner or manager request is an access grant")
    expect(
      screen.getByRole("heading", { name: "Protect access first — then fix the Business Profile" }),
    ).toBeInTheDocument()

    const googleSays = screen.getByRole("heading", { name: "What Google says" }).closest("section")
    expect(
      within(googleSays as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(3)
    expect(
      within(googleSays as HTMLElement).getByText("Help protect your Google Business Profile"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Help protect against fraudulent calls and texts"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).getByText("Manage your Business Profile owners & managers"),
    ).toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Verify your business on Google"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Secure a hacked or compromised Google Account"),
    ).not.toBeInTheDocument()
    expect(
      within(googleSays as HTMLElement).queryByText("Transfer primary ownership of a Business Profile"),
    ).not.toBeInTheDocument()

    const bibliography = screen.getByRole("heading", { name: "Official sources" }).closest("section")
    expect(
      within(bibliography as HTMLElement).getAllByRole("link", { name: /View official Google guidance/ }),
    ).toHaveLength(8)

    const relatedSection = screen
      .getByRole("heading", { name: "Continue understanding your situation" })
      .closest("section")
    expect(
      within(relatedSection as HTMLElement).queryAllByRole("link", { name: /read guide/i }),
    ).toHaveLength(2)
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Someone Offered to Remove My Google Reviews for Money: What Should I Check?",
      ),
    ).toBeInTheDocument()
    expect(
      within(relatedSection as HTMLElement).getByText(
        "Lost Access to Your Google Business Profile: Ownership and Manager Options",
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain("Coming soon")

    expect(screen.getByRole("link", { name: /Start your Review Protection assessment/ })).toHaveAttribute(
      "href",
      "/get-help?service=review",
    )
  })

  it("never asks customers for credentials in the approved copy", () => {
    const { container } = render(
      <ResourceArticleView resource={resource!} body={body!} related={related} />,
    )
    expect(container.textContent).toContain("Do not share your Google Account password")
    expect(container.textContent).toContain(
      "Never send passwords, OTPs, PINs or verification codes to ProfileRelaunch",
    )
  })
})
