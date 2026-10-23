import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { confirmationCsrfToken, confirmationRuntime } from "@/lib/cases/email-confirmation"
import {
  confirmEmailAddress,
  confirmationCustomerMessage,
  resendEmailConfirmation,
} from "@/lib/cases/email-confirmation-command"
import { readEnquiryEmailConfig, runtimeMayUseLiveProvider } from "@/lib/enquiry-config"
import { readBoundedJson } from "@/lib/public-body"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import { readSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const csrfCookieName = "pr_email_confirm"

/**
 * Only the route handler issues the CSRF cookie. It must be scoped to the
 * POST /api/confirm-email endpoint, not the /confirm-email page.
 * GET does not read or consume the email verification challenge.
 */
export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (!confirmationRuntime() || (site && site !== "same-origin" && site !== "none")) {
    return NextResponse.json({ message: "Unavailable." }, { status: 403, headers: { "cache-control": "no-store" } })
  }
  const csrf = confirmationCsrfToken().slice(0, 64)
  const response = NextResponse.json({ csrf }, { headers: { "cache-control": "private, no-store" } })
  response.cookies.set(csrfCookieName, csrf, {
    httpOnly: true,
    sameSite: "strict",
    path: "/api/confirm-email",
    maxAge: 1800,
    secure: new URL(request.url).protocol === "https:",
  })
  return response
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    return url.host === host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: confirmationCustomerMessage("unavailable") }, { status: 400 })
  }
  const body = await readBoundedJson(request)
  if (!body.ok) {
    return NextResponse.json({ message: confirmationCustomerMessage("unavailable") }, { status: body.status })
  }
  const value = body.value
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json({ message: confirmationCustomerMessage("unavailable") }, { status: 400 })
  }
  const fields = value as Record<string, unknown>
  const challengeId = typeof fields.challengeId === "string" ? fields.challengeId : ""
  const token = typeof fields.token === "string" ? fields.token : undefined
  const csrf = typeof fields.csrf === "string" ? fields.csrf : undefined
  const action = fields.action === "resend" ? "resend" : fields.action === "confirm" ? "confirm" : ""
  if (!action || !readSupabaseConfig().ready) {
    return NextResponse.json({ message: confirmationCustomerMessage("unavailable") }, { status: 400 })
  }
  const csrfCookie = (await cookies()).get(csrfCookieName)?.value
  const client = createSupabaseServerClient()
  const result = action === "confirm"
    ? await confirmEmailAddress({ client, challengeId, token, csrf, csrfCookie })
    : await resendEmailConfirmation({
      client,
      challengeId,
      token,
      csrf,
      csrfCookie,
      fromEmail: readEnquiryEmailConfig().fromEmail,
      provider: runtimeMayUseLiveProvider() && readEnquiryEmailConfig().ready
        ? createResendEnquiryProvider(readEnquiryEmailConfig().apiKey)
        : null,
    })
  const ok = result.status === "confirmed" || result.status === "already_confirmed" || result.status === "already_verified" || result.status === "sent"
  return NextResponse.json({ message: confirmationCustomerMessage(result.status) }, { status: ok ? 200 : 400 })
}
