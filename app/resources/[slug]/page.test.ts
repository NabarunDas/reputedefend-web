import { describe, expect, it, vi } from "vitest"
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
    expect(slugs).not.toContain("google-business-profile-verification-stuck-or-rejected")
    expect(dynamicParams).toBe(false)
  })

  it("404s draft slugs instead of rendering a coming-soon shell", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "google-review-extortion" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "google-business-profile-verification-stuck-or-rejected" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      ResourceArticlePage({ params: Promise.resolve({ slug: "google-review-extortion" }) }),
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
