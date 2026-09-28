import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import { publishedResourceSitemapEntries } from "@/lib/resources"
import { sitemapPaths } from "@/lib/site-nav"
import { isSitePublic } from "@/lib/site-visibility"

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isSitePublic()) return []
  return [
    ...sitemapPaths.map((url) => ({ url: `${brandSiteUrl}${url}` })),
    ...publishedResourceSitemapEntries(),
  ]
}
