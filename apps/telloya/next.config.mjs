import { fileURLToPath } from "node:url"
import { marketingContentSecurityPolicy } from "../../lib/security/content-security-policy.mjs"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

const config = {
  poweredByHeader: false,
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
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
