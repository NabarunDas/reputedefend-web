import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, migrationSql, preparePlatform } from "../recovery/harness"

const migrationName = "20261101170000_commercial_foundation_v1.sql"
const sql = migrationSql(migrationName).trim()
const beginAt = sql.indexOf("\nBEGIN;\n")
const commitAt = sql.lastIndexOf("\nCOMMIT;")
const body = beginAt >= 0 && commitAt > beginAt ? sql.slice(beginAt + "\nBEGIN;\n".length, commitAt) : ""

const customer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const businessA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
const businessB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
const locationA1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"
const locationA2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2"
const locationB = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3"
const actor = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1"
const telloyaPlan = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1"
const draftPlan = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2"
const completePlan = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3"

const preservedNames = [
  "guard_activate_v1",
  "guard_apply_invoice_paid_v1",
  "guard_set_billing_entitlement_v1",
  "guard_confirm_cancellation_v1",
  "guard_schedule_cancellation_v1",
  "customer_portal_begin_login_v1",
  "customer_portal_finish_otp_v1",
  "admin_contact_verify_v1",
]

const db = new PGlite()
let preserved = ""
let guardConstraints = ""

async function rows<T>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(query, params)).rows
}

async function snapshotPreserved(): Promise<string> {
  const defs = await rows<{ signature: string; body: string; acl: string }>(
    `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
            md5(pg_get_functiondef(p.oid)) as body,
            coalesce(p.proacl::text, '') as acl
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where p.proname = any($1::text[])
     order by 1`,
    [preservedNames],
  )
  return JSON.stringify(defs)
}

async function snapshotGuardConstraints(): Promise<string> {
  const defs = await rows<{ name: string; definition: string }>(
    `select conrelid::regclass::text || '.' || conname as name, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conname in ('guard_coverages_basis_origin', 'guard_coverages_included_period', 'guard_billing_basis_state')
     order by 1`,
  )
  return JSON.stringify(defs)
}

async function fails(query: string, params: unknown[] = []): Promise<string> {
  await db.exec("SAVEPOINT expect_fail")
  try {
    await db.query(query, params)
  } catch (error) {
    await db.exec("ROLLBACK TO SAVEPOINT expect_fail")
    await db.exec("RELEASE SAVEPOINT expect_fail")
    return error instanceof Error ? error.message : String(error)
  }
  await db.exec("ROLLBACK TO SAVEPOINT expect_fail")
  await db.exec("RELEASE SAVEPOINT expect_fail")
  throw new Error(`expected rejection: ${query}`)
}

async function seed() {
  await db.exec(`
    insert into public.customers(id, full_name, email) values
      ('${customer}', 'Alex Baker', 'alex@example.com');
    insert into public.businesses(id, display_name) values
      ('${businessA}', 'Bakery'),
      ('${businessB}', 'Yard');
    insert into public.locations(id, business_id, country, location_name) values
      ('${locationA1}', '${businessA}', 'GB', 'High Street'),
      ('${locationA2}', '${businessA}', 'GB', 'Dock'),
      ('${locationB}', '${businessB}', 'GB', 'Yard');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${businessA}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${customer}', '${businessB}', 'verified', now(), '${actor}', 'Mailbox already proved for Yard');
    insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'APPROVED'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'APPROVED');
    insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency, terms_ref
    ) values
      ('${telloyaPlan}', 'TELLOYA', 1, 'DRAFT', now(), 'MONTH', 'GBP', 'TELLOYA-TERMS-1'),
      ('${draftPlan}', 'TELLOYA', 2, 'DRAFT', now() + interval '1 year', 'MONTH', 'GBP', null),
      ('${completePlan}', 'COMPLETE', 1, 'DRAFT', now(), 'MONTH', 'GBP', 'COMPLETE-TERMS-1');
    insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values
      ('${telloyaPlan}', 'TELLOYA', 2, 'LOCATION'),
      ('${completePlan}', 'TELLOYA', 2, 'LOCATION'),
      ('${completePlan}', 'GUARD', 1, 'LOCATION');
    update public.plan_versions
      set status = 'APPROVED', amount_minor = 4900, tax_behaviour = 'NOT_APPLICABLE',
          approved_by = '${actor}', approved_at = now()
      where id in ('${telloyaPlan}', '${completePlan}');
  `)
}

function subscriptionSql(id: string, ref: string, business: string, plan: string, state: string, succeeds: string | null) {
  const successor = succeeds ? `'${succeeds}'` : "null"
  return `insert into public.commercial_subscriptions(
    id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
    amount_minor, currency, cadence_snapshot, terms_ref, pilot_ends_at, succeeds_subscription_id
  ) values (
    '${id}', '${ref}', '${customer}', '${business}', 'VOICE', '${plan}', 'NON_BILLABLE_PILOT', '${state}',
    null, 'GBP', 'MONTH', '${plan === completePlan ? "COMPLETE-TERMS-1" : "TELLOYA-TERMS-1"}',
    now() + interval '14 days', ${successor}
  )`
}

describe("the commercial foundation migration text", () => {
  it("is one forward transaction and does not activate, charge, or log anyone in", () => {
    expect(body.length).toBeGreaterThan(0)
    expect(sql).not.toContain("BUNDLE_COMPLETE")
    expect(sql).not.toContain("customer_portal_begin_invited")
    expect(sql).not.toContain("guard_apply_bundle_paid_through")
    expect(sql).not.toContain("guard_set_billing_entitlement_v1")
    expect(sql).not.toContain("guard_apply_invoice_paid_v1")
    expect(sql).not.toContain("guard_schedule_cancellation_v1")
    expect(sql).not.toContain("guard_activate_v1")
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.guard_")
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.customer_portal_")
    expect(sql).not.toContain("UPDATE public.customers")
    expect(sql).not.toContain("UPDATE public.guard_")
    expect(sql).not.toContain("INSERT INTO public.guard_")
    expect(sql).not.toContain("payment_receipts")
    expect(sql).not.toContain(" raw_token")
    expect(sql).not.toContain("invitation_token")
    const stateCheck = sql.slice(sql.indexOf("state text NOT NULL CHECK (state IN ('RESERVED'"), sql.indexOf("paid_through_at"))
    expect(stateCheck).not.toContain("FUNDED")
    expect(stateCheck).not.toContain("PROVIDER_PENDING")
    expect(readFileSync(new URL("../../../../apps/admin/lib/recovery/manifest.ts", import.meta.url), "utf8")).toContain("appliedToDev: false")
  })
})

describe("commercial foundation constraints", () => {
  beforeAll(async () => {
    await preparePlatform(db)
    await applyChain(db, { through: "20261031160000" })
    preserved = await snapshotPreserved()
    guardConstraints = await snapshotGuardConstraints()
    expect(preserved).toContain("guard_activate_v1")
    expect(preserved).toContain("customer_portal_begin_login_v1")
    await db.exec("BEGIN")
    await db.exec(body)
  }, 180000)

  beforeEach(async () => {
    await db.exec("SAVEPOINT commercial_case")
  })

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT commercial_case")
  })

  afterAll(async () => {
    await db.exec("ROLLBACK")
    expect(await snapshotPreserved()).toBe(preserved)
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'product_catalogue'",
    )).toEqual([{ n: 0 }])
    await db.close()
  })

  it("keeps Recovery and Guard functions and coverage rules unchanged inside the migration", async () => {
    expect(await snapshotPreserved()).toBe(preserved)
    expect(await snapshotGuardConstraints()).toBe(guardConstraints)
    expect(guardConstraints).toContain("DIRECT_GUARD")
    expect(guardConstraints).not.toContain("BUNDLE")
    const invited = await rows<{ n: number }>(
      "select count(*)::int as n from pg_proc where proname like 'customer_portal_begin_invited%' or proname like 'guard_apply_bundle%'",
    )
    expect(invited[0].n).toBe(0)
  })

  it("lets one customer hold two businesses and two locations on one plan", async () => {
    await seed()
    const first = "11111111-1111-4111-8111-111111111111"
    const second = "11111111-1111-4111-8111-111111111112"
    await db.exec(subscriptionSql(first, "VC-26-AB2345", businessA, telloyaPlan, "ACTIVE", null))
    await db.exec(subscriptionSql(second, "VC-26-BB2345", businessB, telloyaPlan, "ACTIVE", null))
    await db.exec(`
      insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
      values ('${first}', 'TELLOYA', 2, 2);
    `)
    await db.exec(`
      insert into public.product_entitlements(
        business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values
        ('${businessA}', '${locationA1}', 'TELLOYA', 'NON_BILLABLE_PILOT', '${first}', 'ELIGIBLE'),
        ('${businessA}', '${locationA2}', 'TELLOYA', 'NON_BILLABLE_PILOT', '${first}', 'ELIGIBLE');
    `)
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from public.commercial_subscriptions where customer_id = $1",
      [customer],
    )).toEqual([{ n: 2 }])
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from public.product_entitlements where commercial_subscription_id = $1",
      [first],
    )).toEqual([{ n: 2 }])
  })

  it("rejects a location from another business, a null location, and a duplicate entitlement", async () => {
    await seed()
    const sub = "11111111-1111-4111-8111-111111111113"
    await db.exec(subscriptionSql(sub, "VC-26-AB2346", businessA, telloyaPlan, "ACTIVE", null))
    expect(await fails(
      `insert into public.product_entitlements(business_id, location_id, component_code, source_kind, commercial_subscription_id, state)
       values ($1, $2, 'TELLOYA', 'NON_BILLABLE_PILOT', $3, 'PENDING')`,
      [businessA, locationB, sub],
    )).toMatch(/foreign key|locations_id_business/i)
    expect(await fails(
      `insert into public.product_entitlements(business_id, location_id, component_code, source_kind, commercial_subscription_id, state)
       values ($1, null, 'TELLOYA', 'NON_BILLABLE_PILOT', $2, 'PENDING')`,
      [businessA, sub],
    )).toMatch(/null value|not-null/i)
    await db.query(
      `insert into public.product_entitlements(business_id, location_id, component_code, source_kind, commercial_subscription_id, state)
       values ($1, $2, 'TELLOYA', 'NON_BILLABLE_PILOT', $3, 'PENDING')`,
      [businessA, locationA1, sub],
    )
    expect(await fails(
      `insert into public.product_entitlements(business_id, location_id, component_code, source_kind, commercial_subscription_id, state)
       values ($1, $2, 'TELLOYA', 'NON_BILLABLE_PILOT', $3, 'ELIGIBLE')`,
      [businessA, locationA1, sub],
    )).toMatch(/duplicate key|unique/i)
  })

  it("rejects a second occupying subscription and accepts one incoming replacement", async () => {
    await seed()
    const occupying = "11111111-1111-4111-8111-111111111114"
    const incoming = "11111111-1111-4111-8111-111111111115"
    const duplicate = "11111111-1111-4111-8111-111111111116"
    await db.exec(subscriptionSql(occupying, "VC-26-AB2347", businessA, telloyaPlan, "ACTIVE", null))
    expect(await fails(subscriptionSql(duplicate, "VC-26-CC2347", businessA, telloyaPlan, "ACTIVE", null))).toMatch(/duplicate key|unique/i)
    expect(await fails(subscriptionSql(incoming, "VC-26-DD2347", businessA, telloyaPlan, "OFFERED", null))).toMatch(/succeed the occupying/i)
    await db.exec(subscriptionSql(incoming, "VC-26-DD2347", businessA, telloyaPlan, "OFFERED", occupying))
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from public.commercial_subscriptions where business_id = $1",
      [businessA],
    )).toEqual([{ n: 2 }])
  })

  it("rejects duplicate Guard allocations, late funding states, and quantities outside the snapshot", async () => {
    await seed()
    const sub = "11111111-1111-4111-8111-111111111117"
    await db.exec(subscriptionSql(sub, "VC-26-AB2348", businessA, completePlan, "ACTIVE", null))
    expect(await fails(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'TELLOYA', 0, 2)`,
      [sub],
    )).toMatch(/check constraint/i)
    expect(await fails(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'TELLOYA', 3, 2)`,
      [sub],
    )).toMatch(/check constraint/i)
    await db.exec(`
      insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
      values ('${sub}', 'GUARD', 1, 1), ('${sub}', 'TELLOYA', 2, 2);
    `)
    const guardSub = "ffffffff-ffff-4fff-8fff-fffffffffff1"
    const coverage = "ffffffff-ffff-4fff-8fff-fffffffffff2"
    await db.exec("set session_replication_role = replica")
    await db.query(
      `insert into public.guard_coverages(
         id, customer_id, business_id, location_id, service_order_id, coverage_basis, coverage_origin, state, activated_at
       ) values ($1, $2, $3, $4, $5, 'DIRECT_GUARD', 'DIRECT_GUARD', 'ACTIVE', now())`,
      [coverage, customer, businessA, locationA1, "ffffffff-ffff-4fff-8fff-fffffffffff3"],
    )
    await db.query(
      `insert into public.guard_billing(coverage_id, billing_state, entitlement_source, paid_through_at)
       values ($1, 'CURRENT', 'PROVIDER', now() + interval '20 days')`,
      [coverage],
    )
    await db.query(
      `insert into public.guard_subscriptions(
         id, customer_id, business_id, location_id, coverage_id, service_order_id, price_version_id,
         amount_minor, currency, tax_behaviour, lifecycle_state, stripe_subscription_id
       ) values ($1, $2, $3, $4, $5, $6, $7, 4900, 'GBP', 'NOT_APPLICABLE', 'ACTIVE', 'sub_guardlocation1')`,
      [guardSub, customer, businessA, locationA1, coverage, "ffffffff-ffff-4fff-8fff-fffffffffff4", "ffffffff-ffff-4fff-8fff-fffffffffff5"],
    )
    await db.exec("set session_replication_role = origin")
    const before = await rows<{ coverage: unknown; billing: unknown; subscription: unknown }>(
      `select to_jsonb(c) as coverage, to_jsonb(b) as billing, to_jsonb(s) as subscription
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       join public.guard_subscriptions s on s.coverage_id = c.id
       where c.id = $1`,
      [coverage],
    )
    expect(await fails(
      `insert into public.bundle_guard_allocations(
         subscription_id, customer_id, business_id, location_id, state
       ) values ($1, $2, $3, $4, 'RESERVED')`,
      [sub, customer, businessA, locationA1],
    )).toMatch(/reserved allocation requires no open Guard/i)
    await db.query(
      `insert into public.bundle_guard_allocations(
         subscription_id, customer_id, business_id, location_id, state, standalone_guard_subscription_id
       ) values ($1, $2, $3, $4, 'PREVIEW', $5)`,
      [sub, customer, businessA, locationA1, guardSub],
    )
    expect(await rows(
      `select to_jsonb(c) as coverage, to_jsonb(b) as billing, to_jsonb(s) as subscription
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       join public.guard_subscriptions s on s.coverage_id = c.id
       where c.id = $1`,
      [coverage],
    )).toEqual(before)
    await db.exec("set constraints bundle_guard_allocations_quantity immediate")
    expect(await fails(
      `insert into public.bundle_guard_allocations(
         subscription_id, customer_id, business_id, location_id, state
       ) values ($1, $2, $3, $4, 'RESERVED')`,
      [sub, customer, businessA, locationA2],
    )).toMatch(/quantity_limit_snapshot/i)
    expect(await fails(
      `insert into public.bundle_guard_allocations(
         subscription_id, customer_id, business_id, location_id, state, guard_coverage_id
       ) values ($1, $2, $3, $4, 'FUNDED', $5)`,
      [sub, customer, businessA, locationA2, coverage],
    )).toMatch(/check|bundle_guard_allocations/i)
  })

  it("refuses an unapproved or null-price billable offer and freezes an accepted snapshot", async () => {
    await seed()
    expect(await fails(
      `update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`,
      [draftPlan, actor],
    )).toMatch(/null-price|approved/i)
    const sub = "11111111-1111-4111-8111-111111111118"
    expect(await fails(
      `insert into public.commercial_subscriptions(
         id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
         amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
       ) values ($1, 'VC-26-AB2349', $2, $3, 'VOICE', $4, 'BILLABLE', 'OFFERED', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [sub, customer, businessA, draftPlan],
    )).toMatch(/unapproved or null-price/i)
    await db.query(
      `insert into public.commercial_subscriptions(
         id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
         amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
       ) values ($1, 'VC-26-AB2349', $2, $3, 'VOICE', $4, 'BILLABLE', 'OFFERED', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [sub, customer, businessA, telloyaPlan],
    )
    expect(await fails(
      "update public.commercial_subscriptions set amount_minor = 100 where id = $1",
      [sub],
    )).toMatch(/immutable/i)
  })

  it("stores only an invitation hash and does not treat a fake receipt as activation", async () => {
    await seed()
    const columns = await rows<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'admin_private' and table_name = 'onboarding_invitations'`,
    )
    expect(columns.map(column => column.column_name)).not.toContain("token")
    expect(columns.map(column => column.column_name)).toContain("token_hash")
    const request = "12121212-1212-4121-8121-121212121212"
    await db.query(
      `insert into public.onboarding_requests(id, customer_id, business_id, email_snapshot, product_code, plan_family, state)
       values ($1, $2, $3, 'alex@example.com', 'TELLOYA', 'VOICE', 'OFFERED')`,
      [request, customer, businessA],
    )
    expect(await fails(
      `insert into admin_private.onboarding_invitations(token_hash, onboarding_request_id, email_snapshot, expires_at, customer_id)
       values ('raw-secret', $1, 'alex@example.com', now() + interval '7 days', $2)`,
      [request, customer],
    )).toMatch(/check|token_hash/i)
    await db.query(
      `insert into admin_private.onboarding_invitations(token_hash, onboarding_request_id, email_snapshot, expires_at, customer_id)
       values ($1, $2, 'alex@example.com', now() + interval '7 days', $3)`,
      ["a".repeat(64), request, customer],
    )
    const sub = "11111111-1111-4111-8111-111111111119"
    await db.query(
      `insert into public.commercial_subscriptions(
         id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
         amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
       ) values ($1, 'VC-26-EE2349', $2, $3, 'VOICE', $4, 'BILLABLE', 'PAYMENT_PENDING', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [sub, customer, businessA, telloyaPlan],
    )
    const pilot = "11111111-1111-4111-8111-11111111111a"
    await db.exec(subscriptionSql(pilot, "VC-26-FF2349", businessB, telloyaPlan, "ACTIVE", null))
    await db.exec(`
      insert into admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id, processed)
      values
        ('evt_checkout', 'checkout.session.completed', 'cs_checkout', true),
        ('evt_unprocessed', 'invoice.paid', 'in_unprocessed', false),
        ('evt_paid', 'invoice.paid', 'in_commercialpaid', true);
    `)
    expect(await fails(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, now(), now() + interval '1 month', 4900, 'GBP', 'evt_checkout')`,
      [sub],
    )).toMatch(/processed paid invoice/i)
    expect(await fails(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, now(), now() + interval '1 month', 4900, 'GBP', 'evt_missing')`,
      [sub],
    )).toMatch(/processed paid invoice/i)
    expect(await fails(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, now(), now() + interval '1 month', 100, 'GBP', 'evt_paid')`,
      [sub],
    )).toMatch(/match the commercial snapshot/i)
    expect(await fails(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, now(), now() + interval '1 month', 4900, 'GBP', 'evt_paid')`,
      [pilot],
    )).toMatch(/pilot subscription cannot store payment evidence/i)
    await db.query(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 4900, 'GBP', 'evt_paid')`,
      [sub],
    )
    expect(await rows<{ state: string }>("select state from public.commercial_subscriptions where id = $1", [sub])).toEqual([
      { state: "PAYMENT_PENDING" },
    ])
    expect(await fails(
      "update public.commercial_subscriptions set state = 'ACTIVE' where id = $1",
      [sub],
    )).toMatch(/cannot be active without payment evidence/i)
    await db.query(
      `update public.commercial_subscriptions
       set state = 'ACTIVE', current_period_start = '2026-11-01T00:00:00Z', current_period_end = '2026-12-01T00:00:00Z'
       where id = $1`,
      [sub],
    )
    expect(await fails(
      "update public.commercial_payment_evidence set amount_minor = 1 where subscription_id = $1",
      [sub],
    )).toMatch(/append-only|immutable/i)
  })

  it("does not make Telloya operational and does not open the tables to browser roles", async () => {
    await seed()
    const sub = "11111111-1111-4111-8111-111111111120"
    await db.exec(subscriptionSql(sub, "VC-26-AB2356", businessA, telloyaPlan, "ACTIVE", null))
    const entitlement = (await rows<{ id: string }>(
      `insert into public.product_entitlements(business_id, location_id, component_code, source_kind, commercial_subscription_id, state)
       values ($1, $2, 'TELLOYA', 'NON_BILLABLE_PILOT', $3, 'ELIGIBLE') returning id`,
      [businessA, locationA1, sub],
    ))[0].id
    await db.query(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ($1, $2, $3, 'NOT_STARTED')`,
      [entitlement, businessA, locationA1],
    )
    expect(await rows<{ state: string }>("select state from public.service_provisions where entitlement_id = $1", [entitlement])).toEqual([
      { state: "NOT_STARTED" },
    ])
    expect(await fails(
      `update public.service_provisions set state = 'LIVE', live_at = now() where entitlement_id = $1`,
      [entitlement],
    )).toMatch(/check|service_provisions_live/i)
    const policies = await rows<{ n: number }>(
      `select count(*)::int as n from pg_policies
       where tablename in (
         'product_catalogue', 'commercial_subscriptions', 'commercial_payment_evidence',
         'product_entitlements', 'service_provisions', 'bundle_guard_allocations', 'onboarding_requests'
       )`,
    )
    expect(policies[0].n).toBe(0)
    for (const role of ["anon", "authenticated", "service_role"]) {
      const allowed = await rows<{ ok: boolean }>(
        "select has_table_privilege($1, 'public.commercial_subscriptions', 'SELECT') as ok",
        [role],
      )
      expect(allowed).toEqual([{ ok: false }])
    }
    for (const role of ["anon", "authenticated"]) {
      for (const query of [
        "select * from public.commercial_subscriptions",
        "select * from public.commercial_payment_evidence",
        "select * from admin_private.onboarding_invitations",
      ]) {
        await db.exec("SAVEPOINT role_probe")
        try {
          await db.exec(`set role ${role}`)
          await expect(db.query(query)).rejects.toThrow(/permission denied/)
        } finally {
          await db.exec("ROLLBACK TO SAVEPOINT role_probe")
          await db.exec("RELEASE SAVEPOINT role_probe")
        }
      }
    }
  })
})
