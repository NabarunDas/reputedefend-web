import { NextRequest, NextResponse } from "next/server"
import { isPublicRead, privateResponseHeaders } from "./lib/access"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response: NextResponse
  if (isPublicRead(pathname, request.method)) {
    response = NextResponse.next()
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
    response = NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 })
  } else {
    // Do not carry record IDs, query strings or user-supplied redirect targets to login.
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    login.search = ""
    response = NextResponse.redirect(login, 303)
  }
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}

export const config = { matcher: "/:path*" }
