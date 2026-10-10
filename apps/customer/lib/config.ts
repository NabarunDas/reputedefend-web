import "server-only"

const DEV_SUPABASE_PROJECT_REF = "rmzozuiamjcclvtgutgd"
const PROD_SUPABASE_PROJECT_REF = "cxwwekdzkkjjbiyofrov"
export const PROD_CUSTOMER_ORIGIN = "https://customer.profilerelaunch.com"

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const origin = new URL(value)
    if (origin.origin !== value || origin.username || origin.password) return null
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null
    return origin.origin
  } catch {
    return null
  }
}

function previewOrigins(): string[] {
  if (process.env.VERCEL_ENV !== "preview") return []
  return [...new Set([process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
    .filter((host): host is string => !!host && /^[A-Za-z0-9.-]+$/.test(host) && host.endsWith(".vercel.app"))
    .map(host => `https://${host}`))]
}

function customerOrigins(): string[] {
  if (process.env.VERCEL_ENV === "production") return [PROD_CUSTOMER_ORIGIN]
  if (process.env.VERCEL_ENV === "preview") return previewOrigins()
  const origin = parseOrigin(process.env.CUSTOMER_ORIGIN)
  return origin ? [origin] : []
}

function supabaseMatchesVercelEnvironment(url: URL) {
  const environment = process.env.VERCEL_ENV
  if (environment === "production") return url.hostname === `${PROD_SUPABASE_PROJECT_REF}.supabase.co`
  if (environment === "preview" || environment === "development") {
    return url.hostname === `${DEV_SUPABASE_PROJECT_REF}.supabase.co`
  }
  return true
}

/**
 * Infrastructure shared by customer actions and the Customer Portal.
 * It does not read CUSTOMER_AUTH_ENABLED or CUSTOMER_PORTAL_ENABLED.
 */
export function customerBackendConfig() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) return null
  const allowedOrigins = customerOrigins()
  if (allowedOrigins.length === 0) return null
  try {
    const origins = allowedOrigins.map(value => new URL(value))
    const supabase = new URL(SUPABASE_URL)
    if (origins.some((origin, index) => origin.origin !== allowedOrigins[index] || origin.username || origin.password)
      || supabase.protocol !== "https:" || !supabaseMatchesVercelEnvironment(supabase)) return null
    if (origins.some(origin => origin.protocol !== "https:"
      && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) return null
    return {
      origin: origins[0].origin,
      allowedOrigins: origins.map(origin => origin.origin),
      url: supabase.origin,
      secret: SUPABASE_SECRET_KEY,
      publishable: SUPABASE_PUBLISHABLE_KEY,
    }
  } catch { return null }
}

export function customerRequestOriginAllowed(
  browserOrigin: string | null,
  requestOrigin: string,
  requireBrowserOrigin = true,
): boolean {
  const config = customerBackendConfig()
  if (!config || !config.allowedOrigins.includes(requestOrigin)) return false
  return requireBrowserOrigin ? browserOrigin === requestOrigin : true
}

/** Customer-action availability. The portal gate is separate. */
export function customerConfig() {
  if (process.env.CUSTOMER_AUTH_ENABLED !== "true") return null
  return customerBackendConfig()
}
export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-pr-action" : "pr-action-dev"
export const pendingCookie = process.env.NODE_ENV === "production" ? "__Host-pr-action-pending" : "pr-action-pending-dev"
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" }
