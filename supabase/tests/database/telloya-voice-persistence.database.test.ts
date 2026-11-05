/**
 * Local Telloya voice persistence. This file builds a disposable database
 * from the repository chain. It does not connect to hosted DEV or Production.
 */
import { createHash } from "node:crypto"
import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"

import { persistVoiceEvent } from "../../../apps/telloya/lib/voice/persist"
import { signRetellSignature } from "../../../apps/telloya/lib/voice/signature"
import { applyChain, migrationSql, preparePlatform } from "../../../apps/admin/lib/recovery/harness"
import { migrationChain } from "../../../apps/admin/lib/recovery/manifest"

const execFile = promisify(execFileCb)
const NOW_MS = 1762300000000
const NOW_ISO = "2026-11-04T23:46:40.000Z"
const KEY = "synthetic_webhook_key_lane_dev"
const CUSTOMER_A = "11111111-1111-4111-8111-111111111111"
const CUSTOMER_B = "33333333-3333-4333-8333-333333333333"
const BUSINESS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const BUSINESS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
const LOCATION_A = "22222222-2222-4222-8222-222222222222"
const LOCATION_B = "44444444-4444-4444-8444-444444444444"
const ACTOR = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1"
const NUMBER_A = "+440000000010"
const NUMBER_B = "+440000000020"
const NUMBER_PROD = "+440000000030"
const NUMBER_PROD_ONLY = "+440000000031"
const BUSINESS_P = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1"
const LOCATION_P = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const CALLBACK = "+440000000099"
const TRANSCRIPT = "TRANSCRIPT_SENTINEL_not_a_real_call"
const RECORDING = "https://recordings.example.invalid/call_test_001"
const NETWORK_CLI = "+440000000001"
const SUMMARY = "Caller: Ada Test\nCallback number: +440000000099\nRequest: Leaking tap\nJob location: Test Street\nCallback preference: Weekday morning"

const db = new PGlite()

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function parsed<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function rejected(sql: string, params: unknown[]): Promise<string> {
  await db.exec("begin")
  try {
    await db.query(sql, params)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.exec("rollback")
    return message
  }
  await db.exec("rollback")
  throw new Error(`expected rejection: ${sql}`)
}

async function commit(payload: Record<string, unknown>): Promise<string> {
  const result = await rows<{ result: unknown }>("select public.telloya_voice_commit_event_v1($1::jsonb) as result", [JSON.stringify(payload)])
  return parsed<{ outcome: string }>(result[0]?.result).outcome
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: "dev",
    event: "call_analyzed",
    callId: "call_test_010",
    bodySha256: digest("call_test_010-analyzed"),
    toNumber: NUMBER_A,
    agentId: "agent_test_a",
    durationSeconds: 90,
    disconnectionReason: "user_hangup",
    providerError: false,
    callerName: "Ada Test",
    callbackNumber: CALLBACK,
    serviceRequested: "Leaking tap",
    jobLocation: "Test Street",
    callbackWindow: "Weekday morning",
    summary: SUMMARY,
    incomplete: false,
    callStatus: "completed",
    finalised: true,
    finalisedBy: "analysis",
    notificationStatus: "pending",
    createdAt: NOW_ISO,
    ...overrides,
  }
}

function callBody(eventName: string, call: Record<string, unknown>): string {
  return JSON.stringify({ event: eventName, call })
}

function retellCall(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    call_type: "phone_call",
    call_id: "call_test_101",
    agent_id: "agent_test_a",
    call_status: "ended",
    from_number: NETWORK_CLI,
    to_number: NUMBER_A,
    direction: "inbound",
    disconnection_reason: "user_hangup",
    start_timestamp: NOW_MS,
    end_timestamp: NOW_MS + 90_000,
    metadata: { business_id: BUSINESS_B, location_id: LOCATION_B },
    retell_llm_dynamic_variables: { tenant: BUSINESS_B },
    transcript: TRANSCRIPT,
    transcript_object: [{ role: "agent", content: TRANSCRIPT }],
    recording_url: RECORDING,
    data_storage_setting: "everything",
    ...overrides,
  }
}

async function deliver(rawBody: string, environment: "dev" | "production" = "dev") {
  return persistVoiceEvent(db, {
    enabledFlag: "true",
    environment,
    apiKey: KEY,
    nowMs: NOW_MS,
    nowIso: NOW_ISO,
    rawBody,
    signatureHeader: signRetellSignature(rawBody, KEY, String(NOW_MS)),
  })
}

async function storedText(): Promise<string> {
  const tables = ["telloya_voice_number_bindings", "telloya_voice_event_receipts", "telloya_voice_leads", "telloya_voice_notification_outbox"]
  const parts: string[] = []
  for (const table of tables) {
    const result = await rows<{ blob: string | null }>(`select coalesce(string_agg(row_value::text, ''), '') as blob from (select t::text as row_value from public.${table} t) s`)
    parts.push(result[0]?.blob ?? "")
  }
  return parts.join("\n")
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into public.customers(id, full_name, email) values
      ('${CUSTOMER_A}', 'Ada Test', 'ada.voice@example.com'),
      ('${CUSTOMER_B}', 'Bea Test', 'bea.voice@example.com');
    insert into public.businesses(id, display_name) values
      ('${BUSINESS_A}', 'Voice Business A'),
      ('${BUSINESS_B}', 'Voice Business B'),
      ('${BUSINESS_P}', 'Voice Business Production Only');
    insert into public.locations(id, business_id, country, location_name) values
      ('${LOCATION_A}', '${BUSINESS_A}', 'GB', 'Lane A'),
      ('${LOCATION_B}', '${BUSINESS_B}', 'GB', 'Lane B'),
      ('${LOCATION_P}', '${BUSINESS_P}', 'GB', 'Lane Production');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${CUSTOMER_A}', '${BUSINESS_A}', 'verified', now(), '${ACTOR}', 'Synthetic membership for the voice isolation test.'),
      ('${CUSTOMER_B}', '${BUSINESS_B}', 'verified', now(), '${ACTOR}', 'Synthetic membership for the other voice business.');
  `)
  await db.query("select public.telloya_voice_bind_number_v1($1, $2, $3, $4, $5)", ["dev", NUMBER_A, "agent_test_a", BUSINESS_A, LOCATION_A])
  await db.query("select public.telloya_voice_bind_number_v1($1, $2, $3, $4, $5)", ["dev", NUMBER_B, "agent_test_b", BUSINESS_B, LOCATION_B])
  await db.query("select public.telloya_voice_bind_number_v1($1, $2, $3, $4, $5)", ["production", NUMBER_PROD, "agent_test_a", BUSINESS_A, LOCATION_A])
  await db.query("select public.telloya_voice_bind_number_v1($1, $2, $3, $4, $5)", ["production", NUMBER_PROD_ONLY, "agent_test_prod", BUSINESS_P, LOCATION_P])
}, 180000)

afterAll(async () => { await db.close() })

describe("local Telloya voice persistence", () => {
  it("creates one lead for the bound business and ignores a second delivery", async () => {
    const raw = callBody("call_analyzed", retellCall({
      call_id: "call_test_101",
      call_analysis: { call_summary: TRANSCRIPT, custom_analysis_data: {
        caller_name: "Ada Test",
        callback_number: CALLBACK,
        service_requested: "Leaking tap",
        job_location: "Test Street",
        callback_window: "Weekday morning",
      } },
    }))
    const first = await deliver(raw)
    expect(first.status).toBe(204)
    expect(first.log.outcome).toBe("accepted")
    expect(first.log.notificationStatus).toBe("pending")
    const second = await deliver(raw)
    expect(second.log.outcome).toBe("duplicate")
    expect(await count("select count(*)::int as n from public.telloya_voice_leads where provider_call_ref = 'call_test_101'")).toBe(1)
    const lead = (await rows<{ business_id: string; callback_number: string; call_status: string }>(
      "select business_id::text, callback_number, call_status from public.telloya_voice_leads where provider_call_ref = 'call_test_101'",
    ))[0]
    expect(lead?.business_id).toBe(BUSINESS_A)
    expect(lead?.callback_number).toBe(CALLBACK)
    expect(lead?.call_status).toBe("completed")
    expect(await count("select count(*)::int as n from public.telloya_voice_notification_outbox o join public.telloya_voice_leads l on l.id = o.lead_id where l.provider_call_ref = 'call_test_101'")).toBe(1)
  })

  it("lets call_ended and call_analyzed update the same call", async () => {
    expect(await commit(event({
      event: "call_ended",
      callId: "call_test_102",
      bodySha256: digest("call_test_102-ended"),
      summary: "Awaiting analysis.",
      incomplete: true,
      callStatus: "incomplete",
      finalised: false,
      finalisedBy: null,
      notificationStatus: null,
      callerName: null,
      callbackNumber: null,
      serviceRequested: null,
      jobLocation: null,
      callbackWindow: null,
    }))).toBe("accepted")
    const before = (await rows<{ id: string; created_at: string }>("select id::text, created_at::text from public.telloya_voice_leads where provider_call_ref = 'call_test_102'"))[0]
    expect(await count("select count(*)::int as n from public.telloya_voice_notification_outbox o join public.telloya_voice_leads l on l.id = o.lead_id where l.provider_call_ref = 'call_test_102'")).toBe(0)
    expect(await commit(event({
      callId: "call_test_102",
      bodySha256: digest("call_test_102-analyzed"),
    }))).toBe("accepted")
    const after = await rows<{ id: string; created_at: string; call_status: string; summary: string }>(
      "select id::text, created_at::text, call_status, summary from public.telloya_voice_leads where provider_call_ref = 'call_test_102'",
    )
    expect(after).toHaveLength(1)
    expect(after[0]?.id).toBe(before?.id)
    expect(after[0]?.created_at).toBe(before?.created_at)
    expect(after[0]?.call_status).toBe("completed")
    expect(after[0]?.summary).toBe(SUMMARY)
    expect(await count("select count(*)::int as n from public.telloya_voice_event_receipts where provider_call_ref = 'call_test_102'")).toBe(2)
  })

  it("does not let a later call_ended downgrade a completed lead", async () => {
    expect(await commit(event({ callId: "call_test_103", bodySha256: digest("call_test_103-analyzed") }))).toBe("accepted")
    expect(await commit(event({
      event: "call_ended",
      callId: "call_test_103",
      bodySha256: digest("call_test_103-ended"),
      summary: "DOWNGRADED",
      incomplete: true,
      callStatus: "incomplete",
      finalised: false,
      finalisedBy: null,
      durationSeconds: 10,
      notificationStatus: null,
    }))).toBe("accepted")
    const lead = (await rows<{ summary: string; call_status: string; duration_seconds: number; finalised: boolean }>(
      "select summary, call_status, duration_seconds, finalised from public.telloya_voice_leads where provider_call_ref = 'call_test_103'",
    ))[0]
    expect(lead?.summary).toBe(SUMMARY)
    expect(lead?.call_status).toBe("completed")
    expect(lead?.finalised).toBe(true)
    expect(lead?.duration_seconds).toBe(90)
  })

  it("keeps the accepted receipt when a later body hash conflicts", async () => {
    expect(await commit(event({ callId: "call_test_104", bodySha256: digest("call_test_104-first"), summary: SUMMARY }))).toBe("accepted")
    expect(await commit(event({
      callId: "call_test_104",
      bodySha256: digest("call_test_104-second"),
      summary: "OVERWRITE",
      callerName: "Other Person",
    }))).toBe("conflict")
    const lead = (await rows<{ summary: string; caller_name: string }>("select summary, caller_name from public.telloya_voice_leads where provider_call_ref = 'call_test_104'"))[0]
    expect(lead?.summary).toBe(SUMMARY)
    expect(lead?.caller_name).toBe("Ada Test")
    const receipt = (await rows<{ body_sha256: string; processing_status: string; conflict_hashes: string[] }>(
      "select body_sha256, processing_status, conflict_hashes from public.telloya_voice_event_receipts where provider_call_ref = 'call_test_104'",
    ))[0]
    expect(receipt?.body_sha256).toBe(digest("call_test_104-first"))
    expect(receipt?.processing_status).toBe("conflict")
    expect(receipt?.conflict_hashes).toEqual([digest("call_test_104-second")])
    expect(await count("select count(*)::int as n from public.telloya_voice_leads where provider_call_ref = 'call_test_104'")).toBe(1)
  })

  it("keeps the same call reference for one location in DEV and Production", async () => {
    expect(await commit(event({ callId: "call_test_shared", bodySha256: digest("call_test_shared-dev") }))).toBe("accepted")
    expect(await commit(event({
      environment: "production",
      callId: "call_test_shared",
      bodySha256: digest("call_test_shared-production"),
      toNumber: NUMBER_PROD,
    }))).toBe("accepted")
    const stored = await rows<{ environment: string; location_id: string }>(
      "select environment, location_id::text from public.telloya_voice_leads where provider_call_ref = 'call_test_shared' order by environment",
    )
    expect(stored).toEqual([
      { environment: "dev", location_id: LOCATION_A },
      { environment: "production", location_id: LOCATION_A },
    ])
  })

  it("returns no other environment from a DEV lane snapshot", async () => {
    const snapshot = parsed<{ bindings: Array<{ environment: string; inboundToNumber: string; agentId: string; businessId: string; locationId: string }> }>((await rows<{ snapshot: unknown }>(
      "select public.telloya_voice_lane_snapshot_v1('dev', 'call_test_shared') as snapshot",
    ))[0]?.snapshot)
    expect(snapshot.bindings.length).toBeGreaterThan(0)
    expect(snapshot.bindings.every((binding) => binding.environment === "dev")).toBe(true)
    const encoded = JSON.stringify(snapshot)
    expect(encoded).not.toContain(NUMBER_PROD)
    expect(encoded).not.toContain(NUMBER_PROD_ONLY)
    expect(encoded).not.toContain("agent_test_prod")
    expect(encoded).not.toContain(BUSINESS_P)
    expect(encoded).not.toContain(LOCATION_P)
  })

  it("does not accept a supplied customer id as a lead read", async () => {
    expect(await count("select count(*)::int as n from pg_proc where proname = 'telloya_voice_list_leads_v1'")).toBe(0)
    const spoofed = await rejected(
      "select public.telloya_voice_list_leads_v1('dev', $1::uuid, $2::uuid)",
      [BUSINESS_A, CUSTOMER_B],
    )
    expect(spoofed).toMatch(/does not exist/i)
    expect(spoofed).not.toContain("call_test_shared")
    expect(spoofed).not.toContain(CALLBACK)
    const devLead = (await rows<{ business_id: string }>(
      "select business_id::text from public.telloya_voice_leads where environment = 'dev' and provider_call_ref = 'call_test_shared'",
    ))[0]
    const productionLead = (await rows<{ business_id: string }>(
      "select business_id::text from public.telloya_voice_leads where environment = 'production' and provider_call_ref = 'call_test_shared'",
    ))[0]
    expect(devLead?.business_id).toBe(BUSINESS_A)
    expect(productionLead?.business_id).toBe(BUSINESS_A)
  })

  it("rejects a number that is not bound to the supplied agent", async () => {
    expect(await commit(event({
      callId: "call_test_107",
      bodySha256: digest("call_test_107"),
      toNumber: NUMBER_A,
      agentId: "agent_test_b",
    }))).toBe("unknown_tenant")
    expect(await count("select count(*)::int as n from public.telloya_voice_leads where provider_call_ref = 'call_test_107'")).toBe(0)
    const receipt = (await rows<{ processing_status: string }>(
      "select processing_status from public.telloya_voice_event_receipts where provider_call_ref = 'call_test_107'",
    ))[0]
    expect(receipt?.processing_status).toBe("ignored_tenant")
  })

  it("leaves a failed notification intent in the outbox", async () => {
    expect(await commit(event({ callId: "call_test_108", bodySha256: digest("call_test_108") }))).toBe("accepted")
    const failed = parsed<{ outcome: string }>((await rows<{ result: unknown }>(
      "select public.telloya_voice_mark_notification_failed_v1('dev', 'call_test_108', 'transport_failed') as result",
    ))[0]?.result)
    expect(failed.outcome).toBe("failed")
    const notice = (await rows<{ delivery_status: string; attempt_count: number; last_error_code: string }>(
      `select o.delivery_status, o.attempt_count, o.last_error_code
       from public.telloya_voice_notification_outbox o
       join public.telloya_voice_leads l on l.id = o.lead_id
       where l.provider_call_ref = 'call_test_108'`,
    ))[0]
    expect(notice).toEqual({ delivery_status: "failed", attempt_count: 1, last_error_code: "transport_failed" })
    expect(await count("select count(*)::int as n from public.telloya_voice_leads where provider_call_ref = 'call_test_108'")).toBe(1)
    const again = parsed<{ outcome: string }>((await rows<{ result: unknown }>(
      "select public.telloya_voice_mark_notification_failed_v1('dev', 'call_test_108', 'transport_failed') as result",
    ))[0]?.result)
    expect(again.outcome).toBe("failed")
    expect(await count("select count(*)::int as n from public.telloya_voice_notification_outbox o join public.telloya_voice_leads l on l.id = o.lead_id where l.provider_call_ref = 'call_test_108' and o.attempt_count = 2")).toBe(1)
  })

  it("denies direct table access to anon, authenticated, and service_role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec("begin")
      await db.exec(`set local role ${role}`)
      let message = "allowed"
      try {
        await db.query("select * from public.telloya_voice_leads")
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      await db.exec("rollback")
      expect(message).toMatch(/permission denied/i)
    }
    await db.exec("begin")
    await db.exec("set local role anon")
    let anonCall = "allowed"
    try {
      await db.query("select public.telloya_voice_lane_snapshot_v1('dev', 'call_test_101')")
    } catch (error) {
      anonCall = error instanceof Error ? error.message : String(error)
    }
    await db.exec("rollback")
    expect(anonCall).toMatch(/permission denied/i)

    await db.exec("begin")
    await db.exec("set local role service_role")
    const snapshot = await rows<{ snapshot: unknown }>("select public.telloya_voice_lane_snapshot_v1('dev', 'call_test_101') as snapshot")
    await db.exec("commit")
    const bindings = parsed<{ bindings: Array<{ environment: string }> }>(snapshot[0]?.snapshot).bindings
    expect(bindings.length).toBeGreaterThan(0)
    expect(bindings.every((binding) => binding.environment === "dev")).toBe(true)
    expect(await count("select count(*)::int as n from pg_policies where tablename like 'telloya_voice_%'")).toBe(0)
  })

  it("rejects a second location for an agent that is already active", async () => {
    const clash = await rejected(
      "select public.telloya_voice_bind_number_v1('dev', '+440000000050', 'agent_test_a', $1, $2)",
      [BUSINESS_B, LOCATION_B],
    )
    expect(clash).toContain("telloya_voice_rejected")
    expect(clash).not.toContain("+440000000050")
    await db.query(
      "select public.telloya_voice_bind_number_v1('dev', '+440000000051', 'agent_test_a', $1, $2)",
      [BUSINESS_A, LOCATION_A],
    )
    expect(await count(
      "select count(*)::int as n from public.telloya_voice_number_bindings where environment = 'dev' and agent_id = 'agent_test_a' and active",
    )).toBe(2)
  })

  it("never stores a transcript, recording, raw body, network caller id, or secret", async () => {
    const raw = callBody("call_analyzed", retellCall({
      call_id: "call_test_109",
      from_number: NETWORK_CLI,
      transcript: TRANSCRIPT,
      recording_url: RECORDING,
      call_analysis: { call_summary: TRANSCRIPT, custom_analysis_data: {
        caller_name: "Ada Test",
        callback_number: CALLBACK,
        service_requested: "Leaking tap",
        job_location: "Test Street",
        callback_window: "Weekday morning",
      } },
    }))
    expect((await deliver(raw)).log.outcome).toBe("accepted")
    const blob = await storedText()
    expect(blob).not.toContain(TRANSCRIPT)
    expect(blob).not.toContain(RECORDING)
    expect(blob).not.toContain(NETWORK_CLI)
    expect(blob).not.toContain(KEY)
    expect(blob).not.toContain(raw)
    const columns = await rows<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name like 'telloya_voice_%'`,
    )
    const names = columns.map((column) => column.column_name)
    for (const forbidden of ["transcript", "recording_url", "raw_body", "from_number", "api_key", "audio"]) {
      expect(names).not.toContain(forbidden)
    }
    const echoed = await rejected("select public.telloya_voice_commit_event_v1($1::jsonb)", [JSON.stringify({
      ...event({ callId: "call_test_110" }),
      transcript: TRANSCRIPT,
      recording_url: RECORDING,
      from_number: NETWORK_CLI,
    })])
    expect(echoed).toContain("telloya_voice_rejected")
    expect(echoed).not.toContain(TRANSCRIPT)
    expect(echoed).not.toContain(CALLBACK)
    expect(echoed).not.toContain(NETWORK_CLI)
    expect(await count("select count(*)::int as n from public.telloya_voice_leads where provider_call_ref = 'call_test_110'")).toBe(0)
    const binding = await rejected(
      "select public.telloya_voice_bind_number_v1('dev', '+44BADSECRET', 'agent_test_a', $1, $2)",
      [BUSINESS_A, LOCATION_A],
    )
    expect(binding).toContain("telloya_voice_rejected")
    expect(binding).not.toContain("BADSECRET")
  })

  it("still refuses a LIVE service provision", async () => {
    const definition = (await rows<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'service_provisions_live_closed'",
    ))[0]?.def
    expect(definition).toContain("<> 'LIVE'")
  })
})

const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find((dir) => existsSync(join(dir, "initdb")))
const pgPort = "55491"
const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

describe.skipIf(!pgBin)("concurrent voice commits on two PostgreSQL sessions", () => {
  const root = { path: "" }
  const socket = { path: "" }

  function psqlArgs() {
    return ["-h", socket.path, "-p", pgPort, "-U", "postgres", "-d", "voicelock", "-v", "ON_ERROR_STOP=1", "-X", "-t", "-A"]
  }

  beforeAll(async () => {
    root.path = await mkdtemp(join(tmpdir(), "voice-lock-"))
    const dataDir = join(root.path, "data")
    socket.path = join(root.path, "socket")
    await mkdir(socket.path)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-l", join(root.path, "server.log"), "-w", "start", "-o", `-p ${pgPort} -k ${socket.path} -c listen_addresses=`])
    await execFile(join(pgBin!, "createdb"), ["-h", socket.path, "-p", pgPort, "-U", "postgres", "voicelock"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map((entry) => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root.path, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file])
    const business = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"
    const location = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2"
    const customer = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3"
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", `
      insert into public.customers(id, full_name, email) values ('${customer}', 'Lock Test', 'lock.voice@example.com');
      insert into public.businesses(id, display_name) values ('${business}', 'Lock Business');
      insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'GB', 'Lock Lane');
      select public.telloya_voice_bind_number_v1('dev', '+440000000040', 'agent_test_lock', '${business}', '${location}');
    `])
  }, 300000)

  afterAll(async () => {
    if (!root.path || !pgBin) return
    await execFile(join(pgBin, "pg_ctl"), ["-D", join(root.path, "data"), "-m", "immediate", "stop"]).catch(() => undefined)
    await rm(root.path, { recursive: true, force: true })
  })

  it("creates one lead when the same event is committed twice at once", async () => {
    const payload = JSON.stringify(event({
      callId: "call_test_concurrent",
      bodySha256: digest("call_test_concurrent"),
      toNumber: "+440000000040",
      agentId: "agent_test_lock",
    }))
    const sql = `select public.telloya_voice_commit_event_v1($voice$${payload}$voice$::jsonb);`
    const run = () => execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", sql])
    const [left, right] = await Promise.all([run(), run()])
    const outcomes = `${left.stdout}\n${right.stdout}`
    expect(outcomes).toContain("accepted")
    expect(outcomes).toContain("duplicate")
    const counted = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", "select count(*) from public.telloya_voice_leads where provider_call_ref = 'call_test_concurrent'"])
    expect(counted.stdout.trim()).toBe("1")
  })

  it("accepts exactly one assignment when two sessions bind one agent to different locations", async () => {
    const business = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"
    const location = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2"
    const other = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4"
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", `
      insert into public.locations(id, business_id, country, location_name)
      values ('${other}', '${business}', 'GB', 'Lock Lane Two');
    `])
    const left = "select public.telloya_voice_bind_number_v1('dev', '+440000000041', 'agent_test_race', '" + business + "', '" + location + "');"
    const right = "select public.telloya_voice_bind_number_v1('dev', '+440000000042', 'agent_test_race', '" + business + "', '" + other + "');"
    const [first, second] = await Promise.allSettled([
      execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", left]),
      execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", right]),
    ])
    const settled = [first, second]
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const failure = settled.find((result) => result.status === "rejected")
    expect(failure?.status).toBe("rejected")
    const reason = failure?.status === "rejected" ? failure.reason as { stderr?: string } : { stderr: "" }
    const text = reason.stderr ?? ""
    expect(text).toContain("telloya_voice_rejected")
    expect(text).not.toContain("+440000000041")
    expect(text).not.toContain("+440000000042")
    const counted = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-c", "select count(*) from public.telloya_voice_number_bindings where agent_id = 'agent_test_race' and active"])
    expect(counted.stdout.trim()).toBe("1")
  })
})
