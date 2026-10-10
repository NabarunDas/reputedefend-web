/**
 * Two real PostgreSQL sessions. PGlite serves the behavioural suite on one
 * connection, so it cannot show that a second transaction waits. This file
 * starts a private PostgreSQL cluster when the server binaries are present
 * and races the customer-action functions on two connections.
 */
import { execFile as execFileCb } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const adminToken = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value: string) => createHash("sha256").update(value).digest("hex")
const title = "Managed recovery service agreement"
const bodyText = "This is the owner-approved service wording for this exact case snapshot and must not be invented by the application."
const scopeText = "Restore the listed Google Business Profile for this case only."

let dataDir = ""
let socketDir = ""
const port = "55432"

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "sec02",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=15000" } })
  return result.stdout
}

function jsonLines(stdout: string): Array<{ status?: string }> {
  return stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("{")).map(line => JSON.parse(line) as { status?: string })
}

async function rpc(name: string, args: string[]): Promise<{ status?: string; id?: string }> {
  const rendered = args.map(value => `'${value.replaceAll("'", "''")}'`).join(",")
  const rows = jsonLines(await psql(`select public.${name}(${rendered})`))
  return rows[0] ?? {}
}

describe.skipIf(!pgBin)("customer action OTP limits under two PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "sec02-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "sec02"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    const dir = new URL("../../../../supabase/migrations/", import.meta.url)
    const names = [
      "20260915120000_core_data_foundation_v1.sql",
      "20260916000000_relaunch_guard_data_foundation_v1.sql",
      "20260917080553_single_admin_auth_v1.sql",
      "20260917160740_admin_audit_foundation_v1.sql",
      "20260917183422_admin_client_workspace_v1.sql",
      readdirSync(dir).find(name => name.endsWith("_admin_enquiry_triage_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_admin_case_workflows_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_admin_customer_actions_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_customer_action_otp_limits_v1.sql"))!,
    ]
    for (const name of names) {
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "sec02", "-v", "ON_ERROR_STOP=1", "-f", new URL(name, dir).pathname,
      ])
    }
  }, 120000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  beforeEach(async () => {
    await psql(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
      alter table public.customer_action_events disable trigger customer_action_events_immutable;
      alter table public.authorization_events disable trigger authorization_events_immutable;
      alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
      alter table public.agreement_versions disable trigger agreement_versions_immutable;
      truncate public.customer_action_events,public.customer_actions,public.authorization_events,public.authorization_records,public.agreement_versions,public.location_manager_access_events,public.location_manager_access,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.authorization_command_receipts,admin_private.customer_action_command_receipts,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.business_memberships,public.customer_contact_verifications,public.customers,public.businesses,public.locations,auth.users cascade;
      alter table public.admin_audit_events enable trigger admin_audit_immutable;
      alter table public.customer_action_events enable trigger customer_action_events_immutable;
      alter table public.authorization_events enable trigger authorization_events_immutable;
      alter table public.location_manager_access_events enable trigger location_manager_access_events_immutable;
      alter table public.agreement_versions enable trigger agreement_versions_immutable;
      insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
      insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
      insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
      insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${adminToken}','${uid}',now());
      insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
      insert into public.businesses(id,display_name) values('${business}','Bakery');
      insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
      insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED');
      insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
      insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.');`)
  })

  async function openAction() {
    const hash = secretHash(secret())
    const pending = secretHash(secret())
    const raw = await psql(`select public.admin_authorization_command_v1('${adminToken}','${key()}','${caseId}','create_agreement_action', jsonb_build_object(
      'kind','SERVICE_AGREEMENT','title',$$${title}$$,'bodyText',$$${bodyText}$$,'scopeText',$$${scopeText}$$,
      'expiresAt', to_char(now() + interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'secretHash','${hash}'))`)
    const parsed = jsonLines(raw)[0] as { status?: string; id?: string }
    expect(parsed.status).toBe("success")
    expect((await rpc("customer_action_exchange_v1", [parsed.id!, hash, pending])).status).toBe("ok")
    return { id: parsed.id!, hash, pending }
  }

  async function ageCooldown(actionId: string) {
    await psql(`update admin_private.customer_action_challenges set last_attempt_at = now() - interval '61 seconds' where action_id = '${actionId}'`)
  }

  async function race(holdSql: string, waitSql: string) {
    const heldPromise = psql(holdSql)
    const deadline = Date.now() + 3000
    let locked = 0
    while (Date.now() < deadline) {
      locked = Number((await psql(`select count(*) from pg_stat_activity
        where pid <> pg_backend_pid() and state = 'active' and query ilike '%pg_sleep%'`)).trim())
      if (locked > 0) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(locked).toBeGreaterThan(0)
    const started = Date.now()
    const waitedText = await psql(waitSql)
    const waitedMs = Date.now() - started
    const heldText = await heldPromise
    return { held: jsonLines(heldText), waited: jsonLines(waitedText), waitedMs }
  }

  it("lets only one of two overlapping sends consume the last slot in the window", async () => {
    const action = await openAction()
    for (let i = 0; i < 4; i++) {
      if (i > 0) await ageCooldown(action.id)
      expect((await rpc("customer_action_begin_otp_v1", [action.pending])).status).toBe("ok")
    }
    await ageCooldown(action.id)
    const hold = `begin; select public.customer_action_begin_otp_v1('${action.pending}'); select pg_sleep(1.5); commit;`
    const other = `select public.customer_action_begin_otp_v1('${action.pending}')`
    const { held, waited, waitedMs } = await race(hold, other)
    expect(waitedMs).toBeGreaterThan(400)
    const statuses = [...held, ...waited].map(row => row.status).sort()
    expect(statuses).toEqual(["ok", "rate_limited"])
    const sends = Number((await psql(`select cardinality(otp_send_attempts) from admin_private.customer_action_challenges where action_id = '${action.id}'`)).trim())
    expect(sends).toBe(5)
  }, 20000)

  it("lets only one of two overlapping verification attempts consume the fifth try", async () => {
    const action = await openAction()
    expect((await rpc("customer_action_begin_otp_v1", [action.pending])).status).toBe("ok")
    expect((await rpc("customer_action_confirm_otp_sent_v1", [action.pending])).status).toBe("ok")
    for (let i = 0; i < 4; i++) expect((await rpc("customer_action_attempt_otp_v1", [action.pending])).status).toBe("ok")
    const hold = `begin; select public.customer_action_attempt_otp_v1('${action.pending}'); select pg_sleep(1.5); commit;`
    const other = `select public.customer_action_attempt_otp_v1('${action.pending}')`
    const { held, waited, waitedMs } = await race(hold, other)
    expect(waitedMs).toBeGreaterThan(400)
    const statuses = [...held, ...waited].map(row => row.status).sort()
    expect(statuses).toEqual(["ok", "unavailable"])
    const attempts = Number((await psql(`select attempts from admin_private.customer_action_challenges where action_id = '${action.id}'`)).trim())
    expect(attempts).toBe(5)
  }, 20000)

  it("does not deadlock when exchange and begin run together", async () => {
    const action = await openAction()
    let pending = action.pending
    for (let i = 0; i < 8; i++) {
      const rotated = secretHash(secret())
      const results = await Promise.allSettled([
        psql(`select public.customer_action_exchange_v1('${action.id}','${action.hash}','${rotated}')`),
        psql(`select public.customer_action_begin_otp_v1('${pending}')`),
      ])
      for (const result of results) {
        expect(result.status).toBe("fulfilled")
        if (result.status === "fulfilled") expect(result.value).not.toMatch(/deadlock/i)
      }
      pending = rotated
      await ageCooldown(action.id)
    }
    const attempts = Number((await psql(`select attempts from admin_private.customer_action_challenges where action_id = '${action.id}'`)).trim())
    expect(attempts).toBe(0)
  }, 20000)
})
