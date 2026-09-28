import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import { isSitePublic } from "@/lib/site-visibility"

export default function robots(): MetadataRoute.Robots {
  // Pre-launch and Preview deployments disallow everything and advertise no
  // sitemap. `Allow: /` is deliberately absent so no crawler can read it as a
  // less restrictive match than the blanket disallow.
  if (!isSitePublic()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${brandSiteUrl}/sitemap.xml`,
  }
}
