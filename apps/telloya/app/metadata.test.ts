import { describe, expect, it } from "vitest"
import { absolutePageTitle, pageTitle, socialShareImage, titleTemplate } from "@/lib/brand"
import { metadata as homeMetadata } from "@/app/page"
import { metadata as howMetadata } from "@/app/how-it-works/page"
import { metadata as featuresMetadata } from "@/app/features/page"
import { metadata as industriesMetadata } from "@/app/industries/page"
import { metadata as pricingMetadata } from "@/app/pricing/page"
import { metadata as enquireMetadata } from "@/app/enquire/page"
import { metadata as cookiesMetadata } from "@/app/cookies/page"
import { metadata as demoMetadata } from "@/app/demo/page"
import { metadata as notFoundMetadata } from "@/app/not-found"

function documentTitle(title: unknown, template = titleTemplate) {
  if (typeof title === "string") return template.replace("%s", title)
  if (title && typeof title === "object" && "absolute" in title && typeof title.absolute === "string") {
    return title.absolute
  }
  return ""
}

describe("Telloya document titles", () => {
  it("applies the brand suffix once", () => {
    const titles = [
      homeMetadata.title,
      howMetadata.title,
      featuresMetadata.title,
      industriesMetadata.title,
      pricingMetadata.title,
      enquireMetadata.title,
      cookiesMetadata.title,
      demoMetadata.title,
      notFoundMetadata.title,
    ].map((title) => documentTitle(title))

    for (const title of titles) {
      expect(title.endsWith("| Telloya")).toBe(true)
      expect(title.match(/\| Telloya/g)).toHaveLength(1)
    }
  })

  it("keeps branded page titles out of the root template", () => {
    expect(absolutePageTitle("Pricing")).toEqual({ absolute: pageTitle("Pricing") })
    expect(documentTitle(pageTitle("Pricing"))).toBe("Pricing | Telloya | Telloya")
    expect(documentTitle(absolutePageTitle("Pricing"))).toBe("Pricing | Telloya")
  })

  it("keeps the missing page out of the index", () => {
    expect(notFoundMetadata.robots).toEqual({ index: false, follow: false, noarchive: true })
  })

  it("keeps the approved share image on pages that set their own social title", () => {
    const pages = [homeMetadata, howMetadata, featuresMetadata, industriesMetadata, pricingMetadata, enquireMetadata, cookiesMetadata, demoMetadata]
    for (const metadata of pages) {
      const twitter = metadata.twitter
      expect(metadata.openGraph?.images).toEqual([socialShareImage])
      expect(twitter && "card" in twitter ? twitter.card : undefined).toBe("summary_large_image")
      expect(twitter && "images" in twitter ? twitter.images : undefined).toEqual([socialShareImage.url])
    }
  })

  it("gives every public page its own canonical path", () => {
    expect(homeMetadata.alternates).toEqual({ canonical: "/" })
    expect(howMetadata.alternates).toEqual({ canonical: "/how-it-works" })
    expect(featuresMetadata.alternates).toEqual({ canonical: "/features" })
    expect(industriesMetadata.alternates).toEqual({ canonical: "/industries" })
    expect(pricingMetadata.alternates).toEqual({ canonical: "/pricing" })
    expect(enquireMetadata.alternates).toEqual({ canonical: "/enquire" })
    expect(cookiesMetadata.alternates).toEqual({ canonical: "/cookies" })
    expect(demoMetadata.alternates).toEqual({ canonical: "/demo" })
  })
})
