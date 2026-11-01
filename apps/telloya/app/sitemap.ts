import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import { isSitePublic } from "@/lib/config"

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isSitePublic()) {
    return []
  }

  return [
    {
      url: brandSiteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ]
}
