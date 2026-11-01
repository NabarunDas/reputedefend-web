import { fileURLToPath } from "node:url"
import { marketingContentSecurityPolicy } from "../../lib/security/content-security-policy.mjs"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

function trimEnv(value) {
  return value?.trim() ?? ""
}

const config = {
  poweredByHeader: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  async headers() {
    const isLaunched = 
      trimEnv(process.env.VERCEL_ENV) === "production" && 
      trimEnv(process.env.TELLOYA_LAUNCHED) === "true"
    
    const robotsValue = isLaunched ? "all" : "noindex, nofollow, noarchive"
    
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: robotsValue },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: marketingContentSecurityPolicy() },
      ],
    }]
  },
}

export default config
