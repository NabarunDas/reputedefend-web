import "server-only"
import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { telloyaDemoWriteAvailable } from "./telloya-demo-status"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

function customerOrigin() {
  const value = process.env.CUSTOMER_ORIGIN ?? ""
  if (!/^https:\/\/[a-z0-9.-]+$/.test(value)) return null
  if (!/^https:\/\/([a-z0-9-]+\.)*(profilerelaunch\.com|telloya\.com)$/.test(value) && value !== "https://localhost") return null
  return value
}

/** Deterministic UUID matching admin_private.commercial_request_uuid_v1. */
export function commercialRequestUuid(requestId: string, suffix: string): string {
  const digest = createHash("md5").update(`${requestId}:${suffix}`).digest("hex")
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function mapPrepareDenial(status: string, reason?: string): { message: string; code: number } | null {
  if (status === "unauthorized") return { message: "Please sign in again.", code: 401 }
  if (status === "invalid" && reason === "reason") return { message: "Add a short factual reason before approving the offer.", code: 400 }
  if (status === "invalid" && reason === "plan_tier") return { message: "Save a plan selection on the draft before approving the offer.", code: 400 }
  if (status === "invalid") return { message: "Reload the saved draft before approving the offer.", code: 400 }
  if (status === "conflict") return { message: "This approval request does not match the earlier attempt. Reload and try again.", code: 409 }
  if (status === "demonstration_not_completed") return { message: "Complete the offline demonstration before approving the offer.", code: 409 }
  if (status === "draft_required") return { message: "Save a quote draft before approving the offer.", code: 409 }
  if (status === "stale_draft") return { message: "This draft has changed. Reload it before approving the offer.", code: 409 }
  if (status === "terms_unconfigured" && reason === "custom_approval") {
    return { message: "Custom draft saved — approval required to issue offer. Convert the proposed amount through commercial plan approval first.", code: 409 }
  }
  if (status === "terms_unconfigured" && reason === "catalogue") return { message: "Not sendable — approved Telloya plan catalogue is not configured.", code: 409 }
  if (status === "terms_unconfigured" && reason === "conditions") return { message: "Not sendable — approved plan conditions are not configured.", code: 409 }
  if (status === "terms_unconfigured" && reason === "agreement") return { message: "Not sendable — approved service agreement is not configured.", code: 409 }
  if (status === "terms_unconfigured") return { message: "Not sendable — approved catalogue or agreement is not configured.", code: 409 }
  if (status === "denied" && reason === "not_telloya") return { message: "That enquiry is not a Telloya enquiry.", code: 403 }
  if (status === "denied" && reason === "onboarding_missing") return { message: "Prepare the Telloya sales context before approving the offer.", code: 409 }
  if (status === "denied" && reason === "identity") return { message: "Confirm the customer and business before approving the offer.", code: 409 }
  if (status === "denied" && reason === "authority") return { message: "Business authority must be verified before approving the offer.", code: 403 }
  if (status === "denied" && reason === "recipient_unverified") return { message: "The customer email must be verified before the offer can be sent.", code: 403 }
  if (status === "denied" && reason === "operating_location") return { message: "Confirm an operating location before approving the offer.", code: 409 }
  if (status === "denied" && reason === "guard_unresolved") return { message: "Confirm explicit Guard locations or clear the proposed quantity before approving the offer.", code: 409 }
  if (status === "denied" && reason === "guard") return { message: "One or more Guard locations are not linked to this business.", code: 409 }
  if (status === "denied" && reason === "custom_incomplete") return { message: "Custom amount and included minutes must be saved before approving the offer.", code: 409 }
  if (status === "denied" && reason === "custom_mismatch") return { message: "The approved Custom plan no longer matches the saved draft.", code: 409 }
  if (status === "denied" && reason === "offer_mismatch") return { message: "The linked commercial offer no longer matches the saved draft.", code: 409 }
  if (status === "denied") return { message: "This offer cannot be approved from the saved draft.", code: 403 }
  return null
}

function mapMailDenial(status: string, reason?: string): { message: string; code: number } | null {
  if (status === "unauthorized") return { message: "Please sign in again.", code: 401 }
  if (status === "invalid") return { message: "Reload the offer before approving email.", code: 400 }
  if (status === "mail_disabled") return { message: "Offer email stays off until the mail control is enabled. Nothing was queued.", code: 403 }
  if (status === "template_unapproved") return { message: "The Telloya offer template is not approved. Nothing was queued.", code: 409 }
  if (status === "ineligible") return { message: "That offer is not linked to this Telloya enquiry. Nothing was queued.", code: 403 }
  if (status === "demonstration_not_completed") return { message: "Complete the offline demonstration before queueing the offer email.", code: 409 }
  if (status === "amendment_pending") return { message: "A change request is open. Resolve it before queueing the offer email.", code: 409 }
  if (status === "offer_not_open") return { message: "That offer is no longer open for email. Nothing was queued.", code: 409 }
  if (status === "denied" && reason === "authority") return { message: "Business authority is no longer verified. Nothing was queued.", code: 403 }
  if (status === "denied" && reason === "recipient_unverified") return { message: "The customer email must be verified before the offer can be queued. Nothing was queued.", code: 403 }
  if (status === "terms_unconfigured" && reason === "agreement") return { message: "The Telloya service agreement is not approved. Nothing was queued.", code: 409 }
  if (status === "terms_unconfigured" && reason === "tax") return { message: "This tax treatment is not ready for a customer offer email. Nothing was queued.", code: 409 }
  if (status === "terms_unconfigured") return { message: "The commercial terms are not ready for a customer offer email. Nothing was queued.", code: 409 }
  if (status === "stale_version") return { message: "This offer has changed. Reload it before queueing email.", code: 409 }
  return null
}

export async function telloyaOfferCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  if (!telloyaDemoWriteAvailable()) return reply("Offer changes stay off. The admin journey flag is not enabled.", 403)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = "", size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    const body = JSON.parse(raw) as Record<string, unknown>
    if (body.operation === "revision") {
      const decision = body.decision
      if (!isUuid(body.amendmentId) || !Number.isInteger(body.expectedVersion) || (decision !== "REVISED" && decision !== "NOTED" && decision !== "DECLINED")) {
        return reply("Reload the amendment before deciding it.", 400)
      }
      const locations = Array.isArray(body.guardLocationIds) ? body.guardLocationIds : []
      if (decision === "REVISED" && (!isUuid(body.planVersionId) || locations.some(id => !isUuid(id)))) {
        return reply("Choose an approved plan and confirmed Guard locations.", 400)
      }
      const result = await backend().rpc<{ status: string; decision?: string }>("telloya_offer_revision_v1", {
        p_token: tokenHash(token),
        p_request: key,
        p_amendment: body.amendmentId,
        p_expected_version: body.expectedVersion,
        p_decision: decision,
        p_plan: decision === "REVISED" ? body.planVersionId : null,
        p_locations: decision === "REVISED" ? locations : [],
      })
      if (result.status === "recorded" && result.decision === "REVISED") return reply("The revised offer is ready. The previous offer is canceled.", 200)
      if (result.status === "recorded" && result.decision === "NOTED") return reply("The request is recorded. The commercial offer is unchanged.", 200)
      if (result.status === "recorded" || result.status === "replay") return reply("Saved. The commercial offer has been reviewed.", 200)
      if (result.status === "unchanged") return reply("That selection matches the current offer. No replacement was created.", 409)
      if (result.status === "stale_version") return reply("This amendment has changed. Reload it before trying again.", 409)
      if (result.status === "offer_not_open") return reply("That offer is no longer open.", 409)
      if (result.status === "demonstration_not_completed") return reply("Complete the offline demonstration before issuing a revised offer.", 409)
      if (result.status === "ineligible") return reply("That offer is not linked to this Telloya enquiry.", 403)
      if (result.status === "terms_unconfigured") return reply("The selected plan or Guard locations are not an approved offer. Nothing was saved.", 409)
      return reply("This deployment cannot review that amendment. Nothing was saved.", 503)
    }
    if (body.operation === "preview") {
      const origin = customerOrigin()
      if (!origin) return reply("The customer portal address is not configured. No preview was created.", 403)
      if (!isUuid(body.enquiryId)) return reply("Reload the enquiry before previewing email.", 400)
      const result = await backend().rpc<{
        status: string
        reason?: string
        subject?: string
        text?: string
        html?: string
        recipient?: string | null
        previewOnly?: boolean
      }>("telloya_offer_preview_v1", {
        p_token: tokenHash(token),
        p_enquiry: body.enquiryId,
        p_origin: origin,
      })
      if (result.status === "ready") {
        return reply("Email preview ready. Nothing was queued or sent.", 200, {
          previewOnly: true,
          subject: result.subject ?? "",
          text: result.text ?? "",
          html: result.html ?? "",
          recipient: result.recipient ?? null,
        })
      }
      if (result.status === "unauthorized") return reply("Please sign in again.", 401)
      if (result.status === "invalid") return reply("Reload the enquiry before previewing email.", 400)
      if (result.status === "no_offer") return reply("Save a quote draft or prepare an offer before previewing email.", 409)
      if (result.status === "draft_required") return reply("Save a quote draft before previewing email.", 409)
      if (result.status === "ineligible") return reply("That offer is not linked to this Telloya enquiry.", 403)
      if (result.status === "terms_unconfigured") return reply("Not sendable — approved catalogue matching the draft is not configured.", 409)
      return reply("This deployment cannot preview that email. Nothing was sent.", 503)
    }
    if (body.operation === "approve_send") {
      const origin = customerOrigin()
      if (!origin) return reply("The customer portal address is not configured. No email was queued.", 403)
      if (!isUuid(body.enquiryId)) return reply("Reload the enquiry before approving the offer.", 400)
      const reason = typeof body.reason === "string" ? body.reason.trim() : ""
      if (reason.length < 8 || reason.length > 500) return reply("Add a short factual reason before approving the offer.", 400)

      if (!Number.isInteger(body.expectedDraftVersion) || (body.expectedDraftVersion as number) < 1) {
        return reply("Save the quote draft before approving the offer.", 400)
      }
      const prepared = await backend().rpc<{
        status: string
        reason?: string
        subscriptionId?: string
        version?: number
        existing?: boolean
      }>("telloya_prepare_offer_from_draft_v1", {
        p_token: tokenHash(token),
        p_request: key,
        p_enquiry: body.enquiryId,
        p_expected_draft_version: body.expectedDraftVersion,
        p_reason: reason,
      })
      if (prepared.status !== "success" || !prepared.subscriptionId || !Number.isInteger(prepared.version)) {
        const denial = mapPrepareDenial(prepared.status, prepared.reason)
        if (denial) return reply(denial.message, denial.code)
        return reply("This deployment cannot prepare that offer from the saved draft. Nothing was queued.", 503)
      }
      const subscriptionId = prepared.subscriptionId
      const expectedVersion = prepared.version as number
      if (
        typeof body.subscriptionId === "string"
        && isUuid(body.subscriptionId)
        && body.subscriptionId !== subscriptionId
      ) {
        return reply("This offer has changed. Reload it before approving email.", 409)
      }

      const mailKey = commercialRequestUuid(key!, "mail")
      const mailed = await backend().rpc<{ status: string; reason?: string; deliveryStatus?: string }>("telloya_offer_mail_v1", {
        p_token: tokenHash(token),
        p_request: mailKey,
        p_subscription: subscriptionId,
        p_expected_version: expectedVersion,
        p_origin: origin,
      })
      if (mailed.status === "queued" || mailed.status === "replay") {
        return reply("The offer email is queued. Queued does not mean the provider accepted it or that it was delivered.", 200, {
          queued: true,
          delivered: false,
          deliveryStatus: mailed.deliveryStatus ?? "NONE",
          subscriptionId,
        })
      }
      const denial = mapMailDenial(mailed.status, mailed.reason)
      if (denial) {
        return reply(
          `${denial.message} The commercial offer is prepared (${subscriptionId}). Approve & Send again to resume queueing without creating a second offer.`,
          denial.code,
          { prepared: true, queued: false, subscriptionId, version: expectedVersion },
        )
      }
      return reply("This deployment cannot queue that email. Nothing was sent.", 503, {
        prepared: true,
        queued: false,
        subscriptionId,
        version: expectedVersion,
      })
    }
    if (body.operation === "mail") {
      const origin = customerOrigin()
      if (!origin) return reply("The customer portal address is not configured. No email was queued.", 403)
      if (!isUuid(body.subscriptionId) || !Number.isInteger(body.expectedVersion)) return reply("Reload the offer before queueing email.", 400)
      const result = await backend().rpc<{ status: string; reason?: string }>("telloya_offer_mail_v1", {
        p_token: tokenHash(token),
        p_request: key,
        p_subscription: body.subscriptionId,
        p_expected_version: body.expectedVersion,
        p_origin: origin,
      })
      if (result.status === "queued" || result.status === "replay") return reply("The offer email is queued. Queued does not mean the provider accepted it or that it was delivered.", 200)
      const denial = mapMailDenial(result.status, result.reason)
      if (denial) return reply(denial.message, denial.code)
      return reply("This deployment cannot queue that email. Nothing was sent.", 503)
    }
    return reply("Reload the offer before trying again.", 400)
  } catch {
    return reply("This deployment cannot update that offer. Nothing was saved.", 503)
  }
}
