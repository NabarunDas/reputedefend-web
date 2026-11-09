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

  // /demo is an illustrative page. Indexing still depends on the launch check above.
  const routes = [
    "",
    "/how-it-works",
    "/demo",
    "/features",
    "/industries",
    "/pricing",
    "/relaunch-guard",
    "/enquire",
    "/cookies",
  ]

  return routes.map((route) => ({
    url: `${brandSiteUrl}${route}`,
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1 : 0.8,
  }))
}
