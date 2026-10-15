/**
 * Two real PostgreSQL sessions claiming one Stripe event.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 * This file starts a private cluster when the server binaries are present.
 */
import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { migrationChain } from "../recovery/manifest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55458"
const uid = "11111111-1111-4111-8111-111111111111"
const tokenA = "a".repeat(64)
const tokenB = "b".repeat(64)

let dataDir = ""
let socketDir = ""

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "payenv04",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout
}

function jsonLines(stdout: string): Array<Record<string, unknown>> {
  return stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("{")).map(line => JSON.parse(line) as Record<string, unknown>)
}

describe.skipIf(!pgBin)("DEV Stripe one-shot under two PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "payenv04-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "payenv04"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    for (const entry of migrationChain) {
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "payenv04", "-v", "ON_ERROR_STOP=1",
        "-f", new URL(`../../../../supabase/migrations/${entry.filename}`, import.meta.url).pathname,
      ])
    }
    await psql(`
      insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
      update public.admin_identity set auth_user_id = '${uid}', enabled = true where singleton;
      insert into public.admin_sessions(token_hash, auth_user_id, created_at) values
        ('${tokenA}','${uid}',now()),
        ('${tokenB}','${uid}',now());
    `)
  }, 180000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  it("lets one of two overlapping claims take the event and leaves the other waiting", async () => {
    const received = jsonLines(await psql(
      `select public.payment_receive_stripe_event_v1('evt_race_hold','payment_intent.succeeded','pi_race_hold', false)`,
    ))
    expect(received[0]).toMatchObject({ status: "success", duplicate: false })
    const hold = `begin; select public.admin_dev_stripe_one_shot_claim_v1('${tokenA}', '${crypto.randomUUID()}', 'evt_race_hold', true, false); select pg_sleep(2.5); commit;`
    const wait = `select public.admin_dev_stripe_one_shot_claim_v1('${tokenB}', '${crypto.randomUUID()}', 'evt_race_hold', true, false)`
    const heldPromise = psql(hold)
    const deadline = Date.now() + 3000
    let locked = 0
    while (Date.now() < deadline) {
      locked = Number((await psql(`select count(*) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and query ilike '%pg_sleep%'`)).trim())
      if (locked > 0) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(locked).toBeGreaterThan(0)
    const started = Date.now()
    const waitedText = await psql(wait)
    // SKIP LOCKED returns while the first transaction still holds the row.
    expect(Date.now() - started).toBeLessThan(400)
    const probe = psql(`select id from admin_private.job_outbox where event_key = 'process-stripe-event:evt_race_hold' for update`)
    await new Promise(resolve => setTimeout(resolve, 400))
    const waiting = Number((await psql(`select count(*) from pg_stat_activity where pid <> pg_backend_pid() and wait_event_type = 'Lock'`)).trim())
    expect(waiting).toBeGreaterThan(0)
    const heldText = await heldPromise
    await probe
    const held = jsonLines(heldText)
    const waited = jsonLines(waitedText)
    expect(held[0]).toMatchObject({ status: "success", attempts: 1 })
    expect(waited[0]).toMatchObject({ status: "conflict", reason: "locked" })
    expect((await psql(`select count(*) from admin_private.jobs where idempotency_key = 'process-stripe-event:evt_race_hold'`)).trim()).toBe("1")
    expect((await psql(`select attempts from admin_private.jobs where idempotency_key = 'process-stripe-event:evt_race_hold'`)).trim()).toBe("1")
    expect((await psql(`select count(*) from admin_private.job_outbox where topic <> 'PROCESS_STRIPE_EVENT'`)).trim()).toBe("0")
  }, 20000)

  it("does not create a second job when two claims start together", async () => {
    expect(jsonLines(await psql(
      `select public.payment_receive_stripe_event_v1('evt_race_pair','payment_intent.succeeded','pi_race_pair', false)`,
    ))[0]).toMatchObject({ status: "success" })
    const calls = [tokenA, tokenB].map(token => psql(
      `select public.admin_dev_stripe_one_shot_claim_v1('${token}', '${crypto.randomUUID()}', 'evt_race_pair', true, false)`,
    ))
    const statuses = (await Promise.all(calls)).flatMap(text => jsonLines(text).map(row => row.status)).sort()
    expect(statuses).toEqual(["conflict", "success"])
    expect((await psql(`select count(*) from admin_private.jobs where idempotency_key = 'process-stripe-event:evt_race_pair'`)).trim()).toBe("1")
    expect((await psql(`select count(*) from admin_private.job_attempts a join admin_private.jobs j on j.id = a.job_id where j.idempotency_key = 'process-stripe-event:evt_race_pair'`)).trim()).toBe("1")
  }, 20000)
})
