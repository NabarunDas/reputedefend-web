import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { telloyaDemoWriteAvailable } from "./telloya-demo-status"

const reply = (message: string, status: number) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function customerOrigin() {
  const value = process.env.CUSTOMER_ORIGIN ?? ""
  if (!/^https:\/\/[a-z0-9.-]+$/.test(value)) return null
  if (!/^https:\/\/([a-z0-9-]+\.)*(profilerelaunch\.com|telloya\.com)$/.test(value) && value !== "https://localhost") return null
  return value
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
      if (size > 4096) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    const body = JSON.parse(raw) as Record<string, unknown>
    if (body.operation === "revision") {
      if (!isUuid(body.amendmentId) || !Number.isInteger(body.expectedVersion) || (body.decision !== "APPROVED" && body.decision !== "DECLINED")) {
        return reply("Reload the amendment before deciding it.", 400)
      }
      const result = await backend().rpc<{ status: string }>("telloya_offer_revision_v1", {
        p_token: tokenHash(token),
        p_request: key,
        p_amendment: body.amendmentId,
        p_expected_version: body.expectedVersion,
        p_decision: body.decision,
      })
      if (result.status === "recorded" || result.status === "replay") return reply("Saved. The commercial offer has been reviewed.", 200)
      if (result.status === "stale_version") return reply("This amendment has changed. Reload it before trying again.", 409)
      if (result.status === "offer_not_open") return reply("That offer is no longer open.", 409)
      return reply("This deployment cannot review that amendment. Nothing was saved.", 503)
    }
    if (body.operation === "mail") {
      const origin = customerOrigin()
      if (!origin) return reply("The customer portal address is not configured. No email was queued.", 403)
      if (!isUuid(body.subscriptionId) || !Number.isInteger(body.expectedVersion)) return reply("Reload the offer before queueing email.", 400)
      const result = await backend().rpc<{ status: string }>("telloya_offer_mail_v1", {
        p_token: tokenHash(token),
        p_request: key,
        p_subscription: body.subscriptionId,
        p_expected_version: body.expectedVersion,
        p_origin: origin,
      })
      if (result.status === "queued" || result.status === "replay") return reply("The offer email is queued. Queued does not mean the provider accepted it or that it was delivered.", 200)
      if (result.status === "mail_disabled") return reply("Offer email stays off until the mail control is enabled. Nothing was queued.", 403)
      if (result.status === "stale_version") return reply("This offer has changed. Reload it before queueing email.", 409)
      return reply("This deployment cannot queue that email. Nothing was sent.", 503)
    }
    return reply("Reload the offer before trying again.", 400)
  } catch {
    return reply("This deployment cannot update that offer. Nothing was saved.", 503)
  }
}
