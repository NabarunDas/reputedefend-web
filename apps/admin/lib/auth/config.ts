import "server-only"

export const ADMIN_EMAIL = "admin@profilerelaunch.com"
const DEV_SUPABASE_PROJECT_REF = "rmzozuiamjcclvtgutgd"
const PROD_SUPABASE_PROJECT_REF = "cxwwekdzkkjjbiyofrov"
const PROD_ADMIN_ORIGIN = "https://admin.profilerelaunch.com"
const PROD_CUSTOMER_ORIGIN = "https://customer.profilerelaunch.com"

function previewOrigin(): string | null {
  if (process.env.VERCEL_ENV !== "preview") return null
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  if (!host || !/^[A-Za-z0-9.-]+$/.test(host) || !host.endsWith(".vercel.app")) return null
  return `https://${host}`
}

function adminOrigin(): string | null {
  if (process.env.VERCEL_ENV === "production") return PROD_ADMIN_ORIGIN
  if (process.env.VERCEL_ENV === "preview") return previewOrigin()
  return parseOrigin(process.env.ADMIN_ORIGIN)
}

function adminCustomerOrigin(): string | null {
  if (process.env.VERCEL_ENV === "production") return PROD_CUSTOMER_ORIGIN
  return parseOrigin(process.env.CUSTOMER_ORIGIN)
}

function supabaseMatchesVercelEnvironment(url: URL) {
  if (process.env.NODE_ENV === "test" && url.hostname === "example.supabase.co") return true
  const environment = process.env.VERCEL_ENV
  if (environment === "production") return url.hostname === `${PROD_SUPABASE_PROJECT_REF}.supabase.co`
  if (environment === "preview" || environment === "development") {
    return url.hostname === `${DEV_SUPABASE_PROJECT_REF}.supabase.co`
  }
  return true
}

export function authConfig() {
  const { ADMIN_AUTH_ENABLED, SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
  if (ADMIN_AUTH_ENABLED !== "true" || !SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) return null
  const resolvedOrigin = adminOrigin()
  if (!resolvedOrigin) return null
  try {
    const origin = new URL(resolvedOrigin)
    const supabase = new URL(SUPABASE_URL)
    if (origin.origin !== resolvedOrigin || origin.username || origin.password || supabase.protocol !== "https:" || !supabaseMatchesVercelEnvironment(supabase)) return null
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null
    return { origin: origin.origin, url: supabase.origin, secret: SUPABASE_SECRET_KEY, publishable: SUPABASE_PUBLISHABLE_KEY, customerOrigin: adminCustomerOrigin() }
  } catch { return null }
}
function parseOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const origin = new URL(value)
    if (origin.origin !== value || origin.username || origin.password) return null
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null
    return origin.origin
  } catch { return null }
}
export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-pr-admin" : "pr-admin-dev"
export const challengeCookie = process.env.NODE_ENV === "production" ? "__Host-pr-admin-challenge" : "pr-admin-challenge-dev"
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" } as const
