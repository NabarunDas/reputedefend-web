import "server-only"
import {
  DEV_CUSTOMER_PORTAL_HREF,
  PRODUCTION_CUSTOMER_PORTAL_HREF,
} from "@/lib/customer-portal-href"

/** Exact value that publishes the production portal from Marketing. */
export const CUSTOMER_PORTAL_LINK_APPROVED = "approved"

const PRODUCTION_ORIGIN = new URL(PRODUCTION_CUSTOMER_PORTAL_HREF).origin
const DEV_ORIGIN = new URL(DEV_CUSTOMER_PORTAL_HREF).origin

/**
 * An https origin with no userinfo, port, query, fragment, or path.
 * A single trailing slash is the only extra spelling accepted.
 */
function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || /\s/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null
  if (url.port !== "" || url.search !== "" || url.hash !== "") return null
  if (url.pathname !== "/" && url.pathname !== "") return null
  if (url.origin !== trimmed && `${url.origin}/` !== trimmed) return null
  return url.origin
}

function deploymentLane(): "production" | "configured" | "closed" {
  const vercel = process.env.VERCEL_ENV?.trim() ?? ""
  if (vercel === "production") return "production"
  if (vercel === "preview" || vercel === "development") return "configured"
  if (vercel !== "") return "closed"
  if (process.env.NODE_ENV === "production") return "closed"
  return "configured"
}

/**
 * Marketing's Customer Portal destination, or null when it must not be shown.
 *
 * Production publishes the canonical `/portal` URL only when
 * `CUSTOMER_PORTAL_LINK` is exactly `approved` and `CUSTOMER_ORIGIN` is the
 * production customer origin. That approval belongs on Marketing after the
 * Customer Portal itself is enabled and release-approved.
 *
 * Preview, Vercel development, and local development publish `/portal` on
 * the verified DEV customer origin only. The production host is rejected.
 * An unknown lane, a missing origin, or any other host publishes nothing.
 */
export function marketingCustomerPortalHref(): string | null {
  const origin = configuredOrigin(process.env.CUSTOMER_ORIGIN)
  const lane = deploymentLane()
  if (!origin || lane === "closed") return null
  if (lane === "production") {
    if (process.env.CUSTOMER_PORTAL_LINK?.trim() !== CUSTOMER_PORTAL_LINK_APPROVED) return null
    return origin === PRODUCTION_ORIGIN ? PRODUCTION_CUSTOMER_PORTAL_HREF : null
  }
  return origin === DEV_ORIGIN ? DEV_CUSTOMER_PORTAL_HREF : null
}
