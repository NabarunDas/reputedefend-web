import type { MetadataRoute } from "next"
import { isSitePublic } from "@/lib/config"

export default function robots(): MetadataRoute.Robots {
  if (!isSitePublic()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    }
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [],
    },
    sitemap: "https://telloya.com/sitemap.xml",
  }
}
