import { fileURLToPath } from "node:url"
import { adminContentSecurityPolicy } from "../../lib/security/content-security-policy.mjs"

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
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // The customer app keeps the private policy unchanged. Admin adds only
        // https://profilerelaunch.com for the public logo in stored email HTML.
        // No other external image host is allowed. The sandboxed preview stays
        // opaque. The other cross-origin browser request is the presigned
        // evidence upload to S3. Inline event handlers stay blocked. Script
        // eval is added only while NODE_ENV is development.
        { key: "Content-Security-Policy", value: adminContentSecurityPolicy() },
      ],
    }]
  },
}

export default config
