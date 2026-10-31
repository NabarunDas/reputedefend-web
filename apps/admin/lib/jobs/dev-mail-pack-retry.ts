import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { devAdminOutgoingMailLane, devCustomerPortalOrigin, devPreviewMailConfigured } from "../communications/dev-lane"
import { communicationsSendEnabled } from "../communications/gate"
import { settleDevSendEmailClaim, type DevSendClaim, type DevSendSettlement } from "../communications/dev-send"
import type { OutgoingMailProvider } from "../communications/mail"
import { cronAuthorized, type EnvMap } from "./config"
import type { JobRpc } from "./model"

const MAX_CLAIMS_PER_RUN = 5

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

/**
 * Closed unless the develop Preview mail lane is already open.
 * The general worker flag is not read. A missing flag does not open this route,
 * and setting this route's bearer does not open the general sweep.
 */
export function devMailPackRetryBlock(env: EnvMap = process.env): string | null {
  if (env.VERCEL_ENV !== "preview") return "wrong_environment"
  if (!devAdminOutgoingMailLane(env) || !devPreviewMailConfigured(env)) return "wrong_lane"
  if (!communicationsSendEnabled(env)) return "mail_disabled"
  if (!env.DEV_MAIL_DISPATCH_WORKER_SECRET || env.DEV_MAIL_DISPATCH_WORKER_SECRET.length < 32) return "missing_secret"
  return null
}

export type DevMailPackRetryCounts = {
  claimed: number
  succeeded: number
  retried: number
  deadLettered: number
  isolated: number
  skipped: number
}

const emptyCounts = (): DevMailPackRetryCounts => ({
  claimed: 0, succeeded: 0, retried: 0, deadLettered: 0, isolated: 0, skipped: 0,
})

function countSettlement(counts: DevMailPackRetryCounts, settled: DevSendSettlement) {
  if (settled === "succeeded") counts.succeeded += 1
  else if (settled === "retry") counts.retried += 1
  else if (settled === "dead_letter") counts.deadLettered += 1
  else if (settled === "isolated") counts.isolated += 1
  else counts.skipped += 1
}

/**
 * Leases due Guided pack retries and settles them with the existing Resend handler.
 * An empty due set claims nothing. A succeeded or delivered job is not selected.
 * The same idempotency key, lease, backoff and acceptance-unknown refusal stay in the claim.
 */
export async function runDevMailPackRetry(options: {
  rpc: JobRpc
  mailProvider?: OutgoingMailProvider
}): Promise<{ status: "disabled" | "success" | "error"; reason?: string; counts: DevMailPackRetryCounts }> {
  const block = devMailPackRetryBlock()
  if (block) return { status: "disabled", reason: block, counts: emptyCounts() }
  const origin = devCustomerPortalOrigin()
  if (!origin) return { status: "disabled", reason: "wrong_lane", counts: emptyCounts() }
  const counts = emptyCounts()
  try {
    for (;;) {
      if (counts.claimed >= MAX_CLAIMS_PER_RUN) break
      const claim = await options.rpc.rpc<DevSendClaim>("dev_mail_dispatch_claim_pack_retry_v1", {
        p_customer_origin: origin,
      })
      if (claim.status !== "success" || claim.replay === true || claim.jobType !== "SEND_EMAIL" || !claim.leaseToken) {
        counts.skipped += 1
        break
      }
      counts.claimed += 1
      const settled = await settleDevSendEmailClaim({
        rpc: options.rpc,
        claim,
        provider: options.mailProvider,
      })
      countSettlement(counts, settled)
    }
    return { status: "success", counts }
  } catch {
    return { status: "error", counts }
  }
}

/** Bearer-authenticated develop Preview trigger. Refuses before any database call when the gate is closed. */
export async function runDevMailPackRetryRequest(request: NextRequest): Promise<NextResponse> {
  const block = devMailPackRetryBlock()
  if (block && block !== "missing_secret") return reply({ status: "disabled", reason: block }, 403)
  const secret = process.env.DEV_MAIL_DISPATCH_WORKER_SECRET
  const authorized = cronAuthorized(request.headers.get("authorization"), secret && secret.length >= 32 ? secret : null)
  if (authorized === "missing_secret") return reply({ status: "disabled", reason: "missing_secret" }, 503)
  if (authorized !== "ok") return reply({ status: "unauthorized" }, 401)
  if (block) return reply({ status: "disabled", reason: block }, 403)
  try {
    const result = await runDevMailPackRetry({ rpc: backend() })
    if (result.status === "disabled") return reply({ status: result.status, reason: result.reason ?? "error" }, 403)
    if (result.status === "error") return reply({ status: "error", ...result.counts }, 503)
    return reply({ status: "success", ...result.counts })
  } catch {
    return reply({ status: "error" }, 503)
  }
}
