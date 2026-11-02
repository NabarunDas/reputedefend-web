import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { devCustomerPortalOrigin } from "../communications/dev-lane"
import type { EnquiryDetail } from "../enquiries/model"
import type { OnboardingView } from "./onboarding"
import {
  dispatchQueuedInvitation,
  invitationDispatchEnabled,
  invitationDispatchReady,
  invitationMessage,
  prepareInvitationHashes,
  type InvitationDispatchOutcome,
} from "./invitation-dispatch"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const referencePattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const operations = ["issue_invitation", "resend_invitation", "revoke_invitation", "process_invitation"] as const

function dispatchMessage(sent: InvitationDispatchOutcome): string {
  if (sent === "accepted") return "Accepted by the email provider. Accepted by the provider is not delivered."
  if (sent === "already") return "The email provider already accepted this invitation. It was not sent again."
  if (sent === "processing") return "This invitation email is already being sent."
  if (sent === "unknown") return "Provider acceptance is unknown. Another invitation was not sent."
  if (sent === "rejected") return "The invitation email was not accepted. It was not sent again."
  if (sent === "closed") return "That invitation is no longer queued. It was not sent again."
  return "The customer invitation is queued. Queued is not delivered."
}

function dispatchStatus(sent: InvitationDispatchOutcome): number {
  if (sent === "unavailable") return 503
  if (sent === "processing" || sent === "unknown" || sent === "rejected" || sent === "closed") return 409
  return 200
}

export async function invitationCommand(request: NextRequest) {
  if (!invitationDispatchEnabled()) return reply("Invitation sending is switched off.", 404)
  if (!invitationDispatchReady()) return reply("Invitation sending is not available yet.", 503)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  const portalOrigin = devCustomerPortalOrigin()
  if (!portalOrigin) return reply("Invitation sending is not available yet.", 503)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8000) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    if (!body || typeof body !== "object") return reply("Please check the form and try again.", 400)
    const record = body as Record<string, unknown>
    const allowed = new Set(["operation", "enquiryId", "version", "reason"])
    if (Object.keys(record).some(name => !allowed.has(name))) return reply("Please check the form and try again.", 400)
    const operation = operations.find(item => item === record.operation)
    const enquiryId = isUuid(record.enquiryId) ? record.enquiryId : null
    const version = typeof record.version === "number" && Number.isInteger(record.version) && record.version >= 0 ? record.version : null
    const reason = typeof record.reason === "string" && record.reason.trim().length >= 10 && record.reason.trim().length <= 1000 ? record.reason.trim() : null
    if (!operation || !enquiryId || version === null || !reason) return reply("Check the note before saving.", 400)
    const detail = await backend().rpc<EnquiryDetail | { missing: true }>("admin_enquiry_detail_v1", { p_token: tokenHash(token), p_id: enquiryId })
    if (!detail || "missing" in detail) return reply("Reload this enquiry before trying again.", 404)
    const onboarding = await backend().rpc<OnboardingView | null>("admin_commercial_onboarding_v1", { p_token: tokenHash(token), p_enquiry: enquiryId })
    const requestId = onboarding && onboarding.supported ? onboarding.request?.id : null
    if (!requestId) return reply("This onboarding request is not ready for an invitation.", 403)
    const reference = detail.caseRef && referencePattern.test(detail.caseRef) ? detail.caseRef : null
    const preparesMail = operation === "issue_invitation" || operation === "resend_invitation"
    const message = preparesMail ? invitationMessage({ origin: portalOrigin, reference }) : null
    const hashes = preparesMail ? prepareInvitationHashes(requestId) : null
    if (preparesMail && (!message || !hashes)) return reply("Invitation sending is not available yet.", 503)
    const result = await backend().rpc<{ status: string; reason?: string; operation?: string; originalRequest?: string }>("admin_customer_invitation_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_operation: operation,
      p_enquiry: enquiryId,
      p_version: version,
      p_reason: reason,
      p_hashes: hashes,
      p_origin: message?.origin ?? null,
      p_sender: message?.sender ?? null,
      p_subject: message?.subject ?? null,
      p_body_text: message?.text ?? null,
      p_body_html: message?.html ?? null,
      p_link_key_version: message?.linkKeyVersion ?? null,
      p_reference: reference,
    })
    if (result.status === "success" && (operation === "issue_invitation" || operation === "resend_invitation")) {
      const sent = await dispatchQueuedInvitation({ requestId: key })
      return reply(dispatchMessage(sent), dispatchStatus(sent))
    }
    if (result.status === "success" && operation === "process_invitation") {
      if (!isUuid(result.originalRequest)) return reply("The queued invitation could not be processed. Reload the enquiry before trying again.", 503)
      const sent = await dispatchQueuedInvitation({ requestId: result.originalRequest })
      return reply(dispatchMessage(sent), dispatchStatus(sent))
    }
    switch (result.status) {
      case "success": return reply("The invitation was withdrawn. The link can no longer be used.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "duplicate") return reply("An invitation is already queued. Reload this enquiry before sending again.", 409)
        return reply("This request has changed. Reload it before trying again.", 409)
      case "denied":
        if (result.reason === "already_verified") return reply("This email is already verified. The existing login remains available. No invitation is sent.", 403)
        if (result.reason === "cap") return reply("No further invitation can be sent for this request.", 403)
        if (result.reason === "reference") return reply("This enquiry has no matching reference to include.", 403)
        if (result.reason === "queued") return reply("An invitation email is already queued. It has not been sent again.", 409)
        if (result.reason === "processing") return reply("This invitation email is already being sent. Another invitation was not created.", 409)
        if (result.reason === "acceptance_unknown") return reply("Provider acceptance is unknown. Another invitation was not sent.", 409)
        if (result.reason === "uncertain") return reply("The invitation email needs review. It has not been sent again.", 409)
        if (result.reason === "already_accepted") return reply("The email provider already accepted this invitation. Another invitation was not sent.", 409)
        if (result.reason === "delivered") return reply("This invitation was delivered. Another invitation was not sent.", 409)
        if (result.reason === "dead_letter") return reply("The invitation email was not accepted. It was not sent again.", 409)
        if (result.reason === "missing") return reply("There is no invitation waiting to be sent.", 404)
        return reply("This onboarding request is not ready for an invitation.", 403)
      case "invalid": return reply("Check the note before saving.", 400)
      default: return reply("We couldn’t confirm the change. Reload the enquiry before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t confirm the change. Reload the enquiry before trying again.", 503)
  }
}
