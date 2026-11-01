import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, isPublicRead, privateResponseHeaders } from "./lib/access"
import { actionSessionFromToken } from "./lib/backend"
import { sessionCookie } from "./lib/config"
import { invitedLoginAvailable, portalAvailable, portalSessionCookieName } from "./lib/portal/config"
import { portalSessionFromToken } from "./lib/portal/session"

function withPrivate(response: NextResponse) {
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}

/** Invitation secrets stay out of the internal path header and later logs. */
export function customerFacingPath(pathname: string) {
  return /^\/login\/invite\/[a-f0-9]{64}$/i.test(pathname) ? "/login/invite/[token]" : pathname
}

function proceed(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-customer-pathname", customerFacingPath(request.nextUrl.pathname))
  return NextResponse.next({ request: { headers } })
}

function redirectTo(request: NextRequest, pathname: string, search = "") {
  const destination = request.nextUrl.clone()
  destination.pathname = pathname
  destination.search = search
  return NextResponse.redirect(destination, 303)
}

function portalTokenShape(token: string | undefined): token is string {
  return !!token && /^[a-f0-9]{64}$/.test(token)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method
  const portalOn = portalAvailable()
  const actionPost = method === "POST" && /^\/api\/action\/(exchange|otp|verify|command)$/.test(pathname)
  const portalPreAuth = method === "POST" && /^\/api\/portal\/auth\/(start|resend|verify)$/.test(pathname)
  const invitedPreAuth = method === "POST" && /^\/api\/portal\/auth\/invite\/(start|resend|verify)$/.test(pathname)
  const invitedRead = (pathname === "/login/invite/continue" || /^\/login\/invite\/[a-f0-9]{64}$/.test(pathname)) && (method === "GET" || method === "HEAD")
  const invitedSurface = pathname === "/login/invite/continue" || /^\/login\/invite\/[a-f0-9]{64}$/i.test(pathname) || pathname.startsWith("/api/portal/auth/invite/")
  const portalSignOut = method === "POST" && pathname === "/api/portal/auth/sign-out"
  const portalMutation = method === "POST" && (
    pathname === "/api/portal/auth/activity"
    || pathname === "/api/portal/evidence"
    || pathname === "/api/portal/service"
    || pathname === "/api/portal/payments"
    || pathname === "/api/portal/guard"
    || pathname === "/api/portal/documents/handover"
  )
  const portalRead = method === "GET" && (
    pathname === "/api/portal/auth/session"
    || pathname === "/api/portal/payments/receipt"
    || pathname === "/api/portal/payments/invoice"
    || pathname === "/api/portal/payments/invoice-document"
    || pathname === "/api/portal/service/quotation"
    || pathname === "/api/portal/guard/document"
    || pathname === "/api/portal/documents/download"
    || pathname === "/api/portal/documents/archive"
  )
  const loginRead = portalOn && pathname === "/login" && (method === "GET" || method === "HEAD")
  const portalPage = pathname === "/portal" || pathname.startsWith("/portal/")
  const portalApi = pathname === "/api/portal" || pathname.startsWith("/api/portal/")

  let response: NextResponse
  if (invitedRead) {
    response = invitedLoginAvailable() ? proceed(request) : redirectTo(request, "/")
  } else if (isPublicRead(pathname, method) || loginRead || actionPost || portalPreAuth || portalSignOut || invitedPreAuth) {
    response = proceed(request)
  } else if (portalPage) {
    const portalToken = request.cookies.get(portalSessionCookieName())?.value
    if (!portalOn) response = redirectTo(request, "/")
    else if (await portalSessionFromToken(portalToken)) response = proceed(request)
    else response = redirectTo(request, "/login", portalTokenShape(portalToken) ? "?ended=security" : "")
  } else if (portalMutation || portalRead) {
    if (!portalOn) response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 404 })
    else if (await portalSessionFromToken(request.cookies.get(portalSessionCookieName())?.value)) response = proceed(request)
    else response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 401 })
  } else if (portalApi) {
    // An action session must not open a portal API that this proxy has not classified.
    response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: portalOn ? 401 : 404 })
  } else if (await actionSessionFromToken(request.cookies.get(sessionCookie)?.value)) {
    // A portal cookie is never read here. Action routes stay on the action session.
    response = proceed(request)
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method)) {
    response = NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 401 })
  } else {
    response = redirectTo(request, "/")
  }
  if (invitedSurface) response.headers.set("Referrer-Policy", "no-referrer")
  return withPrivate(response)
}
export const config = { matcher: "/:path*" }
