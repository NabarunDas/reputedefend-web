/**
 * Disposable inbound-admission checks. This builds a local database from the
 * repository chain. It does not connect to hosted DEV or Production, and it
 * does not place a Retell call.
 *
 * Hosted schema still rejects a LIVE provision and a billable ACTIVE
 * subscription. This file simulates those rows only inside the disposable
 * database so the reservation command can be exercised. That simulation is
 * not a hosted DEV verification.
 */
import { execFile as execFileCb, spawn } from "node:child_process"
import { existsSync } from "node:fs"
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
const CUSTOMER = "11111111-1111-4111-8111-111111111111"
const PLAN = "33333333-3333-4333-8333-333333333331"
const AGREEMENT = "66666666-6666-4666-8666-666666666661"
const CONDITIONS = "77777777-7777-4777-8777-777777777771"
const PERIOD_START = "2026-11-01T00:00:00.000Z"
const PERIOD_END = "2026-12-01T00:00:00.000Z"
const NEXT_END = "2027-01-01T00:00:00.000Z"
const NOW = "2026-11-15T12:00:00.000Z"
const CONSENT_AT = "2026-11-07T09:00:00.000Z"
const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)

const seats = [
  ["A", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "22222222-2222-4222-8222-222222222221", "44444444-4444-4444-8444-444444444441", "55555555-5555-4555-8555-555555555551", "VC-26-ADMTAX", "+441111111111", "ACTIVE", "LIVE", "off", PERIOD_START, PERIOD_END],
  ["B", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444442", "55555555-5555-4555-8555-555555555552", "VC-26-ADMTBY", "+442222222222", "ACTIVE", "LIVE", "on", PERIOD_START, PERIOD_END],
  ["C", "cccccccc-cccc-4ccc-8ccc-ccccccccccc3", "22222222-2222-4222-8222-222222222223", "44444444-4444-4444-8444-444444444443", "55555555-5555-4555-8555-555555555553", "VC-26-ADMTCZ", "+443333333333", "ACTIVE", "LIVE", "none", PERIOD_START, PERIOD_END],
  ["D", "dddddddd-dddd-4ddd-8ddd-ddddddddddd4", "22222222-2222-4222-8222-222222222224", "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555554", "VC-26-ADMTDW", "+444444444444", "ACCEPTED", "LIVE", "off", PERIOD_START, PERIOD_END],
  ["E", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5", "22222222-2222-4222-8222-222222222225", "44444444-4444-4444-8444-444444444445", "55555555-5555-4555-8555-555555555555", "VC-26-ADMTEV", "+445555555555", "CANCELED", "LIVE", "off", PERIOD_START, PERIOD_END],
  ["F", "ffffffff-ffff-4fff-8fff-fffffffffff6", "22222222-2222-4222-8222-222222222226", "44444444-4444-4444-8444-444444444446", "55555555-5555-4555-8555-555555555556", "VC-26-ADMTFU", "+446666666666", "ACTIVE", "TEST_REQUIRED", "off", PERIOD_START, PERIOD_END],
  ["G", "99999999-9999-4999-8999-999999999997", "22222222-2222-4222-8222-222222222227", "44444444-4444-4444-8444-444444444447", "55555555-5555-4555-8555-555555555557", "VC-26-ADMTGS", "+447777777777", "ACTIVE", "LIVE", "off", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"],
  ["R", "88888888-8888-4888-8888-888888888888", "22222222-2222-4222-8222-222222222228", "44444444-4444-4444-8444-444444444448", "55555555-5555-4555-8555-555555555558", "VC-26-ADMTHR", "+448888888888", "ACTIVE", "LIVE", "off", PERIOD_START, PERIOD_END],
  ["X", "77777777-7777-4777-8777-777777777779", "22222222-2222-4222-8222-222222222229", "44444444-4444-4444-8444-444444444449", "55555555-5555-4555-8555-555555555559", "VC-26-ADMTXQ", "+449999999991", "ACTIVE", "LIVE", "off", PERIOD_START, PERIOD_END],
] as const

type Seat = (typeof seats)[number]
const seat = (key: string): Seat => {
  const found = seats.find(item => item[0] === key)
  if (!found) throw new Error(key)
  return found
}

type ReserveResult = { status: string; reason?: string; billable?: boolean; decision?: string; reserveSeconds?: number }

function command(seatKey: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const item = seat(seatKey)
  return {
    environment: "dev",
    providerCallRef: `call_${seatKey.toLowerCase()}`,
    callScope: "customer_phone",
    toNumber: item[6],
    now: NOW,
    bodySha256: HASH_A,
    ...overrides,
  }
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function reserve(body: Record<string, unknown>): Promise<ReserveResult> {
  const result = (await rows<{ result: ReserveResult }>(
    "select public.commercial_usage_reserve_inbound_v1($1::jsonb) as result",
    [JSON.stringify(body)],
  ))[0]?.result
  if (!result) throw new Error("admission function returned no row")
  return result
}

async function reservations(callRef: string): Promise<number> {
  return Number((await rows<{ n: number }>(
    "select count(*)::int as n from admin_private.commercial_usage_reservations where provider_call_ref = $1",
    [callRef],
  ))[0]?.n ?? 0)
}

function fixtureSql(): string {
  const businesses = seats.map(item => `('${item[1]}', 'Admission ${item[0]}')`).join(",")
  const locations = seats.map(item => `('${item[2]}', '${item[1]}', 'GB', 'Lane ${item[0]}')`).join(",")
  const memberships = seats.map(item => `('${CUSTOMER}', '${item[1]}', 'verified', now(), '${CUSTOMER}', 'Local admission fixture membership.')`).join(",")
  const subscriptions = seats.map(item => `('${item[3]}', '${item[5]}', '${CUSTOMER}', '${item[1]}', 'VOICE', '${PLAN}', 'BILLABLE', 'DRAFT', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-USAGE-LEDGER')`).join(",")
  const items = seats.map(item => `('${item[3]}', 'TELLOYA', 1, 1)`).join(",")
  const stateUpdates = seats.map(item => `
    update public.commercial_subscriptions
      set state = '${item[7]}',
          current_period_start = '${item[10]}',
          current_period_end = '${item[11]}',
          canceled_at = ${item[7] === "CANCELED" ? "now()" : "null"}
      where id = '${item[3]}';
  `).join("\n")
  const entitlements = seats.map(item => `('${item[4]}', '${item[1]}', '${item[2]}', 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', '${item[3]}', 'ELIGIBLE')`).join(",")
  const provisions = seats.map(item => `('${item[4]}', '${item[1]}', '${item[2]}', '${item[8]}')`).join(",")
  const owners = seats.map(item => `('telloya_voice', '${item[6]}', 'dev', '${CUSTOMER}', '${item[1]}', '${item[2]}', '${item[3]}', 'agent_admission')`).join(",")
  const accepted = seats.filter(item => item[9] !== "none")
  const acceptSql = accepted.map(item => `
    insert into public.commercial_offer_acceptances(
      request_id, subscription_id, customer_id, business_id, product_code, plan_version_id,
      agreement_version_id, agreement_version_ref, agreement_content_hash, agreement_title,
      agreement_body, cancellation_text, terms_snapshot, amount_minor, currency, tax_behaviour,
      cadence, subscription_record_version, recurring_consent_at,
      plan_tier, included_minutes, minutes_rollover, base_amount_minor,
      guard_included, guard_quantity, overage_permitted, overage_rate_minor, overage_opt_in,
      overage_cap_minor, overage_consent_at, conditions_id, conditions_record_version,
      confirmations, email_snapshot, actor_customer_id, auth_user_id
    )
    select
      '${item[4]}'::uuid, sub.id, sub.customer_id, sub.business_id, 'TELLOYA', sub.plan_version_id,
      '${AGREEMENT}', agreement.version_ref, agreement.content_hash, agreement.title,
      agreement.body_text, agreement.cancellation_text, '{}'::jsonb, sub.amount_minor, sub.currency, sub.tax_behaviour,
      sub.cadence_snapshot, sub.record_version, now(),
      'Basic', 120, false, 4900,
      false, 0, true, 25, ${item[9] === "on"},
      ${item[9] === "on" ? "25" : "null"}, ${item[9] === "on" ? `'${CONSENT_AT}'` : "null"},
      '${CONDITIONS}', conditions.record_version,
      '{"business_authority":true}'::jsonb, 'ada.admission@example.com', sub.customer_id, '${CUSTOMER}'
    from public.commercial_subscriptions sub
    join public.commercial_agreement_versions agreement on agreement.id = '${AGREEMENT}'
    join public.commercial_plan_conditions conditions on conditions.id = '${CONDITIONS}'
    where sub.id = '${item[3]}';
  `).join("\n")
  return `
    insert into public.customers(id, full_name, email) values
      ('${CUSTOMER}', 'Ada Admission', 'ada.admission@example.com');
    insert into public.businesses(id, display_name) values ${businesses};
    insert into public.locations(id, business_id, country, location_name) values ${locations};
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values ${memberships};
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
    ) values ${subscriptions};
    insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot) values ${items};
    alter table public.service_provisions drop constraint service_provisions_live_closed;
    set session_replication_role = replica;
    ${stateUpdates}
    insert into public.product_entitlements(
      id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
    ) values ${entitlements};
    insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ${provisions};
    set session_replication_role = origin;
    insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      '${AGREEMENT}', 'TELLOYA', 'TELLOYA-USAGE-LEDGER', 'Telloya service agreement',
      'This agreement covers the named Telloya service for the selected locations only.',
      'Cancel in writing before the next billing date.',
      admin_private.commercial_agreement_hash_v1(
        'TELLOYA', 'TELLOYA-USAGE-LEDGER', 'Telloya service agreement',
        'This agreement covers the named Telloya service for the selected locations only.',
        'Cancel in writing before the next billing date.',
        '[{"key":"business_authority","label":"I can accept this offer for the business."}]'::jsonb
      ),
      '[{"key":"business_authority","label":"I can accept this offer for the business."}]'::jsonb,
      'APPROVED', '${CUSTOMER}', now()
    );
    insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    ) values (
      '${CONDITIONS}', '${PLAN}', 'BASIC', 'Basic', 120, false, 4900, null, 25,
      admin_private.commercial_plan_conditions_hash_v1('BASIC', 120, false, 4900, null, 25),
      'APPROVED', '${CUSTOMER}', now()
    );
    ${acceptSql}
    insert into admin_private.commercial_provider_number_owners(
      provider, e164, environment, customer_id, business_id, location_id, subscription_id, agent_ref
    ) values ${owners};
    insert into admin_private.commercial_usage_events(
      environment, provider_call_ref, call_scope, subscription_id, business_id, location_id,
      period_start, period_end, duration_seconds, duration_quality, body_sha256, plan_version_id,
      included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
      overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
    ) values
      ('dev', 'seed_x_usage', 'customer_phone', '${seat("X")[3]}', '${seat("X")[1]}', '${seat("X")[2]}',
        '${PERIOD_START}', '${PERIOD_END}', 7200, 'confirmed', '${HASH_A}', '${PLAN}',
        120, false, false, 25, null, null),
      ('dev', 'seed_b_usage', 'customer_phone', '${seat("B")[3]}', '${seat("B")[1]}', '${seat("B")[2]}',
        '${PERIOD_START}', '${PERIOD_END}', 7200, 'confirmed', '${HASH_B}', '${PLAN}',
        120, false, true, 25, 25, '${CONSENT_AT}');
  `
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(fixtureSql())
}, 180000)

afterAll(async () => { await db.close() })

describe("inbound admission reservation", () => {
  it("denies an unallocated number and a cross-tenant subscription", async () => {
    expect(await reserve(command("A", { providerCallRef: "call_unknown", toNumber: "+449999999999" }))).toMatchObject({
      status: "denied",
      reason: "unknown_number",
      billable: false,
    })
    expect(await reserve(command("A", { providerCallRef: "call_other_env", environment: "production" }))).toMatchObject({
      status: "denied",
      reason: "unknown_number",
    })
    expect(await reserve(command("A", { providerCallRef: "call_cross", subscriptionId: seat("B")[3] }))).toMatchObject({
      status: "denied",
      reason: "cross_tenant",
      billable: false,
    })
    expect(await reservations("call_unknown")).toBe(0)
    expect(await reservations("call_cross")).toBe(0)
  })

  it("denies unpaid, inactive, unprovisioned and out-of-period subscriptions", async () => {
    expect(await reserve(command("D", { providerCallRef: "call_unpaid" }))).toMatchObject({ status: "denied", reason: "subscription_unpaid" })
    expect(await reserve(command("E", { providerCallRef: "call_inactive" }))).toMatchObject({ status: "denied", reason: "subscription_inactive" })
    expect(await reserve(command("F", { providerCallRef: "call_provision" }))).toMatchObject({ status: "denied", reason: "provision_inactive" })
    expect(await reserve(command("G", { providerCallRef: "call_period" }))).toMatchObject({ status: "denied", reason: "invalid_billing_period" })
    expect(await reservations("call_unpaid") + await reservations("call_inactive") + await reservations("call_provision") + await reservations("call_period")).toBe(0)
  })

  it("denies a missing acceptance and a supplied allowance that differs from the accepted offer", async () => {
    expect(await reserve(command("C", { providerCallRef: "call_absent" }))).toMatchObject({ status: "denied", reason: "acceptance_absent" })
    expect(await reserve(command("A", { providerCallRef: "call_wrong_minutes", includedMinutes: 300 }))).toMatchObject({
      status: "denied",
      reason: "acceptance_mismatch",
    })
    expect(await reserve(command("B", { providerCallRef: "call_wrong_cap", overageCapMinor: 100 }))).toMatchObject({
      status: "denied",
      reason: "acceptance_mismatch",
    })
    expect(await reservations("call_absent") + await reservations("call_wrong_minutes") + await reservations("call_wrong_cap")).toBe(0)
  })

  it("reserves the accepted Basic allowance and treats a duplicate body as a replay", async () => {
    const first = await reserve(command("A", { providerCallRef: "call_basic" }))
    expect(first).toMatchObject({ status: "admitted", reason: "allow_included", reserveSeconds: 60, billable: true })
    expect(await reserve(command("A", { providerCallRef: "call_basic" }))).toMatchObject({ status: "replay", decision: "admitted", billable: true })
    expect(await reserve(command("A", { providerCallRef: "call_basic", bodySha256: HASH_B }))).toMatchObject({ status: "conflict", billable: false })
    expect(await reservations("call_basic")).toBe(1)
    const stored = (await rows<{ included_minutes_snapshot: number; overage_opt_in_snapshot: boolean; overage_cap_minor_snapshot: number | null }>(
      "select included_minutes_snapshot, overage_opt_in_snapshot, overage_cap_minor_snapshot from admin_private.commercial_usage_reservations where provider_call_ref = 'call_basic'",
    ))[0]
    expect(stored).toEqual({ included_minutes_snapshot: 120, overage_opt_in_snapshot: false, overage_cap_minor_snapshot: null })
  })

  it("denies a further minute when the included allowance is exhausted and overage is off", async () => {
    expect(await reserve(command("X", { providerCallRef: "call_exhausted" }))).toMatchObject({
      status: "denied",
      reason: "allowance_exhausted",
      billable: false,
    })
    expect(await reservations("call_exhausted")).toBe(0)
  })

  it("allows one overage minute inside the accepted cap and denies the minute that would pass it", async () => {
    expect(await reserve(command("B", { providerCallRef: "call_overage" }))).toMatchObject({
      status: "admitted",
      reason: "allow_overage",
      billable: true,
    })
    expect(await reserve(command("B", { providerCallRef: "call_overage_cap", bodySha256: HASH_B }))).toMatchObject({
      status: "denied",
      reason: "spending_cap_exhausted",
      billable: false,
    })
    expect(await reservations("call_overage")).toBe(1)
    expect(await reservations("call_overage_cap")).toBe(0)
  })

  it("keeps an in-progress reservation on the original period when the subscription renews", async () => {
    expect(await reserve(command("R", { providerCallRef: "call_renew_open" }))).toMatchObject({ status: "admitted", reason: "allow_included" })
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update public.commercial_subscriptions set current_period_start = $2::timestamptz, current_period_end = $3::timestamptz where id = $1::uuid",
      [seat("R")[3], PERIOD_END, NEXT_END],
    )
    await db.exec("set session_replication_role = origin")
    const original = (await rows<{ period_start: string; state: string }>(
      "select period_start::text, state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_renew_open'",
    ))[0]
    expect(original?.state).toBe("open")
    expect(original?.period_start.startsWith("2026-11-01")).toBe(true)
    expect(await reserve(command("R", { providerCallRef: "call_renew_next", bodySha256: HASH_B, now: "2026-12-15T12:00:00.000Z" }))).toMatchObject({
      status: "admitted",
      reason: "allow_included",
    })
    const next = (await rows<{ period_start: string }>(
      "select period_start::text from admin_private.commercial_usage_reservations where provider_call_ref = 'call_renew_next'",
    ))[0]
    expect(next?.period_start.startsWith("2026-12-01")).toBe(true)
  })

  it("stores an admin web call as non-billable and keeps caller content out of the ledger", async () => {
    expect(await reserve({
      environment: "dev",
      providerCallRef: "web_admin_qa",
      callScope: "admin_web_qa",
      toNumber: null,
      now: NOW,
      bodySha256: HASH_A,
    })).toMatchObject({ status: "excluded", reason: "internal_admin_web_call", billable: false })
    expect(await reservations("web_admin_qa")).toBe(0)
    const columns = await rows<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'admin_private'
        and table_name in (
          'commercial_usage_events',
          'commercial_usage_reservations',
          'commercial_usage_admission_receipts',
          'commercial_usage_admission_conflicts'
        )
    `)
    const names = columns.map(column => column.column_name).join(" ")
    expect(names).not.toMatch(/transcript|recording|access_token|raw_body|payload/)
  })

  it("lets only the server role execute the public reservation command", async () => {
    const privileges = (await rows<{
      service_public: boolean
      anon_public: boolean
      auth_public: boolean
      service_private: boolean
      service_schema: boolean
    }>(`
      select
        has_function_privilege('service_role', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as service_public,
        has_function_privilege('anon', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as anon_public,
        has_function_privilege('authenticated', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as auth_public,
        has_function_privilege('service_role', 'admin_private.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as service_private,
        has_schema_privilege('service_role', 'admin_private', 'USAGE') as service_schema
    `))[0]
    expect(privileges).toEqual({
      service_public: true,
      anon_public: false,
      auth_public: false,
      service_private: false,
      service_schema: false,
    })
    await db.exec("SET ROLE service_role")
    try {
      const recorded = (await rows<{ result: ReserveResult }>(
        "select public.commercial_usage_reserve_inbound_v1($1::jsonb) as result",
        [JSON.stringify(command("A", { providerCallRef: "call_role" }))],
      ))[0]?.result
      expect(recorded?.status).toBe("admitted")
      await expect(db.query("select admin_private.commercial_usage_reserve_inbound_v1('{}'::jsonb)")).rejects.toThrow(/permission denied/i)
    } finally {
      await db.exec("RESET ROLE")
    }
  })
})

const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const concurrencyPort = "55498"
const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

describe.skipIf(!pgBin)("concurrent inbound reservation", () => {
  let root = ""
  let dataDir = ""
  let socketDir = ""

  function psqlArgs(stopOnError = true) {
    const args = ["-h", socketDir, "-p", concurrencyPort, "-U", "postgres", "-d", "inboundadmit", "-X"]
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

  function reserveSql(callRef: string) {
    const body = JSON.stringify(command("A", { providerCallRef: callRef, bodySha256: HASH_A })).replace(/'/g, "''")
    return `select public.commercial_usage_reserve_inbound_v1('${body}'::jsonb)::text;`
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "inboundadmit-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${concurrencyPort} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", concurrencyPort, "-U", "postgres", "inboundadmit"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file], { timeout: 300000 })
    const seeded = fixtureSql().replace(
      "('dev', 'seed_x_usage'",
      "('dev', 'seed_a_last_minute', 'customer_phone', '" + seat("A")[3] + "', '" + seat("A")[1] + "', '" + seat("A")[2] + `',
        '${PERIOD_START}', '${PERIOD_END}', 7140, 'confirmed', '${HASH_A}', '${PLAN}',
        120, false, false, 25, null, null),
      ('dev', 'seed_x_usage'`,
    )
    await psql(seeded)
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
    }
    if (root) await rm(root, { recursive: true, force: true })
  })

  it("lets only one of two simultaneous calls take the last included minute", async () => {
    const first = heldSession()
    const second = heldSession()
    try {
      await first.query("BEGIN;")
      const admitted = await first.query(reserveSql("call_race_1"))
      expect(admitted.stderr + admitted.stdout).toContain("admitted")
      const pending = second.query(reserveSql("call_race_2"))
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'inboundadmit'"))
      expect(waiting).toBeGreaterThan(0)
      await first.query("COMMIT;")
      const denied = await pending
      expect(denied.stderr + denied.stdout).toContain("allowance_exhausted")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref in ('call_race_1', 'call_race_2')")).toBe("1")
    } finally {
      first.end()
      second.end()
    }
  })
})
