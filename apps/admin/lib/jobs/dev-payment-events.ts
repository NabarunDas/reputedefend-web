import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { isStripeLiveSecret, isStripeTestSecret, isStripeWebhookSecret, type PaymentEnv } from "../../../../lib/payments/config"
import type { PaymentProvider } from "../../../../lib/payments/provider"
import { processStripeEventHandler } from "../payments/handlers"
import { customerPortalOrigin } from "../auth/config"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { communicationsSendEnabled } from "../communications/gate"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import type { OutgoingMailProvider } from "../communications/mail"
import { cronAuthorized } from "./config"
import type { JobHandler, JobHandlerResult, JobRpc } from "./model"
import { devStripeClassificationProvider } from "./dev-stripe-one-shot"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
export const DEV_PAYMENT_EVENT_WORKER_NAME = "dev-payment-events"
export const DEFAULT_DEV_PAYMENT_CADENCE_SECONDS = 300
const MIN_CADENCE_SECONDS = 60
const MAX_CADENCE_SECONDS = 900
const MAX_CLAIMS_PER_RUN = 5

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

/**
 * Closed unless every DEV Preview condition is present. Absence is refusal.
 * The worker's branch-specific secrets are loaded only on a fresh develop deployment.
 * Rotating the worker key requires a new DEV deployment; previous deployments retain the prior key.
 * This does not read or enable the production worker.
 */
export function devPaymentEventWorkerBlock(env: PaymentEnv = process.env): string | null {
  if (env.VERCEL_ENV !== "preview") return "wrong_environment"
  if (env.VERCEL_GIT_COMMIT_REF !== "develop") return "wrong_branch"
  if (env.SUPABASE_URL !== DEV_SUPABASE_URL) return "wrong_project"
  if (env.AWS_EVIDENCE_BUCKET !== DEV_EVIDENCE_BUCKET) return "wrong_bucket"
  if (env.DEV_PAYMENT_EVENT_WORKER_ENABLED !== "true") return "disabled"
  if (env.PAYMENTS_PROVIDER_MODE !== "stripe_test") return "wrong_mode"
  if (env.STRIPE_LIVE_ACTIVATION) return "live_activation"
  if (!isStripeTestSecret(env.STRIPE_SECRET_KEY) || isStripeLiveSecret(env.STRIPE_SECRET_KEY)) return "wrong_key"
  if (!isStripeWebhookSecret(env.STRIPE_WEBHOOK_SECRET)) return "payments_disabled"
  if (!env.DEV_PAYMENT_EVENT_WORKER_SECRET || env.DEV_PAYMENT_EVENT_WORKER_SECRET.length < 32) return "missing_secret"
  return null
}

export function parseDevPaymentCadenceSeconds(env: PaymentEnv = process.env): number {
  const raw = env.DEV_PAYMENT_EVENT_WORKER_CADENCE_SECONDS
  if (raw === undefined || raw === "") return DEFAULT_DEV_PAYMENT_CADENCE_SECONDS
  if (!/^[0-9]+$/.test(raw)) return DEFAULT_DEV_PAYMENT_CADENCE_SECONDS
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < MIN_CADENCE_SECONDS || value > MAX_CADENCE_SECONDS) {
    return DEFAULT_DEV_PAYMENT_CADENCE_SECONDS
  }
  return value
}

export function devPaymentEventWorkerSecret(env: PaymentEnv = process.env): string | null {
  const secret = env.DEV_PAYMENT_EVENT_WORKER_SECRET
  return secret && secret.length >= 32 ? secret : null
}

export class DevPaymentIsolationError extends Error {
  readonly rpcName: string
  constructor(rpcName: string) {
    super("Guard or unrelated work is not allowed on the DEV payment event worker.")
    this.name = "DevPaymentIsolationError"
    this.rpcName = rpcName
  }
}

const allowedRpc = new Set([
  "payment_provider_lane_status_v1",
  "payment_apply_provider_event_v1",
  "payment_confirmation_context_v1",
  "payment_queue_confirmation_v1",
])

export function fenceDevPaymentRpc(rpc: JobRpc): JobRpc {
  return {
    async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
      if (!allowedRpc.has(name)) throw new DevPaymentIsolationError(name)
      return rpc.rpc<T>(name, args ?? {})
    },
  }
}

/** True when this Checkout must stay queued for a separately gated Guard worker. */
export async function checkoutSessionIsGuard(
  provider: Pick<PaymentProvider, "retrieveCheckout">,
  objectId: string,
): Promise<boolean> {
  const session = await provider.retrieveCheckout(objectId)
  if (!session || session.livemode) return true
  return session.mode === "subscription" || Boolean(session.metadata.guardSubscriptionId)
}

type ClaimResult = {
  status?: string
  reason?: string
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

type Candidate = { eventId?: string; eventType?: string; objectId?: string }

export type DevPaymentRunCounts = {
  claimed: number
  succeeded: number
  retried: number
  deadLettered: number
  released: number
  skipped: number
  confirmationSent: number
}

const emptyCounts = (): DevPaymentRunCounts => ({
  claimed: 0, succeeded: 0, retried: 0, deadLettered: 0, released: 0, skipped: 0, confirmationSent: 0,
})

async function heartbeat(
  rpc: JobRpc,
  phase: "start" | "complete" | "success" | "error",
  error: string | null,
) {
  const cadence = parseDevPaymentCadenceSeconds()
  const deployment = process.env.VERCEL_DEPLOYMENT_ID
  await rpc.rpc("job_heartbeat_v1", {
    p_worker: DEV_PAYMENT_EVENT_WORKER_NAME,
    p_environment: "preview",
    p_phase: phase,
    p_error: error,
    p_deployment: deployment ? deployment.slice(0, 80) : null,
    p_expected_interval: cadence,
    p_late_after: cadence + 300,
  })
}

async function settleClaim(input: {
  rpc: JobRpc
  claim: ClaimResult
  handler: JobHandler
  abandonAfterHandler: boolean
}): Promise<"succeeded" | "retry" | "dead_letter" | "released" | "skipped"> {
  const claim = input.claim
  if (!claim.jobId || !claim.leaseToken || !claim.idempotencyKey || !claim.payload || claim.jobType !== "PROCESS_STRIPE_EVENT") {
    return "skipped"
  }
  const fenced = fenceDevPaymentRpc(input.rpc)
  let result: JobHandlerResult
  try {
    result = await input.handler.execute({
      idempotencyKey: claim.idempotencyKey,
      payload: claim.payload,
      rpc: fenced,
    })
  } catch (error) {
    const isolated = error instanceof DevPaymentIsolationError
    if (isolated) {
      const released = await input.rpc.rpc<{ status?: string }>("dev_payment_event_release_v1", {
        p_job: claim.jobId,
        p_lease: claim.leaseToken,
        p_reason: "Guard-linked Stripe event was released without applying a payment.",
      })
      return released.status === "success" ? "released" : "skipped"
    }
    const failed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_fail_v1", {
      p_job: claim.jobId,
      p_lease: claim.leaseToken,
      p_error: "Stripe event processing failed unexpectedly.",
      p_retryable: true,
    })
    if (failed.jobStatus === "RETRY") return "retry"
    if (failed.jobStatus === "DEAD_LETTER") return "dead_letter"
    return "skipped"
  }
  if (input.abandonAfterHandler) {
    throw new Error("worker stopped after the event handler")
  }
  if (result.ok) {
    const completed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_complete_v1", {
      p_job: claim.jobId,
      p_lease: claim.leaseToken,
    })
    return completed.status === "success" && completed.jobStatus === "SUCCEEDED" ? "succeeded" : "skipped"
  }
  const failed = await input.rpc.rpc<{ status?: string; jobStatus?: string }>("job_fail_v1", {
    p_job: claim.jobId,
    p_lease: claim.leaseToken,
    p_error: result.error || "Stripe event processing failed",
    p_retryable: result.retryable,
  })
  if (failed.jobStatus === "RETRY") return "retry"
  if (failed.jobStatus === "DEAD_LETTER") return "dead_letter"
  return "skipped"
}

async function deliverQueuedPaymentConfirmation(
  rpc: JobRpc,
  provider?: OutgoingMailProvider,
): Promise<number> {
  if (!communicationsSendEnabled()) return 0
  const origin = customerPortalOrigin()
  if (!origin) return 0
  const claimed = await rpc.rpc<DevSendClaim>("dev_payment_confirmation_claim_v1", {
    p_customer_origin: origin,
  })
  if (claimed.status !== "success" || claimed.replay === true) return 0
  const settled = await settleDevSendEmailClaim({ rpc, claim: claimed, provider })
  return settled === "succeeded" ? 1 : 0
}

export async function runDevPaymentEventWorker(options: {
  rpc: JobRpc
  handler?: JobHandler
  abandonAfterHandler?: boolean
  mailProvider?: OutgoingMailProvider
}): Promise<{ status: "disabled" | "success" | "error"; reason?: string; counts: DevPaymentRunCounts }> {
  const block = devPaymentEventWorkerBlock()
  if (block) return { status: "disabled", reason: block, counts: emptyCounts() }
  const counts = emptyCounts()
  const handler = options.handler ?? processStripeEventHandler()
  try {
    await heartbeat(options.rpc, "start", null)
    const listed = await options.rpc.rpc<{ status?: string; events?: Candidate[] }>("dev_payment_event_candidates_v1", {
      p_limit: 20,
    })
    const events = listed.events ?? []
    let provider: PaymentProvider | null = null
    for (const event of events) {
      if (counts.claimed >= MAX_CLAIMS_PER_RUN) break
      const eventId = event.eventId || ""
      const eventType = event.eventType || ""
      const objectId = event.objectId || ""
      if (!eventId || !eventType || !objectId) {
        counts.skipped += 1
        continue
      }
      let settlementClear = false
      if (eventType.startsWith("checkout.session.")) {
        try {
          provider ??= await devStripeClassificationProvider(options.rpc)
          if (await checkoutSessionIsGuard(provider, objectId)) {
            counts.skipped += 1
            continue
          }
        } catch {
          counts.skipped += 1
          continue
        }
        settlementClear = true
      } else if (!eventType.startsWith("payment_intent.")) {
        counts.skipped += 1
        continue
      }
      const claim = await options.rpc.rpc<ClaimResult>("dev_payment_event_claim_v1", {
        p_event_id: eventId,
        p_settlement_clear: settlementClear,
      })
      if (claim.status !== "success") {
        counts.skipped += 1
        continue
      }
      counts.claimed += 1
      const outcome = await settleClaim({
        rpc: options.rpc,
        claim,
        handler,
        abandonAfterHandler: options.abandonAfterHandler === true && counts.claimed === 1,
      })
      if (outcome === "succeeded") counts.succeeded += 1
      else if (outcome === "retry") counts.retried += 1
      else if (outcome === "dead_letter") counts.deadLettered += 1
      else if (outcome === "released") counts.released += 1
      else counts.skipped += 1
    }
    counts.confirmationSent += await deliverQueuedPaymentConfirmation(options.rpc, options.mailProvider)
    await heartbeat(options.rpc, "complete", null)
    await heartbeat(options.rpc, "success", null)
    return { status: "success", counts }
  } catch {
    try {
      await heartbeat(options.rpc, "error", "Payment event worker failed.")
    } catch {
      // The queue remains leased until the lease expires. A later run can reclaim it.
    }
    return { status: "error", counts }
  }
}

function publicBody(result: { status: string; reason?: string; counts: DevPaymentRunCounts }, status: number) {
  if (result.status !== "success") {
    return reply({ status: result.status, reason: result.reason ?? "error" }, status)
  }
  return reply({ status: "success", ...result.counts })
}

/** Bearer-authenticated DEV trigger. Refuses before any database call when the gate is closed. */
export async function runDevPaymentEventRequest(request: NextRequest): Promise<NextResponse> {
  const block = devPaymentEventWorkerBlock()
  if (block && block !== "missing_secret") return reply({ status: "disabled", reason: block }, 403)
  const authorized = cronAuthorized(request.headers.get("authorization"), devPaymentEventWorkerSecret())
  if (authorized === "missing_secret") return reply({ status: "disabled", reason: "missing_secret" }, 503)
  if (authorized !== "ok") return reply({ status: "unauthorized" }, 401)
  if (block) return reply({ status: "disabled", reason: block }, 403)
  try {
    const result = await runDevPaymentEventWorker({ rpc: backend() })
    if (result.status === "disabled") return publicBody(result, 403)
    if (result.status === "error") return publicBody(result, 503)
    return publicBody(result, 200)
  } catch {
    return reply({ status: "error" }, 503)
  }
}
