import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import { sitemapPaths } from "@/lib/site-nav"

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.VERCEL_ENV !== "production") return []
  return sitemapPaths.map((url) => ({ url: `${brandSiteUrl}${url}` }))
}
