import { NextRequest, NextResponse } from "next/server"
import { isPublicRead, privateResponseHeaders } from "./lib/access"
import { sessionFromToken } from "./lib/auth/backend"
import { isProductionAdminEnvironment, PROD_ADMIN_ORIGIN, sessionCookie } from "./lib/auth/config"

// This stable DEV hostname is intentionally a webhook-only public surface.
// Vercel Authentication excludes custom domains on this existing project; the
// host guard must run before normal public-path and session handling.
const DEV_WEBHOOK_HOST = "dev-hooks.profilerelaunch.com"
const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"

function devHooksStripePost(request: NextRequest): boolean {
  return process.env.VERCEL_ENV === "preview"
    && request.method === "POST"
    && request.nextUrl.pathname === "/api/webhooks/stripe"
}

/** Signed Resend delivery events. Stripe's preview-only rule stays unchanged. */
function devHooksResendPost(request: NextRequest): boolean {
  const project = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "develop"
    && project === DEV_SUPABASE_URL
    && request.method === "POST"
    && request.nextUrl.pathname === "/api/webhooks/resend"
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.nextUrl.hostname === DEV_WEBHOOK_HOST && !devHooksStripePost(request) && !devHooksResendPost(request)) {
    const denied = NextResponse.json({ error: "Not found." }, { status: 404 })
    for (const [key, value] of Object.entries(privateResponseHeaders)) denied.headers.set(key, value)
    return denied
  }
  const productionBrowserRead = isProductionAdminEnvironment()
    && (request.method === "GET" || request.method === "HEAD")
    && pathname !== "/api"
    && !pathname.startsWith("/api/")
  if (productionBrowserRead && request.nextUrl.origin !== PROD_ADMIN_ORIGIN) {
    const canonical = new URL(`${pathname}${request.nextUrl.search}`, PROD_ADMIN_ORIGIN)
    const redirect = NextResponse.redirect(canonical, 308)
    for (const [key, value] of Object.entries(privateResponseHeaders)) redirect.headers.set(key, value)
    return redirect
  }
  let response: NextResponse
  const authPost = request.method === "POST" && /^\/auth\/(send|verify|logout|logout-all)$/.test(pathname)
  const cronRead = (request.method === "GET" || request.method === "HEAD") && pathname === "/api/internal/jobs/run"
  // This endpoint authenticates its own dedicated bearer. Do not require a
  // staff session, but expose it only on the protected develop Preview alias.
  const developPreviewCron = request.nextUrl.hostname === "profilerelaunch-admin-git-develop-clientcove.vercel.app"
    && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "develop"
  const devPaymentCronRead = request.method === "GET"
    && pathname === "/api/internal/jobs/dev-payment-events"
    && developPreviewCron
  const devMailCronRead = request.method === "GET"
    && pathname === "/api/internal/jobs/dev-mail-dispatch"
    && developPreviewCron
  const devMailEventPost = request.method === "POST"
    && pathname === "/api/internal/mail/dispatch"
    && developPreviewCron
  const providerWebhook = request.method === "POST" && (pathname === "/api/webhooks/resend" || pathname === "/api/webhooks/resend/inbound" || pathname === "/api/webhooks/stripe")
  if (isPublicRead(pathname, request.method) || authPost || cronRead || devPaymentCronRead || devMailCronRead || devMailEventPost || providerWebhook || await sessionFromToken(request.cookies.get(sessionCookie)?.value)) {
    response = NextResponse.next()
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
    response = NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 })
  } else {
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    login.search = ""
    response = NextResponse.redirect(login, 303)
  }
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}
export const config = { matcher: "/:path*" }
