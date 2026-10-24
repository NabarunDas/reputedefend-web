import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { paymentProvider } from "../../../../lib/payments"
import { isStripeLiveSecret, isStripeTestSecret, paymentsEnabled, type PaymentEnv } from "../../../../lib/payments/config"
import { guardExternalPayment } from "../../../../lib/payments/lane-agreement"
import { PaymentsDisabledError, type PaymentProvider } from "../../../../lib/payments/provider"
import { processStripeEventHandler } from "../payments/handlers"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import type { JobHandlerResult, JobRpc } from "./model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
const CLAIM = "admin_dev_stripe_one_shot_claim_v1"

const reply = (message: string, status = 200) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

/**
 * Closed unless every DEV Preview condition is present. Absence is refusal.
 * This does not read or enable the production worker.
 */
export function devStripeOneShotBlock(env: PaymentEnv = process.env): string | null {
  if (env.VERCEL_ENV !== "preview") return "wrong_environment"
  if (env.VERCEL_GIT_COMMIT_REF !== "develop") return "wrong_branch"
  if (env.SUPABASE_URL !== DEV_SUPABASE_URL) return "wrong_project"
  if (env.AWS_EVIDENCE_BUCKET !== DEV_EVIDENCE_BUCKET) return "wrong_bucket"
  if (env.DEV_STRIPE_ONE_SHOT_ENABLED !== "true") return "disabled"
  if (env.PAYMENTS_PROVIDER_MODE !== "stripe_test") return "wrong_mode"
  if (env.STRIPE_LIVE_ACTIVATION) return "live_activation"
  if (!isStripeTestSecret(env.STRIPE_SECRET_KEY) || isStripeLiveSecret(env.STRIPE_SECRET_KEY)) return "wrong_key"
  if (!paymentsEnabled(env)) return "payments_disabled"
  return null
}

export class DevStripeIsolationError extends Error {
  readonly rpcName: string
  constructor(rpcName: string) {
    super("Guard or unrelated work is not allowed on the DEV Stripe one-shot path.")
    this.name = "DevStripeIsolationError"
    this.rpcName = rpcName
  }
}

const allowedRpc = new Set(["payment_apply_provider_event_v1", "payment_provider_lane_status_v1"])

/**
 * The provider used to classify one Checkout, SetupIntent or invoice.
 * A bare paymentProvider() is disabled on Preview because the database lane
 * is required. This reads that lane and refuses before any Stripe call when
 * it is missing, live, or does not agree with this environment.
 */
export async function devStripeClassificationProvider(rpc: JobRpc, env: PaymentEnv = process.env): Promise<PaymentProvider> {
  const lane = await guardExternalPayment(async (name, args) => rpc.rpc(name, args ?? {}), env)
  if (!lane) throw new PaymentsDisabledError("Payment database lane does not match this environment.")
  const provider = paymentProvider(env, { databaseLane: lane })
  if (provider.mode !== "stripe_test") throw new PaymentsDisabledError("Payment database lane does not match this environment.")
  return provider
}

export function fenceDevStripeRpc(rpc: JobRpc): JobRpc {
  return {
    async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
      if (!allowedRpc.has(name)) throw new DevStripeIsolationError(name)
      return rpc.rpc<T>(name, args ?? {})
    },
  }
}

/** True when this event must stay queued for a separately gated Guard worker. */
export async function stripeEventIsGuardLinked(
  provider: Pick<PaymentProvider, "retrieveCheckout" | "retrieveSetupIntent" | "retrieveRecurringInvoice">,
  eventType: string,
  objectId: string | null,
): Promise<boolean> {
  if (!objectId) return true
  if (eventType.startsWith("checkout.session.")) {
    const session = await provider.retrieveCheckout(objectId)
    if (!session || session.livemode) return true
    return session.mode === "subscription" || Boolean(session.metadata.guardSubscriptionId)
  }
  if (eventType.startsWith("setup_intent.")) {
    const setup = await provider.retrieveSetupIntent(objectId)
    if (!setup || setup.livemode) return true
    return Boolean(setup.metadata.guardSubscriptionId)
  }
  if (eventType.startsWith("invoice.")) {
    const invoice = await provider.retrieveRecurringInvoice(objectId)
    if (!invoice || invoice.livemode) return true
    const parent = invoice.subscriptionMetadata ?? {}
    return Boolean(invoice.subscriptionId || invoice.metadata.guardSubscriptionId || parent.guardSubscriptionId)
  }
  return true
}

type ClaimResult = {
  status?: string
  reason?: string
  replay?: boolean
  currentJobStatus?: string | null
  eventId?: string
  eventType?: string
  objectId?: string
  jobId?: string
  jobType?: string
  idempotencyKey?: string
  payload?: Record<string, unknown>
  leaseToken?: string
  attempts?: number
  maxAttempts?: number
  jobStatus?: string
}

export type SettleOutcome = "succeeded" | "retry" | "dead_letter" | "lease_lost" | "isolated" | "handler_error"

export async function settleClaimedStripeEvent(input: {
  rpc: JobRpc
  claim: ClaimResult
  handler?: ReturnType<typeof processStripeEventHandler>
}): Promise<{ outcome: SettleOutcome; detail: string }> {
  const claim = input.claim
  if (!claim.jobId || !claim.leaseToken || !claim.idempotencyKey || !claim.payload || claim.jobType !== "PROCESS_STRIPE_EVENT") {
    return { outcome: "lease_lost", detail: "The claim did not identify one Stripe event." }
  }
  const handler = input.handler ?? processStripeEventHandler()
  const fenced = fenceDevStripeRpc(input.rpc)
  let result: JobHandlerResult
  try {
    result = await handler.execute({
      idempotencyKey: claim.idempotencyKey,
      payload: claim.payload,
      rpc: fenced,
    })
  } catch (error) {
    const isolated = error instanceof DevStripeIsolationError || (error as { name?: string }).name === "DevStripeIsolationError"
    try {
      const failed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_fail_v1", {
        p_job: claim.jobId,
        p_lease: claim.leaseToken,
        p_error: isolated
          ? "Guard-linked Stripe event is not processed on the DEV one-shot path."
          : "Stripe event processing failed unexpectedly.",
        p_retryable: !isolated,
      })
      if (failed.status !== "success") {
        return { outcome: "lease_lost", detail: "The event was not settled. The lease was no longer held, so it was left unchanged." }
      }
      if (isolated) return { outcome: "isolated", detail: "That event would have called Guard and was dead-lettered without running it." }
      if (failed.jobStatus === "RETRY") {
        return { outcome: "handler_error", detail: "The event was not settled because processing failed. A later one-shot attempt can claim it after the retry delay." }
      }
      return { outcome: "dead_letter", detail: "The event was dead-lettered after a processing failure. It was not marked paid by this request." }
    } catch {
      return { outcome: "lease_lost", detail: "The event was not settled. The lease remains until it expires, and it was not marked paid." }
    }
  }
  if (result.ok) {
    const completed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_complete_v1", {
      p_job: claim.jobId,
      p_lease: claim.leaseToken,
    })
    if (completed.status !== "success" || completed.jobStatus !== "SUCCEEDED") {
      return { outcome: "lease_lost", detail: "The lease was no longer held. Reload the jobs page before trying again." }
    }
    return { outcome: "succeeded", detail: "The selected test-mode Stripe event was processed." }
  }
  const failed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_fail_v1", {
    p_job: claim.jobId,
    p_lease: claim.leaseToken,
    p_error: result.error || "Stripe event processing failed",
    p_retryable: result.retryable,
  })
  if (failed.status !== "success") return { outcome: "lease_lost", detail: "The lease was no longer held. Reload the jobs page before trying again." }
  if (failed.jobStatus === "RETRY") return { outcome: "retry", detail: "The event was not settled. A later one-shot attempt can claim it after the retry delay." }
  return { outcome: "dead_letter", detail: "The event was dead-lettered. It was not marked paid by this request." }
}

function settleStatus(outcome: SettleOutcome): number {
  if (outcome === "succeeded") return 200
  if (outcome === "lease_lost") return 409
  if (outcome === "handler_error") return 503
  return 200
}

function claimMessage(result: ClaimResult): { message: string; status: number } {
  if (result.status === "unauthorized") return { message: "Your session has ended. Please sign in again.", status: 401 }
  if (result.status === "reauth_required") return { message: ADMIN_RECENT_SIGN_IN_MESSAGE, status: 403 }
  if (result.status === "conflict") return { message: "That event is already leased. Wait for the lease to end, then submit a new idempotency key.", status: 409 }
  if (result.status === "preflight_required") return { message: "That event still needs a provider classification.", status: 409 }
  if (result.reason === "missing") return { message: "That test-mode Stripe event is not queued.", status: 404 }
  if (result.reason === "guard_event") return { message: "That event belongs to Guard or subscription billing and was left queued.", status: 403 }
  if (result.reason === "already_processed") return { message: "That event was already processed.", status: 200 }
  if (result.reason === "dead_letter") return { message: "That event is dead-lettered. Replay it from the jobs page before a one-shot attempt.", status: 403 }
  if (result.reason === "not_ready") return { message: "That event is not ready to run yet.", status: 409 }
  if (result.reason === "unsupported" || result.reason === "not_stripe_test" || result.reason === "receipt") {
    return { message: "That event cannot be processed on the DEV one-shot path and was left unchanged.", status: 403 }
  }
  return { message: "The event could not be claimed. Reload the page before trying again.", status: 503 }
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
      return reply("Request too large.", 413)
    }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let body: unknown
  try { body = JSON.parse(raw || "{}") } catch { return reply("Invalid request.", 400) }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Invalid request.", 400)
  return { body: body as Record<string, unknown> }
}

export async function devStripeOneShotCommand(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin)) {
    return reply("Reload this Admin page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const requestId = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(requestId)) return reply("Reload the form and try again.", 400)
  if (devStripeOneShotBlock()) return reply("DEV Stripe one-shot processing is not enabled for this deployment.", 403)

  const parsed = await readBody(request)
  if (parsed instanceof NextResponse) return parsed
  const fields = parsed.body
  const keys = Object.keys(fields)
  if (keys.some(key => key !== "eventId" && key !== "confirmed")) return reply("Check the fields before saving.", 400)
  const eventId = typeof fields.eventId === "string" ? fields.eventId : ""
  if (fields.confirmed !== true || !/^evt_[A-Za-z0-9_]{4,160}$/.test(eventId)) return reply("Confirm the exact test-mode Stripe event.", 400)

  const rpc = backend()
  const claim = async (preflight: boolean) => rpc.rpc<ClaimResult>(CLAIM, {
    p_token: tokenHash(token),
    p_request: requestId,
    p_event_id: eventId,
    p_confirmed: true,
    p_preflight_clear: preflight,
  })

  try {
    let claimed = await claim(false)
    if (claimed.status === "preflight_required") {
      let linked = true
      try {
        linked = await stripeEventIsGuardLinked(
          await devStripeClassificationProvider(rpc),
          claimed.eventType || "",
          claimed.objectId || null,
        )
      } catch {
        return reply("That event could not be classified and was left queued.", 503)
      }
      if (linked) return reply("That event belongs to Guard or subscription billing and was left queued.", 403)
      claimed = await claim(true)
    }
    if (claimed.replay && claimed.currentJobStatus === "RUNNING" && claimed.status === "success") {
      const settled = await settleClaimedStripeEvent({ rpc, claim: claimed })
      return reply(settled.detail, settleStatus(settled.outcome))
    }
    if (claimed.replay) {
      if (claimed.currentJobStatus === "SUCCEEDED" || claimed.reason === "already_processed") {
        return reply("That request was already processed.", 200)
      }
      if (claimed.currentJobStatus === "RETRY") return reply("That attempt did not settle the event. Submit a new idempotency key after the retry delay.", 409)
      if (claimed.currentJobStatus === "DEAD_LETTER" || claimed.reason === "dead_letter") {
        return reply("That event is dead-lettered. Replay it from the jobs page before a one-shot attempt.", 403)
      }
      const mapped = claimMessage(claimed)
      return reply(mapped.message, mapped.status)
    }
    if (claimed.status !== "success") {
      const mapped = claimMessage(claimed)
      return reply(mapped.message, mapped.status)
    }
    const settled = await settleClaimedStripeEvent({ rpc, claim: claimed })
    return reply(settled.detail, settleStatus(settled.outcome))
  } catch {
    return reply("The event could not be processed. Reload the page before trying again.", 503)
  }
}
