import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a020d000-0000-4000-8000-0000000000a1"
const sam = "a020d000-0000-4000-8000-0000000000b2"
const alexAuth = "a020d000-0000-4000-8000-0000000000d4"
const samAuth = "a020d000-0000-4000-8000-0000000000e5"
const actor = "a020d000-0000-4000-8000-0000000000f6"
const bakery = "a020d000-0000-4000-8000-000000000011"
const yard = "a020d000-0000-4000-8000-000000000012"
const high = "a020d000-0000-4000-8000-000000000021"
const dock = "a020d000-0000-4000-8000-000000000022"
const yardLoc = "a020d000-0000-4000-8000-000000000023"
const telloyaPlan = "a020d000-0000-4000-8000-000000000031"
const completePlan = "a020d000-0000-4000-8000-000000000032"
const stripeCustomer = "cus_PortalMustNotShow1"
const stripeSubscription = "sub_PortalMustNotShow1"
const binding = "bindPortalMustNotShow1"
const testCall = "callPortalMustNotShow1"
const providerEvent = "evt_PortalMustNotShow1"

type Products = {
  businesses: Array<{
    businessName: string
    telloya: { status: string; locations: Array<{ locationName: string; status: string; nextStep: string | null }> }
    guard: {
      status: string
      locations: Array<{
        locationName: string
        status: string
        monitoringRecorded: boolean
        allocation: string | null
        nextStep: string | null
      }>
    }
  }>
  reads: { telloya: string; guard: string }
}

let alexSession = ""
let samSession = ""

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

function token() {
  return randomBytes(32).toString("hex")
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(`login did not start: ${started.status}`)
  const confirmed = await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp confirm failed: ${confirmed.status}`)
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(`otp finish failed: ${JSON.stringify(finished)}`)
  return sessionHash
}

async function products(session: string) {
  return rpc<Products | null>("customer_portal_products_v1", [session])
}

function telloyaLocations(result: Products | null, businessName: string) {
  return result?.businesses.find(business => business.businessName === businessName)?.telloya
}

function guardBusiness(result: Products | null, businessName: string) {
  return result?.businesses.find(business => business.businessName === businessName)?.guard
}

async function pilotSubscription(id: string, ref: string, business: string, plan: string, quantity: number, component: "TELLOYA" | "BOTH") {
  await db.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, cadence_snapshot, terms_ref, pilot_ends_at
    ) values ($1, $2, $3, $4, 'VOICE', $5, 'NON_BILLABLE_PILOT', 'DRAFT', null, 'GBP', 'MONTH', $6, now() + interval '14 days')`,
    [id, ref, alex, business, plan, plan === completePlan ? "COMPLETE-TERMS-1" : "TELLOYA-TERMS-1"],
  )
  const items = component === "BOTH"
    ? `('${id}', 'TELLOYA', ${quantity}, 5), ('${id}', 'GUARD', ${quantity}, 5)`
    : `('${id}', 'TELLOYA', ${quantity}, 5)`
  await db.exec(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot) values ${items}`,
  )
  await db.query("update public.commercial_subscriptions set state = 'ACTIVE' where id = $1", [id])
}

async function entitlement(id: string, business: string, location: string, subscription: string, kind: "NON_BILLABLE_PILOT" | "COMMERCIAL_SUBSCRIPTION", state = "ELIGIBLE") {
  await db.query(
    `insert into public.product_entitlements(
      id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
    ) values ($1, $2, $3, 'TELLOYA', $4, $5, $6)`,
    [id, business, location, kind, subscription, state],
  )
}

async function readyProvision(entitlementId: string, business: string, location: string, state: string, passed: boolean) {
  const cols = "profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at, customer_confirmed_at, provider_binding_ref, provider_test_call_ref, provider_test_outcome, agent_test_passed_at"
  const bindingSql = passed ? `'${binding}'` : "null"
  const call = passed ? `'${testCall}'` : "null"
  const outcome = passed ? "'PASSED'" : "null"
  const tested = passed ? "now()" : "null"
  await db.exec(
    `insert into public.service_provisions(
      entitlement_id, business_id, location_id, state, ${cols}
    ) values (
      '${entitlementId}', '${business}', '${location}', '${state}',
      now(), now(), now(), now(), now(), ${bindingSql}, ${call}, ${outcome}, ${tested}
    )`,
  )
}

async function allowLive() {
  await db.exec("alter table public.service_provisions disable trigger service_provisions_guard")
  await db.exec("alter table public.service_provisions drop constraint service_provisions_live_closed")
}

async function billable(id: string, ref: string, business: string, state: string, withEvidence: boolean) {
  await db.exec("set local session_replication_role = replica")
  await db.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref,
      current_period_start, current_period_end, stripe_customer_id, stripe_subscription_id
    ) values (
      $1, $2, $3, $4, 'VOICE', $5, 'BILLABLE', $6,
      4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1',
      now() - interval '1 day', now() + interval '20 days', $7, $8
    )`,
    [id, ref, alex, business, telloyaPlan, state, stripeCustomer, stripeSubscription],
  )
  await db.exec(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ('${id}', 'TELLOYA', 2, 5)`,
  )
  if (withEvidence) {
    await db.query(
      `insert into public.commercial_payment_evidence(
        subscription_id, period_start, period_end, amount_minor, currency, provider_event_id
      )
      select id, current_period_start, current_period_end, 4900, 'GBP', $2
      from public.commercial_subscriptions where id = $1`,
      [id, providerEvent],
    )
  }
  await db.exec("set local session_replication_role = origin")
}

async function guardCoverage(options: { active: boolean; location: string; business: string; paidThrough: string }) {
  const coverage = randomUUID()
  const guardSub = randomUUID()
  await db.exec("set local session_replication_role = replica")
  await db.query(
    `insert into public.guard_coverages(
      id, customer_id, business_id, location_id, service_order_id, coverage_basis, coverage_origin, state, activated_at
    ) values ($1, $2, $3, $4, $5, 'DIRECT_GUARD', 'DIRECT_GUARD', $6, $7)`,
    [coverage, alex, options.business, options.location, randomUUID(), options.active ? "ACTIVE" : "REQUESTED", options.active ? new Date().toISOString() : null],
  )
  await db.query(
    `insert into public.guard_billing(coverage_id, billing_state, entitlement_source, paid_through_at)
     values ($1, $2, $3, $4::timestamptz)`,
    [coverage, options.active ? "CURRENT" : "PENDING", options.active ? "PROVIDER" : "NONE", options.active ? options.paidThrough : null],
  )
  await db.query(
    `insert into public.guard_subscriptions(
      id, customer_id, business_id, location_id, coverage_id, service_order_id, price_version_id,
      amount_minor, currency, tax_behaviour, lifecycle_state, stripe_subscription_id
    ) values ($1, $2, $3, $4, $5, $6, $7, 4900, 'GBP', 'NOT_APPLICABLE', 'ACTIVE', $8)`,
    [guardSub, alex, options.business, options.location, coverage, randomUUID(), randomUUID(), `sub_Guard${guardSub.replace(/-/g, "").slice(0, 12)}`],
  )
  await db.exec("set local session_replication_role = origin")
  return { coverage, guardSub }
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.products@example.com', now()),
      ('${samAuth}', 'sam.products@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.products@example.com'),
      ('${sam}', 'Sam Cole', 'sam.products@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.products@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam.products@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${yard}', 'North Yard');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${yardLoc}', '${yard}', 'GB', 'Hidden Yard');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Yard'),
      ('${sam}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for shared Bakery');
    insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'APPROVED'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'APPROVED');
    insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency, terms_ref
    ) values
      ('${telloyaPlan}', 'TELLOYA', 1, 'DRAFT', now(), 'MONTH', 'GBP', 'TELLOYA-TERMS-1'),
      ('${completePlan}', 'COMPLETE', 1, 'DRAFT', now(), 'MONTH', 'GBP', 'COMPLETE-TERMS-1');
    insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values
      ('${telloyaPlan}', 'TELLOYA', 5, 'LOCATION'),
      ('${completePlan}', 'TELLOYA', 5, 'LOCATION'),
      ('${completePlan}', 'GUARD', 5, 'LOCATION');
    update public.plan_versions
      set status = 'APPROVED', amount_minor = 4900, tax_behaviour = 'NOT_APPLICABLE',
          approved_by = '${actor}', approved_at = now()
      where id in ('${telloyaPlan}', '${completePlan}');
  `)
  alexSession = await portalSession("alex.products@example.com", alexAuth)
  samSession = await portalSession("sam.products@example.com", samAuth)
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT products_case")
  await db.exec("SET CONSTRAINTS bundle_guard_allocations_quantity, product_entitlements_quantity IMMEDIATE")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT products_case")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("customer_portal_products_v1", () => {
  it("accepts only a portal session token hash and grants execute to service_role", async () => {
    const privilege = await rows<{
      anon_ok: boolean
      auth_ok: boolean
      service_ok: boolean
      private_service: boolean
      args: string
      nargs: number
    }>(
      `select has_function_privilege('anon', 'public.customer_portal_products_v1(text)', 'EXECUTE') as anon_ok,
              has_function_privilege('authenticated', 'public.customer_portal_products_v1(text)', 'EXECUTE') as auth_ok,
              has_function_privilege('service_role', 'public.customer_portal_products_v1(text)', 'EXECUTE') as service_ok,
              has_function_privilege('service_role', 'admin_private.customer_portal_products_v1(text)', 'EXECUTE') as private_service,
              pg_get_function_identity_arguments(p.oid) as args,
              p.pronargs as nargs
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'customer_portal_products_v1'`,
    )
    expect(privilege).toEqual([{
      anon_ok: false,
      auth_ok: false,
      service_ok: true,
      private_service: false,
      args: "p_token_hash text",
      nargs: 1,
    }])
    const table = await rows<{ anon_ok: boolean; rls: boolean }>(
      `select has_table_privilege('anon', 'public.commercial_subscriptions', 'SELECT') as anon_ok,
              c.relrowsecurity as rls
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'commercial_subscriptions'`,
    )
    expect(table).toEqual([{ anon_ok: false, rls: true }])
    const body = await rows<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'customer_portal_products_v1'`,
    )
    expect(body.map(item => item.def).join("\n")).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/i)
    expect(await products("not-a-hash")).toBeNull()
    expect(await products(hash(token()))).toBeNull()
  })

  it("returns the same empty result for revoked, idle, and absolutely expired sessions", async () => {
    await db.query("update admin_private.customer_portal_sessions set revoked_at = now() where token_hash = $1", [alexSession])
    expect(await products(alexSession)).toBeNull()

    await db.query(
      `update admin_private.customer_portal_sessions
       set revoked_at = null,
           authenticated_at = now() - interval '2 hours',
           created_at = now() - interval '2 hours',
           last_activity_at = now() - interval '31 minutes',
           expires_at = now() - interval '2 hours' + interval '8 hours'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await products(alexSession)).toBeNull()

    await db.query(
      `update admin_private.customer_portal_sessions
       set revoked_at = null,
           authenticated_at = now() - interval '9 hours',
           created_at = now() - interval '9 hours',
           expires_at = now() - interval '9 hours' + interval '8 hours',
           last_activity_at = now() - interval '9 hours' + interval '8 hours'
       where token_hash = $1`,
      [alexSession],
    )
    expect(await products(alexSession)).toBeNull()
  })

  it("shows both verified businesses and hides a pending or revoked membership", async () => {
    const bakerySub = randomUUID()
    const yardSub = randomUUID()
    await pilotSubscription(bakerySub, "VC-26-AB2346", bakery, telloyaPlan, 1, "TELLOYA")
    await pilotSubscription(yardSub, "VC-26-BB2346", yard, telloyaPlan, 1, "TELLOYA")
    await entitlement(randomUUID(), bakery, high, bakerySub, "NON_BILLABLE_PILOT", "PENDING")
    await entitlement(randomUUID(), yard, yardLoc, yardSub, "NON_BILLABLE_PILOT", "PENDING")
    const both = await products(alexSession)
    expect(both?.reads).toEqual({ telloya: "ok", guard: "ok" })
    expect(both?.businesses.map(business => business.businessName).sort()).toEqual(["Harbour Bakery", "North Yard"])
    expect(JSON.stringify(both)).not.toContain("@")
    expect(JSON.stringify(both)).not.toContain(stripeCustomer)

    await db.query(
      `update public.business_memberships
       set status = 'pending', verified_at = null, verified_by = null
       where customer_id = $1 and business_id = $2`,
      [alex, yard],
    )
    const pending = await products(alexSession)
    expect(pending?.businesses.map(business => business.businessName)).toEqual(["Harbour Bakery"])
    expect(JSON.stringify(pending)).not.toContain("Hidden Yard")
    expect(JSON.stringify(pending)).not.toContain("North Yard")

    await db.query(
      `update public.business_memberships
       set status = 'revoked', verified_at = null, verified_by = null
       where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    const revoked = await products(alexSession)
    expect(revoked?.businesses).toEqual([])
    expect(JSON.stringify(revoked)).not.toContain("High Street")
    expect(JSON.stringify(revoked)).not.toContain("Hidden Yard")
  })

  it("lets a second verified member see setup and not another business or a secret", async () => {
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-CC2346", bakery, telloyaPlan, 1, "TELLOYA")
    const highEntitlement = randomUUID()
    await entitlement(highEntitlement, bakery, high, sub, "NON_BILLABLE_PILOT")
    await db.query(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state)
       values ($1, $2, $3, 'PROFILE_REQUIRED')`,
      [highEntitlement, bakery, high],
    )
    const yardSub = randomUUID()
    await pilotSubscription(yardSub, "VC-26-DD2346", yard, telloyaPlan, 1, "TELLOYA")
    await entitlement(randomUUID(), yard, yardLoc, yardSub, "NON_BILLABLE_PILOT")
    const seen = await products(samSession)
    expect(telloyaLocations(seen, "Harbour Bakery")?.locations.map(location => location.status)).toEqual(["setup"])
    expect(seen?.businesses.map(business => business.businessName)).toEqual(["Harbour Bakery"])
    expect(JSON.stringify(seen)).not.toContain("alex.products@example.com")
    expect(JSON.stringify(seen)).not.toContain("Hidden Yard")
    expect(JSON.stringify(seen)).not.toMatch(/cus_|sub_|si_/)
  })

  it("does not attach a location from another business", async () => {
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-EE2346", bakery, telloyaPlan, 1, "TELLOYA")
    expect(await rejected(
      `insert into public.product_entitlements(
        business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, 'TELLOYA', 'NON_BILLABLE_PILOT', $3, 'ELIGIBLE')`,
      [bakery, yardLoc, sub],
    )).toMatch(/foreign key|locations_id_business/i)
    const seen = await products(alexSession)
    expect(JSON.stringify(seen)).not.toContain("Hidden Yard")
  })

  it("keeps one live location from making the other location or the business active", async () => {
    const sub = randomUUID()
    await billable(sub, "VC-26-FF2346", bakery, "ACTIVE", true)
    const highEntitlement = randomUUID()
    const dockEntitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await entitlement(highEntitlement, bakery, high, sub, "COMMERCIAL_SUBSCRIPTION")
    await entitlement(dockEntitlement, bakery, dock, sub, "COMMERCIAL_SUBSCRIPTION")
    await db.exec("set local session_replication_role = origin")
    await readyProvision(dockEntitlement, bakery, dock, "READY_FOR_PROVIDER_VERIFICATION", false)
    expect(await rejected(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ($1, $2, $3, 'LIVE')`,
      [highEntitlement, bakery, high],
    )).toMatch(/LIVE|check constraint/i)
    await allowLive()
    await db.exec(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at,
        customer_confirmed_at, provider_binding_ref, provider_test_call_ref, provider_test_outcome,
        agent_test_passed_at, live_at
      ) values (
        '${highEntitlement}', '${bakery}', '${high}', 'LIVE',
        now(), now(), now(), now(), now(), '${binding}', '${testCall}', 'PASSED', now(), now()
      )`,
    )
    const seen = await products(alexSession)
    const telloya = telloyaLocations(seen, "Harbour Bakery")
    expect(telloya?.locations.find(location => location.locationName === "High Street")?.status).toBe("active")
    expect(telloya?.locations.find(location => location.locationName === "Dock")?.status).toBe("ready_for_provider")
    expect(telloya?.status).not.toBe("active")
    expect(telloya?.locations.find(location => location.locationName === "Dock")?.nextStep).toBe("This location is waiting for provider verification.")
    expect(JSON.stringify(seen)).not.toContain(binding)
    expect(JSON.stringify(seen)).not.toContain(testCall)
    expect(JSON.stringify(seen)).not.toContain(stripeSubscription)
    expect(JSON.stringify(seen)).not.toContain(providerEvent)
    expect(JSON.stringify(seen)).not.toContain("4900")
  })

  it("does not call a missing binding or a failed provider test active", async () => {
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-GG2346", bakery, telloyaPlan, 1, "TELLOYA")
    const id = randomUUID()
    await entitlement(id, bakery, high, sub, "NON_BILLABLE_PILOT")
    await db.exec(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at, customer_confirmed_at,
        provider_test_outcome
      ) values ('${id}', '${bakery}', '${high}', 'READY_FOR_PROVIDER_VERIFICATION', now(), now(), now(), now(), now(), 'FAILED')`,
    )
    const failed = await products(alexSession)
    expect(telloyaLocations(failed, "Harbour Bakery")?.locations[0]?.status).not.toBe("active")
    expect(telloyaLocations(failed, "Harbour Bakery")?.status).not.toBe("active")
  })

  it("expires a pilot at its approved end and does not label it paid", async () => {
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-HH2346", bakery, telloyaPlan, 1, "TELLOYA")
    const id = randomUUID()
    await entitlement(id, bakery, high, sub, "NON_BILLABLE_PILOT")
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_subscriptions set pilot_ends_at = now() - interval '1 hour' where id = $1`,
      [sub],
    )
    await db.query(
      `update public.product_entitlements set state = 'EXPIRED', eligible_to = now() - interval '1 hour' where id = $1`,
      [id],
    )
    await db.exec("set local session_replication_role = origin")
    const seen = await products(alexSession)
    expect(telloyaLocations(seen, "Harbour Bakery")?.locations[0]?.status).toBe("expired")
    expect(JSON.stringify(seen).toLowerCase()).not.toContain("paid")
    expect(telloyaLocations(seen, "Harbour Bakery")?.status).not.toBe("pilot")
    expect(telloyaLocations(seen, "Harbour Bakery")?.status).not.toBe("active")
  })

  it("keeps a paid-through period active after a failed renewal", async () => {
    const sub = randomUUID()
    await billable(sub, "VC-26-JJ2346", bakery, "PAST_DUE", true)
    const id = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await entitlement(id, bakery, high, sub, "COMMERCIAL_SUBSCRIPTION")
    await db.exec("set local session_replication_role = origin")
    await allowLive()
    await db.exec(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at,
        customer_confirmed_at, provider_binding_ref, provider_test_call_ref, provider_test_outcome,
        agent_test_passed_at, live_at
      ) values (
        '${id}', '${bakery}', '${high}', 'LIVE',
        now(), now(), now(), now(), now(), '${binding}', '${testCall}', 'PASSED', now(), now()
      )`,
    )
    const seen = await products(alexSession)
    const location = telloyaLocations(seen, "Harbour Bakery")?.locations[0]
    expect(location?.status).toBe("active")
    expect(location?.nextStep).toBe("The current period continues. Renewal did not complete.")
    expect(location?.status).not.toBe("expired")
    expect(location?.status).not.toBe("suspended")
    expect(JSON.stringify(seen)).not.toContain(stripeSubscription)
    expect(JSON.stringify(seen)).not.toContain("4900")
  })

  it("does not treat a Stripe subscription without payment evidence as active", async () => {
    const sub = randomUUID()
    await billable(sub, "VC-26-KK2346", bakery, "ACTIVE", false)
    const id = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await entitlement(id, bakery, high, sub, "COMMERCIAL_SUBSCRIPTION")
    await db.exec("set local session_replication_role = origin")
    await readyProvision(id, bakery, high, "READY_FOR_PROVIDER_VERIFICATION", true)
    const seen = await products(alexSession)
    expect(telloyaLocations(seen, "Harbour Bakery")?.locations[0]?.status).toBe("pending")
    expect(telloyaLocations(seen, "Harbour Bakery")?.status).not.toBe("active")
    expect(JSON.stringify(seen)).not.toContain(stripeCustomer)
    expect(JSON.stringify(seen)).not.toContain(stripeSubscription)
  })

  it("does not let a preview allocation replace standalone Guard monitoring", async () => {
    const open = await guardCoverage({
      active: true,
      location: high,
      business: bakery,
      paidThrough: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const before = await rows<{ state: string; paid: string }>(
      `select c.state, b.paid_through_at::text as paid
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       where c.id = $1`,
      [open.coverage],
    )
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-LL2346", bakery, completePlan, 2, "BOTH")
    await db.query(
      `insert into public.bundle_guard_allocations(
        subscription_id, customer_id, business_id, location_id, state, standalone_guard_subscription_id
      ) values ($1, $2, $3, $4, 'PREVIEW', $5)`,
      [sub, alex, bakery, high, open.guardSub],
    )
    const seen = await products(alexSession)
    const location = guardBusiness(seen, "Harbour Bakery")?.locations[0]
    expect(location?.status).toBe("active")
    expect(location?.monitoringRecorded).toBe(true)
    expect(location?.allocation).toBe("preview")
    expect(location?.nextStep).toBeNull()
    expect(await rows(
      `select c.state, b.paid_through_at::text as paid
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       where c.id = $1`,
      [open.coverage],
    )).toEqual(before)

    const waiting = await guardCoverage({
      active: false,
      location: dock,
      business: bakery,
      paidThrough: new Date().toISOString(),
    })
    await db.query(
      `insert into public.bundle_guard_allocations(
        subscription_id, customer_id, business_id, location_id, state, standalone_guard_subscription_id
      ) values ($1, $2, $3, $4, 'PREVIEW', $5)`,
      [sub, alex, bakery, dock, waiting.guardSub],
    )
    const mixed = await products(alexSession)
    const dockLocation = guardBusiness(mixed, "Harbour Bakery")?.locations.find(location => location.locationName === "Dock")
    expect(dockLocation?.status).not.toBe("active")
    expect(dockLocation?.monitoringRecorded).toBe(false)
    expect(dockLocation?.allocation).toBe("preview")
    expect(dockLocation?.nextStep).toBe("Guard monitoring is not active from this bundle.")
    expect(guardBusiness(mixed, "Harbour Bakery")?.status).not.toBe("active")
  })

  it("reports one product unavailable without calling the other unpurchased, and writes nothing", async () => {
    const sub = randomUUID()
    await pilotSubscription(sub, "VC-26-MM2346", bakery, telloyaPlan, 1, "TELLOYA")
    await entitlement(randomUUID(), bakery, high, sub, "NON_BILLABLE_PILOT")
    const open = await guardCoverage({
      active: true,
      location: dock,
      business: bakery,
      paidThrough: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const before = await counts()
    const activity = await rows<{ at: string }>(
      "select last_activity_at::text as at from admin_private.customer_portal_sessions where token_hash = $1",
      [alexSession],
    )
    await db.exec("alter table public.product_entitlements rename to product_entitlements_hidden")
    const telloyaDown = await products(alexSession)
    expect(telloyaDown?.reads).toEqual({ telloya: "unavailable", guard: "ok" })
    expect(guardBusiness(telloyaDown, "Harbour Bakery")?.locations[0]?.status).toBe("active")
    expect(JSON.stringify(telloyaDown?.businesses[0]?.telloya)).not.toContain("not_subscribed")
    await db.exec("alter table public.product_entitlements_hidden rename to product_entitlements")

    await db.exec("alter table public.guard_coverages rename to guard_coverages_hidden")
    const guardDown = await products(alexSession)
    expect(guardDown?.reads.guard).toBe("unavailable")
    expect(guardDown?.reads.telloya).toBe("ok")
    expect(telloyaLocations(guardDown, "Harbour Bakery")?.locations[0]?.status).toBe("setup")
    expect(JSON.stringify(guardDown?.businesses.find(business => business.businessName === "Harbour Bakery")?.guard)).not.toContain("not_subscribed")
    await db.exec("alter table public.guard_coverages_hidden rename to guard_coverages")

    expect(await counts()).toEqual(before)
    expect(await rows(
      "select last_activity_at::text as at from admin_private.customer_portal_sessions where token_hash = $1",
      [alexSession],
    )).toEqual(activity)
    expect(await rows<{ state: string }>("select state from public.guard_coverages where id = $1", [open.coverage])).toEqual([{ state: "ACTIVE" }])
    const empty = await products(alexSession)
    expect(empty?.reads).toEqual({ telloya: "ok", guard: "ok" })
  })

  it("keeps identical business and location names as separate businesses", async () => {
    const liveBusiness = "a020d000-0000-4000-8000-000000000041"
    const waitingBusiness = "a020d000-0000-4000-8000-000000000042"
    const liveLocation = "a020d000-0000-4000-8000-000000000051"
    const waitingLocation = "a020d000-0000-4000-8000-000000000052"
    await db.exec(`
      insert into public.businesses(id, display_name) values
        ('${liveBusiness}', 'Harbour Bakery'),
        ('${waitingBusiness}', 'Harbour Bakery');
      insert into public.locations(id, business_id, country, location_name) values
        ('${liveLocation}', '${liveBusiness}', 'GB', 'High Street'),
        ('${waitingLocation}', '${waitingBusiness}', 'GB', 'High Street');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${alex}', '${liveBusiness}', 'verified', now(), '${actor}', 'Mailbox already proved for the live twin'),
        ('${alex}', '${waitingBusiness}', 'verified', now(), '${actor}', 'Mailbox already proved for the waiting twin');
    `)
    const liveSub = randomUUID()
    await billable(liveSub, "VC-26-NN2346", liveBusiness, "ACTIVE", true)
    const liveEntitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await entitlement(liveEntitlement, liveBusiness, liveLocation, liveSub, "COMMERCIAL_SUBSCRIPTION")
    await db.exec("set local session_replication_role = origin")
    expect(await rejected(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ($1, $2, $3, 'LIVE')`,
      [liveEntitlement, liveBusiness, liveLocation],
    )).toMatch(/LIVE|check constraint/i)
    await allowLive()
    await db.exec(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at,
        customer_confirmed_at, provider_binding_ref, provider_test_call_ref, provider_test_outcome,
        agent_test_passed_at, live_at
      ) values (
        '${liveEntitlement}', '${liveBusiness}', '${liveLocation}', 'LIVE',
        now(), now(), now(), now(), now(), '${binding}', '${testCall}', 'PASSED', now(), now()
      )`,
    )
    const liveGuard = await guardCoverage({
      active: true,
      location: liveLocation,
      business: liveBusiness,
      paidThrough: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const waitingSub = randomUUID()
    await pilotSubscription(waitingSub, "VC-26-PQ2346", waitingBusiness, completePlan, 1, "BOTH")
    const waitingEntitlement = randomUUID()
    await entitlement(waitingEntitlement, waitingBusiness, waitingLocation, waitingSub, "NON_BILLABLE_PILOT")
    await readyProvision(waitingEntitlement, waitingBusiness, waitingLocation, "READY_FOR_PROVIDER_VERIFICATION", false)
    const waitingGuard = await guardCoverage({
      active: false,
      location: waitingLocation,
      business: waitingBusiness,
      paidThrough: new Date().toISOString(),
    })
    await db.query(
      `insert into public.bundle_guard_allocations(
        subscription_id, customer_id, business_id, location_id, state, standalone_guard_subscription_id
      ) values ($1, $2, $3, $4, 'PREVIEW', $5)`,
      [waitingSub, alex, waitingBusiness, waitingLocation, waitingGuard.guardSub],
    )
    const guardBefore = await rows<{ state: string; paid: string }>(
      `select c.state, b.paid_through_at::text as paid
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       where c.id = $1`,
      [liveGuard.coverage],
    )

    const seen = await products(alexSession)
    const twins = (seen?.businesses ?? []).filter(business => business.businessName === "Harbour Bakery" && business.telloya.locations.length === 1 && business.telloya.locations[0]?.locationName === "High Street" && business.guard.locations.length === 1)
    expect(twins).toHaveLength(2)
    const live = twins.find(business => business.telloya.locations[0]?.status === "active")
    const waiting = twins.find(business => business.telloya.locations[0]?.status === "ready_for_provider")
    expect(live?.telloya.status).toBe("active")
    expect(live?.telloya.locations).toHaveLength(1)
    expect(live?.guard.status).toBe("active")
    expect(live?.guard.locations[0]).toMatchObject({
      locationName: "High Street",
      status: "active",
      monitoringRecorded: true,
    })
    expect(waiting?.telloya.locations).toHaveLength(1)
    expect(waiting?.telloya.status).not.toBe("active")
    expect(waiting?.guard.locations[0]).toMatchObject({
      locationName: "High Street",
      status: "pending",
      monitoringRecorded: false,
      allocation: "preview",
      nextStep: "Guard monitoring is not active from this bundle.",
    })
    expect(waiting?.guard.status).not.toBe("active")
    const serialised = JSON.stringify(seen)
    expect(serialised).not.toContain("businessId")
    expect(serialised).not.toContain(liveBusiness)
    expect(serialised).not.toContain(waitingBusiness)
    expect(serialised).not.toContain(liveLocation)
    expect(serialised).not.toContain(waitingLocation)
    expect(serialised).not.toMatch(/cus_|sub_|si_/)
    expect(serialised).not.toContain(binding)
    expect(serialised).not.toContain(testCall)
    expect(serialised).not.toContain(providerEvent)
    expect(serialised).not.toContain("4900")
    expect(await rows(
      `select c.state, b.paid_through_at::text as paid
       from public.guard_coverages c
       join public.guard_billing b on b.coverage_id = c.id
       where c.id = $1`,
      [liveGuard.coverage],
    )).toEqual(guardBefore)

    await db.exec("alter table public.product_entitlements rename to product_entitlements_hidden")
    const telloyaDown = await products(alexSession)
    expect(telloyaDown?.reads).toEqual({ telloya: "unavailable", guard: "ok" })
    const guardTwins = (telloyaDown?.businesses ?? []).filter(business => business.businessName === "Harbour Bakery")
    expect(guardTwins).toHaveLength(2)
    expect(guardTwins.map(business => business.telloya.status)).toEqual(["unavailable", "unavailable"])
    expect(guardTwins.map(business => business.guard.locations[0]?.monitoringRecorded).sort()).toEqual([false, true])
    expect(guardTwins.find(business => business.guard.locations[0]?.allocation === "preview")?.guard.locations[0]?.status).not.toBe("active")
    expect(JSON.stringify(telloyaDown)).not.toContain(liveBusiness)
    await db.exec("alter table public.product_entitlements_hidden rename to product_entitlements")

    await db.exec("alter table public.guard_coverages rename to guard_coverages_hidden")
    const guardDown = await products(alexSession)
    expect(guardDown?.reads).toEqual({ telloya: "ok", guard: "unavailable" })
    const telloyaTwins = (guardDown?.businesses ?? []).filter(business => business.telloya.locations.some(location => location.locationName === "High Street" && (location.status === "active" || location.status === "ready_for_provider")))
    expect(telloyaTwins).toHaveLength(2)
    expect(telloyaTwins.map(business => business.guard.status)).toEqual(["unavailable", "unavailable"])
    expect(telloyaTwins.map(business => business.telloya.locations[0]?.status).sort()).toEqual(["active", "ready_for_provider"])
    expect(JSON.stringify(guardDown?.businesses.map(business => business.guard))).not.toContain("not_subscribed")
    await db.exec("alter table public.guard_coverages_hidden rename to guard_coverages")
  })

  it("projects an accepted or payment-pending subscription with no entitlement as pending", async () => {
    const before = await counts()
    const offered = randomUUID()
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, cadence_snapshot, terms_ref, pilot_ends_at
      ) values ($1, 'VC-26-RS2346', $2, $3, 'VOICE', $4, 'NON_BILLABLE_PILOT', 'DRAFT', null, 'GBP', 'MONTH', 'TELLOYA-TERMS-1', now() + interval '14 days')`,
      [offered, alex, bakery, telloyaPlan],
    )
    await db.exec(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ('${offered}', 'TELLOYA', 1, 5)`,
    )
    await db.query("update public.commercial_subscriptions set state = 'OFFERED' where id = $1", [offered])
    const quoted = await products(alexSession)
    expect(quoted?.businesses ?? []).toEqual([])
    expect(JSON.stringify(quoted)).not.toContain("pending")
    expect(JSON.stringify(quoted)).not.toContain("active")

    await db.query("update public.commercial_subscriptions set state = 'ACCEPTED' where id = $1", [offered])
    const accepted = await products(alexSession)
    expect(telloyaLocations(accepted, "Harbour Bakery")).toEqual({ status: "pending", locations: [] })
    expect(accepted?.businesses).toHaveLength(1)
    expect(guardBusiness(accepted, "Harbour Bakery")?.status).toBe("not_subscribed")
    expect(JSON.stringify(accepted)).not.toMatch(/cus_|sub_|si_/)
    expect(JSON.stringify(accepted)).not.toContain("4900")
    expect(JSON.stringify(accepted)).not.toContain("businessId")

    const paying = randomUUID()
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values ($1, 'VC-26-TU2346', $2, $3, 'VOICE', $4, 'BILLABLE', 'DRAFT', 4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1')`,
      [paying, alex, yard, telloyaPlan],
    )
    await db.exec(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ('${paying}', 'TELLOYA', 1, 5)`,
    )
    await db.query("update public.commercial_subscriptions set state = 'PAYMENT_PENDING' where id = $1", [paying])
    const pending = await products(alexSession)
    expect(telloyaLocations(pending, "Harbour Bakery")).toEqual({ status: "pending", locations: [] })
    expect(telloyaLocations(pending, "North Yard")).toEqual({ status: "pending", locations: [] })
    expect(pending?.businesses).toHaveLength(2)
    expect(pending?.businesses.every(business => business.telloya.status !== "active")).toBe(true)
    expect(pending?.businesses.every(business => business.guard.status === "not_subscribed")).toBe(true)
    expect(JSON.stringify(pending)).not.toContain("4900")
    expect(JSON.stringify(pending)).not.toMatch(/cus_|sub_|si_/)
    expect(await rows<{ entitlements: number }>(
      "select count(*)::int as entitlements from public.product_entitlements where commercial_subscription_id in ($1, $2)",
      [offered, paying],
    )).toEqual([{ entitlements: 0 }])
    expect(await counts()).toEqual({ ...before, subscriptions: before.subscriptions + 2 })
  })

  it("lets a newer accepted subscription replace a closed entitlement without a second aggregate", async () => {
    const historical = randomUUID()
    await pilotSubscription(historical, "VC-26-VW2346", bakery, telloyaPlan, 2, "TELLOYA")
    const expiredId = randomUUID()
    const revokedId = randomUUID()
    await entitlement(expiredId, bakery, high, historical, "NON_BILLABLE_PILOT")
    await entitlement(revokedId, bakery, dock, historical, "NON_BILLABLE_PILOT")
    await db.query(
      "update public.product_entitlements set state = 'EXPIRED', eligible_to = now() - interval '1 hour' where id = $1",
      [expiredId],
    )
    await db.query(
      `update public.product_entitlements
       set state = 'REVOKED', revoked_at = now(), revoked_by = $2, revocation_reason = $3
       where id = $1`,
      [revokedId, actor, "Historical entitlement closed before the replacement."],
    )
    const closed = await products(alexSession)
    expect(closed?.businesses).toHaveLength(1)
    expect(telloyaLocations(closed, "Harbour Bakery")?.status).toBe("expired")
    expect(telloyaLocations(closed, "Harbour Bakery")?.locations.map(location => location.status).sort()).toEqual(["cancelled", "expired"])

    const incoming = randomUUID()
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, cadence_snapshot, terms_ref, pilot_ends_at, succeeds_subscription_id
      ) values ($1, 'VC-26-XY2346', $2, $3, 'VOICE', $4, 'NON_BILLABLE_PILOT', 'DRAFT', null, 'GBP', 'MONTH', 'TELLOYA-TERMS-1', now() + interval '14 days', $5)`,
      [incoming, alex, bakery, telloyaPlan, historical],
    )
    await db.exec(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ('${incoming}', 'TELLOYA', 1, 5)`,
    )
    const draft = await products(alexSession)
    expect(draft?.businesses).toHaveLength(1)
    expect(telloyaLocations(draft, "Harbour Bakery")?.status).toBe("expired")
    expect(JSON.stringify(draft)).not.toContain("pending")

    await db.query("update public.commercial_subscriptions set state = 'OFFERED' where id = $1", [incoming])
    const offered = await products(alexSession)
    expect(offered?.businesses).toHaveLength(1)
    expect(telloyaLocations(offered, "Harbour Bakery")?.status).toBe("expired")
    expect(JSON.stringify(offered)).not.toContain("pending")

    await db.query("update public.commercial_subscriptions set state = 'ACCEPTED' where id = $1", [incoming])
    const accepted = await products(alexSession)
    expect(accepted?.businesses).toHaveLength(1)
    expect(telloyaLocations(accepted, "Harbour Bakery")).toEqual({ status: "pending", locations: [] })
    expect(guardBusiness(accepted, "Harbour Bakery")?.status).toBe("not_subscribed")

    await db.query("update public.commercial_subscriptions set state = 'PAYMENT_PENDING' where id = $1", [incoming])
    const pending = await products(alexSession)
    expect(pending?.businesses).toHaveLength(1)
    expect(telloyaLocations(pending, "Harbour Bakery")).toEqual({ status: "pending", locations: [] })
    const serialised = JSON.stringify(pending)
    expect(serialised).not.toContain("expired")
    expect(serialised).not.toContain("cancelled")
    expect(serialised).not.toContain("businessId")
    expect(serialised).not.toContain(bakery)
    expect(serialised).not.toContain(historical)
    expect(serialised).not.toContain(incoming)
    expect(serialised).not.toContain(alex)
    expect(serialised).not.toContain("alex.products@example.com")
    expect(serialised).not.toMatch(/cus_|sub_|si_/)
    expect(serialised).not.toContain(binding)
    expect(serialised).not.toContain(testCall)
    expect(serialised).not.toContain(providerEvent)
    expect(serialised).not.toContain("4900")
    expect(await rows<{ entitlements: number }>(
      "select count(*)::int as entitlements from public.product_entitlements where commercial_subscription_id = $1",
      [incoming],
    )).toEqual([{ entitlements: 0 }])
  })

  it("keeps one active aggregate while a replacement subscription is pending", async () => {
    const current = randomUUID()
    await billable(current, "VC-26-ZA2348", yard, "ACTIVE", true)
    const currentEntitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await entitlement(currentEntitlement, yard, yardLoc, current, "COMMERCIAL_SUBSCRIPTION")
    await db.exec("set local session_replication_role = origin")
    expect(await rejected(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ($1, $2, $3, 'LIVE')`,
      [currentEntitlement, yard, yardLoc],
    )).toMatch(/LIVE|check constraint/i)
    await allowLive()
    await db.exec(
      `insert into public.service_provisions(
        entitlement_id, business_id, location_id, state,
        profile_ready_at, agent_configured_at, number_allocated_at, forwarding_instructed_at,
        customer_confirmed_at, provider_binding_ref, provider_test_call_ref, provider_test_outcome,
        agent_test_passed_at, live_at
      ) values (
        '${currentEntitlement}', '${yard}', '${yardLoc}', 'LIVE',
        now(), now(), now(), now(), now(), '${binding}', '${testCall}', 'PASSED', now(), now()
      )`,
    )
    const open = await products(alexSession)
    expect(open?.businesses).toHaveLength(1)
    expect(telloyaLocations(open, "North Yard")?.status).toBe("active")
    expect(telloyaLocations(open, "North Yard")?.locations).toEqual([
      { locationName: "Hidden Yard", status: "active", nextStep: null },
    ])

    const replacement = randomUUID()
    await db.query(
      `insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref, succeeds_subscription_id
      ) values (
        $1, 'VC-26-BC2349', $2, $3, 'VOICE', $4, 'BILLABLE', 'DRAFT',
        4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-1', $5
      )`,
      [replacement, alex, yard, telloyaPlan, current],
    )
    await db.exec(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ('${replacement}', 'TELLOYA', 1, 5)`,
    )
    await db.query("update public.commercial_subscriptions set state = 'PAYMENT_PENDING' where id = $1", [replacement])
    const pending = await products(alexSession)
    expect(pending?.businesses).toHaveLength(1)
    expect(pending?.businesses[0]?.businessName).toBe("North Yard")
    expect(telloyaLocations(pending, "North Yard")).toEqual({
      status: "active",
      locations: [{ locationName: "Hidden Yard", status: "active", nextStep: null }],
    })
    const serialised = JSON.stringify(pending)
    expect(serialised).not.toContain("pending")
    expect(serialised).not.toContain("businessId")
    expect(serialised).not.toContain(yard)
    expect(serialised).not.toContain(current)
    expect(serialised).not.toContain(replacement)
    expect(serialised).not.toContain(alex)
    expect(serialised).not.toContain("alex.products@example.com")
    expect(serialised).not.toMatch(/cus_|sub_|si_/)
    expect(serialised).not.toContain(binding)
    expect(serialised).not.toContain(testCall)
    expect(serialised).not.toContain(providerEvent)
    expect(serialised).not.toContain("4900")
    expect(await rows<{ entitlements: number }>(
      "select count(*)::int as entitlements from public.product_entitlements where commercial_subscription_id = $1",
      [replacement],
    )).toEqual([{ entitlements: 0 }])
  })
})

async function rejected(query: string, params: unknown[] = []): Promise<string> {
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

async function counts() {
  const found = await rows<{
    subscriptions: number
    entitlements: number
    provisions: number
    allocations: number
    coverages: number
    billing: number
  }>(
    `select
      (select count(*)::int from public.commercial_subscriptions) as subscriptions,
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.bundle_guard_allocations) as allocations,
      (select count(*)::int from public.guard_coverages) as coverages,
      (select count(*)::int from public.guard_billing) as billing`,
  )
  return found[0]
}
