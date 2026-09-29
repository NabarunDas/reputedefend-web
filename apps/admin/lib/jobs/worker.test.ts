import { describe, expect, it, vi } from "vitest"
import { handlerFor, registeredJobHandlers } from "./adapters"
import { runJobWorker } from "./worker"

describe("job worker handlers", () => {
  it("fails closed for unknown job types and invalid payloads", async () => {
    const fail = vi.fn(async () => ({ jobStatus: "DEAD_LETTER" }))
    const rpc = {
      rpc: vi.fn(async (name: string) => {
        if (name === "job_heartbeat_v1") return { status: "success" }
        if (name === "job_promote_outbox_v1") return { status: "success", promoted: 0 }
        if (name === "job_claim_batch_v1") return {
          status: "success",
          jobs: [{
            jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            jobType: "SEND_EMAIL",
            idempotencyKey: "stable-key-1",
            payload: { to: "hidden@example.com" },
            leaseToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            attemptNumber: 1,
            attempts: 1,
            maxAttempts: 5,
          }],
        }
        if (name === "job_fail_v1") return fail()
        return {}
      }),
    }
    const result = await runJobWorker({
      rpc,
      env: { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) },
    })
    expect(result.counts.deadLettered).toBe(1)
    expect(fail).toHaveBeenCalled()
    expect(handlerFor("SEND_EMAIL")).toBeNull()
  })

  it("does not register production adapters outside production", () => {
    expect(registeredJobHandlers({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "preview" })).toEqual({
      SYSTEM_HEALTH_PROBE: expect.objectContaining({ jobType: "SYSTEM_HEALTH_PROBE" }),
    })
    expect(registeredJobHandlers({ VERCEL_ENV: "production" }).SYSTEM_HEALTH_PROBE).toBeTruthy()
  })
})
