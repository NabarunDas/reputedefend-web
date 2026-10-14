import { fileURLToPath } from "node:url"
import { privateAppContentSecurityPolicy } from "../../lib/security/content-security-policy.mjs"

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
        // Same enforced policy as the customer app. Neither workspace loads a
        // third-party script. The only cross-origin browser request is the
        // presigned evidence upload to S3. Inline event handlers stay blocked.
        // Script eval is added only while NODE_ENV is development.
        { key: "Content-Security-Policy", value: privateAppContentSecurityPolicy() },
      ],
    }]
  },
}

export default config
