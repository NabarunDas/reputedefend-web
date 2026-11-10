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
import { createHash } from "node:crypto"
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

type ReserveResult = {
  status: string
  reason?: string
  billable?: boolean
  decision?: string
  reserveSeconds?: number
  admissionRef?: string
  agentRef?: string
  providerCallRef?: string | null
  released?: number
  periodStart?: string
}

function hashFor(label: string): string {
  return createHash("sha256").update(label).digest("hex")
}

function command(seatKey: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const item = seat(seatKey)
  const label = String(overrides.bodyLabel ?? overrides.providerCallRef ?? "default")
  const rest = { ...overrides }
  delete rest.bodyLabel
  return {
    environment: "dev",
    callScope: "customer_phone",
    toNumber: item[6],
    now: NOW,
    bodySha256: hashFor(`${seatKey}:${label}`),
    ...rest,
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
  const owners = seats.map(item => `('telloya_voice', '${item[6]}', 'dev', '${CUSTOMER}', '${item[1]}', '${item[2]}', '${item[3]}', 'agent_seat_${item[0].toLowerCase()}')`).join(",")
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

async function callSql(fn: string, body: Record<string, unknown>): Promise<ReserveResult> {
  const result = (await rows<{ result: ReserveResult }>(
    `select public.${fn}($1::jsonb) as result`,
    [JSON.stringify(body)],
  ))[0]?.result
  if (!result) throw new Error(`${fn} returned no row`)
  return result
}

describe("inbound admission reservation", () => {
  it("denies an unallocated number and a contradictory tenant claim", async () => {
    expect(await reserve(command("A", { providerCallRef: "call_unknown", toNumber: "+449999999999" }))).toMatchObject({
      status: "denied",
      reason: "unknown_number",
      billable: false,
    })
    expect(await reserve(command("A", { providerCallRef: "call_other_env", environment: "production" }))).toMatchObject({
      status: "denied",
      reason: "unknown_number",
    })
    expect(await reserve(command("A", { providerCallRef: "call_cross", assertedSubscriptionId: seat("B")[3] }))).toMatchObject({
      status: "denied",
      reason: "cross_tenant",
      billable: false,
    })
    expect(await reservations("call_unknown")).toBe(0)
    expect(await reservations("call_cross")).toBe(0)
    expect(await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_admissions")).toEqual([{ n: 0 }])
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

  it("reserves the accepted Basic allowance and replays an identical body without a second reservation", async () => {
    const firstBody = command("A", { providerCallRef: "call_basic" })
    const first = await reserve(firstBody)
    expect(first).toMatchObject({
      status: "admitted",
      reason: "allow_included",
      reserveSeconds: 60,
      billable: true,
      agentRef: "agent_seat_a",
      providerCallRef: "call_basic",
    })
    expect(first.admissionRef).toMatch(/^adm_[0-9a-f]{32}$/)
    expect(await reserve(firstBody)).toMatchObject({
      status: "replay",
      decision: "admitted",
      billable: true,
      admissionRef: first.admissionRef,
      agentRef: "agent_seat_a",
    })
    expect(await reserve({ ...firstBody, bodySha256: HASH_B })).toMatchObject({ status: "conflict", billable: false, admissionRef: first.admissionRef })
    expect(await reserve({ ...firstBody, bodySha256: hashFor("quoted-other"), quotedAdmissionRef: first.admissionRef })).toMatchObject({
      status: "conflict",
      billable: false,
    })
    expect(await reservations("call_basic")).toBe(1)
    const stored = (await rows<{ included_minutes_snapshot: number; overage_opt_in_snapshot: boolean; overage_cap_minor_snapshot: number | null; agent_ref: string }>(
      `select reservation.included_minutes_snapshot, reservation.overage_opt_in_snapshot, reservation.overage_cap_minor_snapshot, admission.agent_ref
       from admin_private.commercial_usage_reservations reservation
       join admin_private.commercial_usage_admissions admission on admission.reservation_id = reservation.id
       where reservation.provider_call_ref = 'call_basic'`,
    ))[0]
    expect(stored).toEqual({
      included_minutes_snapshot: 120,
      overage_opt_in_snapshot: false,
      overage_cap_minor_snapshot: null,
      agent_ref: "agent_seat_a",
    })
  })

  it("admits a payload with no provider call id, then binds the later call id once", async () => {
    const first = await reserve(command("A", { bodyLabel: "no-call-id" }))
    expect(first).toMatchObject({ status: "admitted", reason: "allow_included", agentRef: "agent_seat_a", providerCallRef: null, billable: true })
    expect(await reservations("call_bound_later")).toBe(0)
    const bound = await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_bound_later",
      toNumber: seat("A")[6],
      admissionRef: first.admissionRef,
      now: NOW,
    })
    expect(bound).toMatchObject({ status: "bound", providerCallRef: "call_bound_later", admissionRef: first.admissionRef, agentRef: "agent_seat_a" })
    expect(await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_bound_later",
      toNumber: seat("A")[6],
      admissionRef: first.admissionRef,
      now: NOW,
    })).toMatchObject({ status: "replay", decision: "bound", admissionRef: first.admissionRef })
    expect(await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_bound_other",
      toNumber: seat("A")[6],
      admissionRef: first.admissionRef,
      now: NOW,
    })).toMatchObject({ status: "conflict", billable: false })
    expect(await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_unmatched",
      toNumber: seat("A")[6],
      now: NOW,
    })).toMatchObject({ status: "unbound", reason: "correlation_unverified", billable: false })
    expect(await reservations("call_bound_later")).toBe(1)
    expect(await reservations("call_bound_other") + await reservations("call_unmatched")).toBe(0)
    const period = (await rows<{ period_start: string; state: string }>(
      "select period_start::text, state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_bound_later'",
    ))[0]
    expect(period?.state).toBe("open")
    expect(period?.period_start.startsWith("2026-11-01")).toBe(true)
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

  it("keeps an in-progress admission on the original period when the subscription renews", async () => {
    const open = command("R", { bodyLabel: "renew-open" })
    const first = await reserve(open)
    expect(first).toMatchObject({ status: "admitted", reason: "allow_included", providerCallRef: null })
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update public.commercial_subscriptions set current_period_start = $2::timestamptz, current_period_end = $3::timestamptz where id = $1::uuid",
      [seat("R")[3], PERIOD_END, NEXT_END],
    )
    await db.exec("set session_replication_role = origin")
    const original = (await rows<{ period_start: string; state: string }>(
      "select period_start::text, state from admin_private.commercial_usage_admissions where admission_ref = $1",
      [first.admissionRef],
    ))[0]
    expect(original?.state).toBe("reserved")
    expect(original?.period_start.startsWith("2026-11-01")).toBe(true)
    expect(await reserve(open)).toMatchObject({ status: "replay", admissionRef: first.admissionRef, billable: true })
    expect(await reserve(command("R", { providerCallRef: "call_renew_next", now: "2026-12-15T12:00:00.000Z" }))).toMatchObject({
      status: "admitted",
      reason: "allow_included",
    })
    const next = (await rows<{ period_start: string }>(
      "select period_start::text from admin_private.commercial_usage_reservations where provider_call_ref = 'call_renew_next'",
    ))[0]
    expect(next?.period_start.startsWith("2026-12-01")).toBe(true)
  })

  it("keeps the original admission when the subscription is cancelled and refuses a new call", async () => {
    const retry = command("R", { providerCallRef: "call_renew_next", now: "2026-12-15T12:00:00.000Z" })
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1::uuid",
      [seat("R")[3]],
    )
    await db.exec("set session_replication_role = origin")
    expect(await reserve(retry)).toMatchObject({ status: "replay", decision: "admitted", billable: true })
    expect(await reserve(command("R", { bodyLabel: "after-cancel", now: "2026-12-15T12:00:00.000Z" }))).toMatchObject({
      status: "denied",
      reason: "subscription_inactive",
      billable: false,
    })
    expect(await reservations("call_renew_next")).toBe(1)
  })

  it("replays an open hold and refuses the same body after the database clock expires it", async () => {
    const open = command("A", { bodyLabel: "expire-me" })
    const held = await reserve(open)
    expect(held.status).toBe("admitted")
    expect(await reserve(open)).toMatchObject({
      status: "replay",
      decision: "admitted",
      billable: true,
      admissionRef: held.admissionRef,
      agentRef: "agent_seat_a",
    })
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = $1",
      [held.admissionRef],
    )
    await db.exec("set session_replication_role = origin")
    const expired = await reserve(open)
    expect(expired).toMatchObject({
      status: "replay",
      reason: "admission_expired",
      billable: false,
      admissionRef: held.admissionRef,
    })
    expect(expired.agentRef).toBeUndefined()
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_admissions where admission_ref = $1",
      [held.admissionRef],
    ))[0]?.state).toBe("expired")
    const disconnected = await reserve(command("A", { providerCallRef: "call_disconnect", bodyLabel: "disconnect-me" }))
    expect(disconnected.status).toBe("admitted")
    expect(await callSql("commercial_usage_release_inbound_admissions_v1", {
      environment: "dev",
      mode: "disconnect",
      providerCallRef: "call_disconnect",
      now: NOW,
    })).toMatchObject({ status: "disconnected", admissionRef: disconnected.admissionRef, billable: false })
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_disconnect'",
    ))[0]?.state).toBe("released")
    expect(await reservations("call_disconnect")).toBe(1)
  })

  it("keeps a bound call and its reservation after the pre-connect timeout", async () => {
    const held = await reserve(command("A", { bodyLabel: "already-bound" }))
    expect(await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_already_bound",
      toNumber: seat("A")[6],
      admissionRef: held.admissionRef,
      now: NOW,
    })).toMatchObject({ status: "bound", billable: true })
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = $1",
      [held.admissionRef],
    )
    await db.exec("set session_replication_role = origin")
    expect(await callSql("commercial_usage_release_inbound_admissions_v1", {
      environment: "dev",
      mode: "expire",
      admissionRef: held.admissionRef,
      now: "2026-11-15T12:11:00.000Z",
    })).toMatchObject({ status: "replay", reason: "bound", admissionRef: held.admissionRef })
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_admissions where admission_ref = $1",
      [held.admissionRef],
    ))[0]?.state).toBe("bound")
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_already_bound'",
    ))[0]?.state).toBe("open")
  })

  it("does not bind a delayed call start after the unbound hold has expired", async () => {
    const held = await reserve(command("A", { providerCallRef: "call_delayed", bodyLabel: "delayed-start" }))
    expect(held.status).toBe("admitted")
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = $1",
      [held.admissionRef],
    )
    await db.exec("set session_replication_role = origin")
    expect(await callSql("commercial_usage_bind_inbound_admission_v1", {
      environment: "dev",
      providerCallRef: "call_delayed",
      toNumber: seat("A")[6],
      admissionRef: held.admissionRef,
      now: NOW,
    })).toMatchObject({ status: "denied", reason: "admission_expired", billable: false, admissionRef: held.admissionRef })
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_delayed'",
    ))[0]?.state).toBe("released")
    expect(await reservations("call_delayed")).toBe(1)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_delayed'",
    ))[0]?.n).toBe(0)
  })

  it("stores an admin web call as non-billable and keeps caller content out of the ledger", async () => {
    expect(await reserve({
      environment: "dev",
      callScope: "admin_web_qa",
      toNumber: null,
      now: NOW,
      bodySha256: hashFor("admin-web"),
    })).toMatchObject({ status: "excluded", reason: "internal_admin_web_call", billable: false })
    expect(await reservations("web_admin_qa")).toBe(0)
    const columns = await rows<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'admin_private'
        and table_name in (
          'commercial_usage_events',
          'commercial_usage_reservations',
          'commercial_usage_admissions',
          'commercial_usage_admission_conflicts',
          'commercial_usage_ingest_diagnostics'
        )
    `)
    const names = columns.map(column => column.column_name).join(" ")
    expect(names).not.toMatch(/transcript|recording|access_token|raw_body|payload/)
  })

  function ingestCommand(seatKey: string, eventType: "call_started" | "call_ended" | "call_analyzed", callRef: string, admissionRef: string | null, overrides: Record<string, unknown> = {}) {
    const label = String(overrides.bodyLabel ?? eventType)
    const rest = { ...overrides }
    delete rest.bodyLabel
    return {
      environment: "dev",
      eventType,
      providerCallRef: callRef,
      toNumber: seat(seatKey)[6],
      admissionRef,
      bodySha256: hashFor(`${seatKey}:${callRef}:${label}`),
      durationQuality: eventType === "call_ended" ? "confirmed" : null,
      durationSeconds: eventType === "call_ended" ? 42 : null,
      endedAt: eventType === "call_ended" ? NOW : null,
      ...rest,
    }
  }

  async function ingest(body: Record<string, unknown>): Promise<ReserveResult> {
    return callSql("commercial_usage_ingest_inbound_admission_v1", body)
  }

  it("binds a later provider call to the admitted minute and does not bill an unmatched call", async () => {
    const held = await reserve(command("A", { bodyLabel: "ingest-hold" }))
    expect(held).toMatchObject({ status: "admitted", providerCallRef: null, billable: true })
    const started = ingestCommand("A", "call_started", "call_ingest_hold", held.admissionRef ?? null)
    expect(await ingest(started)).toMatchObject({
      status: "accepted",
      billable: true,
      admissionRef: held.admissionRef,
      reserveSeconds: 60,
    })
    expect(await ingest(started)).toMatchObject({ status: "replay", billable: false, reason: "duplicate_delivery", admissionRef: held.admissionRef })
    const ended = ingestCommand("A", "call_ended", "call_ingest_hold", held.admissionRef ?? null)
    expect(await ingest(ended)).toMatchObject({ status: "accepted", billable: true, admissionRef: held.admissionRef })
    expect(await ingest(ended)).toMatchObject({ status: "replay", billable: false, admissionRef: held.admissionRef })
    expect(await ingest({ ...ended, bodySha256: HASH_B })).toMatchObject({ status: "conflict", billable: false, admissionRef: held.admissionRef })
    expect(await reservations("call_ingest_hold")).toBe(1)
    const stored = (await rows<{ state: string; period_start: string; seconds: number; events: number }>(
      `select reservation.state, event.period_start::text, event.duration_seconds as seconds,
              (select count(*)::int from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_hold') as events
       from admin_private.commercial_usage_reservations reservation
       join admin_private.commercial_usage_events event on event.provider_call_ref = reservation.provider_call_ref
       where reservation.provider_call_ref = 'call_ingest_hold'`,
    ))[0]
    expect(stored?.state).toBe("consumed")
    expect(stored?.period_start.startsWith("2026-11-01")).toBe(true)
    expect(stored?.seconds).toBe(42)
    expect(stored?.events).toBe(1)
    const unmatched = await ingest(ingestCommand("A", "call_started", "call_unmatched", null, { bodyLabel: "missing-metadata" }))
    expect(unmatched).toMatchObject({ status: "denied", reason: "unmatched_admission", billable: false })
    expect(await reservations("call_unmatched")).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_unmatched'"))[0]?.n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_ingest_diagnostics where provider_call_ref = 'call_unmatched'"))[0]?.n).toBe(1)
    expect(await ingest(ingestCommand("A", "call_started", "call_unmatched", null, { bodyLabel: "missing-metadata" }))).toMatchObject({
      status: "replay",
      reason: "unmatched_admission",
      billable: false,
    })
  })

  it("accepts call_ended before call_started and keeps one reservation and one duration", async () => {
    const held = await reserve(command("A", { bodyLabel: "ended-first" }))
    expect(held.status).toBe("admitted")
    expect(await ingest(ingestCommand("A", "call_ended", "call_ended_first", held.admissionRef ?? null))).toMatchObject({
      status: "accepted",
      billable: true,
      admissionRef: held.admissionRef,
    })
    expect(await ingest(ingestCommand("A", "call_started", "call_ended_first", null))).toMatchObject({
      status: "accepted",
      billable: true,
      admissionRef: held.admissionRef,
    })
    expect(await reservations("call_ended_first")).toBe(1)
    expect((await rows<{ n: number; seconds: number }>(
      "select count(*)::int as n, coalesce(sum(duration_seconds), 0)::int as seconds from admin_private.commercial_usage_events where provider_call_ref = 'call_ended_first'",
    ))[0]).toEqual({ n: 1, seconds: 42 })
    expect((await rows<{ state: string }>("select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_ended_first'"))[0]?.state).toBe("consumed")
  })

  it("rejects a conflicting tenant, number, expired hold, and disconnected admission without usage", async () => {
    const known = await reserve(command("A", { providerCallRef: "call_known_meta", bodyLabel: "known-meta" }))
    expect(known.status).toBe("admitted")
    expect(await ingest(ingestCommand("A", "call_started", "call_known_meta", null))).toMatchObject({
      status: "accepted",
      billable: true,
      admissionRef: known.admissionRef,
    })
    const conflicted = await reserve(command("A", { bodyLabel: "cross-ingest" }))
    expect(await ingest(ingestCommand("A", "call_started", "call_cross_ingest", conflicted.admissionRef ?? null, {
      assertedSubscriptionId: seat("B")[3],
    }))).toMatchObject({ status: "denied", reason: "cross_tenant", billable: false })
    expect(await ingest(ingestCommand("A", "call_started", "call_wrong_number", conflicted.admissionRef ?? null, {
      toNumber: seat("B")[6],
      bodyLabel: "wrong-number",
    }))).toMatchObject({ status: "denied", reason: "cross_tenant", billable: false })
    expect(await ingest(ingestCommand("A", "call_started", "call_altered_ref", "adm_" + "c".repeat(32)))).toMatchObject({
      status: "denied",
      reason: "unmatched_admission",
      billable: false,
    })
    expect(await ingest({ ...ingestCommand("A", "call_started", "call_bad_ref", conflicted.admissionRef ?? null), admissionRef: "not-an-admission" })).toMatchObject({
      status: "rejected",
      reason: "rejected_payload",
      billable: false,
    })
    expect(await reservations("call_cross_ingest") + await reservations("call_wrong_number") + await reservations("call_altered_ref")).toBe(0)

    const expiring = await reserve(command("A", { providerCallRef: "call_ingest_expired", bodyLabel: "ingest-expired" }))
    await db.exec("set session_replication_role = replica")
    await db.query(
      "update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = $1",
      [expiring.admissionRef],
    )
    await db.exec("set session_replication_role = origin")
    expect(await ingest(ingestCommand("A", "call_ended", "call_ingest_expired", expiring.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "admission_expired",
      billable: false,
    })
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_expired'"))[0]?.n).toBe(0)
    expect((await rows<{ state: string }>("select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_ingest_expired'"))[0]?.state).toBe("released")

    const dropped = await reserve(command("A", { bodyLabel: "ingest-disconnect" }))
    expect(await callSql("commercial_usage_release_inbound_admissions_v1", {
      environment: "dev",
      mode: "disconnect",
      admissionRef: dropped.admissionRef,
      now: NOW,
    })).toMatchObject({ status: "disconnected", billable: false })
    expect(await ingest(ingestCommand("A", "call_ended", "call_ingest_disconnect", dropped.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "admission_disconnected",
      billable: false,
    })
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_disconnect'"))[0]?.n).toBe(0)
  })

  it("keeps the admitted period when the subscription has already renewed and stores only the structured lead", async () => {
    const admissionRef = (await rows<{ admission_ref: string }>(
      "select admission_ref from admin_private.commercial_usage_admissions where body_sha256 = $1",
      [hashFor("R:renew-open")],
    ))[0]?.admission_ref
    expect(admissionRef).toMatch(/^adm_[0-9a-f]{32}$/)
    const ended = await ingest(ingestCommand("R", "call_ended", "call_renewed_ingest", admissionRef ?? null, { bodyLabel: "renewed-ingest" }))
    expect(ended).toMatchObject({ status: "accepted", billable: true, admissionRef })
    expect(String(ended.periodStart ?? "")).toContain("2026-11-01")
    const analyzed = await ingest(ingestCommand("R", "call_analyzed", "call_renewed_ingest", admissionRef ?? null, {
      bodyLabel: "renewed-analysis",
      summary: "Boiler repair tomorrow morning",
      callerName: "Ada",
      callbackNumber: "+447700900222",
    }))
    expect(analyzed).toMatchObject({ status: "accepted", billable: true, admissionRef })
    const lead = (await rows<{ summary: string; business_id: string; n: number }>(
      `select summary, business_id::text, (select count(*)::int from public.telloya_voice_leads where provider_call_ref = 'call_renewed_ingest') as n
       from public.telloya_voice_leads where provider_call_ref = 'call_renewed_ingest'`,
    ))[0]
    expect(lead).toMatchObject({ summary: "Boiler repair tomorrow morning", business_id: seat("R")[1], n: 1 })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.telloya_voice_notification_outbox where lead_id in (select id from public.telloya_voice_leads where provider_call_ref = 'call_renewed_ingest')",
    ))[0]?.n).toBe(0)
    expect(await reservations("call_renewed_ingest")).toBe(1)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_renewed_ingest'"))[0]?.n).toBe(1)
  })

  it("refuses to bind an admission to a usage event or reservation it does not own", async () => {
    const otherPlan = "33333333-3333-4333-8333-333333333332"
    await db.exec(`
      insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values (
        '${otherPlan}', 'TELLOYA', 2, 'DRAFT', '2026-10-01 00:00:00+00', 'MONTH', 'GBP',
        4900, 'NOT_APPLICABLE', 'TELLOYA-USAGE-LEDGER'
      );
      insert into admin_private.commercial_usage_events(
        environment, provider_call_ref, call_scope, subscription_id, business_id, location_id,
        period_start, period_end, duration_seconds, duration_quality, body_sha256, plan_version_id,
        included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
        overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
      ) values (
        'dev', 'call_other_tenant_event', 'customer_phone', '${seat("B")[3]}', '${seat("B")[1]}', '${seat("B")[2]}',
        '${PERIOD_START}', '${PERIOD_END}', 15, 'confirmed', '${HASH_B}', '${PLAN}',
        120, false, true, 25, 25, '${CONSENT_AT}'
      ), (
        'dev', 'call_other_period_event', 'customer_phone', '${seat("A")[3]}', '${seat("A")[1]}', '${seat("A")[2]}',
        '${PERIOD_END}', '${NEXT_END}', 15, 'confirmed', '${HASH_A}', '${PLAN}',
        120, false, false, 25, null, null
      );
      insert into admin_private.commercial_usage_reservations(
        environment, provider_call_ref, subscription_id, location_id, business_id,
        period_start, period_end, reserved_seconds, state, plan_version_id,
        included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
        overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
      ) values (
        'dev', 'call_bad_terms', '${seat("A")[3]}', '${seat("A")[2]}', '${seat("A")[1]}',
        '${PERIOD_START}', '${PERIOD_END}', 60, 'open', '${otherPlan}',
        120, false, true, 99, 10, '${CONSENT_AT}'
      );
    `)
    const tenantHold = await reserve(command("A", { bodyLabel: "other-tenant-event" }))
    const periodHold = await reserve(command("A", { bodyLabel: "other-period-event" }))
    const termsHold = await reserve(command("A", { bodyLabel: "bad-terms" }))
    expect(tenantHold.status).toBe("admitted")
    expect(periodHold.status).toBe("admitted")
    expect(termsHold.status).toBe("admitted")
    expect(await ingest(ingestCommand("A", "call_started", "call_other_tenant_event", tenantHold.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "usage_event_conflict",
      billable: false,
    })
    expect(await ingest(ingestCommand("A", "call_ended", "call_other_period_event", periodHold.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "usage_event_conflict",
      billable: false,
    })
    expect(await ingest(ingestCommand("A", "call_started", "call_bad_terms", termsHold.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "call_conflict",
      billable: false,
    })
    const owned = (await rows<{ call_ref: string; subscription_id: string; seconds: number; period_start: string }>(
      `select provider_call_ref as call_ref, subscription_id::text, duration_seconds as seconds, period_start::text
       from admin_private.commercial_usage_events
       where provider_call_ref in ('call_other_tenant_event', 'call_other_period_event')
       order by provider_call_ref`,
    ))
    expect(owned).toEqual([
      { call_ref: "call_other_period_event", subscription_id: seat("A")[3], seconds: 15, period_start: expect.stringContaining("2026-12-01") },
      { call_ref: "call_other_tenant_event", subscription_id: seat("B")[3], seconds: 15, period_start: expect.stringContaining("2026-11-01") },
    ])
    expect(await reservations("call_other_tenant_event") + await reservations("call_other_period_event")).toBe(0)
    expect(await reservations("call_bad_terms")).toBe(1)
    expect((await rows<{ state: string; plan_version_id: string; rate: number }>(
      "select state, plan_version_id::text, overage_rate_minor_snapshot as rate from admin_private.commercial_usage_reservations where provider_call_ref = 'call_bad_terms'",
    ))[0]).toMatchObject({ state: "open", plan_version_id: otherPlan, rate: 99 })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_admissions where admission_ref in ($1, $2, $3) and state = 'bound'",
      [tenantHold.admissionRef, periodHold.admissionRef, termsHold.admissionRef],
    ))[0]?.n).toBe(0)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_receipts where provider_call_ref in ('call_other_tenant_event', 'call_other_period_event', 'call_bad_terms')",
    ))[0]?.n).toBe(0)

    const released = await reserve(command("A", { providerCallRef: "call_released_hold", bodyLabel: "released-hold" }))
    expect(released.status).toBe("admitted")
    await db.exec("update admin_private.commercial_usage_reservations set state = 'released' where provider_call_ref = 'call_released_hold'")
    expect(await ingest(ingestCommand("A", "call_ended", "call_released_hold", released.admissionRef ?? null))).toMatchObject({
      status: "denied",
      reason: "reservation_released",
      billable: false,
    })
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_released_hold'",
    ))[0]?.state).toBe("released")
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.commercial_usage_events where provider_call_ref = 'call_released_hold'",
    ))[0]?.n).toBe(0)
    expect((await rows<{ state: string }>(
      "select state from admin_private.commercial_usage_admissions where admission_ref = $1",
      [released.admissionRef],
    ))[0]?.state).toBe("reserved")
  })

  it("lets only the server role execute the public reservation command", async () => {
    const privileges = (await rows<{
      service_public: boolean
      anon_public: boolean
      auth_public: boolean
      service_bind: boolean
      anon_release: boolean
      service_private: boolean
      service_schema: boolean
    }>(`
      select
        has_function_privilege('service_role', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as service_public,
        has_function_privilege('anon', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as anon_public,
        has_function_privilege('authenticated', 'public.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as auth_public,
        has_function_privilege('service_role', 'public.commercial_usage_bind_inbound_admission_v1(jsonb)', 'EXECUTE') as service_bind,
        has_function_privilege('anon', 'public.commercial_usage_release_inbound_admissions_v1(jsonb)', 'EXECUTE') as anon_release,
        has_function_privilege('service_role', 'admin_private.commercial_usage_reserve_inbound_v1(jsonb)', 'EXECUTE') as service_private,
        has_schema_privilege('service_role', 'admin_private', 'USAGE') as service_schema,
        has_function_privilege('service_role', 'public.commercial_usage_ingest_inbound_admission_v1(jsonb)', 'EXECUTE') as service_ingest,
        has_function_privilege('anon', 'public.commercial_usage_ingest_inbound_admission_v1(jsonb)', 'EXECUTE') as anon_ingest,
        has_function_privilege('authenticated', 'public.commercial_usage_ingest_inbound_admission_v1(jsonb)', 'EXECUTE') as auth_ingest,
        has_function_privilege('service_role', 'admin_private.commercial_usage_ingest_inbound_admission_v1(jsonb)', 'EXECUTE') as service_private_ingest
    `))[0]
    expect(privileges).toEqual({
      service_public: true,
      anon_public: false,
      auth_public: false,
      service_bind: true,
      anon_release: false,
      service_private: false,
      service_schema: false,
      service_ingest: true,
      anon_ingest: false,
      auth_ingest: false,
      service_private_ingest: false,
    })
    await db.exec("SET ROLE service_role")
    try {
      const recorded = (await rows<{ result: ReserveResult }>(
        "select public.commercial_usage_reserve_inbound_v1($1::jsonb) as result",
        [JSON.stringify(command("A", { providerCallRef: "call_role" }))],
      ))[0]?.result
      expect(recorded?.status).toBe("admitted")
      await expect(db.query("select admin_private.commercial_usage_reserve_inbound_v1('{}'::jsonb)")).rejects.toThrow(/permission denied/i)
      await expect(db.query("select public.commercial_usage_ingest_inbound_admission_v1('{}'::jsonb)")).resolves.toBeTruthy()
      await expect(db.query("select admin_private.commercial_usage_ingest_inbound_admission_v1('{}'::jsonb)")).rejects.toThrow(/permission denied/i)
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

  function reserveSql(label: string) {
    const body = JSON.stringify(command("A", { bodyLabel: label })).replace(/'/g, "''")
    return `select public.commercial_usage_reserve_inbound_v1('${body}'::jsonb)::text;`
  }

  function jsonCall(fn: string, body: Record<string, unknown>) {
    const encoded = JSON.stringify(body).replace(/'/g, "''")
    return `select public.${fn}('${encoded}'::jsonb)::text;`
  }

  function periodLockSql(admissionRef: string) {
    return `select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'commercial-usage-period:' || subscription_id::text || ':' || period_start::text, 0))
      from admin_private.commercial_usage_admissions
      where admission_ref = '${admissionRef}';`
  }

  async function activityCount(where: string) {
    return psql(`select count(*) from pg_stat_activity a where a.datname = 'inboundadmit' and ${where}`)
  }

  async function grantedTupleLocks(marker: string) {
    return psql(`select count(*) from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where a.datname = 'inboundadmit'
        and a.query like '%${marker}%'
        and l.locktype = 'tuple'
        and l.granted`)
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
      expect(await psql("select count(*) from admin_private.commercial_usage_admissions where state = 'reserved' and subscription_id = '" + seat("A")[3] + "'")).toBe("1")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref in ('call_race_1', 'call_race_2')")).toBe("0")
      const winner = (admitted.stdout.match(/adm_[0-9a-f]{32}/) ?? [])[0]
      expect(winner).toBeTruthy()
      const started = await psql(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
        environment: "dev",
        eventType: "call_started",
        providerCallRef: "call_race_winner",
        toNumber: seat("A")[6],
        admissionRef: winner,
        bodySha256: hashFor("race-winner-start"),
      }))
      const ended = await psql(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
        environment: "dev",
        eventType: "call_ended",
        providerCallRef: "call_race_winner",
        toNumber: seat("A")[6],
        admissionRef: winner,
        bodySha256: hashFor("race-winner-end"),
        durationQuality: "confirmed",
        durationSeconds: 42,
        endedAt: NOW,
      }))
      expect(started).toContain("\"billable\": true")
      expect(ended).toContain("\"billable\": true")
      const loser = await psql(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
        environment: "dev",
        eventType: "call_ended",
        providerCallRef: "call_race_loser",
        toNumber: seat("A")[6],
        admissionRef: null,
        bodySha256: hashFor("race-loser"),
        durationQuality: "confirmed",
        durationSeconds: 42,
        endedAt: NOW,
      }))
      expect(loser).toContain("unmatched_admission")
      expect(loser).toContain("\"billable\": false")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref = 'call_race_winner'")).toBe("1")
      expect(await psql("select count(*) from admin_private.commercial_usage_events where provider_call_ref in ('call_race_winner', 'call_race_loser')")).toBe("1")
    } finally {
      first.end()
      second.end()
    }
  })

  it("binds and records call_started and call_ended together without a second reservation or a deadlock", async () => {
    const opened = JSON.parse(await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "ingest-race" })))) as ReserveResult
    expect(opened).toMatchObject({ status: "admitted", providerCallRef: null, billable: true })
    const holder = heldSession()
    const started = heldSession()
    const ended = heldSession()
    try {
      await holder.query("BEGIN;")
      expect((await holder.query(periodLockSql(opened.admissionRef!))).stderr).toBe("")
      const pendingStart = started.query(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
        environment: "dev",
        eventType: "call_started",
        providerCallRef: "call_ingest_race",
        toNumber: seat("R")[6],
        admissionRef: opened.admissionRef,
        bodySha256: hashFor("ingest-race-start"),
      }))
      const pendingEnd = ended.query(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
        environment: "dev",
        eventType: "call_ended",
        providerCallRef: "call_ingest_race",
        toNumber: seat("R")[6],
        admissionRef: opened.admissionRef,
        bodySha256: hashFor("ingest-race-end"),
        durationQuality: "confirmed",
        durationSeconds: 42,
        endedAt: NOW,
      }))
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(await activityCount("a.query like '%call_ingest_race%' and a.wait_event_type = 'Lock' and a.wait_event = 'advisory'")).toBe("2")
      expect(await grantedTupleLocks("call_ingest_race")).toBe("0")
      await holder.query("COMMIT;")
      const startText = (await pendingStart).stderr + (await pendingStart).stdout
      const endText = (await pendingEnd).stderr + (await pendingEnd).stdout
      expect(startText.toLowerCase()).not.toContain("deadlock")
      expect(endText.toLowerCase()).not.toContain("deadlock")
      expect(startText).toContain("\"billable\": true")
      expect(endText).toContain("\"billable\": true")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref = 'call_ingest_race'")).toBe("1")
      expect(await psql("select count(*) from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_race'")).toBe("1")
      expect(await psql("select coalesce(sum(duration_seconds), 0) from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_race'")).toBe("42")
      expect(await psql("select period_start::text from admin_private.commercial_usage_events where provider_call_ref = 'call_ingest_race'")).toContain("2026-11-01")
    } finally {
      await holder.query("ROLLBACK;").catch(() => undefined)
      holder.end()
      started.end()
      ended.end()
    }
  })

  it("blocks a second overage call until a hold has become one reservation", async () => {
    const opened = JSON.parse(await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("B", { bodyLabel: "hold-race" })))) as ReserveResult
    expect(opened.status).toBe("admitted")
    const binder = heldSession()
    const caller = heldSession()
    try {
      await binder.query("BEGIN;")
      const bound = await binder.query(jsonCall("commercial_usage_bind_inbound_admission_v1", {
        environment: "dev",
        providerCallRef: "call_hold_race",
        toNumber: seat("B")[6],
        admissionRef: opened.admissionRef,
        now: NOW,
      }))
      expect(bound.stderr + bound.stdout).toContain("bound")
      const pending = caller.query(jsonCall("commercial_usage_reserve_inbound_v1", command("B", { bodyLabel: "second-overage" })))
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'inboundadmit'"))
      expect(waiting).toBeGreaterThan(0)
      await binder.query("COMMIT;")
      const denied = await pending
      expect(denied.stderr + denied.stdout).toContain("spending_cap_exhausted")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref = 'call_hold_race' and state = 'open'")).toBe("1")
      expect(await psql("select count(*) from admin_private.commercial_usage_admissions where body_sha256 = '" + hashFor("B:second-overage") + "'")).toBe("0")
    } finally {
      binder.end()
      caller.end()
    }
  })

  it("keeps a call bound when expiry waits on the same period lock", async () => {
    const opened = JSON.parse(await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "expire-race" })))) as ReserveResult
    expect(opened.status).toBe("admitted")
    const binder = heldSession()
    const expirer = heldSession()
    try {
      await binder.query("BEGIN;")
      const bound = await binder.query(jsonCall("commercial_usage_bind_inbound_admission_v1", {
        environment: "dev",
        providerCallRef: "call_expire_race",
        toNumber: seat("R")[6],
        admissionRef: opened.admissionRef,
        now: NOW,
      }))
      expect(bound.stderr + bound.stdout).toContain("\"status\": \"bound\"")
      const pending = expirer.query(jsonCall("commercial_usage_release_inbound_admissions_v1", {
        environment: "dev",
        mode: "expire",
        admissionRef: opened.admissionRef,
        now: "2026-11-15T12:11:00.000Z",
      }))
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'inboundadmit'"))
      expect(waiting).toBeGreaterThan(0)
      await binder.query("COMMIT;")
      const kept = await pending
      expect(kept.stderr + kept.stdout).toContain("\"reason\": \"bound\"")
      expect(kept.stderr + kept.stdout).not.toContain("\"status\": \"expired\"")
      expect(await psql("select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_expire_race'")).toBe("open")
    } finally {
      binder.end()
      expirer.end()
    }
    await psql(
      "set session_replication_role = replica; update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = '" + opened.admissionRef + "'; set session_replication_role = origin;",
    )
    const later = await psql(jsonCall("commercial_usage_release_inbound_admissions_v1", {
      environment: "dev",
      mode: "expire",
      admissionRef: opened.admissionRef,
      now: "2026-11-15T12:11:00.000Z",
    }))
    expect(later).toContain("\"reason\": \"bound\"")
    expect(await psql("select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_expire_race'")).toBe("open")
    expect(await psql("select state from admin_private.commercial_usage_admissions where admission_ref = '" + opened.admissionRef + "'")).toBe("bound")
  })

  it("lets a no-call-id replay and call binding share one reservation without a deadlock", async () => {
    const opened = JSON.parse(await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "replay-vs-bind" })))) as ReserveResult
    expect(opened).toMatchObject({ status: "admitted", providerCallRef: null, billable: true })
    const holder = heldSession()
    const replay = heldSession()
    const binder = heldSession()
    try {
      await holder.query("BEGIN;")
      const locked = await holder.query(periodLockSql(opened.admissionRef!))
      expect(locked.stderr).toBe("")
      const replayHash = hashFor("R:replay-vs-bind")
      const pendingReplay = replay.query(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "replay-vs-bind" })))
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(await activityCount("a.query like '%" + replayHash + "%' and a.wait_event_type = 'Lock' and a.wait_event = 'advisory'")).toBe("1")
      expect(await grantedTupleLocks(replayHash)).toBe("0")
      const pendingBind = binder.query(jsonCall("commercial_usage_bind_inbound_admission_v1", {
        environment: "dev",
        providerCallRef: "call_replay_bind",
        toNumber: seat("R")[6],
        admissionRef: opened.admissionRef,
        now: NOW,
      }))
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(await activityCount("a.query like '%call_replay_bind%' and a.wait_event_type = 'Lock' and a.wait_event = 'advisory'")).toBe("1")
      expect(await grantedTupleLocks("call_replay_bind")).toBe("0")
      expect(await grantedTupleLocks(replayHash)).toBe("0")
      await holder.query("COMMIT;")
      const replayed = await pendingReplay
      const bound = await pendingBind
      const replayText = replayed.stderr + replayed.stdout
      const bindText = bound.stderr + bound.stdout
      expect(replayText.toLowerCase()).not.toContain("deadlock")
      expect(bindText.toLowerCase()).not.toContain("deadlock")
      expect(replayText).not.toContain("invalid_billing_period")
      expect(bindText).not.toContain("invalid_billing_period")
      expect(replayText).toContain(opened.admissionRef)
      expect(replayText).toContain("\"billable\": true")
      expect(bindText).toContain(opened.admissionRef)
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref = 'call_replay_bind' and state = 'open'")).toBe("1")
      expect(await psql("select count(*) from admin_private.commercial_usage_admissions where body_sha256 = '" + replayHash + "'")).toBe("1")
      expect(await psql("select period_start::text from admin_private.commercial_usage_admissions where admission_ref = '" + opened.admissionRef + "'")).toContain("2026-11-01")
      expect(await psql("select count(*) from admin_private.commercial_usage_events where provider_call_ref = 'call_replay_bind'")).toBe("0")
    } finally {
      await holder.query("ROLLBACK;").catch(() => undefined)
      holder.end()
      replay.end()
      binder.end()
    }
  })

  it("lets an identical replay and expiry settle an expired hold without an approval or a deadlock", async () => {
    const opened = JSON.parse(await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "replay-vs-expiry" })))) as ReserveResult
    expect(opened.status).toBe("admitted")
    await psql(
      "set session_replication_role = replica; update admin_private.commercial_usage_admissions set expires_at = clock_timestamp() - interval '1 minute' where admission_ref = '" + opened.admissionRef + "'; set session_replication_role = origin;",
    )
    const holder = heldSession()
    const replay = heldSession()
    const expirer = heldSession()
    try {
      await holder.query("BEGIN;")
      const locked = await holder.query(periodLockSql(opened.admissionRef!))
      expect(locked.stderr).toBe("")
      const replayHash = hashFor("R:replay-vs-expiry")
      const pendingReplay = replay.query(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "replay-vs-expiry" })))
      const pendingExpire = expirer.query(jsonCall("commercial_usage_release_inbound_admissions_v1", {
        environment: "dev",
        mode: "expire",
        admissionRef: opened.admissionRef,
        now: "2026-11-15T12:11:00.000Z",
      }))
      await new Promise(resolve => setTimeout(resolve, 400))
      expect(await activityCount("a.query like '%" + replayHash + "%' and a.wait_event_type = 'Lock' and a.wait_event = 'advisory'")).toBe("1")
      expect(await activityCount("a.query like '%" + opened.admissionRef + "%' and a.query like '%expire%' and a.wait_event_type = 'Lock' and a.wait_event = 'advisory'")).toBe("1")
      expect(await grantedTupleLocks(replayHash)).toBe("0")
      expect(await grantedTupleLocks(opened.admissionRef!)).toBe("0")
      await holder.query("COMMIT;")
      const replayed = await pendingReplay
      const expired = await pendingExpire
      const replayText = replayed.stderr + replayed.stdout
      const expireText = expired.stderr + expired.stdout
      expect(replayText.toLowerCase()).not.toContain("deadlock")
      expect(expireText.toLowerCase()).not.toContain("deadlock")
      expect(replayText).toContain("admission_expired")
      expect(replayText).toContain("\"billable\": false")
      expect(replayText).not.toContain("\"billable\": true")
      expect(replayText).not.toContain("invalid_billing_period")
      expect(replayText).not.toContain("agent_seat_r")
      expect(await psql("select state from admin_private.commercial_usage_admissions where admission_ref = '" + opened.admissionRef + "'")).toBe("expired")
      expect(await psql("select count(*) from admin_private.commercial_usage_admissions where body_sha256 = '" + replayHash + "'")).toBe("1")
      expect(await psql("select reservation_id is null from admin_private.commercial_usage_admissions where admission_ref = '" + opened.admissionRef + "'")).toBe("t")
      expect(await psql("select count(*) from admin_private.commercial_usage_reservations where subscription_id = '" + seat("R")[3] + "'")).toBe("3")
    } finally {
      await holder.query("ROLLBACK;").catch(() => undefined)
      holder.end()
      replay.end()
      expirer.end()
    }
  })

  it("keeps the reserved period when renewal waits, then rejects a call after cancellation", async () => {
    const reserver = heldSession()
    const renewer = heldSession()
    try {
      await reserver.query("BEGIN;")
      const admitted = await reserver.query(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "renew-race" })))
      expect(admitted.stderr + admitted.stdout).toContain("admitted")
      const pending = renewer.query(
        "update public.commercial_subscriptions set current_period_start = '2026-12-01T00:00:00.000Z', current_period_end = '2027-01-01T00:00:00.000Z' where id = '" + seat("R")[3] + "';",
      )
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'inboundadmit'"))
      expect(waiting).toBeGreaterThan(0)
      await reserver.query("COMMIT;")
      const renewed = await pending
      expect(renewed.stderr).toBe("")
    } finally {
      reserver.end()
      renewer.end()
    }
    expect(await psql("select period_start::text from admin_private.commercial_usage_admissions where body_sha256 = '" + hashFor("R:renew-race") + "'")).toContain("2026-11-01")
    expect(await psql("select current_period_start::text from public.commercial_subscriptions where id = '" + seat("R")[3] + "'")).toContain("2026-12-01")
    const renewedAdmission = await psql("select admission_ref from admin_private.commercial_usage_admissions where body_sha256 = '" + hashFor("R:renew-race") + "'")
    const renewedIngest = await psql(jsonCall("commercial_usage_ingest_inbound_admission_v1", {
      environment: "dev",
      eventType: "call_ended",
      providerCallRef: "call_renew_race_end",
      toNumber: seat("R")[6],
      admissionRef: renewedAdmission,
      bodySha256: hashFor("renew-race-end"),
      durationQuality: "confirmed",
      durationSeconds: 30,
      endedAt: "2026-12-15T12:00:00.000Z",
    }))
    expect(renewedIngest).toContain("\"billable\": true")
    expect(await psql("select period_start::text from admin_private.commercial_usage_events where provider_call_ref = 'call_renew_race_end'")).toContain("2026-11-01")
    expect(await psql("select count(*) from admin_private.commercial_usage_reservations where provider_call_ref = 'call_renew_race_end'")).toBe("1")
    expect(await psql("select state from admin_private.commercial_usage_reservations where provider_call_ref = 'call_renew_race_end'")).toBe("consumed")

    const canceller = heldSession()
    const holder = heldSession()
    try {
      await holder.query("BEGIN;")
      const next = await holder.query(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "cancel-race", now: "2026-12-15T12:00:00.000Z" })))
      expect(next.stderr + next.stdout).toContain("admitted")
      const pending = canceller.query(
        "update public.commercial_subscriptions set state = 'CANCELED', canceled_at = clock_timestamp() where id = '" + seat("R")[3] + "';",
      )
      await new Promise(resolve => setTimeout(resolve, 400))
      const waiting = Number(await psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = 'inboundadmit'"))
      expect(waiting).toBeGreaterThan(0)
      await holder.query("COMMIT;")
      const cancelled = await pending
      expect(cancelled.stderr).toBe("")
    } finally {
      holder.end()
      canceller.end()
    }
    expect(await psql("select period_start::text from admin_private.commercial_usage_admissions where body_sha256 = '" + hashFor("R:cancel-race") + "'")).toContain("2026-12-01")
    const refused = await psql(jsonCall("commercial_usage_reserve_inbound_v1", command("R", { bodyLabel: "after-cancel-race", now: "2026-12-15T12:00:00.000Z" })))
    expect(refused).toContain("subscription_inactive")
    expect(await psql("select count(*) from admin_private.commercial_usage_admissions where body_sha256 = '" + hashFor("R:after-cancel-race") + "'")).toBe("0")
  })
})
