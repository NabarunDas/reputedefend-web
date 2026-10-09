import { NextRequest, NextResponse } from "next/server"
import { isPublicRead, privateResponseHeaders } from "./lib/access"
import { sessionFromToken } from "./lib/auth/backend"
import { isProductionAdminEnvironment, PROD_ADMIN_ORIGIN, sessionCookie } from "./lib/auth/config"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
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
  const providerWebhook = request.method === "POST" && (pathname === "/api/webhooks/resend" || pathname === "/api/webhooks/resend/inbound" || pathname === "/api/webhooks/stripe")
  if (isPublicRead(pathname, request.method) || authPost || cronRead || providerWebhook || await sessionFromToken(request.cookies.get(sessionCookie)?.value)) {
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
