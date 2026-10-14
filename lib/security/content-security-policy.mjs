/**
 * Response content-security policies.
 *
 * Next.js writes inline bootstrap scripts into statically rendered marketing
 * HTML. A per-request nonce would make those pages dynamic and bypass the CDN
 * cache, so production keeps 'unsafe-inline' and does not use a nonce.
 * 'unsafe-eval' is limited to the development server. Production, preview, and
 * test responses do not allow it.
 *
 * Google Analytics hosts are listed so the marketing script can load after
 * consent. They are not a reason to load analytics before that choice.
 */

const GOOGLE_TAG_HOST = "https://www.googletagmanager.com"
const GOOGLE_ANALYTICS_CONNECT = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  GOOGLE_TAG_HOST,
  "https://analytics.google.com",
]
const GOOGLE_ANALYTICS_IMAGES = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  GOOGLE_TAG_HOST,
]

function scriptSources(extra = "") {
  const evaluation = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  return `script-src 'self' 'unsafe-inline'${evaluation}${extra}`
}

function join(directives) {
  return directives.join("; ")
}

export function marketingContentSecurityPolicy() {
  return join([
    "default-src 'self'",
    scriptSources(` ${GOOGLE_TAG_HOST}`),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${GOOGLE_ANALYTICS_IMAGES.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' ${GOOGLE_ANALYTICS_CONNECT.join(" ")}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ])
}

export function privateAppContentSecurityPolicy() {
  return join([
    "default-src 'self'",
    scriptSources(),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://*.amazonaws.com",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ])
}
