import { describe, expect, it, vi } from "vitest"
import ResourceArticlePage, { dynamicParams, generateMetadata, generateStaticParams } from "./page"

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

describe("resource article route", () => {
  it("does not prerender draft slugs", () => {
    expect(generateStaticParams()).toEqual([])
    expect(dynamicParams).toBe(false)
  })

  it("404s draft slugs instead of rendering a coming-soon shell", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "google-review-extortion" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "google-business-profile-suspended-before-appeal" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      ResourceArticlePage({ params: Promise.resolve({ slug: "google-review-extortion" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
