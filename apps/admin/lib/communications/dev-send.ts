import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import type { JobHandlerResult, JobRpc } from "../jobs/model"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin } from "./dev-lane"
import type { EnvMap } from "../jobs/config"
import { communicationsSendEnabled, sendDisabledReason } from "./gate"
import { sendEmailHandler } from "./handler"
import { resolveMailProvider, type OutgoingMailProvider } from "./mail"

const CLAIM = "admin_dev_send_email_claim_v1"
const reply = (message: string, status = 200) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

const handlerRpc = new Set([
  "communication_load_send_v1",
  "communication_begin_provider_attempt_v1",
  "communication_mark_acceptance_unknown_v1",
  "communication_mark_provider_rejected_v1",
])

export class DevSendIsolationError extends Error {
  readonly rpcName: string
  constructor(rpcName: string) {
    super("Only the queued email job can run on this path.")
    this.name = "DevSendIsolationError"
    this.rpcName = rpcName
  }
}

export function fenceDevSendRpc(rpc: JobRpc): JobRpc {
  return {
    async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
      if (!handlerRpc.has(name)) throw new DevSendIsolationError(name)
      return rpc.rpc<T>(name, args ?? {})
    },
  }
}

export type DevSendClaim = {
  status?: string
  reason?: string
  replay?: boolean
  currentJobStatus?: string | null
  jobId?: string
  jobType?: string
  idempotencyKey?: string
  payload?: Record<string, unknown>
  leaseToken?: string
}

export type DevSendSettlement = "succeeded" | "retry" | "dead_letter" | "isolated" | "unavailable"

export async function settleDevSendEmailClaim(input: {
  rpc: JobRpc
  claim: DevSendClaim
  provider?: OutgoingMailProvider
  env?: EnvMap
}): Promise<DevSendSettlement> {
  const claim = input.claim
  if (claim.replay === true) return "unavailable"
  if (claim.jobType !== "SEND_EMAIL" || !claim.jobId || !claim.leaseToken || !claim.idempotencyKey || !claim.payload) {
    return "unavailable"
  }
  const fail = (retryable: boolean, error: string) => input.rpc.rpc("job_fail_v1", {
    p_job: claim.jobId,
    p_lease: claim.leaseToken,
    p_error: error,
    p_retryable: retryable,
  })
  let result: JobHandlerResult
  try {
    result = await sendEmailHandler(input.env, input.provider).execute({
      idempotencyKey: claim.idempotencyKey,
      payload: claim.payload,
      rpc: fenceDevSendRpc(input.rpc),
    })
  } catch (error) {
    if (error instanceof DevSendIsolationError) {
      await fail(false, "Unrelated work is not allowed")
      return "isolated"
    }
    await fail(true, "Email provider acceptance is unknown")
    return "retry"
  }
  if (result.ok) {
    if (result.providerAccepted) {
      await input.rpc.rpc("communication_mark_provider_accepted_v1", {
        p_communication: result.providerAccepted.communicationId,
        p_provider: result.providerAccepted.provider,
        p_provider_message_id: result.providerAccepted.providerMessageId,
        p_idempotency_key: claim.idempotencyKey,
      })
    }
    await input.rpc.rpc("job_complete_v1", { p_job: claim.jobId, p_lease: claim.leaseToken })
    return "succeeded"
  }
  await fail(result.retryable, result.error)
  return result.retryable ? "retry" : "dead_letter"
}

function claimMessage(result: DevSendClaim): { message: string; status: number } {
  if (result.status === "unauthorized") return { message: "Your session has ended. Please sign in again.", status: 401 }
  if (result.status === "reauth_required") return { message: "Sign out and sign in with a new email code, then try again within 30 minutes.", status: 403 }
  if (result.status === "conflict") return { message: "That email is already being processed. Wait for the lease to end, then submit a new idempotency key.", status: 409 }
  if (result.reason === "origin") return { message: "The stored upload link is not the development customer portal. The email was not sent.", status: 403 }
  if (result.reason === "acceptance_unknown") return { message: "Provider acceptance is unknown. The email was not sent again.", status: 409 }
  if (result.reason === "not_queued") return { message: "That communication is not a queued email.", status: 404 }
  if (result.reason === "already_processed") return { message: "That queued email was already processed.", status: 200 }
  if (result.reason === "dead_letter") return { message: "That email job is dead-lettered. It was not sent again.", status: 403 }
  if (result.reason === "not_ready") return { message: "That email is not ready to send yet.", status: 409 }
  if (result.reason === "not_send_email") return { message: "That job is not an approved email and was left unchanged.", status: 403 }
  return { message: "The queued email could not be processed. Reload the page before trying again.", status: 503 }
}

async function readBody(request: NextRequest): Promise<{ body: Record<string, unknown> } | NextResponse> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2048) {
      await reader.cancel()
      return reply("That request is too large.", 413)
    }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let body: unknown
  try { body = JSON.parse(raw || "{}") } catch { return reply("Check the communication and try again.", 400) }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Check the communication and try again.", 400)
  return { body: body as Record<string, unknown> }
}

export async function devSendEmailCommand(
  request: NextRequest,
  deps: { provider?: OutgoingMailProvider } = {},
): Promise<NextResponse> {
  if (!devAdminOutgoingMailLane()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin)) {
    return reply("Reload this page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const requestId = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(requestId)) return reply("Reload the form and try again.", 400)
  if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403)

  const parsed = await readBody(request)
  if (parsed instanceof NextResponse) return parsed
  const fields = parsed.body
  const keys = Object.keys(fields)
  if (keys.length !== 2 || !Object.hasOwn(fields, "communicationId") || !Object.hasOwn(fields, "confirmed")) {
    return reply("Check the communication and try again.", 400)
  }
  if (fields.confirmed !== true || !isUuid(fields.communicationId)) return reply("Confirm the queued email before sending.", 400)
  const portal = devCustomerPortalOrigin()
  if (!portal) return reply("The development customer portal is not configured.", 503)
  const provider = deps.provider ?? resolveMailProvider()
  if (provider === "disabled") return reply(sendDisabledReason(), 403)

  try {
    const claimed = await backend().rpc<DevSendClaim>(CLAIM, {
      p_token: tokenHash(token),
      p_request: requestId,
      p_communication: fields.communicationId,
      p_confirmed: true,
      p_customer_origin: portal,
    })
    if (claimed.replay === true) {
      if (claimed.currentJobStatus === "SUCCEEDED" || claimed.reason === "already_processed") {
        return reply("That queued email was already processed.")
      }
      if (claimed.status === "success" && claimed.currentJobStatus === "RUNNING") {
        return reply("That email is already being processed. This request will not send it again.", 409)
      }
      const mapped = claimMessage(claimed)
      return reply(mapped.message, mapped.status)
    }
    if (claimed.status !== "success") {
      const mapped = claimMessage(claimed)
      return reply(mapped.message, mapped.status)
    }
    const settled = await settleDevSendEmailClaim({ rpc: backend(), claim: claimed, provider })
    if (settled === "succeeded") return reply("The queued email was submitted to the email provider.")
    if (settled === "isolated") return reply("That job is not an approved email and was left unchanged.", 403)
    return reply("The queued email was not accepted. It was not submitted again.", settled === "retry" ? 503 : 409)
  } catch {
    return reply("The queued email could not be processed. Reload the page before trying again.", 503)
  }
}
