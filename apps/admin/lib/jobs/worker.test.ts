import { describe, expect, it, vi } from "vitest"
import { handlerFor, registeredJobHandlers } from "./adapters"
import { runJobWorker } from "./worker"

describe("job worker handlers", () => {
  it("fails closed for unknown job types and invalid payloads", async () => {
    const fail = vi.fn(async () => ({ jobStatus: "DEAD_LETTER" }))
    const rpc = {
      async rpc<T>(name: string): Promise<T> {
        if (name === "job_heartbeat_v1") return { status: "success" } as T
        if (name === "job_promote_outbox_v1") return { status: "success", promoted: 0 } as T
        if (name === "job_claim_batch_v1") return {
          status: "success",
          jobs: [{
            jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            jobType: "CHARGE_STRIPE",
            idempotencyKey: "stable-key-1",
            payload: { to: "hidden@example.com" },
            leaseToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            attemptNumber: 1,
            attempts: 1,
            maxAttempts: 5,
          }],
        } as T
        if (name === "job_fail_v1") return fail() as T
        return {} as T
      },
    }
    const result = await runJobWorker({
      rpc,
      env: { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) },
    })
    expect(result.counts.deadLettered).toBe(1)
    expect(fail).toHaveBeenCalled()
    expect(handlerFor("CHARGE_STRIPE")).toBeNull()
  })

  it("does not enqueue Guard checks when GUARD_CHECKS_ENABLED is unset, false, or malformed", async () => {
    const calls: string[] = []
    const rpc = {
      async rpc<T>(name: string): Promise<T> {
        calls.push(name)
        if (name === "job_heartbeat_v1") return { status: "success" } as T
        if (name === "job_promote_outbox_v1") return { status: "success", promoted: 0 } as T
        if (name === "job_claim_batch_v1") return { status: "success", jobs: [], deadLettered: 0 } as T
        return {} as T
      },
    }
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) }
    await runJobWorker({ rpc, env })
    expect(calls).not.toContain("guard_enqueue_daily_checks_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_CHECKS_ENABLED: "false" } })
    expect(calls).not.toContain("guard_enqueue_daily_checks_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_CHECKS_ENABLED: "yes" } })
    expect(calls).not.toContain("guard_enqueue_daily_checks_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_CHECKS_ENABLED: "true" } })
    expect(calls).toContain("guard_enqueue_daily_checks_v1")
  })

  it("does not register production adapters outside production", () => {
    const preview = registeredJobHandlers({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "preview" })
    expect(preview.SYSTEM_HEALTH_PROBE).toEqual(expect.objectContaining({ jobType: "SYSTEM_HEALTH_PROBE" }))
    expect(preview.SEND_EMAIL).toEqual(expect.objectContaining({ jobType: "SEND_EMAIL" }))
    expect(preview.IMPORT_INBOUND_EMAIL).toEqual(expect.objectContaining({ jobType: "IMPORT_INBOUND_EMAIL" }))
    expect(preview.IMPORT_INBOUND_ATTACHMENT).toEqual(expect.objectContaining({ jobType: "IMPORT_INBOUND_ATTACHMENT" }))
    expect(preview.COLLECT_PAYMENT).toEqual(expect.objectContaining({ jobType: "COLLECT_PAYMENT" }))
    expect(preview.PROCESS_STRIPE_EVENT).toEqual(expect.objectContaining({ jobType: "PROCESS_STRIPE_EVENT" }))
    expect(preview.RECONCILE_GUARD_BILLING).toEqual(expect.objectContaining({ jobType: "RECONCILE_GUARD_BILLING" }))
    expect(preview.MAINTAIN_GUARD_CHECKS).toEqual(expect.objectContaining({ jobType: "MAINTAIN_GUARD_CHECKS" }))
    expect(preview.MAINTAIN_GUARD_ALERTS).toEqual(expect.objectContaining({ jobType: "MAINTAIN_GUARD_ALERTS" }))
    expect(registeredJobHandlers({ VERCEL_ENV: "production" }).SYSTEM_HEALTH_PROBE).toBeTruthy()
    expect(JSON.stringify(Object.keys(preview))).not.toMatch(/SEND_GUARD|GOOGLE/)
  })

  it("does not enqueue Guard alerts when GUARD_ALERTS_ENABLED is unset, false, or malformed", async () => {
    const calls: string[] = []
    const rpc = {
      async rpc<T>(name: string): Promise<T> {
        calls.push(name)
        if (name === "job_heartbeat_v1") return { status: "success" } as T
        if (name === "job_promote_outbox_v1") return { status: "success", promoted: 0 } as T
        if (name === "job_claim_batch_v1") return { status: "success", jobs: [], deadLettered: 0 } as T
        return {} as T
      },
    }
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) }
    await runJobWorker({ rpc, env })
    expect(calls).not.toContain("guard_enqueue_daily_alerts_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_ALERTS_ENABLED: "false" } })
    expect(calls).not.toContain("guard_enqueue_daily_alerts_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_ALERTS_ENABLED: "yes" } })
    expect(calls).not.toContain("guard_enqueue_daily_alerts_v1")
    calls.length = 0
    await runJobWorker({ rpc, env: { ...env, GUARD_ALERTS_ENABLED: "true" } })
    expect(calls).toContain("guard_enqueue_daily_alerts_v1")
  })
})
