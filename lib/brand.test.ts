import type { Metadata } from "next"
import { describe, expect, it } from "vitest"
import { brandAssets, brandColors, logoSize, markSize, ogCopy, ogImage } from "@/lib/brand"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

function isSummaryLargeImageTwitter(
  twitter: NonNullable<Metadata["twitter"]>,
): twitter is Extract<NonNullable<Metadata["twitter"]>, { card: "summary_large_image" }> {
  return "card" in twitter && twitter.card === "summary_large_image"
}

describe("brand assets", () => {
  it("keeps the social image at the Open Graph size", () => {
    expect(ogImage.width).toBe(1200)
    expect(ogImage.height).toBe(630)
    expect(ogImage.contentType).toBe("image/png")
  })

  it("uses the current site palette", () => {
    expect(brandColors.forest).toBe("#10261F")
    expect(brandColors.paper).toBe("#f7f8f3")
    expect(brandColors.green).toBe("#0b6b52")
    expect(brandColors.lime).toBe("#cbe86b")
  })

  it("exposes replaceable horizontal and mark files for each variant", () => {
    for (const variant of ["dark", "light", "mono"] as const) {
      expect(brandAssets.horizontal[variant]).toMatch(/^\/brand\/logo-horizontal-/)
      expect(brandAssets.mark[variant]).toMatch(/^\/brand\/mark-/)
    }
  })

  it("preserves the approved wordmark aspect ratio", () => {
    expect(logoSize.width / logoSize.height).toBeCloseTo(1456 / 300)
    expect(markSize.width).toBe(markSize.height)
  })

  it("keeps OG copy aligned with public claims", () => {
    expect(ogCopy.name).toBe("ReputeDefend")
    expect(ogCopy.headline).toMatch(/business presence and reputation on Google/)
    expect(ogCopy.support).toBe("Independent • Evidence-led • No guaranteed outcomes")
  })
})

describe("social metadata helpers", () => {
  it("does not invent a static PNG path", () => {
    const openGraph = socialOpenGraph({
      title: "Privacy notice | ReputeDefend",
      description: "How information is handled.",
      path: "/privacy",
    })
    const twitter = socialTwitter({
      title: "Privacy notice | ReputeDefend",
      description: "How information is handled.",
    })

    expect(openGraph.images).toEqual([
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: expect.stringContaining("ReputeDefend"),
        type: "image/png",
      },
    ])
    expect(isSummaryLargeImageTwitter(twitter)).toBe(true)
    if (!isSummaryLargeImageTwitter(twitter)) return

    expect(twitter.card).toBe("summary_large_image")
    const image = Array.isArray(twitter.images) ? twitter.images[0] : twitter.images
    const imageUrl = typeof image === "object" && image && "url" in image ? String(image.url) : image
    expect(imageUrl).toBe("/twitter-image")
    expect(JSON.stringify(openGraph)).not.toContain("og-image.png")
    expect(JSON.stringify(twitter)).not.toContain("og-image.png")
  })
})
