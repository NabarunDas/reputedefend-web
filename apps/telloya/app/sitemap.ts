import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: brandSiteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ]
}
