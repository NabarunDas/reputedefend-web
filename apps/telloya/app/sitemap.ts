import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

function isSitePublicForSitemap() {
  return trimEnv(process.env.VERCEL_ENV) === "production" && trimEnv(process.env.TELLOYA_LAUNCHED) === "true"
}

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isSitePublicForSitemap()) {
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
