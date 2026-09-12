import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Metadata } from "next"
import { describe, expect, it } from "vitest"
import {
  brandAssets,
  brandColors,
  brandDescriptor,
  brandName,
  brandSiteUrl,
  brandTagline,
  defaultTitle,
  logoSize,
  markSize,
  ogCopy,
  ogImage,
  pageTitle,
  titleTemplate,
} from "@/lib/brand"
import { homepageFaqs } from "@/lib/homepage-content"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

function isSummaryLargeImageTwitter(
  twitter: NonNullable<Metadata["twitter"]>,
): twitter is Extract<NonNullable<Metadata["twitter"]>, { card: "summary_large_image" }> {
  return "card" in twitter && twitter.card === "summary_large_image"
}

describe("brand identity", () => {
  it("uses the ProfileRelaunch name, domain and approved lines", () => {
    expect(brandName).toBe("ProfileRelaunch")
    expect(brandSiteUrl).toBe("https://profilerelaunch.com")
    expect(brandTagline).toBe("Restore visibility. Protect your reputation.")
    expect(brandDescriptor).toBe("Google Business Profile Recovery & Review Protection")
    expect(defaultTitle).toBe("ProfileRelaunch | Google Business Profile Recovery & Review Protection")
    expect(titleTemplate).toBe("%s | ProfileRelaunch")
    expect(pageTitle("Privacy notice")).toBe("Privacy notice | ProfileRelaunch")
  })

  it("does not use defensive wording as social-share headline copy", () => {
    const social = `${ogCopy.headline} ${ogCopy.headlineLines.join(" ")} ${ogCopy.support} ${ogImage.alt}`
    expect(social.toLowerCase()).not.toMatch(/guaranteed|independent of google/)
  })

  it("keeps customer-facing FAQs on the ProfileRelaunch name", () => {
    expect(JSON.stringify(homepageFaqs)).not.toContain("ReputeDefend")
    expect(homepageFaqs.some((item) => item.q.includes("ProfileRelaunch"))).toBe(true)
  })
})

describe("brand assets", () => {
  it("keeps the social image at the Open Graph size", () => {
    expect(ogImage.width).toBe(1200)
    expect(ogImage.height).toBe(630)
    expect(ogImage.contentType).toBe("image/png")
  })

  it("uses a palette aligned with the ProfileRelaunch logo", () => {
    expect(brandColors.forest).toBe("#10261F")
    expect(brandColors.paper).toBe("#f7f8f3")
    expect(brandColors.green).toBe("#0a6e3c")
    expect(brandColors.accent).toBe("#009838")
    expect(brandColors.lime).toBe("#c5e8b4")
  })

  it("exposes replaceable horizontal, lockup and mark files for each variant", () => {
    for (const variant of ["dark", "light", "mono"] as const) {
      expect(brandAssets.horizontal[variant]).toMatch(/^\/brand\/profile-relaunch-logo/)
      expect(brandAssets.mark[variant]).toMatch(/^\/brand\/profile-relaunch-mark/)
      expect(brandAssets.lockup[variant]).toMatch(/^\/brand\/profile-relaunch-/)
    }
  })

  it("publishes the derived brand files in public/brand", () => {
    const files = [
      brandAssets.horizontal.dark,
      brandAssets.horizontal.light,
      brandAssets.mark.dark,
      brandAssets.mark.light,
      brandAssets.lockup.dark,
      "/brand/profile-relaunch-source.png",
      "/icon.png",
      "/apple-icon.png",
    ]
    for (const file of files) {
      expect(existsSync(join(process.cwd(), "public", file.replace(/^\//, "")))).toBe(true)
    }
  })

  it("preserves the approved wordmark aspect ratio", () => {
    expect(logoSize.width / logoSize.height).toBeCloseTo(1932 / 446)
    expect(markSize.width).toBe(markSize.height)
  })

  it("keeps OG copy aligned with public claims", () => {
    expect(ogCopy.name).toBe("ProfileRelaunch")
    expect(ogCopy.headline).toBe(brandDescriptor)
    expect(ogCopy.support).toBe(brandTagline)
    expect(ogImage.alt).toBe("ProfileRelaunch — Google Business Profile Recovery & Review Protection.")
    expect(`${ogCopy.support} ${ogImage.alt}`.toLowerCase()).not.toMatch(/guaranteed/)
  })
})

describe("social metadata helpers", () => {
  it("does not invent a static PNG path", () => {
    const openGraph = socialOpenGraph({
      title: "Privacy notice | ProfileRelaunch",
      description: "How information is handled.",
      path: "/privacy",
    })
    const twitter = socialTwitter({
      title: "Privacy notice | ProfileRelaunch",
      description: "How information is handled.",
    })

    expect(openGraph.siteName).toBe("ProfileRelaunch")
    expect(openGraph.images).toEqual([
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: expect.stringContaining("ProfileRelaunch"),
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
