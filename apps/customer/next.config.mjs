import { fileURLToPath } from "node:url"
import { privateAppContentSecurityPolicy } from "../../lib/security/content-security-policy.mjs"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

const billingAssets = [
  "../../lib/billing/fonts/NotoSans-Regular.ttf",
  "../../lib/billing/fonts/NotoSans-Bold.ttf",
  "../../lib/billing/fonts/NotoSansBengali-Regular.ttf",
  "../../lib/billing/fonts/NotoSansDevanagari-Regular.ttf",
  "../../lib/billing/fonts/NotoNaskhArabic-Regular.ttf",
  "../../lib/billing/fonts/NotoSansSC-VF.ttf",
  "./public/brand/profile-relaunch-logo.png",
]
const pdfRoutes = [
  "/api/portal/payments/receipt",
  "/api/portal/payments/invoice-document",
  "/api/portal/service/quotation",
  "/api/portal/guard/document",
]

const config = {
  poweredByHeader: false,
  outputFileTracingRoot: repositoryRoot,
  outputFileTracingIncludes: Object.fromEntries(pdfRoutes.map(route => [route, billingAssets])),
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
        { key: "Content-Security-Policy", value: privateAppContentSecurityPolicy() },
      ],
    }]
  },
}

export default config
