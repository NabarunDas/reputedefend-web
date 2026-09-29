import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createIdempotentFakeProvider } from "./adapters"
import { runJobWorker, WorkerCrash } from "./worker"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()

type RpcResult = {
  status?: string
  promoted?: number
  jobs?: Array<{
    jobId: string
    jobType: string
    idempotencyKey: string
    payload: Record<string, unknown>
    leaseToken: string
    attemptNumber: number
    attempts: number
    maxAttempts: number
  }>
  jobId?: string
  jobStatus?: string
  outboxId?: string
  idempotencyKey?: string
  replayCount?: number
  version?: number
  heartbeat?: { status?: string; lastStartedAt?: string | null; expectedIntervalSeconds?: number; lateAfterSeconds?: number }
  deadLettered?: number
  counts?: { pending?: number; running?: number; retry?: number; succeeded?: number; deadLetter?: number }
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

const signatures: Record<string, string[]> = {
  job_promote_outbox_v1: ["p_limit"],
  job_claim_batch_v1: ["p_limit", "p_worker", "p_lease_seconds", "p_deployment"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
  job_heartbeat_v1: ["p_worker", "p_environment", "p_phase", "p_error", "p_deployment", "p_expected_interval", "p_late_after"],
  admin_enqueue_job_probe_v1: ["p_token", "p_request"],
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const order = signatures[name] ?? Object.keys(args)
      const values = order.map(key => args[key] ?? null)
      return (await db.query<{ value: T }>(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(",")}) as value`, values)).rows[0].value
    },
  }
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)'; CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')'; CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';"))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    readdirSync(dir).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_foundation_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_workspace_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_prepared_packs_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_customer_actions_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_case_pack_access_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_evidence_upload_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_jobs_outbox_operational_health_v1.sql"))!,
  ]) await db.exec(read(name))
}, 30000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table admin_private.job_attempts disable trigger job_attempts_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.job_attempts,admin_private.jobs,admin_private.job_outbox,admin_private.job_worker_heartbeats,admin_private.job_command_receipts cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table admin_private.job_attempts enable trigger job_attempts_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());`)
})

async function enqueueProbe(request = key()) {
  const result = await rpc("admin_enqueue_job_probe_v1", [token, request])
  expect(result?.status).toBe("success")
  return { request, ...result }
}

async function promoteAndClaim(worker = "worker-a") {
  expect(await rpc("job_promote_outbox_v1", [20])).toMatchObject({ status: "success" })
  const claimed = await rpc("job_claim_batch_v1", [10, worker, 120, "dpl_test"])
  expect(claimed?.status).toBe("success")
  return claimed?.jobs ?? []
}

describe("jobs outbox SQL", () => {
  it("rolls back the outbox row when the surrounding business transaction fails", async () => {
    await expect(db.exec(`do $$ begin
      perform admin_private.enqueue_outbox_v1('tx-rollback-event-1','SYSTEM_HEALTH_PROBE','admin_probe',null,jsonb_build_object('source','TEST'), now());
      insert into public.admin_sessions(token_hash,auth_user_id) values ('${"b".repeat(64)}','${uid}');
      raise exception 'simulated business failure';
    end $$;`)).rejects.toThrow(/simulated business failure/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_sessions")).rows[0].n).toBe(1)
  })

  it("commits the outbox row with the business mutation", async () => {
    await db.exec(`do $$ begin
      perform admin_private.enqueue_outbox_v1('tx-commit-event-1','SYSTEM_HEALTH_PROBE','admin_probe',null,jsonb_build_object('source','TEST'), now());
      insert into public.admin_sessions(token_hash,auth_user_id) values ('${"c".repeat(64)}','${uid}');
    end $$;`)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_sessions")).rows[0].n).toBe(2)
  })

  it("promotes an Admin probe exactly once and two promoters cannot duplicate the job", async () => {
    const probe = await enqueueProbe()
    const first = await rpc("job_promote_outbox_v1", [20])
    const second = await rpc("job_promote_outbox_v1", [20])
    expect(first).toEqual({ status: "success", promoted: 1 })
    expect(second).toEqual({ status: "success", promoted: 0 })
    const jobs = await db.query<{ n: number; idempotency_key: string }>("select count(*)::int as n, min(idempotency_key) as idempotency_key from admin_private.jobs")
    expect(jobs.rows[0].n).toBe(1)
    expect(jobs.rows[0].idempotency_key).toBe(`system-health-probe:${probe.request}`)
    await expect(db.query(
      `insert into admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
       values ($1, 'SYSTEM_HEALTH_PROBE', $2, '{}'::jsonb, 'PENDING', now())`,
      [probe.outboxId, `system-health-probe:${probe.request}`],
    )).rejects.toThrow(/unique|duplicate/i)
  })

  it("lets only one worker hold an unexpired lease and rejects stale complete/fail tokens", async () => {
    await enqueueProbe()
    const first = await promoteAndClaim("worker-a")
    const second = await rpc("job_claim_batch_v1", [10, "worker-b", 120, "dpl_other"])
    expect(first).toHaveLength(1)
    expect(second?.jobs).toEqual([])
    expect(await rpc("job_complete_v1", [first[0].jobId, key()])).toEqual({ status: "conflict" })
    expect(await rpc("job_fail_v1", [first[0].jobId, key(), "stale", true])).toEqual({ status: "conflict" })
    expect(await rpc("job_complete_v1", [first[0].jobId, first[0].leaseToken])).toMatchObject({ status: "success", jobStatus: "SUCCEEDED" })
    expect(await rpc("job_complete_v1", [first[0].jobId, first[0].leaseToken])).toEqual({ status: "conflict" })
  })

  it("reclaims an expired lease and ignores the old token", async () => {
    await enqueueProbe()
    const [first] = await promoteAndClaim("worker-a")
    await db.query("update admin_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1", [first.jobId])
    const [next] = (await rpc("job_claim_batch_v1", [10, "worker-b", 120, "dpl_reclaim"]))?.jobs ?? []
    expect(next.jobId).toBe(first.jobId)
    expect(next.leaseToken).not.toBe(first.leaseToken)
    expect(next.idempotencyKey).toBe(first.idempotencyKey)
    expect(await rpc("job_complete_v1", [first.jobId, first.leaseToken])).toEqual({ status: "conflict" })
    expect(await rpc("job_fail_v1", [first.jobId, first.leaseToken, "stale", false])).toEqual({ status: "conflict" })
    expect(await rpc("job_complete_v1", [next.jobId, next.leaseToken])).toMatchObject({ status: "success" })
  })

  it("retries with deterministic backoff and dead-letters exhausted or permanent failures", async () => {
    await enqueueProbe()
    const [first] = await promoteAndClaim()
    expect(await rpc("job_fail_v1", [first.jobId, first.leaseToken, "temporary", true])).toMatchObject({ status: "success", jobStatus: "RETRY" })
    const retry = await db.query<{ status: string; scheduled_at: string; last_error: string }>("select status, scheduled_at::text, last_error from admin_private.jobs where id=$1", [first.jobId])
    expect(retry.rows[0].status).toBe("RETRY")
    expect(retry.rows[0].last_error).toBe("temporary")
    const delay = await db.query<{ seconds: number }>("select extract(epoch from (scheduled_at-now()))::int as seconds from admin_private.jobs where id=$1", [first.jobId])
    expect(delay.rows[0].seconds).toBeGreaterThanOrEqual(50)
    expect(delay.rows[0].seconds).toBeLessThanOrEqual(70)

    await db.query("update admin_private.jobs set scheduled_at=now(), max_attempts=2 where id=$1", [first.jobId])
    const [second] = (await rpc("job_claim_batch_v1", [10, "worker-a", 120, null]))?.jobs ?? []
    expect(await rpc("job_fail_v1", [second.jobId, second.leaseToken, "still failing", true])).toMatchObject({ jobStatus: "DEAD_LETTER" })

    const probe = await enqueueProbe()
    await rpc("job_promote_outbox_v1", [20])
    const [permanent] = (await rpc("job_claim_batch_v1", [10, "worker-a", 120, null]))?.jobs ?? []
    expect(permanent.idempotencyKey).toBe(`system-health-probe:${probe.request}`)
    expect(await rpc("job_fail_v1", [permanent.jobId, permanent.leaseToken, "invalid payload", false])).toMatchObject({ jobStatus: "DEAD_LETTER" })
    const health = await rpc("admin_job_health_v1", [token])
    expect(health?.counts).toMatchObject({ deadLetter: 2, succeeded: 0 })
    expect(JSON.stringify(health)).toMatch(/DEAD_LETTER/)
  })

  it("replays only dead letters, keeps the same idempotency key, and is idempotent", async () => {
    const probe = await enqueueProbe()
    const [job] = await promoteAndClaim()
    expect(await rpc("job_fail_v1", [job.jobId, job.leaseToken, "permanent", false])).toMatchObject({ jobStatus: "DEAD_LETTER" })
    const version = (await db.query<{ record_version: number }>("select record_version from admin_private.jobs where id=$1", [job.jobId])).rows[0].record_version
    const request = key()
    const replayed = await rpc("admin_job_replay_v1", [token, request, job.jobId, "Need to retry the health probe after a worker fault.", true, version])
    expect(replayed).toMatchObject({ status: "success", jobId: job.jobId, idempotencyKey: `system-health-probe:${probe.request}`, replayCount: 1 })
    expect(await rpc("admin_job_replay_v1", [token, request, job.jobId, "Need to retry the health probe after a worker fault.", true, version])).toEqual(replayed)
    const row = await db.query<{ status: string; attempts: number; idempotency_key: string; replay_count: number }>("select status, attempts, idempotency_key, replay_count from admin_private.jobs where id=$1", [job.jobId])
    expect(row.rows[0]).toMatchObject({ status: "PENDING", attempts: 0, idempotency_key: job.idempotencyKey, replay_count: 1 })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_attempts where job_id=$1", [job.jobId])).rows[0].n).toBe(1)

    await rpc("job_promote_outbox_v1", [20])
    const [running] = (await rpc("job_claim_batch_v1", [10, "worker-a", 120, null]))?.jobs ?? []
    expect(running.idempotencyKey).toBe(job.idempotencyKey)
    await rpc("job_complete_v1", [running.jobId, running.leaseToken])
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_attempts where job_id=$1", [job.jobId])).rows[0].n).toBe(2)
    const succeededVersion = (await db.query<{ record_version: number }>("select record_version from admin_private.jobs where id=$1", [running.jobId])).rows[0].record_version
    expect(await rpc("admin_job_replay_v1", [token, key(), running.jobId, "Trying to replay a succeeded job.", true, succeededVersion])).toEqual({ status: "denied" })
  })

  it("requires a fresh Admin sign-in to replay and writes Admin audit only for Admin commands", async () => {
    await enqueueProbe()
    const [job] = await promoteAndClaim()
    await rpc("job_fail_v1", [job.jobId, job.leaseToken, "permanent", false])
    await db.query("update public.admin_sessions set created_at=now()-interval '6 minutes' where token_hash=$1", [token])
    const version = (await db.query<{ record_version: number }>("select record_version from admin_private.jobs where id=$1", [job.jobId])).rows[0].record_version
    expect(await rpc("admin_job_replay_v1", [token, key(), job.jobId, "Need to retry the health probe after a worker fault.", true, version])).toEqual({ status: "reauth_required" })
    const audit = await db.query<{ action: string; outcome: string }>("select action, outcome from public.admin_audit_events order by id")
    expect(audit.rows.some(row => row.action === "OPERATIONS_CHANGED" && row.outcome === "success")).toBe(true)
    expect(audit.rows.some(row => row.action === "OPERATIONS_CHANGED" && row.outcome === "reauth_required")).toBe(true)
    expect(JSON.stringify(audit.rows)).not.toMatch(/CRON_SECRET|otp|password|Bearer /i)
  })

  it("updates heartbeat with zero jobs and completes a SYSTEM_HEALTH_PROBE", async () => {
    expect(await rpc("job_heartbeat_v1", ["admin-jobs", "production", "start", null, "dpl_empty"])).toEqual({ status: "success" })
    expect(await rpc("job_heartbeat_v1", ["admin-jobs", "production", "complete", null, "dpl_empty"])).toEqual({ status: "success" })
    expect(await rpc("job_heartbeat_v1", ["admin-jobs", "production", "success", null, "dpl_empty"])).toEqual({ status: "success" })
    const empty = await rpc("admin_job_health_v1", [token])
    expect(empty?.heartbeat).toMatchObject({ status: "HEALTHY", expectedIntervalSeconds: 86400, lateAfterSeconds: 93600 })
    expect(empty?.counts).toMatchObject({ pending: 0, running: 0, retry: 0, deadLetter: 0 })

    await enqueueProbe()
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32), VERCEL_DEPLOYMENT_ID: "dpl_probe" }
    const result = await runJobWorker({ rpc: namedRpc(), env })
    expect(result).toEqual({ status: "success", counts: { promoted: 1, claimed: 1, succeeded: 1, retried: 0, deadLettered: 0 } })
    const health = await rpc("admin_job_health_v1", [token])
    expect(health?.counts).toMatchObject({ succeeded: 1, pending: 0 })
    expect(JSON.stringify(health)).not.toMatch(/CRON_SECRET|payload|storageKey|secret/i)
  })

  it("does not process jobs when the worker is disabled", async () => {
    await enqueueProbe()
    const result = await runJobWorker({
      rpc: namedRpc(),
      env: { JOB_WORKER_ENABLED: "false", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) },
    })
    expect(result.status).toBe("disabled")
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_worker_heartbeats")).rows[0].n).toBe(0)
  })

  it("reuses the same idempotency key after a crash and does not duplicate the provider effect", async () => {
    await enqueueProbe()
    const provider = createIdempotentFakeProvider()
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) }
    await expect(runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: input => provider.execute(input) } },
      crashAfterProvider: true,
    })).rejects.toBeInstanceOf(WorkerCrash)
    expect(provider.effects).toBe(1)
    expect((await db.query<{ status: string }>("select status from admin_private.jobs")).rows[0].status).toBe("RUNNING")
    await db.exec("update admin_private.jobs set lease_expires_at=now()-interval '1 second'")
    const recovered = await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: input => provider.execute(input) } },
    })
    expect(recovered).toMatchObject({ status: "success", counts: { succeeded: 1 } })
    expect(provider.calls).toBe(2)
    expect(provider.effects).toBe(1)
    expect((await db.query<{ status: string }>("select status from admin_private.jobs")).rows[0].status).toBe("SUCCEEDED")
  })

  it("dead-letters after repeated lease expiry without exceeding max_attempts", async () => {
    await enqueueProbe()
    await rpc("job_promote_outbox_v1", [20])
    await db.exec("update admin_private.jobs set max_attempts=2")
    const [first] = (await rpc("job_claim_batch_v1", [10, "worker-a", 120, null]))?.jobs ?? []
    expect(first.attempts).toBe(1)
    await db.query("update admin_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1", [first.jobId])
    const [second] = (await rpc("job_claim_batch_v1", [10, "worker-b", 120, null]))?.jobs ?? []
    expect(second.attempts).toBe(2)
    expect(second.leaseToken).not.toBe(first.leaseToken)
    await db.query("update admin_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1", [second.jobId])
    const third = await rpc("job_claim_batch_v1", [10, "worker-c", 120, null])
    expect(third?.jobs).toEqual([])
    expect(third?.deadLettered).toBe(1)
    const row = await db.query<{ status: string; attempts: number; last_error: string }>("select status, attempts, last_error from admin_private.jobs where id=$1", [first.jobId])
    expect(row.rows[0]).toEqual({
      status: "DEAD_LETTER",
      attempts: 2,
      last_error: "Maximum attempts exhausted after worker lease expiry",
    })
    const history = await db.query<{ attempt_number: number; outcome: string | null }>("select attempt_number, outcome from admin_private.job_attempts where job_id=$1 order by attempt_number", [first.jobId])
    expect(history.rows).toEqual([
      { attempt_number: 1, outcome: "LEASE_EXPIRED" },
      { attempt_number: 2, outcome: "DEAD_LETTER" },
    ])
    expect(await rpc("job_complete_v1", [first.jobId, first.leaseToken])).toEqual({ status: "conflict" })
    expect(await rpc("job_fail_v1", [second.jobId, second.leaseToken, "stale", true])).toEqual({ status: "conflict" })
    await expect(db.query(
      "update admin_private.jobs set attempts=3 where id=$1",
      [first.jobId],
    )).rejects.toThrow(/jobs_attempts_check|check constraint/i)
    const health = await rpc("admin_job_health_v1", [token])
    expect(health?.counts).toMatchObject({ deadLetter: 1, running: 0 })
    expect(JSON.stringify(health)).toMatch(/DEAD_LETTER/)
  })

  it("dead-letters after two worker crashes without claiming a third attempt", async () => {
    await enqueueProbe()
    await rpc("job_promote_outbox_v1", [20])
    await db.exec("update admin_private.jobs set max_attempts=2")
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) }
    const handlers = {
      SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE" as const, execute: async () => ({ ok: true as const }) },
    }
    await expect(runJobWorker({ rpc: namedRpc(), env, handlers, crashAfterProvider: true })).rejects.toBeInstanceOf(WorkerCrash)
    expect((await db.query<{ attempts: number; status: string }>("select attempts, status from admin_private.jobs")).rows[0]).toEqual({
      attempts: 1, status: "RUNNING",
    })
    await db.exec("update admin_private.jobs set lease_expires_at=now()-interval '1 second'")
    await expect(runJobWorker({ rpc: namedRpc(), env, handlers, crashAfterProvider: true })).rejects.toBeInstanceOf(WorkerCrash)
    expect((await db.query<{ attempts: number; status: string }>("select attempts, status from admin_private.jobs")).rows[0]).toEqual({
      attempts: 2, status: "RUNNING",
    })
    await db.exec("update admin_private.jobs set lease_expires_at=now()-interval '1 second'")
    const third = await runJobWorker({ rpc: namedRpc(), env, handlers })
    expect(third).toEqual({
      status: "success",
      counts: { promoted: 0, claimed: 0, succeeded: 0, retried: 0, deadLettered: 1 },
    })
    const row = await db.query<{ status: string; attempts: number }>("select status, attempts from admin_private.jobs")
    expect(row.rows[0]).toEqual({ status: "DEAD_LETTER", attempts: 2 })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_attempts")).rows[0].n).toBe(2)
  })

  it("dead-letters an expired first lease when max_attempts is 1", async () => {
    await enqueueProbe()
    await rpc("job_promote_outbox_v1", [20])
    await db.exec("update admin_private.jobs set max_attempts=1")
    const [first] = (await rpc("job_claim_batch_v1", [10, "worker-a", 120, null]))?.jobs ?? []
    expect(first.attempts).toBe(1)
    await db.query("update admin_private.jobs set lease_expires_at=now()-interval '1 second' where id=$1", [first.jobId])
    const next = await rpc("job_claim_batch_v1", [10, "worker-b", 120, null])
    expect(next?.jobs).toEqual([])
    expect(next?.deadLettered).toBe(1)
    const row = await db.query<{ status: string; attempts: number }>("select status, attempts from admin_private.jobs where id=$1", [first.jobId])
    expect(row.rows[0]).toEqual({ status: "DEAD_LETTER", attempts: 1 })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_attempts where job_id=$1", [first.jobId])).rows[0].n).toBe(1)
  })

  it("classifies heartbeat health from the stored worker cadence, not a 10-minute window", async () => {
    expect(await rpc("job_heartbeat_v1", ["admin-jobs", "production", "start", null, "dpl_empty", 86400, 93600])).toEqual({ status: "success" })
    await db.exec("update admin_private.job_worker_heartbeats set last_started_at=now()-interval '11 minutes', updated_at=now()-interval '11 minutes'")
    expect((await rpc("admin_job_health_v1", [token]))?.heartbeat).toMatchObject({
      status: "HEALTHY", expectedIntervalSeconds: 86400, lateAfterSeconds: 93600,
    })
    await db.exec("update admin_private.job_worker_heartbeats set last_started_at=now()-interval '27 hours', updated_at=now()-interval '27 hours'")
    expect((await rpc("admin_job_health_v1", [token]))?.heartbeat?.status).toBe("LATE")
  })

  it("revokes PUBLIC, anon and authenticated access to the queue tables and RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["job_outbox", "jobs", "job_attempts", "job_worker_heartbeats", "job_command_receipts"]) {
        const access = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `admin_private.${table}`])
        expect(access.rows[0].ok).toBe(false)
      }
      const fn = await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.job_claim_batch_v1(integer,text,integer,text)','EXECUTE') as ok", [role])
      expect(fn.rows[0].ok).toBe(false)
    }
  })
})
