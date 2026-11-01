import type { MetadataRoute } from "next"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

function isSitePublicForRobots() {
  return trimEnv(process.env.VERCEL_ENV) === "production" && trimEnv(process.env.TELLOYA_LAUNCHED) === "true"
}

export default function robots(): MetadataRoute.Robots {
  if (!isSitePublicForRobots()) {
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
