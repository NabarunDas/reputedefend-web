import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { verifyVercelOidcToken, type VercelOidcPayload } from "@vercel/oidc"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin, devPreviewMailConfigured } from "./dev-lane"
import { communicationsSendEnabled } from "./gate"
import { settleDevSendEmailClaim, type DevSendClaim } from "./dev-send"
import { resolveMailProvider, type OutgoingMailProvider } from "./mail"

const OIDC_HEADER = "x-vercel-trusted-oidc-idp-token"
const CUSTOMER_PROJECT = "profilerelaunch-customer"

export type CentralDispatchStatus =
  | "accepted"
  | "held"
  | "conflict"
  | "retry"
  | "unknown"
  | "dead"
  | "unavailable"
  | "disabled"

const reply = (status: CentralDispatchStatus, http = 200) =>
  NextResponse.json({ status }, { status: http, headers: privateResponseHeaders })

/** The Admin develop lane that already sends quotation and evidence mail. The worker flag is not read. */
export function centralDispatchLaneOpen(): boolean {
  return devAdminOutgoingMailLane()
    && devPreviewMailConfigured()
    && communicationsSendEnabled()
    && devCustomerPortalOrigin() !== null
}

export async function customerPreviewCaller(token: string): Promise<boolean> {
  const ownerId = process.env.VERCEL_ORG_ID
  if (!ownerId || token.length < 20 || token.length > 16384) return false
  try {
    const verified = await verifyVercelOidcToken<VercelOidcPayload>(token, {
      projectId: "*",
      environment: "preview",
      ownerId,
    })
    const subject = verified.payload.sub
    return verified.payload.owner_id === ownerId
      && verified.payload.environment === "preview"
      && typeof subject === "string"
      && subject.includes(`:project:${CUSTOMER_PROJECT}:environment:preview`)
  } catch {
    return false
  }
}

function claimStatus(claim: DevSendClaim): CentralDispatchStatus | null {
  if (claim.reason === "not_ready") return "held"
  if (claim.status === "conflict" || claim.reason === "leased" || claim.reason === "locked") return "conflict"
  if (claim.reason === "already_processed") return "accepted"
  if (claim.reason === "acceptance_unknown") return "unknown"
  if (claim.reason === "dead_letter") return "dead"
  if (claim.status !== "success" || claim.replay === true || !claim.leaseToken || claim.jobType !== "SEND_EMAIL") {
    return "unavailable"
  }
  return null
}

/**
 * Claims the communication stored for this queue request and sends it with the
 * existing Admin mail handler. The request id is the only input. A missing
 * activation row does not block this request, and the sweep worker stays closed.
 */
export async function dispatchQueuedMailRequest(input: {
  requestId: string
  provider?: OutgoingMailProvider
}): Promise<CentralDispatchStatus> {
  if (!centralDispatchLaneOpen()) return "disabled"
  const origin = devCustomerPortalOrigin()
  const provider = input.provider ?? resolveMailProvider()
  if (!origin || provider === "disabled") return "disabled"
  let claim: DevSendClaim
  try {
    claim = await backend().rpc<DevSendClaim>("dev_mail_dispatch_claim_request_v1", {
      p_request: input.requestId,
      p_customer_origin: origin,
    })
  } catch {
    return "unavailable"
  }
  const refused = claimStatus(claim)
  if (refused) return refused
  try {
    const settled = await settleDevSendEmailClaim({ rpc: backend(), claim, provider })
    if (settled === "succeeded") return "accepted"
    if (settled === "retry") return "retry"
    if (settled === "dead_letter") return "dead"
    return "unavailable"
  } catch {
    return "unavailable"
  }
}

function requestIdFrom(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, "requestId")) return null
  return isUuid(record.requestId) ? record.requestId : null
}

/** Customer develop Preview event. A browser session cannot call this, and the body cannot name a recipient. */
export async function centralDispatchCommand(request: NextRequest): Promise<NextResponse> {
  if (!centralDispatchLaneOpen()) return reply("disabled", 404)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("unavailable", 415)
  const token = request.headers.get(OIDC_HEADER) ?? ""
  if (!await customerPreviewCaller(token)) return reply("unavailable", 401)
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 256) {
      await reader.cancel()
      return reply("unavailable", 413)
    }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let body: unknown
  try { body = JSON.parse(raw || "{}") } catch { return reply("unavailable", 400) }
  const requestId = requestIdFrom(body)
  if (!requestId) return reply("unavailable", 400)
  const status = await dispatchQueuedMailRequest({ requestId })
  if (status === "disabled") return reply(status, 404)
  if (status === "unavailable") return reply(status, 503)
  if (status === "conflict" || status === "unknown" || status === "dead") return reply(status, 409)
  return reply(status, 200)
}
