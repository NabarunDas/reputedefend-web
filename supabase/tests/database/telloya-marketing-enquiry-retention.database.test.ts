/**
 * Local rehearsal of the proposed Telloya marketing-enquiry retention.
 * PGlite only. It does not connect to hosted DEV or Production and it does
 * not apply the migration anywhere except this disposable database.
 */
import { execFile as execFileCb, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, migrationSql, preparePlatform } from "../../../apps/admin/lib/recovery/harness"
import { migrationChain } from "../../../apps/admin/lib/recovery/manifest"

const execFile = promisify(execFileCb)

const db = new PGlite()
const NOW = "2026-11-11T12:00:00.000Z"
const ACTOR = "11111111-1111-4111-8111-111111111111"
const migrationName = "20261111130000_telloya_marketing_enquiry_retention_v1.sql"

type RetentionResult = {
  status: string
  deleted: number
  failed: number
  eligible: number
  blockedReason: string | null
  limit: number
  counts: Record<string, number>
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function run(mode: "dry_run" | "execute", limit = 25): Promise<RetentionResult> {
  const result = (await rows<{ result: RetentionResult }>(
    "select admin_private.telloya_marketing_enquiry_retention_v1($1::timestamptz, $2, $3) as result",
    [NOW, mode, limit],
  ))[0]?.result
  if (!result) throw new Error("retention function returned no row")
  return result
}

async function enquiry(input: {
  source?: string
  status?: string
  createdAt: string
  assigned?: boolean
  nextAction?: string
  publicRef?: string
  caseId?: string
  monitoringId?: string
}): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into public.enquiries(
      id, submission_key, fingerprint, source, payload, status, assigned, next_action,
      internal_status, ack_status, created_at, public_ref, case_id, monitoring_request_id
    ) values (
      $1, $2, $3, $4, '{"source":"fixture"}'::jsonb, $5, $6, $7,
      'SKIPPED', 'SKIPPED', $8::timestamptz, $9, $10, $11
    )`,
    [
      id,
      randomUUID(),
      randomUUID(),
      input.source ?? "telloya",
      input.status ?? "closed",
      input.assigned ?? false,
      input.nextAction ?? "",
      input.createdAt,
      input.publicRef ?? null,
      input.caseId ?? null,
      input.monitoringId ?? null,
    ],
  )
  await db.query(
    "insert into public.enquiry_events(enquiry_id, event) values ($1, 'received')",
    [id],
  )
  return id
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 180000)

afterAll(async () => {
  await db.close()
})

describe("Telloya marketing enquiry retention", () => {
  it("stays revoked, unscheduled and disabled until a separate approval", async () => {
    const source = readFileSync(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url), "utf8")
    expect(source).toContain("Do not apply this file to DEV or Production")
    expect(source).toContain("Do not create this schedule")
    expect(source).toContain("This does not use PRIVACY_DELETION_ENABLED")
    expect(source).not.toMatch(/WHERE\s+.*PRIVACY_DELETION_ENABLED|destructive_enabled boolean NOT NULL DEFAULT true/)
    expect(source).not.toMatch(/^\s*SELECT cron\.schedule/m)
    expect(await count("select count(*)::int as n from admin_private.telloya_marketing_enquiry_retention_control")).toBe(0)

    const privileges = await rows<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, 'admin_private.telloya_marketing_enquiry_retention_v1(timestamptz,text,integer)', 'EXECUTE') as allowed
       from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)`,
    )
    expect(privileges).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: false },
      { role: "service_role", allowed: false },
    ])
    expect(await count(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'telloya_marketing_enquiry_retention_v1' and n.nspname = 'public'`,
    )).toBe(0)
    const definition = (await rows<{ def: string }>(
      "select pg_get_functiondef('admin_private.telloya_marketing_enquiry_retention_v1(timestamptz,text,integer)'::regprocedure) as def",
    ))[0]?.def ?? ""
    expect(definition).toContain("pg_try_advisory_xact_lock")
    expect(definition).not.toMatch(/telloya_voice_leads|commercial_usage|resend/i)

    const disabled = await run("execute")
    expect(disabled).toMatchObject({ status: "disabled", deleted: 0, failed: 0 })
    expect(await count("select count(*)::int as n from public.enquiries")).toBe(0)
  })

  it("selects only an unlinked Telloya enquiry older than 90 complete days", async () => {
    const customer = randomUUID()
    const business = randomUUID()
    const location = randomUUID()
    const caseId = randomUUID()
    const monitoringId = randomUUID()
    await db.query(
      "insert into public.customers(id, full_name, email) values ($1, 'Retention Customer', $2)",
      [customer, `retention-${customer}@example.com`],
    )
    await db.query(
      "insert into public.businesses(id, display_name) values ($1, 'Retention Business')",
      [business],
    )
    await db.query(
      "insert into public.locations(id, business_id, location_name, country) values ($1, $2, 'Shop', 'United Kingdom')",
      [location, business],
    )
    await db.query(
      `insert into public.cases(
        id, public_ref, case_type, customer_id, business_id, location_id, issue_description
      ) values ($1, 'PR-26-RETAAA', 'PROFILE_RECOVERY', $2, $3, $4, 'Existing case')`,
      [caseId, customer, business, location],
    )
    await db.query(
      `insert into public.monitoring_requests(
        id, submission_key, customer_id, business_id, location_id, number_of_locations, terms_accepted_at
      ) values ($1, $2, $3, $4, $5, 1, now())`,
      [monitoringId, randomUUID(), customer, business, location],
    )
    await db.query(
      "insert into public.product_catalogue(code, name, kind, status) values ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT')",
    )
    const hours = randomUUID()
    const targets = randomUUID()
    await db.query(
      `insert into public.admin_setting_versions(id, setting_key, version, status, payload, effective_from, reason, created_by)
       values (
         $1, 'SERVICE_HOURS', 1, 'DRAFT',
         '{"timezone":"Europe/London","weekendPolicy":"EXCLUDED","bankHolidayPolicy":"INCLUDED","windows":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb,
         now(), 'Retention fixture', $2
       )`,
      [hours, ACTOR],
    )
    await db.query(
      `insert into public.admin_setting_versions(id, setting_key, version, status, payload, effective_from, reason, created_by)
       values (
         $1, 'RESPONSE_TARGETS', 1, 'DRAFT',
         '{"ENQUIRY_FIRST_RESPONSE":{"hours":8},"CASE_FIRST_RESPONSE":{"hours":8}}'::jsonb,
         now(), 'Retention fixture', $2
       )`,
      [targets, ACTOR],
    )

    const eligible = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    const recent = await enquiry({ createdAt: "2026-08-13T12:00:00.000Z", status: "new" })
    const boundary = await enquiry({ createdAt: "2026-08-13T12:00:00.000Z", status: "closed" })
    await db.query("update public.enquiries set created_at = $2::timestamptz where id = $1", [boundary, "2026-08-13T12:00:00.000Z"])
    const young = await enquiry({ createdAt: "2026-08-14T12:00:00.000Z", status: "closed" })
    const active = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "open" })
    const assigned = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed", assigned: true })
    const other = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", source: "contact", status: "closed" })
    const linkedCase = await enquiry({
      createdAt: "2026-08-01T12:00:00.000Z",
      status: "converted",
      caseId,
    })
    const linkedMonitoring = await enquiry({
      createdAt: "2026-08-01T12:00:00.000Z",
      status: "converted",
      monitoringId,
    })
    const complaintEnquiry = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    await db.query(
      `insert into public.complaints(customer_id, enquiry_id, source, category, status, summary, created_by)
       values ($1, $2, 'EMAIL', 'SERVICE', 'OPEN', 'Please keep this enquiry', $3)`,
      [customer, complaintEnquiry, ACTOR],
    )
    const onboardingEnquiry = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    await db.query(
      `insert into public.onboarding_requests(enquiry_id, email_snapshot, product_code, plan_family, state)
       values ($1, 'keep@example.com', 'TELLOYA', 'VOICE', 'CLOSED')`,
      [onboardingEnquiry],
    )
    const obligationEnquiry = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    await db.query(
      `insert into public.service_response_obligations(
        target_type, enquiry_id, policy_version_id, hours_version_id, opened_at, due_at, timezone, target_hours, status
      ) values ('ENQUIRY_FIRST_RESPONSE', $1, $2, $3, now(), now(), 'Europe/London', 8, 'FULFILLED')`,
      [obligationEnquiry, targets, hours],
    )
    const privacyEnquiry = await enquiry({
      createdAt: "2026-08-01T12:00:00.000Z",
      status: "closed",
      publicRef: "TY-26-KEEPAA",
    })
    await db.query(
      `insert into public.privacy_requests(kind, status, subject_ref, created_by)
       values ('ACCESS', 'RECEIVED', 'TY-26-KEEPAA', $1)`,
      [ACTOR],
    )
    const held = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "spam" })
    await db.query(
      "insert into admin_private.telloya_marketing_enquiry_holds(enquiry_id, reason) values ($1, 'legal_review')",
      [held],
    )

    const preview = await run("dry_run")
    expect(preview.status).toBe("dry_run")
    expect(preview.deleted).toBe(0)
    expect(preview.eligible).toBe(1)
    expect(preview.counts).toMatchObject({
      eligible: 1,
      too_recent: 3,
      active: 2,
      other_source: 1,
      linked_case: 1,
      linked_monitoring: 1,
      linked_complaint: 1,
      linked_onboarding: 1,
      linked_obligation: 1,
      privacy_request: 1,
      enquiry_hold: 1,
    })
    expect(JSON.stringify(preview)).not.toMatch(/example\.com|Retention Customer|Please keep/)
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [eligible])).toBe(1)
    expect(await count("select count(*)::int as n from public.enquiry_events where enquiry_id = $1", [eligible])).toBe(1)

    const refused = await run("execute")
    expect(refused).toMatchObject({ status: "disabled", deleted: 0, failed: 0, eligible: 1 })
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [eligible])).toBe(1)

    await db.query(
      "insert into admin_private.telloya_marketing_enquiry_retention_control(singleton, destructive_enabled) values (true, true)",
    )
    const deleted = await run("execute", 10)
    expect(deleted).toMatchObject({ status: "complete", deleted: 1, failed: 0 })
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [eligible])).toBe(0)
    expect(await count("select count(*)::int as n from public.enquiry_events where enquiry_id = $1", [eligible])).toBe(0)
    for (const protectedId of [recent, boundary, young, active, assigned, other, linkedCase, linkedMonitoring, complaintEnquiry, onboardingEnquiry, obligationEnquiry, privacyEnquiry, held]) {
      expect(await count("select count(*)::int as n from public.enquiries where id = $1", [protectedId])).toBe(1)
      expect(await count("select count(*)::int as n from public.enquiry_events where enquiry_id = $1", [protectedId])).toBe(1)
    }

    const again = await run("execute", 10)
    expect(again).toMatchObject({ status: "complete", deleted: 0, failed: 0, eligible: 0 })

    const failing = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    const survivor = await enquiry({ createdAt: "2026-07-01T12:00:00.000Z", status: "closed" })
    await db.exec(`
      create function pg_temp.block_retention_delete() returns trigger
      language plpgsql as $fn$
      begin
        if old.id = '${failing}'::uuid then
          raise exception 'forced retention failure';
        end if;
        return old;
      end;
      $fn$;
      create trigger block_retention_delete before delete on public.enquiries
      for each row execute function pg_temp.block_retention_delete();
    `)
    const partial = await run("execute", 10)
    expect(partial.deleted).toBe(1)
    expect(partial.failed).toBe(1)
    expect(partial.status).toBe("complete")
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [failing])).toBe(1)
    expect(await count("select count(*)::int as n from public.enquiry_events where enquiry_id = $1", [failing])).toBe(1)
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [survivor])).toBe(0)
    await db.exec("drop trigger block_retention_delete on public.enquiries")

    const holdId = randomUUID()
    await db.query(
      `insert into public.legal_holds(id, scope_kind, customer_id, reason, status, created_by)
       values ($1, 'CUSTOMER', $2, 'Unlinked marketing enquiry cannot be matched', 'ACTIVE', $3)`,
      [holdId, customer, ACTOR],
    )
    const duringHold = await enquiry({ createdAt: "2026-08-01T12:00:00.000Z", status: "closed" })
    const blockedPreview = await run("dry_run")
    expect(blockedPreview.deleted).toBe(0)
    expect(blockedPreview.eligible).toBe(0)
    expect(blockedPreview.counts.unresolved_person_hold).toBeGreaterThan(0)
    const blocked = await run("execute")
    expect(blocked).toMatchObject({ status: "blocked", deleted: 0, blockedReason: "unresolved_person_hold" })
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [duringHold])).toBe(1)
    await db.query(
      `update public.legal_holds
       set status = 'RELEASED', released_at = now(), released_by = $2, record_version = record_version + 1
       where id = $1`,
      [holdId, ACTOR],
    )

    const categoryHold = randomUUID()
    await db.query(
      `insert into public.legal_holds(id, scope_kind, category, reason, status, created_by)
       values ($1, 'CATEGORY', 'UNSUCCESSFUL_ENQUIRIES', 'Category retention hold', 'ACTIVE', $2)`,
      [categoryHold, ACTOR],
    )
    const categoryRun = await run("execute")
    expect(categoryRun.deleted).toBe(0)
    expect(categoryRun.counts.category_hold).toBeGreaterThan(0)
    expect(await count("select count(*)::int as n from public.enquiries where id = $1", [duringHold])).toBe(1)
    await db.query(
      `update public.legal_holds
       set status = 'RELEASED', released_at = now(), released_by = $2, record_version = record_version + 1
       where id = $1`,
      [categoryHold, ACTOR],
    )
    await db.query(
      "update admin_private.telloya_marketing_enquiry_retention_control set destructive_enabled = false",
    )
    const restored = await run("execute")
    expect(restored.status).toBe("disabled")
    expect(restored.deleted).toBe(0)
  })
})

describe("concurrent Telloya marketing enquiry retention", () => {
  const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
  const port = "55498"
  let root = ""
  let dataDir = ""
  let socketDir = ""

  function psqlArgs() {
    return ["-h", socketDir, "-p", port, "-U", "postgres", "-d", "retention", "-X", "-v", "ON_ERROR_STOP=1"]
  }

  async function psql(sql: string) {
    const result = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-t", "-A", "-c", sql], {
      env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" },
    })
    return result.stdout.trim()
  }

  function heldSession() {
    const child = spawn("stdbuf", ["-o0", "-e0", join(pgBin!, "psql"), ...psqlArgs().filter(arg => arg !== "-v" && arg !== "ON_ERROR_STOP=1")], {
      env: { ...process.env, PAGER: "cat" },
    })
    let out = ""
    let err = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", chunk => { out += chunk })
    child.stderr.on("data", chunk => { err += chunk })
    return {
      async query(sql: string) {
        const mark = `READY_${randomUUID().replace(/-/g, "")}`
        const start = out.length
        child.stdin.write(`${sql}\n\\echo ${mark}\n`)
        const deadline = Date.now() + 20000
        while (!out.slice(start).includes(mark)) {
          if (child.exitCode != null) throw new Error(`psql exited ${child.exitCode}\n${err}\n${out.slice(start)}`)
          if (Date.now() > deadline) throw new Error(`timeout\n${err}\n${out.slice(start)}`)
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        return out.slice(start).replace(mark, "").trim()
      },
      end() { child.stdin.end() },
    }
  }

  beforeAll(async () => {
    if (!pgBin) return
    root = await mkdtemp(join(tmpdir(), "telloya-retention-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "retention"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
    const pgcryptoStub = [
      "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
      "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
      "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
      "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
    ].join(" ")
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin, "psql"), [...psqlArgs(), "-f", file], { timeout: 180000 })
  }, 300000)

  afterAll(async () => {
    if (!dataDir) return
    await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  })

  it.skipIf(!pgBin)("lets one transaction delete while the other reports busy", async () => {
    await psql(`
      insert into public.enquiries(
        submission_key, fingerprint, source, payload, status, internal_status, ack_status, created_at
      ) values
        (gen_random_uuid(), 'one', 'telloya', '{"source":"fixture"}'::jsonb, 'closed', 'SKIPPED', 'SKIPPED', '2026-08-01 12:00:00+00'),
        (gen_random_uuid(), 'two', 'telloya', '{"source":"fixture"}'::jsonb, 'closed', 'SKIPPED', 'SKIPPED', '2026-07-01 12:00:00+00');
      insert into public.enquiry_events(enquiry_id, event)
      select id, 'received' from public.enquiries;
      insert into admin_private.telloya_marketing_enquiry_retention_control(singleton, destructive_enabled)
      values (true, true);
    `)
    const first = heldSession()
    const second = heldSession()
    await first.query("BEGIN;")
    const held = await first.query(
      "select admin_private.telloya_marketing_enquiry_retention_v1('2026-11-11 12:00:00+00', 'execute', 1)::text;",
    )
    expect(held).toContain("complete")
    expect(held).toContain('"deleted": 1')
    const busy = await second.query(
      "select admin_private.telloya_marketing_enquiry_retention_v1('2026-11-11 12:00:00+00', 'execute', 1)::text;",
    )
    expect(busy).toContain("busy")
    expect(busy).toContain('"deleted": 0')
    await first.query("COMMIT;")
    first.end()
    second.end()
    expect(await psql("select count(*)::text from public.enquiries")).toBe("1")
    expect(await psql("select count(*)::text from public.enquiry_events")).toBe("1")
    const followUp = await psql(
      "select admin_private.telloya_marketing_enquiry_retention_v1('2026-11-11 12:00:00+00', 'execute', 1)::text",
    )
    expect(followUp).toContain('"deleted": 1')
    expect(await psql("select count(*)::text from public.enquiries")).toBe("0")
    expect(await psql("select count(*)::text from public.enquiry_events")).toBe("0")
  })
})
