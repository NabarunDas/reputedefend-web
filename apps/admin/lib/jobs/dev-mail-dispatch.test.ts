import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { readFileSync } from "node:fs"
import { jobWorkerConfig } from "./config"
import { item } from "../release/readiness"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ backend: () => mocks }))

import {
  devMailAutomaticDispatchActive,
  devMailDispatchWorkerBlock,
  devMailScheduleInstalled,
  parseDevMailCadenceSeconds,
  productionEmailDispatcherAssessment,
  runDevMailDispatchRequest,
  runDevMailDispatchWorker,
} from "./dev-mail-dispatch"
import type { JobRpc } from "./model"

const secret = "d".repeat(32)
const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  CUSTOMER_ORIGIN: portal,
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  RESEND_API_KEY: "re_dev_placeholder",
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  DEV_MAIL_DISPATCH_WORKER_ENABLED: "true",
  DEV_MAIL_DISPATCH_WORKER_SECRET: secret,
}

const communicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function loadedSend() {
  return {
    status: "success",
    lifecycle: "QUEUED",
    contentLocked: true,
    recipient: "alex@example.com",
    subject: "Your pack is ready",
    bodyText: "The pack is ready.",
    bodyHtml: "<p>The pack is ready.</p>",
    templateKey: "GUIDED_PACK_READY",
    deliveryStatus: "NONE",
    contentVersion: 1,
    senderAddress: "ops@example.com",
    suppressed: false,
  }
}

describe("DEV mail dispatch gate", () => {
  it("stays closed unless the develop preview mail lane is open", () => {
    expect(devMailDispatchWorkerBlock(preview)).toBeNull()
    expect(devMailDispatchWorkerBlock({ ...preview, VERCEL_ENV: "production" })).toBe("wrong_environment")
    expect(devMailDispatchWorkerBlock({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toBe("wrong_lane")
    expect(devMailDispatchWorkerBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_ENABLED: undefined })).toBe("disabled")
    expect(devMailDispatchWorkerBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_ENABLED: "false" })).toBe("disabled")
    expect(devMailDispatchWorkerBlock({ ...preview, DEV_MAIL_DISPATCH_WORKER_SECRET: "short" })).toBe("missing_secret")
    expect(devMailDispatchWorkerBlock({ ...preview, COMMUNICATIONS_SEND_ENABLED: "false" })).toBe("mail_disabled")
    expect(devMailDispatchWorkerBlock({
      ...preview,
      VERCEL_ENV: "production",
      JOB_WORKER_ENABLED: "true",
      CRON_SECRET: "c".repeat(32),
      JOB_WORKER_CADENCE_SECONDS: "300",
    })).toBe("production_worker")
    expect(jobWorkerConfig({ ...preview, JOB_WORKER_ENABLED: "true", CRON_SECRET: "c".repeat(32) }).enabled).toBe(false)
  })

  it("keeps the develop cadence inside the live-mail ceiling", () => {
    expect(parseDevMailCadenceSeconds({})).toBe(300)
    expect(parseDevMailCadenceSeconds({ DEV_MAIL_DISPATCH_WORKER_CADENCE_SECONDS: "120" })).toBe(120)
    expect(parseDevMailCadenceSeconds({ DEV_MAIL_DISPATCH_WORKER_CADENCE_SECONDS: "30" })).toBe(300)
    expect(parseDevMailCadenceSeconds({ DEV_MAIL_DISPATCH_WORKER_CADENCE_SECONDS: "86400" })).toBe(300)
    expect(parseDevMailCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "86400" })).toBe(300)
  })

  it("records that Production does not yet have a live-mail dispatcher", () => {
    const assessment = productionEmailDispatcherAssessment({})
    expect(assessment.ready).toBe(false)
    expect(assessment.reasons).toEqual(["production_worker_disabled", "cadence_above_300", "mail_gate_closed"])
    expect(jobWorkerConfig({}).cadenceSeconds).toBe(86400)
    expect(item("vercel.cron-unchanged")?.requirement).toContain("0 4 * * *")
    const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")
    expect(vercel).not.toContain("crons")
    expect(productionEmailDispatcherAssessment({
      VERCEL_ENV: "production",
      JOB_WORKER_ENABLED: "true",
      CRON_SECRET: "c".repeat(32),
      JOB_WORKER_CADENCE_SECONDS: "300",
      JOB_PROVIDER_MODE: "production",
      COMMUNICATIONS_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
    }).ready).toBe(true)
  })

  it("keeps automatic sending inactive until the separate main schedule is recorded", async () => {
    expect(devMailScheduleInstalled({})).toBe(false)
    expect(devMailScheduleInstalled({ DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED: "true" })).toBe(true)
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    const handler = readFileSync(new URL("../communications/handler.ts", import.meta.url), "utf8")
    const dispatcher = readFileSync(new URL("./dev-mail-dispatch.ts", import.meta.url), "utf8")
    expect(handler).not.toContain("DEV_MAIL_ALLOWED_RECIPIENTS")
    expect(dispatcher).not.toContain("DEV_MAIL_ALLOWED_RECIPIENTS")
    expect(productionEmailDispatcherAssessment({
      VERCEL_ENV: "production",
      JOB_WORKER_ENABLED: "true",
      CRON_SECRET: "c".repeat(32),
      JOB_WORKER_CADENCE_SECONDS: "300",
      JOB_PROVIDER_MODE: "production",
      COMMUNICATIONS_SEND_ENABLED: "true",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
      DEV_MAIL_ALLOWED_RECIPIENTS: "only-this-mailbox@example.com",
    }).ready).toBe(true)
  })

  it("stays inactive when activation, recovery, worker health, or credentials are missing", async () => {
    for (const [name, value] of Object.entries({ ...preview, DEV_MAIL_DISPATCH_SCHEDULE_INSTALLED: "true" })) {
      vi.stubEnv(name, value)
    }
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({
      status: "success", automatic: false, activation: false, schedule: true, workerHealthy: true, credentials: true,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockResolvedValue({
      status: "success", automatic: true, activation: true, schedule: false, workerHealthy: true, credentials: true,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockResolvedValue({
      status: "success", automatic: true, activation: true, schedule: true, workerHealthy: false, credentials: true,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockResolvedValue({
      status: "success", automatic: true, activation: true, schedule: true, workerHealthy: true, credentials: false,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockRejectedValue(new Error("readiness unavailable"))
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockResolvedValue({
      status: "unavailable", automatic: false, activation: false, schedule: false, workerHealthy: false, credentials: false,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(false)
    mocks.rpc.mockResolvedValue({
      status: "success", automatic: true, activation: true, schedule: true, workerHealthy: true, credentials: true,
    })
    expect(await devMailAutomaticDispatchActive()).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith("dev_mail_dispatch_readiness_v1", {})
    vi.unstubAllEnvs()
  })
})

describe("DEV mail dispatch run", () => {
  afterEach(() => vi.unstubAllEnvs())
  const calls: string[] = []
  let sends = 0
  const rpc: JobRpc = {
    async rpc<T>(name: string): Promise<T> {
      calls.push(name)
      if (name.startsWith("payment_") || name.includes("guard") || name === "job_promote_outbox_v1" || name === "job_claim_batch_v1") {
        throw new Error(`unexpected rpc ${name}`)
      }
      if (name === "dev_mail_dispatch_candidates_v1") {
        return { status: "success", communications: [{ communicationId }] } as T
      }
      if (name === "dev_mail_dispatch_claim_v1") {
        if (calls.filter(item => item === name).length > 1) return { status: "conflict", reason: "leased" } as T
        return {
          status: "success",
          jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          jobType: "SEND_EMAIL",
          idempotencyKey: `send-email:${communicationId}:v1`,
          payload: { communicationId, contentVersion: 1 },
          leaseToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        } as T
      }
      if (name === "communication_load_send_v1") return loadedSend() as T
      if (name === "communication_begin_provider_attempt_v1") return { status: "success", providerCallPermitted: true } as T
      if (name === "job_complete_v1") return { status: "success", jobStatus: "SUCCEEDED" } as T
      return { status: "success" } as T
    },
  }

  beforeEach(() => {
    calls.length = 0
    sends = 0
  })

  it("accepts one queued email and does not send a second copy while the lease is live", async () => {
    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    const provider = { send: async () => { sends += 1; return { ok: true as const, providerMessageId: "msg_1", replay: false } } }
    const first = await runDevMailDispatchWorker({ rpc, mailProvider: provider })
    expect(first).toMatchObject({ status: "success", counts: { claimed: 1, succeeded: 1 } })
    expect(sends).toBe(1)
    const second = await runDevMailDispatchWorker({ rpc, mailProvider: provider })
    expect(second.counts.claimed).toBe(0)
    expect(second.counts.skipped).toBe(1)
    expect(sends).toBe(1)
    expect(calls).not.toContain("job_promote_outbox_v1")
    expect(calls).not.toContain("job_claim_batch_v1")
  })

  it("schedules a later retry after an explicit 429 and does not resend unknown acceptance", async () => {
    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    const seen: string[] = []
    const failures: Array<Record<string, unknown>> = []
    const rpc: JobRpc = {
      async rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
        seen.push(name)
        if (name === "job_fail_v1") failures.push(args ?? {})
        if (name === "dev_mail_dispatch_candidates_v1") {
          return { status: "success", communications: [{ communicationId }] } as T
        }
        if (name === "dev_mail_dispatch_claim_v1") {
          if (seen.filter(item => item === name).length > 1) return { status: "conflict", reason: "leased" } as T
          return {
            status: "success",
            jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            jobType: "SEND_EMAIL",
            idempotencyKey: `send-email:${communicationId}:v1`,
            payload: { communicationId, contentVersion: 1 },
            leaseToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          } as T
        }
        if (name === "communication_load_send_v1") return loadedSend() as T
        if (name === "communication_begin_provider_attempt_v1") return { status: "success", providerCallPermitted: true } as T
        return { status: "success" } as T
      },
    }
    const rejected = await runDevMailDispatchWorker({
      rpc,
      mailProvider: { send: async () => ({ ok: false, retryable: true, error: "Email provider rejected the message" }) },
    })
    expect(rejected.counts).toMatchObject({ claimed: 1, retried: 1, succeeded: 0 })
    expect(seen).not.toContain("communication_mark_acceptance_unknown_v1")
    expect(seen).not.toContain("communication_mark_provider_rejected_v1")
    expect(failures[0]).toMatchObject({ p_retryable: true })

    seen.length = 0
    failures.length = 0
    const uncertain = await runDevMailDispatchWorker({
      rpc,
      mailProvider: { send: async () => ({ ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }) },
    })
    expect(uncertain.counts.succeeded).toBe(0)
    expect(seen).toContain("communication_mark_acceptance_unknown_v1")
    expect(seen).not.toContain("communication_mark_provider_accepted_v1")
    expect(failures.at(-1)).toMatchObject({ p_retryable: true })
  })
})

describe("DEV mail dispatch request", () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    vi.unstubAllEnvs()
  })
  afterEach(() => vi.unstubAllEnvs())

  it("refuses an unauthenticated call before it reads the queue", async () => {
    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    const response = await runDevMailDispatchRequest(new NextRequest("https://admin.example.test/api/internal/jobs/dev-mail-dispatch"))
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
