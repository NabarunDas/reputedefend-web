import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a033a000-0000-4000-8000-0000000000a1"
const alexAuth = "a033a000-0000-4000-8000-0000000000d4"
const blake = "a033a000-0000-4000-8000-0000000000b2"
const blakeAuth = "a033a000-0000-4000-8000-0000000000d5"
const actor = "a033a000-0000-4000-8000-0000000000aa"
const adminUser = "11111111-1111-4111-8111-111111111111"
const bakery = "a033a000-0000-4000-8000-000000000011"
const twin = "a033a000-0000-4000-8000-000000000012"
const kitchen = "a033a000-0000-4000-8000-000000000015"
const other = "a033a000-0000-4000-8000-000000000016"
const high = "a033a000-0000-4000-8000-000000000021"
const dock = "a033a000-0000-4000-8000-000000000022"
const oven = "a033a000-0000-4000-8000-000000000024"
const counter = "a033a000-0000-4000-8000-000000000025"
const yard = "a033a000-0000-4000-8000-000000000026"
const stripeCustomer = "cus_NffrFeUfNV2Hib"
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const adminToken = "a".repeat(64)
const challenge = "c".repeat(64)
const reason = "Begin setup after the verified payment."
const sqlPath = new URL("../../../../supabase/migrations/20261105120000_admin_commercial_begin_setup_v1.sql", import.meta.url)

type Row = Record<string, unknown>
let session = ""
let planNumber = 400
let refNumber = 0
let serial = 0

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function nextRef() {
  let cursor = refNumber + 80
  refNumber += 1
  let body = ""
  for (let index = 0; index < 6; index += 1) {
    body = alphabet[cursor % alphabet.length] + body
    cursor = Math.floor(cursor / alphabet.length)
  }
  return `VC-26-${body}`
}

function stripeIds() {
  serial += 1
  const suffix = serial.toString(36).toUpperCase().padStart(4, "A").replace(/0/g, "A").replace(/1/g, "B")
  return {
    priceId: `price_Begin${suffix}`,
    sessionId: `cs_test_begin${suffix}`,
    eventId: `evt_begin${suffix}`,
    invoiceId: `in_begin${suffix}`,
    stripeSubscriptionId: `sub_begin${suffix}`,
  }
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(randomBytes(32).toString("hex"))
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", [email, pending])
  if (started.status !== "ok") throw new Error(started.status)
  const confirmed = await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(confirmed.status)
  const sessionHash = hash(randomBytes(32).toString("hex"))
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(JSON.stringify(finished))
  return sessionHash
}

async function agreement(product: "TELLOYA" | "COMPLETE", versionRef: string) {
  const title = `${product === "TELLOYA" ? "Telloya" : "Complete"} service agreement`
  const body = `This agreement covers the named ${product === "TELLOYA" ? "Telloya" : "Complete"} service for the selected locations only.`
  const cancellation = "Cancel in writing before the next billing date."
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  await db.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      $1, $2, $3, $4, $5, $6,
      admin_private.commercial_agreement_hash_v1($2, $3, $4, $5, $6, $7::jsonb),
      $7::jsonb, 'APPROVED', $8, now()
    )`,
    [randomUUID(), product, versionRef, title, body, cancellation, confirmations, actor],
  )
}

async function offer(product: "TELLOYA" | "COMPLETE", business: string, locations: string[], amount: number) {
  const ref = nextRef()
  const terms = `${product}-BEG-${ref.slice(-4)}`
  const guardQuantity = product === "COMPLETE" ? 1 : 0
  const id = randomUUID()
  const version = ++planNumber
  const telloyaQuantity = locations.length
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, $2, $3, 'DRAFT', now() - interval '30 days' + make_interval(mins => $3), 'MONTH', 'GBP', $4, 'NOT_APPLICABLE', $5)`,
    [id, product, version, amount, terms],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', $2, 'LOCATION')`,
    [id, telloyaQuantity],
  )
  if (product === "COMPLETE") {
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'GUARD', 1, 'LOCATION')`,
      [id],
    )
  }
  await db.query(
    `update public.plan_versions set effective_to = now() - interval '30 days' + make_interval(mins => $2)
     where product_code = $1 and status = 'APPROVED' and effective_to is null`,
    [product, version],
  )
  await db.query(`update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`, [id, actor])
  await agreement(product, terms)
  const subscription = randomUUID()
  await db.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
    ) values ($1, $2, $3, $4, 'VOICE', $5, 'BILLABLE', 'DRAFT', $6, 'GBP', 'NOT_APPLICABLE', 'MONTH', $7)`,
    [subscription, ref, alex, business, id, amount, terms],
  )
  await db.query(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ($1, 'TELLOYA', $2, $2)`,
    [subscription, telloyaQuantity],
  )
  if (guardQuantity > 0) {
    await db.query(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'GUARD', 1, 1)`,
      [subscription],
    )
  }
  await db.query(`update public.commercial_subscriptions set state = 'OFFERED' where id = $1`, [subscription])
  const request = randomUUID()
  await db.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.begin@example.com', $4, 'VOICE', 'OFFERED', $5)`,
    [request, alex, business, product, subscription],
  )
  for (const location of locations) {
    await db.query(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)`,
      [request, location],
    )
  }
  const guardUnit = guardQuantity > 0 ? 999 : null
  const base = amount - (guardUnit ?? 0) * guardQuantity
  await db.query(
    `insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    ) values (
      $1, $2, 'GROWTH', 'Growth', 300, false, $3, $4, 25,
      admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, $3, $4, 25),
      'APPROVED', $5, now()
    )`,
    [randomUUID(), id, base, guardUnit, actor],
  )
  const versionRow = await rows<{ record_version: number }>(
    `select record_version from public.commercial_subscriptions where id = $1`,
    [subscription],
  )
  return {
    subscription, ref, amount, product, business, request, locations,
    version: versionRow[0].record_version,
    conditions: {
      tier: "Growth", includedMinutes: 300, minutesRollover: false, baseAmountMinor: base,
      guardIncluded: guardQuantity > 0, guardUnitMinor: guardUnit, guardQuantity,
      overagePermitted: true, overageRateMinor: 25,
    },
  }
}

function consent(prepared: Awaited<ReturnType<typeof offer>>) {
  return {
    offerVersion: prepared.version,
    priceMinor: prepared.amount,
    taxBehaviour: "NOT_APPLICABLE",
    taxMinor: null,
    cadence: "MONTH",
    agreementRef: `${prepared.product}-BEG-${prepared.ref.slice(-4)}`,
    agreementAccepted: true,
    recurringConsent: true,
    confirmations: { business_authority: true },
    conditions: { ...prepared.conditions, overageOptIn: false, overageCapMinor: null },
  }
}

async function prepareCheckout(options: {
  product?: "TELLOYA" | "COMPLETE"
  business?: string
  locations?: string[]
  amount?: number
} = {}) {
  const product = options.product ?? "TELLOYA"
  const ids = stripeIds()
  const prepared = await offer(
    product,
    options.business ?? (product === "COMPLETE" ? kitchen : bakery),
    options.locations ?? (product === "COMPLETE" ? [oven, counter] : [high, dock]),
    options.amount ?? (product === "COMPLETE" ? 14900 : 7900),
  )
  const accepted = await rpc<Row>("customer_portal_commercial_offer_command_v1", [
    session, randomUUID(), prepared.ref, JSON.stringify(consent(prepared)),
  ])
  if (accepted?.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
  const started = await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), prepared.ref])
  if (started?.status !== "success") throw new Error(`prepare ${JSON.stringify(started)}`)
  const priced = await rpc<Row>("commercial_payment_record_price_v1", [started.priceOperationId, ids.priceId, `prod_${ids.priceId.slice(6, 18)}`])
  if (priced?.status !== "success") throw new Error(`price ${JSON.stringify(priced)}`)
  await db.query(
    `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2) on conflict (customer_id) do nothing`,
    [alex, stripeCustomer],
  )
  const recorded = await rpc<Row>("commercial_payment_record_checkout_v1", [started.providerOperationId, ids.sessionId])
  if (recorded?.status !== "success") throw new Error(`checkout ${JSON.stringify(recorded)}`)
  return { prepared, started, ...ids, amount: prepared.amount }
}

function facts(armed: Awaited<ReturnType<typeof prepareCheckout>>, overrides: Record<string, unknown> = {}) {
  return {
    eventId: armed.eventId,
    invoiceId: armed.invoiceId,
    checkoutSessionId: armed.sessionId,
    stripeCustomerId: stripeCustomer,
    stripeSubscriptionId: armed.stripeSubscriptionId,
    checkoutSubscriptionId: armed.stripeSubscriptionId,
    stripePriceId: armed.priceId,
    currency: "gbp",
    invoiceStatus: "paid",
    amountDueMinor: armed.amount,
    amountPaidMinor: armed.amount,
    quantity: 1,
    lineCount: 1,
    discountMinor: 0,
    taxMinor: 0,
    periodStart,
    periodEnd,
    billingReason: "subscription_create",
    livemode: false,
    automaticTax: false,
    trial: false,
    refunded: false,
    disputed: false,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    schedulePresent: false,
    subscriptionLivemode: false,
    subscriptionCustomerId: stripeCustomer,
    subscriptionPriceId: armed.priceId,
    subscriptionQuantity: 1,
    subscriptionPeriodStart: periodStart,
    subscriptionPeriodEnd: periodEnd,
    commercialCustomerId: alex,
    commercialSubscriptionId: armed.prepared.subscription,
    acceptanceId: String(armed.started.acceptanceId),
    checkoutOperationId: String(armed.started.providerOperationId),
    checkoutMode: "subscription",
    checkoutStatus: "complete",
    checkoutPaymentStatus: "paid",
    checkoutLivemode: false,
    checkoutCustomerId: stripeCustomer,
    conflictingMetadata: false,
    checkoutMetadataCustomerId: alex,
    checkoutMetadataSubscriptionId: armed.prepared.subscription,
    checkoutMetadataAcceptanceId: String(armed.started.acceptanceId),
    checkoutMetadataOperationId: String(armed.started.providerOperationId),
    subscriptionMetadataCustomerId: alex,
    subscriptionMetadataSubscriptionId: armed.prepared.subscription,
    subscriptionMetadataAcceptanceId: String(armed.started.acceptanceId),
    subscriptionMetadataOperationId: String(armed.started.providerOperationId),
    ...overrides,
  }
}

async function pay(options: Parameters<typeof prepareCheckout>[0] = {}) {
  const armed = await prepareCheckout(options)
  await rpc("payment_receive_stripe_event_v1", [armed.eventId, "invoice.paid", armed.invoiceId, false])
  const leased = await rpc<Row>("commercial_payment_invoice_claim_v1", [armed.eventId, armed.priceId, stripeCustomer])
  const settled = await rpc<Row>("commercial_payment_settle_initial_invoice_v1", [
    leased.jobId, leased.leaseToken, JSON.stringify(facts(armed)),
  ])
  if (settled?.status !== "settled") throw new Error(`settle ${JSON.stringify(settled)}`)
  return armed
}

async function versions(subscription: string) {
  const found = await rows<{ subscription_version: number; request_id: string; request_version: number; amount_minor: number }>(
    `select subscription.record_version as subscription_version, request.id as request_id,
            request.record_version as request_version, subscription.amount_minor
     from public.commercial_subscriptions subscription
     join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
     where subscription.id = $1 and request.state not in ('CLOSED', 'DECLINED')`,
    [subscription],
  )
  return found[0]
}

function commandPayload(current: Awaited<ReturnType<typeof versions>>, business: string, extra: Record<string, unknown> = {}) {
  return {
    customerId: alex,
    businessId: business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    reason,
    ...extra,
  }
}

async function begin(armed: Awaited<ReturnType<typeof pay>>, request = randomUUID(), extra: Record<string, unknown> = {}, version?: number) {
  const current = await versions(armed.prepared.subscription)
  return rpc<Row>("admin_commercial_begin_setup_v1", [
    adminToken,
    request,
    armed.prepared.subscription,
    version ?? current.subscription_version,
    JSON.stringify(commandPayload(current, armed.prepared.business, extra)),
  ])
}

async function effects(subscription: string) {
  const found = await rows<{
    entitlements: number
    guard_entitlements: number
    provisions: number
    live: number
    profile: number
    provider_fields: number
    communications: number
    guard_coverages: number
    allocations: number
    cases: number
    evidence: number
    amount_minor: number
    request_state: string
  }>(
    `select
      (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1 and component_code = 'TELLOYA') as entitlements,
      (select count(*)::int from public.product_entitlements where commercial_subscription_id = $1 and component_code = 'GUARD') as guard_entitlements,
      (select count(*)::int from public.service_provisions provision
        join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
        where entitlement.commercial_subscription_id = $1) as provisions,
      (select count(*)::int from public.service_provisions provision
        join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
        where entitlement.commercial_subscription_id = $1 and provision.state = 'LIVE') as live,
      (select count(*)::int from public.service_provisions provision
        join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
        where entitlement.commercial_subscription_id = $1 and provision.state = 'PROFILE_REQUIRED'
          and provision.profile_ready_at is null and provision.agent_configured_at is null
          and provision.number_allocated_at is null and provision.provider_binding_ref is null
          and provision.forwarding_instructed_at is null and provision.provider_test_call_ref is null
          and provision.customer_confirmed_at is null and provision.live_at is null) as profile,
      (select count(*)::int from public.service_provisions where provider_binding_ref is not null or number_allocated_at is not null) as provider_fields,
      (select count(*)::int from public.communications) as communications,
      (select count(*)::int from public.guard_coverages) as guard_coverages,
      (select count(*)::int from public.bundle_guard_allocations) as allocations,
      (select count(*)::int from public.cases) as cases,
      (select count(*)::int from public.commercial_payment_evidence where subscription_id = $1) as evidence,
      (select amount_minor from public.commercial_subscriptions where id = $1) as amount_minor,
      (select state from public.onboarding_requests where commercial_subscription_id = $1 and state <> 'DECLINED' order by created_at desc limit 1) as request_state`,
    [subscription],
  )
  return found[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.begin@example.com', now()),
      ('${blakeAuth}', 'blake.begin@example.com', now()),
      ('${actor}', 'actor.begin@example.com', now()),
      ('${adminUser}', 'admin@profilerelaunch.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${adminUser}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.begin@example.com'),
      ('${blake}', 'Blake Porter', 'blake.begin@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.begin@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${blake}', 'email', 'blake.begin@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${twin}', 'Harbour Bakery'),
      ('${kitchen}', 'Complete Kitchen'),
      ('${other}', 'Other Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${yard}', '${twin}', 'GB', 'Yard'),
      ('${oven}', '${kitchen}', 'GB', 'Oven'),
      ('${counter}', '${kitchen}', 'GB', 'Counter');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${twin}', 'verified', now(), '${actor}', 'Mailbox already proved for the second Bakery'),
      ('${alex}', '${kitchen}', 'verified', now(), '${actor}', 'Mailbox already proved for Kitchen'),
      ('${blake}', '${other}', 'verified', now(), '${actor}', 'Mailbox already proved for Other Bakery');
  `)
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  session = await portalSession("alex.begin@example.com", alexAuth)
  if (await rpc("admin_begin_otp_v1", [challenge]) !== adminUser) throw new Error("admin otp did not start")
  if (await rpc("admin_attempt_otp_v1", [challenge]) !== adminUser) throw new Error("admin otp was not attempted")
  if (await rpc("admin_finish_otp_v1", [challenge, adminToken, adminUser]) !== true) throw new Error("admin otp did not finish")
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT begin_setup")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT begin_setup")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("audited admin begin setup", () => {
  it("keeps the command service-role only and names the unapplied boundary", async () => {
    const source = readFileSync(sqlPath, "utf8")
    expect(source).toContain("Do not apply 20261105120000 to DEV")
    expect(source).toContain("Do not apply 20261105120000 to Production")
    expect(source).toContain("03A-03-03-02-02")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED/i)
    const privilege = await rows<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select
        has_function_privilege('anon', 'public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as service`,
    )
    expect(privilege[0]).toEqual({ anon: false, authenticated: false, service: true })
    expect(await rpc("admin_commercial_begin_setup_v1", ["b".repeat(64), randomUUID(), randomUUID(), 1, JSON.stringify({ reason })] )).toMatchObject({ status: "unauthorized" })
  })

  it("starts Telloya setup for every selected location and leaves the service inactive", async () => {
    const armed = await pay()
    const before = await effects(armed.prepared.subscription)
    const started = await begin(armed)
    expect(started).toMatchObject({
      status: "success",
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm business preferences",
      onboardingState: "PROVISIONING",
      provisionState: "PROFILE_REQUIRED",
      entitlementCount: 2,
    })
    expect(typeof started.startedAt).toBe("string")
    const after = await effects(armed.prepared.subscription)
    expect(after.entitlements).toBe(2)
    expect(after.provisions).toBe(2)
    expect(after.profile).toBe(2)
    expect(after.live).toBe(0)
    expect(after.provider_fields).toBe(0)
    expect(after.guard_entitlements).toBe(0)
    expect(after.allocations).toBe(before.allocations)
    expect(after.guard_coverages).toBe(before.guard_coverages)
    expect(after.communications).toBe(before.communications)
    expect(after.cases).toBe(before.cases)
    expect(after.evidence).toBe(1)
    expect(after.amount_minor).toBe(before.amount_minor)
    expect(after.request_state).toBe("PROVISIONING")
    const states = await rows<{ state: string }>(
      `select entitlement.state from public.product_entitlements entitlement
       where entitlement.commercial_subscription_id = $1 order by entitlement.location_id`,
      [armed.prepared.subscription],
    )
    expect(states.map(row => row.state)).toEqual(["PENDING", "PENDING"])
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const item = queue?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(item).toMatchObject({
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm business preferences",
    })
    expect(typeof item?.setupStartedAt).toBe("string")
    const handover = await rpc<{ subscriptions: Row[] }>("customer_portal_setup_handover_v1", [session])
    const customer = handover?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    expect(customer).toMatchObject({
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      financialStatus: "verified",
      paymentScope: "initial_settlement",
    })
    const checklist = customer?.checklist as Row[]
    expect(checklist.map(step => step.state)).toEqual(["complete", "planned", "planned", "planned", "planned", "planned"])
    const products = await rpc<Row>("customer_portal_products_v1", [session])
    const text = JSON.stringify(products)
    expect(text).not.toMatch(/"status":"active"/)
    expect(text).toContain("Telloya is not active yet.")
  })

  it("starts a paid Complete subscription without creating Guard coverage", async () => {
    const armed = await pay({ product: "COMPLETE" })
    const started = await begin(armed)
    expect(started).toMatchObject({ status: "success", entitlementCount: 2, operationalStatus: "setup_started" })
    const after = await effects(armed.prepared.subscription)
    expect(after.entitlements).toBe(2)
    expect(after.guard_entitlements).toBe(0)
    expect(after.allocations).toBe(0)
    expect(after.guard_coverages).toBe(0)
    expect(after.live).toBe(0)
    const handover = await rpc<{ subscriptions: Row[] }>("customer_portal_setup_handover_v1", [session])
    const customer = handover?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    expect(customer?.guard).toMatchObject({ included: true, monitoringActive: false, assignment: "pending_confirmation", quantity: 1 })
    expect((customer?.guard as Row).locations).toEqual([])
  })

  it("returns the recorded outcome for the same request and conflicts when the payload changes", async () => {
    const armed = await pay({ locations: [high] })
    const request = randomUUID()
    const current = await versions(armed.prepared.subscription)
    const body = JSON.stringify(commandPayload(current, armed.prepared.business))
    const first = await rpc<Row>("admin_commercial_begin_setup_v1", [
      adminToken, request, armed.prepared.subscription, current.subscription_version, body,
    ])
    const second = await rpc<Row>("admin_commercial_begin_setup_v1", [
      adminToken, request, armed.prepared.subscription, current.subscription_version, body,
    ])
    expect(second).toEqual(first)
    expect(first).toMatchObject({ status: "success", entitlementCount: 1 })
    expect((await effects(armed.prepared.subscription)).entitlements).toBe(1)
    const changed = await rpc<Row>("admin_commercial_begin_setup_v1", [
      adminToken, request, armed.prepared.subscription, current.subscription_version,
      JSON.stringify(commandPayload(current, armed.prepared.business, { reason: "Begin setup with a different note." })),
    ])
    expect(changed).toEqual({ status: "conflict" })
    expect((await effects(armed.prepared.subscription)).entitlements).toBe(1)
    const again = await begin(armed)
    expect(again).toMatchObject({ status: "conflict", reason: "provision" })
    expect((await effects(armed.prepared.subscription)).entitlements).toBe(1)
  })

  it("rejects a stale subscription version without writing setup", async () => {
    const stale = await pay({ locations: [dock] })
    expect(await begin(stale, randomUUID(), {}, 1)).toMatchObject({ status: "conflict", reason: "version" })
    expect((await effects(stale.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects a revoked business membership", async () => {
    const revoked = await pay({ locations: [high] })
    await db.query(
      `update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where business_id = $1`,
      [bakery],
    )
    expect(await begin(revoked)).toMatchObject({ status: "denied", reason: "revoked" })
    expect((await effects(revoked.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects payment evidence that does not match the accepted amount", async () => {
    const unpaid = await pay({ locations: [dock] })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_payment_evidence set amount_minor = amount_minor - 1 where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await begin(unpaid)).toMatchObject({ status: "denied", reason: "payment" })
    expect((await effects(unpaid.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects an acceptance that names a different customer", async () => {
    const mismatched = await pay({ locations: [high] })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_offer_acceptances set customer_id = $2 where subscription_id = $1`, [mismatched.prepared.subscription, blake])
    await db.exec("set local session_replication_role = origin")
    expect(await begin(mismatched)).toMatchObject({ status: "denied", reason: "acceptance" })
    expect((await effects(mismatched.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects a selected location from another business", async () => {
    const foreign = await pay({ locations: [dock] })
    await db.query(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)`,
      [foreign.prepared.request, yard],
    )
    expect(await begin(foreign)).toMatchObject({ status: "denied", reason: "location" })
    expect((await effects(foreign.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects a command that names another customer and business", async () => {
    const crossed = await pay({ locations: [high] })
    expect(await begin(crossed, randomUUID(), { businessId: other, customerId: blake })).toMatchObject({ status: "denied", reason: "customer" })
    expect((await effects(crossed.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects a canceled subscription", async () => {
    const canceled = await pay({ locations: [dock] })
    await db.query(
      `update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`,
      [canceled.prepared.subscription],
    )
    expect(await begin(canceled)).toMatchObject({ status: "denied", reason: "inactive" })
    expect((await effects(canceled.prepared.subscription)).entitlements).toBe(0)
  })

  it("rejects a subscription whose recorded period has ended", async () => {
    const expired = await pay({ locations: [high] })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`,
      [expired.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await begin(expired)).toMatchObject({ status: "denied", reason: "expired" })
    expect((await effects(expired.prepared.subscription)).entitlements).toBe(0)
  })

  it("does not move an onboarding request that has not reached an offer", async () => {
    const early = await pay({ locations: [dock] })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.onboarding_requests set state = 'RECEIVED' where id = $1`, [early.prepared.request])
    await db.exec("set local session_replication_role = origin")
    expect(await begin(early)).toMatchObject({ status: "denied", reason: "lifecycle" })
    expect((await effects(early.prepared.subscription)).request_state).toBe("RECEIVED")
    expect((await effects(early.prepared.subscription)).entitlements).toBe(0)
  })

  it("moves an invited request into provisioning", async () => {
    const invited = await pay({ locations: [high] })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.onboarding_requests set state = 'INVITED' where id = $1`, [invited.prepared.request])
    await db.exec("set local session_replication_role = origin")
    expect(await begin(invited)).toMatchObject({ status: "success", onboardingState: "PROVISIONING", entitlementCount: 1 })
  })

  it("does not replace a Telloya provision that already exists", async () => {
    const occupied = await pay({ locations: [dock] })
    const entitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.product_entitlements(
        id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, $3, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', $4, 'PENDING')`,
      [entitlement, bakery, dock, occupied.prepared.subscription],
    )
    await db.query(
      `insert into public.service_provisions(entitlement_id, business_id, location_id, state) values ($1, $2, $3, 'NOT_STARTED')`,
      [entitlement, bakery, dock],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await begin(occupied)).toMatchObject({ status: "conflict", reason: "provision" })
    const states = await rows<{ state: string }>(`select state from public.service_provisions where location_id = $1`, [dock])
    expect(states.map(row => row.state)).toEqual(["NOT_STARTED"])
  })

  it("requires a recent Admin sign-in and does not consume the request", async () => {
    await db.query(`update public.admin_sessions set created_at = now() - interval '31 minutes' where token_hash = $1`, [adminToken])
    const staleSession = await pay({ locations: [high] })
    expect(await begin(staleSession)).toEqual({ status: "reauth_required" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_command_receipts`)).toEqual([{ count: 0 }])
    expect((await effects(staleSession.prepared.subscription)).entitlements).toBe(0)
  })

  it("rolls a partial entitlement insert back with the command receipt", async () => {
    const partial = await pay()
    await db.exec(`
      create function public.fail_second_entitlement_v1() returns trigger language plpgsql as $fn$
      begin
        if (select count(*) from public.product_entitlements where commercial_subscription_id = new.commercial_subscription_id) >= 1 then
          raise exception 'forced partial failure';
        end if;
        return new;
      end $fn$;
      create trigger fail_second_entitlement before insert on public.product_entitlements
      for each row execute function public.fail_second_entitlement_v1();
    `)
    await expect(begin(partial)).rejects.toThrow(/forced partial failure/)
    await db.exec("ROLLBACK TO SAVEPOINT begin_setup")
    await db.exec("SAVEPOINT begin_setup")
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.product_entitlements`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_command_receipts`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions`)).toEqual([{ count: 0 }])
  })

  it("leaves a Guard entitlement on the same location untouched", async () => {
    const armed = await pay({ locations: [high] })
    const guardEntitlement = randomUUID()
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.product_entitlements(
        id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) values ($1, $2, $3, 'GUARD', 'COMMERCIAL_SUBSCRIPTION', $4, 'PENDING')`,
      [guardEntitlement, bakery, high, armed.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await begin(armed)).toMatchObject({ status: "success", entitlementCount: 1 })
    const guard = await rows<{ state: string }>(`select state from public.product_entitlements where id = $1`, [guardEntitlement])
    expect(guard).toEqual([{ state: "PENDING" }])
    expect((await effects(armed.prepared.subscription)).guard_entitlements).toBe(1)
    expect((await effects(armed.prepared.subscription)).allocations).toBe(0)
  })
})
