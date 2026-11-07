/**
 * Local usage-ledger checks. This builds a disposable database from the
 * repository chain. It does not connect to hosted DEV or Production and it
 * does not create a Stripe charge.
 */
import { execFile as execFileCb, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"

import { evaluateUsage, type UsagePosition } from "../../../apps/admin/lib/commercial/usage-policy"
import { applyChain, migrationSql, preparePlatform } from "../../../apps/admin/lib/recovery/harness"
import { migrationChain } from "../../../apps/admin/lib/recovery/manifest"

const execFile = promisify(execFileCb)
const db = new PGlite()
const CUSTOMER = "11111111-1111-4111-8111-111111111111"
const BUSINESS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const LOCATION = "22222222-2222-4222-8222-222222222222"
const BUSINESS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
const LOCATION_B = "22222222-2222-4222-8222-222222222223"
const PLAN = "33333333-3333-4333-8333-333333333331"
const SUB_A = "44444444-4444-4444-8444-444444444441"
const SUB_B = "44444444-4444-4444-8444-444444444442"
const PERIOD_START = "2026-11-01T00:00:00.000Z"
const PERIOD_END = "2026-12-01T00:00:00.000Z"
const NEXT_END = "2027-01-01T00:00:00.000Z"
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const HASH_C = "c".repeat(64)
const HASH_D = "d".repeat(64)
const HASH_E = "e".repeat(64)
const HASH_F = "f".repeat(64)

type ApplyResult = { status: string; eventId?: string | null }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

function payload(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    environment: "dev",
    eventType: "call_ended",
    providerCallRef: "call_customer_1",
    callScope: "customer_phone",
    subscriptionId: SUB_A,
    businessId: BUSINESS,
    locationId: LOCATION,
    durationSeconds: 90,
    durationQuality: "confirmed",
    bodySha256: HASH_A,
    includedMinutes: 120,
    overageOptIn: false,
    overageRateMinor: null,
    overageCapMinor: null,
    ...overrides,
  }
}

async function apply(body: Record<string, unknown>): Promise<ApplyResult> {
  const result = (await rows<{ result: ApplyResult }>(
    "select public.commercial_usage_apply_event_v1($1::jsonb) as result",
    [JSON.stringify(body)],
  ))[0]?.result
  if (!result) throw new Error("usage function returned no row")
  return result
}

async function seconds(subscription: string, start: string, end: string): Promise<number> {
  const value = (await rows<{ n: number }>(
    "select public.commercial_usage_customer_seconds_v1($1::uuid, $2::timestamptz, $3::timestamptz) as n",
    [subscription, start, end],
  ))[0]?.n
  return Number(value)
}

async function reserved(subscription: string, start: string, end: string): Promise<number> {
  const value = (await rows<{ n: number }>(
    "select public.commercial_usage_open_reservation_seconds_v1($1::uuid, $2::timestamptz, $3::timestamptz) as n",
    [subscription, start, end],
  ))[0]?.n
  return Number(value)
}

function position(overrides: Partial<UsagePosition>): UsagePosition {
  return {
    scope: "customer_phone",
    subscriptionState: "ACTIVE",
    provisionState: "LIVE",
    nowMs: Date.parse(PERIOD_START) + 86_400_000,
    period: { startMs: Date.parse(PERIOD_START), endMs: Date.parse(PERIOD_END) },
    confirmedCustomerSeconds: 0,
    openReservationSeconds: 0,
    previousPeriodCustomerSeconds: 0,
    snapshot: {
      tier: "BASIC",
      includedMinutes: 120,
      minutesRollover: false,
      overageOptIn: false,
      overageRateMinor: null,
      overageCapMinor: null,
    },
    ...overrides,
  }
}

function denyReason(decision: ReturnType<typeof evaluateUsage>): string {
  if (decision.outcome !== "deny") throw new Error(decision.outcome)
  return decision.reason
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into public.customers(id, full_name, email) values
      ('${CUSTOMER}', 'Ada Usage', 'ada.usage@example.com');
    insert into public.businesses(id, display_name) values
      ('${BUSINESS}', 'Usage Business'),
      ('${BUSINESS_B}', 'Other Usage Business');
    insert into public.locations(id, business_id, country, location_name) values
      ('${LOCATION}', '${BUSINESS}', 'GB', 'Usage Lane'),
      ('${LOCATION_B}', '${BUSINESS_B}', 'GB', 'Other Lane');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${CUSTOMER}', '${BUSINESS}', 'verified', now(), '${CUSTOMER}', 'Local usage fixture membership.'),
      ('${CUSTOMER}', '${BUSINESS_B}', 'verified', now(), '${CUSTOMER}', 'Local usage fixture membership.');
    insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT');
    insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values (
      '${PLAN}', 'TELLOYA', 1, 'DRAFT', '2026-10-01 00:00:00+00', 'MONTH', 'GBP',
      4900, 'NOT_APPLICABLE', 'TELLOYA-USAGE-LEDGER'
    );
    insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
      values ('${PLAN}', 'TELLOYA', 1, 'LOCATION');
    update public.plan_versions
      set status = 'APPROVED', approved_by = '${CUSTOMER}', approved_at = now()
      where id = '${PLAN}';
    insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
    ) values
      ('${SUB_A}', 'VC-26-USAGEX', '${CUSTOMER}', '${BUSINESS}', 'VOICE', '${PLAN}', 'BILLABLE', 'DRAFT', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-USAGE-LEDGER'),
      ('${SUB_B}', 'VC-26-USAGYY', '${CUSTOMER}', '${BUSINESS_B}', 'VOICE', '${PLAN}', 'BILLABLE', 'DRAFT', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-USAGE-LEDGER');
    insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot) values
      ('${SUB_A}', 'TELLOYA', 1, 1),
      ('${SUB_B}', 'TELLOYA', 1, 1);
    update public.commercial_subscriptions
      set state = 'ACCEPTED', current_period_start = '${PERIOD_START}', current_period_end = '${PERIOD_END}'
      where id = '${SUB_A}';
    update public.commercial_subscriptions
      set state = 'ACCEPTED', current_period_start = '${PERIOD_END}', current_period_end = '${NEXT_END}'
      where id = '${SUB_B}';
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("subscription usage ledger", () => {
  it("records an internal web call once and keeps it out of customer seconds", async () => {
    const body = payload({
      eventType: "call_ended",
      providerCallRef: "web_qa_1",
      callScope: "admin_web_qa",
      subscriptionId: null,
      businessId: null,
      locationId: null,
      durationSeconds: 30,
      includedMinutes: null,
      endedAt: null,
    })
    expect((await apply(body)).status).toBe("accepted")
    expect((await apply(body)).status).toBe("replay")
    expect((await apply({ ...body, bodySha256: HASH_B })).status).toBe("conflict")
    expect(await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'web_qa_1'")).toEqual([{ n: 1 }])
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(0)
    const definition = (await rows<{ def: string }>(
      "select pg_get_functiondef('admin_private.commercial_usage_apply_event_v1(jsonb)'::regprocedure) as def",
    ))[0]?.def
    expect(definition).toContain("pg_advisory_xact_lock")
  })

  it("rejects a change to recorded usage evidence", async () => {
    await db.exec("begin")
    try {
      await db.query("update admin_private.commercial_usage_events set duration_seconds = 1 where provider_call_ref = 'web_qa_1'")
      throw new Error("expected the usage row to stay immutable")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.exec("rollback")
      expect(message).toMatch(/immutable/)
    }
  })

  it("lets only the server role call the public usage functions", async () => {
    const privileges = (await rows<{
      service_schema: boolean
      anon_schema: boolean
      auth_schema: boolean
      service_apply: boolean
      anon_apply: boolean
      auth_apply: boolean
      service_private: boolean
      service_select: boolean
      anon_insert: boolean
    }>(`
      select
        has_schema_privilege('service_role', 'admin_private', 'USAGE') as service_schema,
        has_schema_privilege('anon', 'admin_private', 'USAGE') as anon_schema,
        has_schema_privilege('authenticated', 'admin_private', 'USAGE') as auth_schema,
        has_function_privilege('service_role', 'public.commercial_usage_apply_event_v1(jsonb)', 'EXECUTE') as service_apply,
        has_function_privilege('anon', 'public.commercial_usage_apply_event_v1(jsonb)', 'EXECUTE') as anon_apply,
        has_function_privilege('authenticated', 'public.commercial_usage_apply_event_v1(jsonb)', 'EXECUTE') as auth_apply,
        has_function_privilege('service_role', 'admin_private.commercial_usage_apply_event_v1(jsonb)', 'EXECUTE') as service_private,
        has_table_privilege('service_role', 'admin_private.commercial_usage_events', 'SELECT') as service_select,
        has_table_privilege('anon', 'admin_private.commercial_usage_events', 'INSERT') as anon_insert
    `))[0]
    expect(privileges).toEqual({
      service_schema: false,
      anon_schema: false,
      auth_schema: false,
      service_apply: true,
      anon_apply: false,
      auth_apply: false,
      service_private: false,
      service_select: false,
      anon_insert: false,
    })

    await db.exec("SET ROLE service_role")
    try {
      const recorded = (await rows<{ result: ApplyResult }>(
        "select public.commercial_usage_apply_event_v1($1::jsonb) as result",
        [JSON.stringify(payload({
          providerCallRef: "web_qa_role",
          callScope: "admin_web_qa",
          subscriptionId: null,
          businessId: null,
          locationId: null,
          durationSeconds: 5,
          bodySha256: HASH_C,
          includedMinutes: null,
        }))],
      ))[0]?.result
      expect(recorded?.status).toBe("accepted")
      await expect(db.query(
        "select admin_private.commercial_usage_customer_seconds_v1($1::uuid, $2::timestamptz, $3::timestamptz)",
        [SUB_A, PERIOD_START, PERIOD_END],
      )).rejects.toThrow(/permission denied/i)
      await expect(db.query("select count(*) from admin_private.commercial_usage_events")).rejects.toThrow(/permission denied/i)
    } finally {
      await db.exec("RESET ROLE")
    }

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`)
      try {
        await expect(db.query(
          "select public.commercial_usage_apply_event_v1($1::jsonb)",
          [JSON.stringify(payload({ providerCallRef: `web_denied_${role}`, bodySha256: HASH_D }))],
        )).rejects.toThrow(/permission denied/i)
        await expect(db.query(
          "select public.commercial_usage_correct_v1('dev', 'web_qa_1', 1, 'provider_correction')",
        )).rejects.toThrow(/permission denied/i)
      } finally {
        await db.exec("RESET ROLE")
      }
    }
  })

  it("records one customer call on the reserved period when it ends after renewal", async () => {
    expect((await apply(payload({
      eventType: "call_started",
      providerCallRef: "call_customer_1",
      durationSeconds: null,
      durationQuality: "missing",
      bodySha256: HASH_A,
    }))).status).toBe("accepted")
    expect(await reserved(SUB_A, PERIOD_START, PERIOD_END)).toBe(60)
    expect(await reserved(SUB_A, PERIOD_END, NEXT_END)).toBe(0)
    expect(await reserved(SUB_B, PERIOD_END, NEXT_END)).toBe(0)

    await db.query(
      "update public.commercial_subscriptions set current_period_start = $2::timestamptz, current_period_end = $3::timestamptz where id = $1::uuid",
      [SUB_A, PERIOD_END, NEXT_END],
    )
    expect(await reserved(SUB_A, PERIOD_START, PERIOD_END)).toBe(60)
    expect(await reserved(SUB_A, PERIOD_END, NEXT_END)).toBe(0)

    const ended = await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_customer_1",
      endedAt: "2026-12-02T00:00:00.000Z",
      durationSeconds: 90,
      bodySha256: HASH_B,
      includedMinutes: 999,
      overageOptIn: true,
      overageRateMinor: 25,
      overageCapMinor: 25,
    }))
    expect(ended.status).toBe("accepted")
    const event = (await rows<{
      period_start: string
      period_end: string
      duration_seconds: number
      included_minutes_snapshot: number
      overage_opt_in_snapshot: boolean
      subscription_id: string
      business_id: string
    }>(`
      select period_start::text, period_end::text, duration_seconds, included_minutes_snapshot,
             overage_opt_in_snapshot, subscription_id::text, business_id::text
      from admin_private.commercial_usage_events
      where provider_call_ref = 'call_customer_1'
    `))[0]
    expect(event?.subscription_id).toBe(SUB_A)
    expect(event?.business_id).toBe(BUSINESS)
    expect(event?.duration_seconds).toBe(90)
    expect(event?.included_minutes_snapshot).toBe(120)
    expect(event?.overage_opt_in_snapshot).toBe(false)
    expect(Date.parse(event?.period_start ?? "")).toBe(Date.parse(PERIOD_START))
    expect(Date.parse(event?.period_end ?? "")).toBe(Date.parse(PERIOD_END))
    expect(await reserved(SUB_A, PERIOD_START, PERIOD_END)).toBe(0)
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(90)
    expect(await seconds(SUB_A, PERIOD_END, NEXT_END)).toBe(0)
    expect(await seconds(SUB_B, PERIOD_END, NEXT_END)).toBe(0)
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_customer_1'",
    )).toEqual([{ n: 1 }])

    expect((await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_customer_1",
      endedAt: "2026-12-02T00:00:00.000Z",
      durationSeconds: 90,
      bodySha256: HASH_B,
    }))).status).toBe("replay")
    expect((await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_customer_1",
      endedAt: "2026-12-02T00:10:00.000Z",
      durationSeconds: 600,
      bodySha256: HASH_C,
    }))).status).toBe("conflict")
    expect(await rows<{ n: number; duration_seconds: number }>(
      "select count(*)::int as n, max(duration_seconds) as duration_seconds from admin_private.commercial_usage_events where provider_call_ref = 'call_customer_1'",
    )).toEqual([{ n: 1, duration_seconds: 90 }])
    expect(await rows<{ n: number }>(`
      select count(*)::int as n
      from admin_private.commercial_usage_receipt_conflicts conflict
      join admin_private.commercial_usage_receipts receipt on receipt.id = conflict.receipt_id
      where receipt.provider_call_ref = 'call_customer_1' and receipt.event_type = 'call_ended'
    `)).toEqual([{ n: 1 }])

    expect((await apply(payload({
      eventType: "call_analyzed",
      providerCallRef: "call_customer_1",
      durationSeconds: null,
      durationQuality: "missing",
      bodySha256: HASH_D,
    }))).status).toBe("accepted")
    expect(await rows<{ duration_seconds: number }>(
      "select duration_seconds from admin_private.commercial_usage_events where provider_call_ref = 'call_customer_1'",
    )).toEqual([{ duration_seconds: 90 }])

    const corrected = (await rows<{ result: { status: string } }>(
      "select public.commercial_usage_correct_v1('dev', 'call_customer_1', $1, 'provider_correction') as result",
      [120 * 60],
    ))[0]?.result
    expect(corrected?.status).toBe("accepted")
    expect(await rows<{ duration_seconds: number }>(
      "select duration_seconds from admin_private.commercial_usage_events where provider_call_ref = 'call_customer_1'",
    )).toEqual([{ duration_seconds: 90 }])
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_corrections",
    )).toEqual([{ n: 1 }])
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(120 * 60)

    await db.exec("begin")
    try {
      await db.query("update admin_private.commercial_usage_reservations set period_start = period_end where provider_call_ref = 'call_customer_1'")
      throw new Error("expected the reservation period to stay immutable")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await db.exec("rollback")
      expect(message).toMatch(/immutable/)
    }

    const denied = await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_cross_tenant",
      subscriptionId: SUB_B,
      businessId: BUSINESS,
      locationId: LOCATION,
      endedAt: "2026-12-15T00:00:00.000Z",
      durationSeconds: 40,
      bodySha256: HASH_E,
    }))
    expect(denied.status).toBe("denied")
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_cross_tenant'",
    )).toEqual([{ n: 0 }])

    const unattributed = await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_late_missing",
      endedAt: "2027-02-01T00:00:00.000Z",
      durationSeconds: 45,
      bodySha256: HASH_F,
    }))
    expect(unattributed.status).toBe("unattributed")
    expect((await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_late_missing",
      endedAt: "2027-02-01T00:00:00.000Z",
      durationSeconds: 45,
      bodySha256: HASH_F,
    }))).status).toBe("replay")
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_late_missing'",
    )).toEqual([{ n: 0 }])

    const inside = await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_missing_start",
      endedAt: "2026-12-15T00:00:00.000Z",
      durationSeconds: 15,
      bodySha256: HASH_C,
      includedMinutes: 120,
      overageOptIn: false,
    }))
    expect(inside.status).toBe("accepted")
    expect(await seconds(SUB_A, PERIOD_END, NEXT_END)).toBe(15)
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(120 * 60)

    expect((await apply(payload({
      eventType: "call_started",
      providerCallRef: "call_other_1",
      subscriptionId: SUB_B,
      businessId: BUSINESS_B,
      locationId: LOCATION_B,
      durationSeconds: null,
      durationQuality: "missing",
      bodySha256: HASH_A,
      includedMinutes: 120,
      overageOptIn: true,
      overageRateMinor: 25,
      overageCapMinor: 25,
    }))).status).toBe("accepted")
    expect((await apply(payload({
      eventType: "call_ended",
      providerCallRef: "call_other_1",
      subscriptionId: SUB_B,
      businessId: BUSINESS_B,
      locationId: LOCATION_B,
      endedAt: "2026-12-10T00:00:00.000Z",
      durationSeconds: 30,
      bodySha256: HASH_B,
      includedMinutes: 999,
      overageOptIn: false,
    }))).status).toBe("accepted")
    expect(await seconds(SUB_B, PERIOD_END, NEXT_END)).toBe(30)
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(120 * 60)
    expect(await seconds(SUB_A, PERIOD_END, NEXT_END)).toBe(15)

    expect((await apply(payload({
      eventType: "call_ended",
      providerCallRef: "web_qa_customer_period",
      callScope: "admin_web_qa",
      subscriptionId: SUB_A,
      businessId: BUSINESS,
      locationId: LOCATION,
      durationSeconds: 45,
      bodySha256: HASH_E,
    }))).status).toBe("accepted")
    expect(await seconds(SUB_A, PERIOD_START, PERIOD_END)).toBe(120 * 60)
    expect(await seconds(SUB_B, PERIOD_END, NEXT_END)).toBe(30)

    const periodA = { startMs: Date.parse(PERIOD_START), endMs: Date.parse(PERIOD_END) }
    const periodB = { startMs: Date.parse(PERIOD_END), endMs: Date.parse(NEXT_END) }
    const secondsA = await seconds(SUB_A, PERIOD_START, PERIOD_END)
    const secondsB = await seconds(SUB_B, PERIOD_END, NEXT_END)
    expect(denyReason(evaluateUsage(position({
      subscriptionState: "CANCELED",
      confirmedCustomerSeconds: secondsA,
      period: periodA,
      nowMs: periodA.startMs + 1,
    })))).toBe("subscription_inactive")
    expect(evaluateUsage(position({
      confirmedCustomerSeconds: secondsB,
      period: periodB,
      nowMs: periodB.startMs + 1,
    })).outcome).toBe("allow_included")
    expect(denyReason(evaluateUsage(position({
      confirmedCustomerSeconds: secondsA,
      openReservationSeconds: 60,
      period: periodA,
      nowMs: periodA.startMs + 1,
      snapshot: { tier: "BASIC", includedMinutes: 120, minutesRollover: false, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 25 },
    })))).toBe("spending_cap_exhausted")
    expect(evaluateUsage(position({
      period: periodB,
      nowMs: periodB.startMs,
      confirmedCustomerSeconds: 0,
      previousPeriodCustomerSeconds: secondsA,
    })).outcome).toBe("allow_included")
  })

  it("redacts a lead after 90 days and keeps a legal hold", async () => {
    await db.query(
      `insert into public.telloya_voice_leads(
        environment, business_id, location_id, provider_call_ref, caller_name, callback_number,
        summary, incomplete, call_status, finalised, finalised_by, created_at
      ) values
        ('dev', $1, $2, 'lead_old', 'Ada', '+447700900111', 'Old summary', false, 'completed', true, 'analysis', now() - interval '91 days'),
        ('dev', $1, $2, 'lead_new', 'Bea', '+447700900222', 'New summary', false, 'completed', true, 'analysis', now() - interval '10 days'),
        ('dev', $1, $2, 'lead_held', 'Cara', '+447700900333', 'Held summary', false, 'completed', true, 'analysis', now() - interval '91 days')`,
      [BUSINESS, LOCATION],
    )
    const held = (await rows<{ id: string }>("select id::text from public.telloya_voice_leads where provider_call_ref = 'lead_held'"))[0]
    await db.exec("SET ROLE service_role")
    try {
      const hold = (await rows<{ result: { status: string } }>(
        "select public.telloya_voice_hold_lead_v1($1::uuid, 'legal_hold') as result",
        [held?.id],
      ))[0]?.result
      expect(hold?.status).toBe("accepted")
      const redacted = (await rows<{ n: number }>(
        "select public.telloya_voice_redact_expired_leads_v1(now()) as n",
      ))[0]?.n
      expect(Number(redacted)).toBe(1)
    } finally {
      await db.exec("RESET ROLE")
    }
    const leads = await rows<{ provider_call_ref: string; caller_name: string | null; summary: string }>(
      "select provider_call_ref, caller_name, summary from public.telloya_voice_leads order by provider_call_ref",
    )
    expect(leads).toEqual([
      { provider_call_ref: "lead_held", caller_name: "Cara", summary: "Held summary" },
      { provider_call_ref: "lead_new", caller_name: "Bea", summary: "New summary" },
      { provider_call_ref: "lead_old", caller_name: null, summary: "redacted" },
    ])
    const usageCount = Number((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events"))[0]?.n)
    expect(usageCount).toBeGreaterThan(0)
  })
})

const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const concurrencyPort = "55497"
const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

describe.skipIf(!pgBin)("concurrent usage delivery", () => {
  let root = ""
  let dataDir = ""
  let socketDir = ""

  function psqlArgs(stopOnError = true) {
    const args = ["-h", socketDir, "-p", concurrencyPort, "-U", "postgres", "-d", "usageledger", "-X"]
    if (stopOnError) args.push("-v", "ON_ERROR_STOP=1")
    return args
  }

  async function psql(sql: string) {
    const result = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-t", "-A", "-c", sql], {
      env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" },
    })
    return result.stdout.trim()
  }

  function heldSession() {
    const child = spawn("stdbuf", ["-o0", "-e0", join(pgBin!, "psql"), ...psqlArgs(false)], { env: { ...process.env, PAGER: "cat" } })
    let out = ""
    let err = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", chunk => { out += chunk })
    child.stderr.on("data", chunk => { err += chunk })
    return {
      async query(sql: string) {
        const mark = `READY_${Date.now()}_${Math.random().toString(16).slice(2)}`
        const start = out.length
        const errStart = err.length
        child.stdin.write(`${sql}\n\\echo ${mark}\n`)
        const deadline = Date.now() + 20000
        while (!out.slice(start).includes(mark)) {
          if (child.exitCode != null) throw new Error(`psql exited ${child.exitCode}\n${err}\n${out.slice(start)}`)
          if (Date.now() > deadline) throw new Error(`timeout\n${err}\n${out.slice(start)}`)
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        return { stdout: out.slice(start).replace(mark, "").trim(), stderr: err.slice(errStart).trim() }
      },
      end() {
        child.stdin.end()
      },
    }
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "usageledger-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${concurrencyPort} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", concurrencyPort, "-U", "postgres", "usageledger"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file], { timeout: 300000 })
    await psql(`
      insert into public.customers(id, full_name, email) values
        ('${CUSTOMER}', 'Ada Usage', 'ada.usage.concurrent@example.com');
      insert into public.businesses(id, display_name) values ('${BUSINESS}', 'Usage Business');
      insert into public.locations(id, business_id, country, location_name) values
        ('${LOCATION}', '${BUSINESS}', 'GB', 'Usage Lane');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${CUSTOMER}', '${BUSINESS}', 'verified', now(), '${CUSTOMER}', 'Local usage fixture membership.');
      insert into public.product_catalogue(code, name, kind, status) values
        ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT');
      insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values (
        '${PLAN}', 'TELLOYA', 1, 'DRAFT', '2026-10-01 00:00:00+00', 'MONTH', 'GBP',
        4900, 'NOT_APPLICABLE', 'TELLOYA-USAGE-LEDGER'
      );
      insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
        values ('${PLAN}', 'TELLOYA', 1, 'LOCATION');
      update public.plan_versions
        set status = 'APPROVED', approved_by = '${CUSTOMER}', approved_at = now()
        where id = '${PLAN}';
      insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values (
        '${SUB_A}', 'VC-26-USAGEX', '${CUSTOMER}', '${BUSINESS}', 'VOICE', '${PLAN}', 'BILLABLE', 'DRAFT',
        4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-USAGE-LEDGER'
      );
      insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
        values ('${SUB_A}', 'TELLOYA', 1, 1);
      update public.commercial_subscriptions
        set state = 'ACCEPTED', current_period_start = '${PERIOD_START}', current_period_end = '${PERIOD_END}'
        where id = '${SUB_A}';
    `)
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
    }
    if (root) await rm(root, { recursive: true, force: true })
  })

  function endedSql(callRef: string, hash: string) {
    const body = JSON.stringify(payload({
      providerCallRef: callRef,
      endedAt: "2026-11-15T00:00:00.000Z",
      durationSeconds: 40,
      bodySha256: hash,
    })).replace(/'/g, "''")
    return `select public.commercial_usage_apply_event_v1('${body}'::jsonb)::text;`
  }

  it("lets one delivery commit and makes the concurrent delivery a replay", async () => {
    const first = heldSession()
    const second = heldSession()
    try {
      await first.query("BEGIN;")
      const accepted = await first.query(endedSql("call_concurrent_same", HASH_A))
      expect(accepted.stderr + accepted.stdout).toContain("accepted")
      const pending = second.query(endedSql("call_concurrent_same", HASH_A))
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'usageledger'"))
      expect(waiting).toBeGreaterThan(0)
      await first.query("COMMIT;")
      const replay = await pending
      expect(replay.stderr + replay.stdout).toContain("replay")
      expect(await psql("select count(*) from admin_private.commercial_usage_events where provider_call_ref = 'call_concurrent_same'")).toBe("1")
    } finally {
      first.end()
      second.end()
    }
  })

  it("keeps one billable row when a concurrent delivery carries a different hash", async () => {
    const first = heldSession()
    const second = heldSession()
    try {
      await first.query("BEGIN;")
      const accepted = await first.query(endedSql("call_concurrent_conflict", HASH_A))
      expect(accepted.stderr + accepted.stdout).toContain("accepted")
      const pending = second.query(endedSql("call_concurrent_conflict", HASH_B))
      await new Promise(resolve => setTimeout(resolve, 300))
      await first.query("COMMIT;")
      const conflict = await pending
      expect(conflict.stderr + conflict.stdout).toContain("conflict")
      expect(await psql("select count(*) from admin_private.commercial_usage_events where provider_call_ref = 'call_concurrent_conflict'")).toBe("1")
      expect(await psql("select duration_seconds::text from admin_private.commercial_usage_events where provider_call_ref = 'call_concurrent_conflict'")).toBe("40")
    } finally {
      first.end()
      second.end()
    }
  })
})
