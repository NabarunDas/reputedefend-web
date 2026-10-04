import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, isPublicRead, privateResponseHeaders } from "./lib/access"
import { actionSessionFromToken } from "./lib/backend"
import { sessionCookie } from "./lib/config"
import { portalAvailable, portalSessionCookieName } from "./lib/portal/config"
import { portalSessionFromToken } from "./lib/portal/session"

function withPrivate(response: NextResponse) {
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}

function redirectTo(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone()
  destination.pathname = pathname
  destination.search = ""
  return NextResponse.redirect(destination, 303)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method
  const portalOn = portalAvailable()
  const actionPost = method === "POST" && /^\/api\/action\/(exchange|otp|verify|command)$/.test(pathname)
  const portalPreAuth = method === "POST" && /^\/api\/portal\/auth\/(start|resend|verify)$/.test(pathname)
  const portalSignOut = method === "POST" && pathname === "/api/portal/auth/sign-out"
  const portalMutation = method === "POST" && (
    pathname === "/api/portal/evidence"
    || pathname === "/api/portal/service"
    || pathname === "/api/portal/payments"
    || pathname === "/api/portal/guard"
  )
  const portalRead = method === "GET" && (
    pathname === "/api/portal/payments/receipt"
    || pathname === "/api/portal/payments/invoice"
    || pathname === "/api/portal/documents/download"
  )
  const loginRead = portalOn && pathname === "/login" && (method === "GET" || method === "HEAD")
  const portalPage = pathname === "/portal" || pathname.startsWith("/portal/")
  const portalApi = pathname === "/api/portal" || pathname.startsWith("/api/portal/")

  let response: NextResponse
  if (isPublicRead(pathname, method) || loginRead || actionPost || portalPreAuth || portalSignOut) {
    response = NextResponse.next()
  } else if (portalPage) {
    if (!portalOn) response = redirectTo(request, "/")
    else if (await portalSessionFromToken(request.cookies.get(portalSessionCookieName())?.value)) response = NextResponse.next()
    else response = redirectTo(request, "/login")
  } else if (portalMutation || portalRead) {
    if (!portalOn) response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 404 })
    else if (await portalSessionFromToken(request.cookies.get(portalSessionCookieName())?.value)) response = NextResponse.next()
    else response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 401 })
  } else if (portalApi) {
    // An action session must not open a portal API that this proxy has not classified.
    response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: portalOn ? 401 : 404 })
  } else if (await actionSessionFromToken(request.cookies.get(sessionCookie)?.value)) {
    // A portal cookie is never read here. Action routes stay on the action session.
    response = NextResponse.next()
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method)) {
    response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 401 })
  } else {
    response = redirectTo(request, "/")
  }
  return withPrivate(response)
}
export const config = { matcher: "/:path*" }
