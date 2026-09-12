import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"

export default function robots(): MetadataRoute.Robots {
  const production = process.env.VERCEL_ENV === "production"
  return {
    rules: {
      userAgent: "*",
      allow: production ? "/" : "/",
      disallow: production ? ["/api/"] : ["/"],
    },
    sitemap: production ? `${brandSiteUrl}/sitemap.xml` : undefined,
  }
}
