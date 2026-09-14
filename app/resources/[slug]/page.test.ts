import { describe, expect, it, vi } from "vitest"
import { getPublishedResources } from "@/lib/resources"
import ResourceArticlePage, { dynamicParams, generateMetadata, generateStaticParams } from "./page"

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

describe("resource article route", () => {
  it("prerenders published resources and keeps unmatched slugs as 404s", () => {
    const slugs = generateStaticParams().map((item) => item.slug)
    expect(slugs).toContain("google-business-profile-suspended-before-appeal")
    expect(slugs).toContain("google-business-profile-appeal-evidence-checklist")
    expect(slugs).toContain("google-business-profile-appeal-rejected-what-next")
    expect(slugs).toContain("google-business-profile-verification-stuck-or-rejected")
    expect(slugs).toContain("can-a-google-review-be-removed")
    expect(slugs).toContain("fake-google-review-or-genuine-negative-feedback")
    expect(slugs).toContain("google-review-extortion")
    expect(slugs).toContain("google-review-bombing")
    expect(slugs).toContain("can-a-competitor-or-ex-employee-leave-a-google-review")
    expect(slugs).toContain("customer-threatening-bad-google-review")
    expect(slugs).toContain("offered-to-remove-google-reviews-for-money")
    expect(slugs).toContain("google-rejected-my-review-report")
    expect(slugs).toContain("lost-access-to-google-business-profile")
    expect(slugs).toContain("google-business-profile-name-rules")
    expect(slugs).toContain("google-business-profile-address-and-service-area-rules")
    expect(slugs).toContain("google-business-profile-categories")
    expect(slugs).toHaveLength(16)
    expect(slugs).toEqual(getPublishedResources().map((resource) => resource.slug))
    expect(dynamicParams).toBe(false)
  })

  /**
   * A slug that will never exist owns this regression, so publishing more
   * Resources cannot invalidate it. Unpublished-record filtering is covered
   * synthetically in lib/resources.test.ts.
   */
  it("404s unknown slugs instead of rendering a coming-soon shell", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "resource-that-does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      ResourceArticlePage({ params: Promise.resolve({ slug: "resource-that-does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("emits approved metadata for the published suspension guide", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "google-business-profile-suspended-before-appeal" }),
    })
    expect(metadata.description).toBe(
      "If your Google Business Profile is suspended, do not rush the appeal. Check eligibility, profile accuracy and evidence before using Google's appeals tool.",
    )
    expect(metadata.alternates).toEqual({
      canonical: "/resources/google-business-profile-suspended-before-appeal",
    })
    expect(JSON.stringify(metadata.openGraph)).toContain('"type":"article"')
    expect(JSON.stringify(metadata.openGraph)).toContain('"publishedTime":"2026-09-13"')
    expect(metadata.twitter).toBeDefined()
  })
})
