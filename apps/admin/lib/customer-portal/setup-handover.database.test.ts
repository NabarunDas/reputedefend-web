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
const sqlPath = new URL("../../../../supabase/migrations/20261104220000_customer_commercial_setup_handover_v1.sql", import.meta.url)

type Row = Record<string, unknown>
let session = ""
let blakeSession = ""
let planNumber = 180
let refNumber = 0
let serial = 0

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function nextRef() {
  let cursor = refNumber + 200
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
    priceId: `price_Handover${suffix}`,
    sessionId: `cs_test_handover${suffix}`,
    eventId: `evt_handover${suffix}`,
    invoiceId: `in_handover${suffix}`,
    stripeSubscriptionId: `sub_handover${suffix}`,
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
  const terms = `${product}-HND-${ref.slice(-4)}`
  const guardQuantity = product === "COMPLETE" ? 1 : 0
  const id = randomUUID()
  const version = ++planNumber
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, $2, $3, 'DRAFT', now() - interval '30 days' + make_interval(mins => $3), 'MONTH', 'GBP', $4, 'NOT_APPLICABLE', $5)`,
    [id, product, version, amount, terms],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 2, 'LOCATION')`,
    [id],
  )
  if (product === "COMPLETE") {
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'GUARD', 2, 'LOCATION')`,
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
     values ($1, 'TELLOYA', 1, 2)`,
    [subscription],
  )
  if (guardQuantity > 0) {
    await db.query(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'GUARD', 1, 2)`,
      [subscription],
    )
  }
  await db.query(`update public.commercial_subscriptions set state = 'OFFERED' where id = $1`, [subscription])
  const request = randomUUID()
  await db.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.handover@example.com', $4, 'VOICE', 'OFFERED', $5)`,
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
    agreementRef: `${prepared.product}-HND-${prepared.ref.slice(-4)}`,
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

function commercialIdentity(armed: { prepared: { subscription: string }; started: Row }) {
  const customerId = alex
  const subscriptionId = armed.prepared.subscription
  const acceptanceId = String(armed.started.acceptanceId)
  const operationId = String(armed.started.providerOperationId)
  return {
    commercialCustomerId: customerId,
    commercialSubscriptionId: subscriptionId,
    acceptanceId,
    checkoutOperationId: operationId,
    checkoutMode: "subscription",
    checkoutStatus: "complete",
    checkoutPaymentStatus: "paid",
    checkoutLivemode: false,
    checkoutCustomerId: stripeCustomer,
    conflictingMetadata: false,
    checkoutMetadataCustomerId: customerId,
    checkoutMetadataSubscriptionId: subscriptionId,
    checkoutMetadataAcceptanceId: acceptanceId,
    checkoutMetadataOperationId: operationId,
    subscriptionMetadataCustomerId: customerId,
    subscriptionMetadataSubscriptionId: subscriptionId,
    subscriptionMetadataAcceptanceId: acceptanceId,
    subscriptionMetadataOperationId: operationId,
  }
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
    ...commercialIdentity(armed),
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

async function effects() {
  const found = await rows<{
    entitlements: number
    provisions: number
    live: number
    communications: number
    guard_coverages: number
    evidence: number
  }>(
    `select
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.service_provisions where state = 'LIVE') as live,
      (select count(*)::int from public.communications) as communications,
      (select count(*)::int from public.guard_coverages) as guard_coverages,
      (select count(*)::int from public.commercial_payment_evidence) as evidence`,
  )
  return found[0]
}

async function queue() {
  return rpc<{ items: Row[] } | null>("admin_commercial_setup_queue_v1", [adminToken])
}

async function handover(token = session) {
  return rpc<{ subscriptions: Row[] } | null>("customer_portal_setup_handover_v1", [token])
}

async function plant(subscription: string, business: string, location: string, state: string) {
  const entitlement = randomUUID()
  await db.exec("set local session_replication_role = replica")
  await db.query(
    `insert into public.product_entitlements(
      id, business_id, location_id, component_code, source_kind, commercial_subscription_id, state
    ) values ($1, $2, $3, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', $4, 'PENDING')`,
    [entitlement, business, location, subscription],
  )
  await db.query(
    `insert into public.service_provisions(entitlement_id, business_id, location_id, state)
     values ($1, $2, $3, $4)`,
    [entitlement, business, location, state],
  )
  await db.exec("set local session_replication_role = origin")
  return entitlement
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.handover@example.com', now()),
      ('${blakeAuth}', 'blake.handover@example.com', now()),
      ('${actor}', 'actor.handover@example.com', now()),
      ('${adminUser}', 'admin@profilerelaunch.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${adminUser}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.handover@example.com'),
      ('${blake}', 'Blake Porter', 'blake.handover@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.handover@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${blake}', 'email', 'blake.handover@example.com', '${actor}', 'Verified from a live call with the customer.');
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
  session = await portalSession("alex.handover@example.com", alexAuth)
  blakeSession = await portalSession("blake.handover@example.com", blakeAuth)
  if (await rpc("admin_begin_otp_v1", [challenge]) !== adminUser) throw new Error("admin otp did not start")
  if (await rpc("admin_attempt_otp_v1", [challenge]) !== adminUser) throw new Error("admin otp was not attempted")
  if (await rpc("admin_finish_otp_v1", [challenge, adminToken, adminUser]) !== true) throw new Error("admin otp did not finish")
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT handover")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT handover")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("commercial post-payment handover", () => {
  it("keeps the read functions service-role only and does not open LIVE", async () => {
    const source = readFileSync(sqlPath, "utf8")
    expect(source).toContain("Do not apply 20261104220000 to DEV")
    expect(source).toContain("Do not apply 20261104220000 to Production")
    expect(source).not.toMatch(/\bINSERT INTO\b|\bUPDATE\b|\bDELETE FROM\b/)
    const privilege = await rows<{
      admin_anon: boolean
      admin_auth: boolean
      admin_service: boolean
      customer_anon: boolean
      customer_auth: boolean
      customer_service: boolean
      private_service: boolean
    }>(
      `select
        has_function_privilege('anon', 'public.admin_commercial_setup_queue_v1(text)', 'EXECUTE') as admin_anon,
        has_function_privilege('authenticated', 'public.admin_commercial_setup_queue_v1(text)', 'EXECUTE') as admin_auth,
        has_function_privilege('service_role', 'public.admin_commercial_setup_queue_v1(text)', 'EXECUTE') as admin_service,
        has_function_privilege('anon', 'public.customer_portal_setup_handover_v1(text)', 'EXECUTE') as customer_anon,
        has_function_privilege('authenticated', 'public.customer_portal_setup_handover_v1(text)', 'EXECUTE') as customer_auth,
        has_function_privilege('service_role', 'public.customer_portal_setup_handover_v1(text)', 'EXECUTE') as customer_service,
        has_function_privilege('service_role', 'admin_private.commercial_setup_handover_v1(uuid)', 'EXECUTE') as private_service`,
    )
    expect(privilege[0]).toEqual({
      admin_anon: false,
      admin_auth: false,
      admin_service: true,
      customer_anon: false,
      customer_auth: false,
      customer_service: true,
      private_service: false,
    })
    const definition = await rows<{ definition: string }>(
      `select pg_get_functiondef('public.customer_portal_setup_handover_v1(text)'::regprocedure) as definition`,
    )
    expect(definition[0].definition).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/)
    const closed = await rows<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'service_provisions_live_closed'`,
    )
    expect(closed[0].definition).toMatch(/LIVE/)
    expect(await queue()).toEqual({ items: [] })
    expect(await handover()).toEqual({ subscriptions: [] })
    expect(await handover(blakeSession)).toEqual({ subscriptions: [] })
    expect(await handover("b".repeat(64))).toBeNull()
    expect(await queue()).not.toBeNull()
    expect(await rpc("admin_commercial_setup_queue_v1", ["b".repeat(64)])).toBeNull()
  })

  it("shows a paid Telloya subscription as setup pending and writes nothing", async () => {
    const before = await effects()
    const armed = await pay()
    const afterPay = await effects()
    expect(afterPay).toEqual({ ...before, evidence: before.evidence + 1 })
    const productsBefore = JSON.stringify(await rpc("customer_portal_products_v1", [session]))
    const admin = await queue()
    const customer = await handover()
    expect(await effects()).toEqual(afterPay)
    expect(JSON.stringify(await rpc("customer_portal_products_v1", [session]))).toBe(productsBefore)
    expect(admin?.items).toHaveLength(1)
    expect(admin?.items[0]).toMatchObject({
      reference: armed.prepared.ref,
      customerName: "Alex Baker",
      businessId: bakery,
      businessName: "Harbour Bakery",
      product: "Telloya",
      plan: "Growth",
      monthlyPriceMinor: 7900,
      currency: "GBP",
      guardLocationCount: 0,
      financialStatus: "verified",
      operationalStatus: "not_started",
      customerDisplay: "Payment received — setup pending",
      message: "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.",
      nextAction: "Begin setup",
      guard: { included: false, status: "not_subscribed", quantity: 0, monitoringActive: false, assignment: "not_applicable", locations: [] },
      paymentScope: "initial_settlement",
    })
    expect(admin?.items[0].locations).toEqual([
      { locationId: high, locationName: "High Street" },
      { locationId: dock, locationName: "Dock" },
    ])
    expect(admin?.items[0].checklist).toEqual([
      { key: "payment", label: "Payment confirmed", state: "complete" },
      { key: "preferences", label: "Business and service preferences", state: "planned" },
      { key: "agent", label: "AI receptionist configuration", state: "planned" },
      { key: "number", label: "Telephone number and forwarding", state: "planned" },
      { key: "test", label: "Test call and verification", state: "planned" },
      { key: "activation", label: "Service activation", state: "planned" },
    ])
    expect(typeof admin?.items[0].paymentConfirmedAt).toBe("string")
    expect(new Date(String(admin?.items[0].periodStart)).toISOString()).toBe(periodStart)
    expect(new Date(String(admin?.items[0].periodEnd)).toISOString()).toBe(periodEnd)
    const seen = customer?.subscriptions[0]
    expect(seen).toMatchObject({
      reference: armed.prepared.ref,
      businessName: "Harbour Bakery",
      product: "Telloya",
      financialStatus: "verified",
      paymentScope: "initial_settlement",
      operationalStatus: "not_started",
      customerDisplay: "Payment received — setup pending",
      message: "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.",
    })
    expect((seen?.checklist as Row[]).find(step => step.key === "preferences")).toMatchObject({ state: "planned" })
    expect(JSON.stringify(customer)).not.toContain("businessId")
    expect(JSON.stringify(admin)).not.toMatch(/cus_|evt_|cs_|price_|prod_|si_/)
    expect(JSON.stringify(customer)).not.toMatch(/cus_|evt_|cs_|price_|prod_|si_/)
    expect(productsBefore).toContain("Payment received. Your AI receptionist setup has not started.")
    expect(productsBefore).toContain("\"status\":\"not_subscribed\"")
    expect(productsBefore).not.toContain("Monitoring setup is pending")
    const progress = await rpc<{ requests: Array<{ statusLabel: string; nextStep: string }> }>("customer_portal_onboarding_status_v1", [session])
    expect(progress.requests.some(request => request.statusLabel === "Service setup")).toBe(true)
    expect(progress.requests.some(request => request.nextStep === "Payment is recorded. Service setup has not started.")).toBe(true)
    expect(JSON.stringify(progress)).not.toContain("Ready for use")
    expect(await handover(blakeSession)).toEqual({ subscriptions: [] })
    expect(afterPay.provisions).toBe(0)
    expect(afterPay.live).toBe(0)
    expect(afterPay.guard_coverages).toBe(before.guard_coverages)
  })

  it("keeps a paid Complete package pending, including one Guard location and no coverage", async () => {
    const before = await effects()
    const armed = await pay({ product: "COMPLETE", business: kitchen, locations: [oven, counter], amount: 14900 })
    const admin = await queue()
    const customer = await handover()
    expect(await effects()).toEqual({ ...before, evidence: before.evidence + 1 })
    const item = admin?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(item).toMatchObject({
      product: "Complete",
      businessId: kitchen,
      businessName: "Complete Kitchen",
      monthlyPriceMinor: 14900,
      guardLocationCount: 1,
      financialStatus: "verified",
      operationalStatus: "not_started",
      customerDisplay: "Payment received — setup pending",
      guard: {
        included: true,
        status: "pending_setup",
        quantity: 1,
        monitoringActive: false,
        assignment: "pending_confirmation",
        locations: [],
      },
    })
    expect(item?.locations).toEqual([
      { locationId: oven, locationName: "Oven" },
      { locationId: counter, locationName: "Counter" },
    ])
    const seen = customer?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    expect(seen?.guard).toEqual({
      included: true,
      status: "pending_setup",
      quantity: 1,
      monitoringActive: false,
      assignment: "pending_confirmation",
      locations: [],
    })
    expect(JSON.stringify(seen)).not.toContain("businessId")
    const products = JSON.stringify(await rpc("customer_portal_products_v1", [session]))
    expect(products).toContain("Included in your package. Monitoring setup is pending.")
    expect(products).toContain("Payment received. Your AI receptionist setup has not started.")
    expect(products).not.toContain("\"monitoringRecorded\":true")
    expect(await effects()).toMatchObject({ guard_coverages: before.guard_coverages, provisions: 0, live: 0 })
  })

  it("does not call a payment-pending subscription paid when evidence is missing or planted", async () => {
    const armed = await prepareCheckout()
    const state = await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [armed.prepared.subscription])
    expect(state[0].state).toBe("PAYMENT_PENDING")
    let admin = await queue()
    let customer = await handover()
    expect(admin?.items ?? []).toEqual([])
    expect(customer?.subscriptions[0]).toMatchObject({
      reference: armed.prepared.ref,
      financialStatus: "awaiting_payment",
      operationalStatus: "not_started",
      customerDisplay: "Payment pending",
      message: null,
      paymentConfirmedAt: null,
    })
    const pendingSteps = customer?.subscriptions[0].checklist as Row[]
    expect(pendingSteps[0]).toMatchObject({ key: "payment", state: "planned" })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, $2, $3, $4, 'GBP', $5)`,
      [armed.prepared.subscription, periodStart, periodEnd, armed.amount, `evt_planted${armed.eventId.slice(4)}`],
    )
    await db.exec("set local session_replication_role = origin")
    admin = await queue()
    customer = await handover()
    expect(admin?.items ?? []).toEqual([])
    expect(customer?.subscriptions[0]).toMatchObject({
      financialStatus: "awaiting_payment",
      customerDisplay: "Payment pending",
      paymentConfirmedAt: null,
    })
    expect(JSON.stringify(customer)).not.toContain("Payment received")
  })

  it("keeps an accepted offer with no checkout and no evidence unpaid", async () => {
    const prepared = await offer("TELLOYA", twin, [yard], 7900)
    const accepted = await rpc<Row>("customer_portal_commercial_offer_command_v1", [
      session, randomUUID(), prepared.ref, JSON.stringify(consent(prepared)),
    ])
    expect(accepted?.status).toBe("success")
    const evidence = await rows<{ count: number }>(
      `select count(*)::int as count from public.commercial_payment_evidence where subscription_id = $1`,
      [prepared.subscription],
    )
    expect(evidence[0].count).toBe(0)
    expect((await queue())?.items ?? []).toEqual([])
    const customer = await handover()
    expect(customer?.subscriptions.find(entry => entry.reference === prepared.ref)).toMatchObject({
      financialStatus: "unverified",
      customerDisplay: "Payment pending",
      paymentConfirmedAt: null,
    })
  })

  it("distinguishes two businesses that share a display name and several locations", async () => {
    const first = await pay({ product: "TELLOYA", business: bakery, locations: [high, dock], amount: 7900 })
    const second = await pay({ product: "TELLOYA", business: twin, locations: [yard], amount: 8900 })
    const admin = await queue()
    const named = (admin?.items ?? []).filter(entry => entry.businessName === "Harbour Bakery")
    expect(named.map(entry => entry.businessId).sort()).toEqual([bakery, twin].sort())
    const left = named.find(entry => entry.businessId === bakery)
    const right = named.find(entry => entry.businessId === twin)
    expect(left?.locations).toEqual([
      { locationId: high, locationName: "High Street" },
      { locationId: dock, locationName: "Dock" },
    ])
    expect(right?.locations).toEqual([{ locationId: yard, locationName: "Yard" }])
    expect(left?.reference).toBe(first.prepared.ref)
    expect(right?.reference).toBe(second.prepared.ref)
    expect(right?.monthlyPriceMinor).toBe(8900)
    const customer = await handover()
    const seen = (customer?.subscriptions ?? []).filter(entry => entry.businessName === "Harbour Bakery")
    expect(seen).toHaveLength(2)
    expect(JSON.stringify(customer)).not.toContain("businessId")
    expect(seen.map(entry => entry.reference).sort()).toEqual([first.prepared.ref, second.prepared.ref].sort())
  })

  it("omits a revoked membership and a canceled or ended subscription", async () => {
    const revoked = await pay({ product: "TELLOYA", business: bakery, locations: [high], amount: 7900 })
    const canceled = await pay({ product: "TELLOYA", business: twin, locations: [yard], amount: 7900 })
    const ended = await pay({ product: "COMPLETE", business: kitchen, locations: [oven], amount: 14900 })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.business_memberships
       set status = 'revoked', verified_at = null, verified_by = null
       where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    await db.query(
      `update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`,
      [canceled.prepared.subscription],
    )
    await db.query(
      `update public.commercial_subscriptions set state = 'ENDED', ended_at = now() where id = $1`,
      [ended.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    const admin = await queue()
    const customer = await handover()
    const refs = [revoked.prepared.ref, canceled.prepared.ref, ended.prepared.ref]
    expect((admin?.items ?? []).map(entry => entry.reference).filter(reference => refs.includes(String(reference)))).toEqual([])
    expect((customer?.subscriptions ?? []).map(entry => entry.reference).filter(reference => refs.includes(String(reference)))).toEqual([])
  })

  it("rejects incorrect and duplicate payment evidence", async () => {
    const wrong = await pay({ product: "TELLOYA", business: bakery, locations: [high], amount: 7900 })
    const duplicate = await pay({ product: "TELLOYA", business: twin, locations: [yard], amount: 7900 })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_payment_evidence set amount_minor = 100 where subscription_id = $1`,
      [wrong.prepared.subscription],
    )
    await db.query(
      `insert into public.commercial_payment_evidence(subscription_id, period_start, period_end, amount_minor, currency, provider_event_id)
       values ($1, $2, $3, 7900, 'GBP', $4)`,
      [duplicate.prepared.subscription, "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z", `evt_duplicate${duplicate.eventId.slice(4)}`],
    )
    await db.exec("set local session_replication_role = origin")
    const admin = await queue()
    const customer = await handover()
    expect(customer?.subscriptions.find(entry => entry.reference === wrong.prepared.ref)).toMatchObject({
      financialStatus: "unverified",
      customerDisplay: "Payment pending",
      paymentConfirmedAt: null,
    })
    expect(customer?.subscriptions.find(entry => entry.reference === duplicate.prepared.ref)).toMatchObject({
      financialStatus: "unverified",
      customerDisplay: "Payment pending",
    })
    expect(JSON.stringify(admin)).not.toContain(wrong.prepared.ref)
    expect(JSON.stringify(admin)).not.toContain(duplicate.prepared.ref)
  })

  it("leaves an existing provision on its own status and never creates LIVE", async () => {
    const armed = await pay()
    const productsBefore = JSON.stringify(await rpc("customer_portal_products_v1", [session]))
    expect(productsBefore).toContain("Payment received. Your AI receptionist setup has not started.")
    await handover()
    expect(JSON.stringify(await rpc("customer_portal_products_v1", [session]))).toBe(productsBefore)
    await plant(armed.prepared.subscription, bakery, high, "NOT_STARTED")
    expect((await queue())?.items[0]).toMatchObject({ operationalStatus: "not_started", nextAction: "Begin setup" })
    await plant(armed.prepared.subscription, bakery, dock, "AGENT_REQUIRED")
    const started = (await queue())?.items[0]
    expect(started).toMatchObject({
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm business preferences",
    })
    const startedSteps = started?.checklist as Row[]
    expect(startedSteps.find(step => step.key === "agent")).toMatchObject({ state: "planned" })
    expect(startedSteps.find(step => step.key === "activation")).toMatchObject({ state: "planned" })
    const productsDuring = JSON.stringify(await rpc("customer_portal_products_v1", [session]))
    await handover()
    expect(JSON.stringify(await rpc("customer_portal_products_v1", [session]))).toBe(productsDuring)
    expect(productsDuring).not.toContain("Payment received. Your AI receptionist setup has not started.")
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.service_provisions set state = 'READY_FOR_PROVIDER_VERIFICATION'`)
    await db.exec("set local session_replication_role = origin")
    expect((await queue())?.items[0]).toMatchObject({
      operationalStatus: "awaiting_verification",
      customerDisplay: "Awaiting final verification",
      nextAction: "Approve activation",
    })
    const verificationSteps = (await queue())?.items[0].checklist as Row[]
    expect(verificationSteps.find(step => step.key === "preferences")).toMatchObject({ state: "planned" })
    expect(verificationSteps.find(step => step.key === "test")).toMatchObject({ state: "planned" })
    await db.exec("SAVEPOINT live_closed")
    await db.exec("set local session_replication_role = replica")
    await expect(db.query(
      `update public.service_provisions set state = 'LIVE' where location_id = $1`,
      [high],
    )).rejects.toThrow(/service_provisions_live_closed/)
    await db.exec("ROLLBACK TO SAVEPOINT live_closed")
    const live = await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE'`)
    expect(live[0].count).toBe(0)
    expect((await queue())?.items.every(entry => entry.operationalStatus !== "active")).toBe(true)
  })

  it("does not treat selected locations as a Guard assignment", async () => {
    const pantry = "a033a000-0000-4000-8000-000000000027"
    await db.query(
      `insert into public.locations(id, business_id, country, location_name) values ($1, $2, 'GB', 'Pantry')`,
      [pantry, kitchen],
    )
    const armed = await pay({ product: "COMPLETE", business: kitchen, locations: [counter, pantry, oven], amount: 14900 })
    const item = (await queue())?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(item?.guardLocationCount).toBe(1)
    expect(item?.locations).toEqual([
      { locationId: oven, locationName: "Oven" },
      { locationId: counter, locationName: "Counter" },
      { locationId: pantry, locationName: "Pantry" },
    ])
    expect(item?.guard).toEqual({
      included: true,
      status: "pending_setup",
      quantity: 1,
      monitoringActive: false,
      assignment: "pending_confirmation",
      locations: [],
    })
    const seen = (await handover())?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    expect(seen?.guard).toEqual({
      included: true,
      status: "pending_setup",
      quantity: 1,
      monitoringActive: false,
      assignment: "pending_confirmation",
      locations: [],
    })
    await db.query(
      `insert into public.bundle_guard_allocations(
        subscription_id, customer_id, business_id, location_id, state
      ) values ($1, $2, $3, $4, 'RESERVED')`,
      [armed.prepared.subscription, alex, kitchen, counter],
    )
    const assigned = (await queue())?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(assigned?.guard).toMatchObject({
      assignment: "recorded",
      quantity: 1,
      monitoringActive: false,
      locations: [{ locationId: counter, locationName: "Counter" }],
    })
    const assignedLocations = JSON.stringify((assigned?.guard as { locations?: unknown } | undefined)?.locations)
    expect(assignedLocations).not.toContain(oven)
    expect(assignedLocations).not.toContain(pantry)
    const coverages = await rows<{ count: number }>(`select count(*)::int as count from public.guard_coverages`)
    expect(coverages[0].count).toBe(0)
  })

  it("completes the test call only when the owned provision recorded a passed call", async () => {
    const armed = await pay()
    const entitlement = await plant(armed.prepared.subscription, bakery, high, "TEST_REQUIRED")
    const testStep = async () => {
      const item = (await queue())?.items[0]
      return (item?.checklist as Row[] | undefined)?.find(entry => entry.key === "test")
    }
    expect(await testStep()).toMatchObject({ state: "planned" })

    const record = async (outcome: string | null, ref: string | null, passed: boolean) => {
      await db.exec("set local session_replication_role = replica")
      await db.query(
        `update public.service_provisions
         set provider_test_outcome = $2,
             provider_test_call_ref = $3,
             agent_test_passed_at = case when $4 then now() else null end
         where entitlement_id = $1`,
        [entitlement, outcome, ref, passed],
      )
      await db.exec("set local session_replication_role = origin")
    }

    await record("FAILED", "call-failed", false)
    expect(await testStep()).toMatchObject({ state: "planned" })
    await record("PASSED", null, true)
    expect(await testStep()).toMatchObject({ state: "planned" })
    await record("PASSED", "   ", true)
    expect(await testStep()).toMatchObject({ state: "planned" })
    await record("PASSED", "call-open", false)
    expect(await testStep()).toMatchObject({ state: "planned" })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.service_provisions
       set state = 'READY_FOR_PROVIDER_VERIFICATION',
           provider_test_outcome = null,
           provider_test_call_ref = null,
           agent_test_passed_at = null
       where entitlement_id = $1`,
      [entitlement],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await testStep()).toMatchObject({ state: "planned" })
    await record("PASSED", "call-pass", true)
    expect(await testStep()).toMatchObject({ state: "complete" })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.service_provisions set business_id = $2 where entitlement_id = $1`,
      [entitlement, twin],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await testStep()).toMatchObject({ state: "planned" })
  })

  it("fails closed unless the single evidence row matches the recorded period and checkout", async () => {
    const armed = await pay()
    const expectUnverified = async () => {
      const customer = await handover()
      expect(customer?.subscriptions[0]).toMatchObject({
        financialStatus: "unverified",
        paymentScope: null,
        periodStart: null,
        periodEnd: null,
        paymentConfirmedAt: null,
        customerDisplay: "Payment pending",
      })
      expect((await queue())?.items ?? []).toEqual([])
    }

    await db.exec("SAVEPOINT financial")
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_payment_evidence
       set period_start = '2026-10-01T00:00:00.000Z', period_end = '2026-11-01T00:00:00.000Z'
       where subscription_id = $1`,
      [armed.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    await expectUnverified()
    await db.exec("ROLLBACK TO SAVEPOINT financial")

    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_subscriptions
       set current_period_start = '2026-12-01T00:00:00.000Z', current_period_end = '2027-01-01T00:00:00.000Z'
       where id = $1`,
      [armed.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    await expectUnverified()
    await db.exec("ROLLBACK TO SAVEPOINT financial")

    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set amount_minor = 100 where id = $1`, [armed.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    await expectUnverified()
    await db.exec("ROLLBACK TO SAVEPOINT financial")

    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_checkout_preparations set amount_minor = amount_minor + 1 where subscription_id = $1`,
      [armed.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    await expectUnverified()
    await db.exec("ROLLBACK TO SAVEPOINT financial")

    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_subscriptions set current_period_start = null, current_period_end = null where id = $1`,
      [armed.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    await expectUnverified()
  })
})
