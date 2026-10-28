import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { devAdminOutgoingMailLane, devPreviewMailConfigured } from "../communications/dev-lane"
import { communicationsSendEnabled, MAX_LIVE_MAIL_CADENCE_SECONDS } from "../communications/gate"
import { settleDevSendEmailClaim, type DevSendClaim, type DevSendSettlement } from "../communications/dev-send"
import type { OutgoingMailProvider } from "../communications/mail"
import { cronAuthorized, jobWorkerConfig, type EnvMap } from "./config"
import type { JobRpc } from "./model"

export const DEV_MAIL_DISPATCH_WORKER_NAME = "dev-mail-dispatch"
export const DEFAULT_DEV_MAIL_CADENCE_SECONDS = 300
const MIN_CADENCE_SECONDS = 60
const MAX_CLAIMS_PER_RUN = 5

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

/**
 * Closed unless every develop-Preview mail condition is present.
 * The production worker is a separate gate and stays disabled here.
 */
export function devMailDispatchWorkerBlock(env: EnvMap = process.env): string | null {
  if (jobWorkerConfig(env).enabled) return "production_worker"
  if (env.VERCEL_ENV !== "preview") return "wrong_environment"
  if (!devAdminOutgoingMailLane(env) || !devPreviewMailConfigured(env)) return "wrong_lane"
  if (!communicationsSendEnabled(env)) return "mail_disabled"
  if (env.DEV_MAIL_DISPATCH_WORKER_ENABLED !== "true") return "disabled"
  if (!env.DEV_MAIL_DISPATCH_WORKER_SECRET || env.DEV_MAIL_DISPATCH_WORKER_SECRET.length < 32) return "missing_secret"
  return null
}

export function parseDevMailCadenceSeconds(env: EnvMap = process.env): number {
  const raw = env.DEV_MAIL_DISPATCH_WORKER_CADENCE_SECONDS
  if (raw === undefined || raw === "") return DEFAULT_DEV_MAIL_CADENCE_SECONDS
  if (!/^[0-9]+$/.test(raw)) return DEFAULT_DEV_MAIL_CADENCE_SECONDS
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < MIN_CADENCE_SECONDS || value > MAX_LIVE_MAIL_CADENCE_SECONDS) {
    return DEFAULT_DEV_MAIL_CADENCE_SECONDS
  }
  return value
}

export function devMailDispatchWorkerSecret(env: EnvMap = process.env): string | null {
  const secret = env.DEV_MAIL_DISPATCH_WORKER_SECRET
  return secret && secret.length >= 32 ? secret : null
}

export type ProductionMailDispatchAssessment = {
  ready: boolean
  reasons: Array<"production_worker_disabled" | "cadence_above_300" | "mail_gate_closed">
}

/** Production mail is ready only when its own worker is enabled at the live cadence. */
export function productionEmailDispatcherAssessment(env: EnvMap = process.env): ProductionMailDispatchAssessment {
  const worker = jobWorkerConfig(env)
  const reasons: ProductionMailDispatchAssessment["reasons"] = []
  if (!worker.enabled) reasons.push("production_worker_disabled")
  if (worker.cadenceSeconds > MAX_LIVE_MAIL_CADENCE_SECONDS) reasons.push("cadence_above_300")
  if (!communicationsSendEnabled(env)) reasons.push("mail_gate_closed")
  return { ready: reasons.length === 0, reasons }
}

type Candidate = { communicationId?: string }

export type DevMailRunCounts = {
  claimed: number
  succeeded: number
  retried: number
  deadLettered: number
  isolated: number
  skipped: number
}

const emptyCounts = (): DevMailRunCounts => ({
  claimed: 0, succeeded: 0, retried: 0, deadLettered: 0, isolated: 0, skipped: 0,
})

async function heartbeat(
  rpc: JobRpc,
  phase: "start" | "complete" | "success" | "error",
  error: string | null,
) {
  const cadence = parseDevMailCadenceSeconds()
  const deployment = process.env.VERCEL_DEPLOYMENT_ID
  await rpc.rpc("job_heartbeat_v1", {
    p_worker: DEV_MAIL_DISPATCH_WORKER_NAME,
    p_environment: "preview",
    p_phase: phase,
    p_error: error,
    p_deployment: deployment ? deployment.slice(0, 80) : null,
    p_expected_interval: cadence,
    p_late_after: cadence + 300,
  })
}

function countSettlement(counts: DevMailRunCounts, settled: DevSendSettlement) {
  if (settled === "succeeded") counts.succeeded += 1
  else if (settled === "retry") counts.retried += 1
  else if (settled === "dead_letter") counts.deadLettered += 1
  else if (settled === "isolated") counts.isolated += 1
  else counts.skipped += 1
}

export async function runDevMailDispatchWorker(options: {
  rpc: JobRpc
  mailProvider?: OutgoingMailProvider
}): Promise<{ status: "disabled" | "success" | "error"; reason?: string; counts: DevMailRunCounts }> {
  const block = devMailDispatchWorkerBlock()
  if (block) return { status: "disabled", reason: block, counts: emptyCounts() }
  const origin = (process.env.CUSTOMER_ORIGIN ?? "").trim().replace(/\/$/, "")
  if (!origin) return { status: "disabled", reason: "wrong_lane", counts: emptyCounts() }
  const counts = emptyCounts()
  try {
    await heartbeat(options.rpc, "start", null)
    const listed = await options.rpc.rpc<{ status?: string; communications?: Candidate[] }>("dev_mail_dispatch_candidates_v1", {
      p_limit: 20,
    })
    for (const candidate of listed.communications ?? []) {
      if (counts.claimed >= MAX_CLAIMS_PER_RUN) break
      const communicationId = candidate.communicationId || ""
      if (!communicationId) {
        counts.skipped += 1
        continue
      }
      const claim = await options.rpc.rpc<DevSendClaim>("dev_mail_dispatch_claim_v1", {
        p_communication: communicationId,
        p_customer_origin: origin,
      })
      if (claim.status !== "success") {
        counts.skipped += 1
        continue
      }
      counts.claimed += 1
      const settled = await settleDevSendEmailClaim({
        rpc: options.rpc,
        claim,
        provider: options.mailProvider,
      })
      countSettlement(counts, settled)
    }
    await heartbeat(options.rpc, "complete", null)
    await heartbeat(options.rpc, "success", null)
    return { status: "success", counts }
  } catch {
    try {
      await heartbeat(options.rpc, "error", "Mail dispatch worker failed.")
    } catch {
      // The claimed row stays leased until the lease expires. A later run can reclaim it.
    }
    return { status: "error", counts }
  }
}

function publicBody(result: { status: string; reason?: string; counts: DevMailRunCounts }, status: number) {
  if (result.status !== "success") {
    return reply({ status: result.status, reason: result.reason ?? "error" }, status)
  }
  return reply({ status: "success", ...result.counts })
}

/** Bearer-authenticated develop Preview trigger. Refuses before any database call when the gate is closed. */
export async function runDevMailDispatchRequest(request: NextRequest): Promise<NextResponse> {
  const block = devMailDispatchWorkerBlock()
  if (block && block !== "missing_secret") return reply({ status: "disabled", reason: block }, 403)
  const authorized = cronAuthorized(request.headers.get("authorization"), devMailDispatchWorkerSecret())
  if (authorized === "missing_secret") return reply({ status: "disabled", reason: "missing_secret" }, 503)
  if (authorized !== "ok") return reply({ status: "unauthorized" }, 401)
  if (block) return reply({ status: "disabled", reason: block }, 403)
  try {
    const result = await runDevMailDispatchWorker({ rpc: backend() })
    if (result.status === "disabled") return publicBody(result, 403)
    if (result.status === "error") return publicBody(result, 503)
    return publicBody(result, 200)
  } catch {
    return reply({ status: "error" }, 503)
  }
}
