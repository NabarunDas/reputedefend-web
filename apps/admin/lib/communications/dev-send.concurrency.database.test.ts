/**
 * Two real PostgreSQL sessions claiming one SEND_EMAIL job with one idempotency key.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 * This file starts a private cluster when the server binaries are present.
 */
import { execFile as execFileCb } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { settleDevSendEmailClaim, type DevSendClaim } from "./dev-send"
import { createIdempotentMailProvider } from "./mail"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55473"
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const linkSecret = "communication-link-secret-for-tests-32b"

let dataDir = ""
let socketDir = ""

const signatures: Record<string, string[]> = {
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
  job_complete_v1: ["p_job", "p_lease"],
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL"
  return `'${String(value).replaceAll("'", "''")}'`
}

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "devmail01",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout
}

function jsonLines(stdout: string): Array<Record<string, unknown>> {
  return stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("{")).map(line => JSON.parse(line) as Record<string, unknown>)
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const order = signatures[name] ?? Object.keys(args)
      const sql = `select public.${name}(${order.map(key => sqlValue(args[key])).join(",")})`
      return jsonLines(await psql(sql))[0] as T
    },
  }
}

async function queueEvidence(): Promise<string> {
  const evidence = jsonLines(await psql(
    `insert into public.evidence_requests(case_id, title, request_text, created_by)
     values('${caseId}','Photo ID','Please send a clear photo of the owner ID.','${uid}')
     returning jsonb_build_object('id', id)`,
  ))[0].id as string
  const actionId = randomUUID()
  const secretHash = createHash("sha256").update(randomBytes(32)).digest("hex")
  const drafted = jsonLines(await psql(
    `select public.admin_communication_command_v1('${token}', '${randomUUID()}', 'draft',
      jsonb_build_object(
        'templateKey','EVIDENCE_REQUEST',
        'caseId','${caseId}',
        'evidenceRequestId','${evidence}',
        'customerOrigin','${portal}',
        'actionId','${actionId}',
        'secretHash','${secretHash}',
        'linkKeyVersion',1
      ), null)`,
  ))[0]
  expect(drafted).toMatchObject({ status: "success" })
  const reviewed = jsonLines(await psql(
    `select public.admin_communication_command_v1('${token}', '${randomUUID()}', 'review',
      jsonb_build_object('communicationId','${drafted.id}','fromAddress','ops@example.com'),
      ${drafted.version})`,
  ))[0]
  expect(reviewed).toMatchObject({ status: "success" })
  const queued = jsonLines(await psql(
    `select public.admin_communication_command_v1('${token}', '${randomUUID()}', 'queue',
      jsonb_build_object('communicationId','${reviewed.id}','sendEnabled',true),
      ${reviewed.version})`,
  ))[0]
  expect(queued).toMatchObject({ status: "success", lifecycle: "QUEUED" })
  return String(queued.id)
}

describe.skipIf(!pgBin)("DEV SEND_EMAIL claim under two PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "devmail01-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "devmail01"])
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
      readdirSync(dir).find(name => name.endsWith("_admin_evidence_foundation_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_admin_evidence_workspace_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_admin_prepared_packs_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_admin_customer_actions_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_customer_case_pack_access_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_customer_evidence_upload_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_jobs_outbox_operational_health_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_communications_outgoing_mail_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_incoming_mail_conversations_v1.sql"))!,
      readdirSync(dir).find(name => name.endsWith("_case_communications_workspace_v1.sql"))!,
    ]
    for (const name of names) {
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "devmail01", "-v", "ON_ERROR_STOP=1",
        "-f", new URL(name, dir).pathname,
      ])
    }
    await execFile(join(pgBin!, "psql"), [
      "-h", socketDir, "-p", port, "-U", "postgres", "-d", "devmail01", "-v", "ON_ERROR_STOP=1",
      "-f", new URL("../../../../docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql", import.meta.url).pathname,
    ])
    await execFile(join(pgBin!, "psql"), [
      "-h", socketDir, "-p", port, "-U", "postgres", "-d", "devmail01", "-v", "ON_ERROR_STOP=1",
      "-f", new URL("../../../../supabase/migrations/20261021132018_dev_send_email_claim_v1.sql", import.meta.url).pathname,
    ])
    await psql(`
      insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
      insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
      update public.admin_identity set auth_user_id = '${uid}', enabled = true where singleton;
      insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
      insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
      insert into public.businesses(id,display_name) values('${business}','Bakery');
      insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
      insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track)
        values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED');
      insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence)
        values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
    `)
  }, 180000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  it("lets one of two same-key sessions call the provider and keeps the other read-only", async () => {
    const communicationId = await queueEvidence()
    await psql(`select public.admin_enqueue_job_probe_v1('${token}', '${randomUUID()}')`)
    const request = randomUUID()
    const claimSql = `select public.admin_dev_send_email_claim_v1('${token}', '${request}', '${communicationId}', true, '${portal}')`
    const [left, right] = await Promise.all([psql(claimSql), psql(claimSql)])
    const results = [left, right].map(text => jsonLines(text)[0] as DevSendClaim)
    const fresh = results.filter(row => row.replay !== true)
    const replayed = results.filter(row => row.replay === true)
    expect(fresh).toHaveLength(1)
    expect(replayed).toHaveLength(1)
    expect(fresh[0]).toMatchObject({ status: "success", replay: false, jobType: "SEND_EMAIL" })
    expect(fresh[0].leaseToken).toEqual(expect.any(String))
    expect(replayed[0]).toMatchObject({ status: "success", replay: true, currentJobStatus: "RUNNING", leaseToken: null })
    const eventKey = `send-email:${communicationId}:v1`
    expect((await psql(`select count(*) from admin_private.jobs where idempotency_key = '${eventKey}'`)).trim()).toBe("1")
    expect((await psql(`select count(*) from admin_private.job_attempts a join admin_private.jobs j on j.id = a.job_id where j.idempotency_key = '${eventKey}'`)).trim()).toBe("1")
    expect((await psql(`select promoted_at is null from admin_private.job_outbox where topic = 'SYSTEM_HEALTH_PROBE'`)).trim()).toBe("t")

    const provider = createIdempotentMailProvider()
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", linkSecret)
    try {
      expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: fresh[0], provider })).toBe("succeeded")
      expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: replayed[0], provider })).toBe("unavailable")
    } finally {
      vi.unstubAllEnvs()
    }
    expect(provider.calls).toBe(1)
    expect(provider.effects).toBe(1)
    expect(provider.payloads[0].text).toContain(`${portal}/action/`)
    expect(provider.payloads[0].html).toContain(`${portal}/action/`)
    expect(provider.payloads[0].text).not.toContain("customer.profilerelaunch.com")
    expect(provider.payloads[0].html).not.toContain("customer.profilerelaunch.com")
    const done = jsonLines(await psql(claimSql))[0]
    expect(done).toMatchObject({ replay: true, currentJobStatus: "SUCCEEDED", leaseToken: null })
    expect(provider.calls).toBe(1)
    expect((await psql(`select count(*) from admin_private.jobs where job_type <> 'SEND_EMAIL'`)).trim()).toBe("0")
  }, 20000)
})
