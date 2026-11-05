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
const sqlPath = new URL("../../../../supabase/migrations/20261105144256_admin_commercial_confirm_preferences_v1.sql", import.meta.url)

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
  await db.exec("SAVEPOINT confirm_preferences")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT confirm_preferences")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

function openingHours(kind: "day" | "overnight" | "bad-break" = "day") {
  return days.map(day => {
    if (day === "sunday") return { day, closed: true, opens: null, closes: null, breaks: [] }
    if (kind === "overnight" && day === "friday") {
      return { day, closed: false, opens: "22:00", closes: "02:00", breaks: [{ starts: "23:00", ends: "23:30" }] }
    }
    if (kind === "bad-break" && day === "friday") {
      return { day, closed: false, opens: "22:00", closes: "02:00", breaks: [{ starts: "12:00", ends: "13:00" }] }
    }
    return {
      day,
      closed: false,
      opens: "09:00",
      closes: "17:30",
      breaks: day === "monday" ? [{ starts: "12:00", ends: "12:30" }] : [],
    }
  })
}

function preferenceBody(
  current: { request_id: string; request_version: number },
  business: string,
  location: string,
  version = 0,
  patch: { preferences?: Record<string, unknown>; confirmation?: Record<string, unknown>; drop?: string } = {},
) {
  const preferences = {
    timezone: "Europe/London",
    openingHours: openingHours(),
    exceptionalHours: "No exceptional hours are agreed.",
    outOfHours: "Take a message and say the business is closed.",
    greeting: "Thank you for calling Harbour Bakery.",
    enquiryDetails: ["Caller name", "Callback number", "Reason for calling"],
    callbackInstructions: "Offer a callback only inside the stated windows.",
    callbackWindows: [{ day: "monday", starts: "10:00", ends: "12:00" }],
    urgentRules: "There is no emergency cover. Take a message for the next working day.",
    directContactRules: "Pass the caller to the business only when they ask for a person.",
    specialInstructions: null,
    voicePresentation: "no_preference",
    accent: "British",
    spokenLanguage: "en-GB",
    additionalLanguages: ["cy"],
    pronunciationNotes: null,
    ...patch.preferences,
  }
  const confirmation = {
    source: "telephone",
    communicationId: null,
    messageId: null,
    attestation: "The customer confirmed these preferences by telephone.",
    customerConfirmedAt: "2026-11-04T15:00:00.000Z",
    ...patch.confirmation,
  }
  const body: Record<string, unknown> = {
    customerId: alex,
    businessId: business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: version,
    preferences,
    confirmation,
  }
  if (patch.drop) delete (body.preferences as Record<string, unknown>)[patch.drop]
  return body
}

async function confirm(
  armed: Awaited<ReturnType<typeof pay>>,
  location: string,
  options: {
    request?: string
    version?: number
    subscriptionVersion?: number
    patch?: Parameters<typeof preferenceBody>[4]
    customerId?: string
  } = {},
) {
  const current = await versions(armed.prepared.subscription)
  const body = preferenceBody(current, armed.prepared.business, location, options.version ?? 0, options.patch)
  if (options.customerId) body.customerId = options.customerId
  return rpc<Row>("admin_commercial_confirm_preferences_v1", [
    adminToken,
    options.request ?? randomUUID(),
    armed.prepared.subscription,
    options.subscriptionVersion ?? current.subscription_version,
    JSON.stringify(body),
  ])
}

describe("audited confirm business preferences", () => {
  it("keeps the command service-role only and does not read the feature flag", async () => {
    const source = readFileSync(sqlPath, "utf8")
    expect(source).toContain("Do not apply 20261105144256 to DEV")
    expect(source).toContain("Do not apply 20261105144256 to Production")
    expect(source).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("'confirm_preferences'")
    expect(source).toContain("'begin_setup'")
    expect(source).toContain("'resend_invitation'")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED|voice_id/i)
    const privilege = await rows<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select
        has_function_privilege('anon', 'public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.admin_commercial_confirm_preferences_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as service`,
    )
    expect(privilege[0]).toEqual({ anon: false, authenticated: false, service: true })
    expect(await rpc("admin_commercial_confirm_preferences_v1", ["b".repeat(64), randomUUID(), randomUUID(), 1, JSON.stringify({})])).toMatchObject({ status: "unauthorized" })
  })

  it("rejects confirmation before begin setup and does not store a preference", async () => {
    const armed = await pay({ locations: [high] })
    expect(await confirm(armed, high)).toMatchObject({ status: "denied", reason: "setup" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_preferences`)).toEqual([{ count: 0 }])
  })

  it("records one location, then the remaining location, without going live", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await begin(armed)).toMatchObject({ status: "success", operationalStatus: "setup_started" })
    const before = await effects(armed.prepared.subscription)
    const first = await confirm(armed, high, { patch: { preferences: { voicePresentation: "female", accent: "British", spokenLanguage: "en-GB", additionalLanguages: ["cy"] } } })
    expect(first).toMatchObject({
      status: "success",
      locationName: "High Street",
      preferenceVersion: 1,
      confirmationSource: "telephone",
      timezone: "Europe/London",
      voicePresentation: "female",
      spokenLanguage: "en-GB",
      preferencesComplete: false,
      confirmedCount: 1,
      locationCount: 2,
      operationalStatus: "setup_started",
      nextAction: "Confirm business preferences",
      provisionState: "PROFILE_REQUIRED",
    })
    expect(String(first.remainingLocations)).toContain("Dock")
    const after = await effects(armed.prepared.subscription)
    expect(after.live).toBe(0)
    expect(after.profile).toBe(before.profile)
    expect(after.guard_entitlements).toBe(0)
    expect(after.guard_coverages).toBe(before.guard_coverages)
    expect(after.communications).toBe(before.communications)
    expect(after.amount_minor).toBe(before.amount_minor)
    expect(after.provider_fields).toBe(0)
    const stored = await rows<{ opening_hours: { day: string; opens: string | null; closes: string | null }[]; voice_presentation: string; accent: string }>(
      `select opening_hours, voice_presentation, accent from admin_private.commercial_location_preferences where location_id = $1`,
      [high],
    )
    expect(stored[0].voice_presentation).toBe("female")
    expect(stored[0].accent).toBe("British")
    const attestation = await rows<{ attestation: string }>(
      `select attestation from admin_private.commercial_location_preferences where location_id = $1`,
      [high],
    )
    expect(attestation[0].attestation).toBe("The customer confirmed these preferences by telephone.")
    expect(stored[0].opening_hours.find(day => day.day === "monday")).toMatchObject({ opens: "09:00", closes: "17:30" })
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const item = queue?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(item?.nextAction).toBe("Confirm business preferences")
    expect((item?.checklist as Row[]).find(step => step.key === "preferences")).toMatchObject({ state: "planned" })
    expect(String(item?.message)).toContain("Dock")
    const progress = item?.preferenceProgress as { confirmedCount: number; locationCount: number }
    expect(progress).toMatchObject({ confirmedCount: 1, locationCount: 2 })
    const second = await confirm(armed, dock)
    expect(second).toMatchObject({
      status: "success",
      preferencesComplete: true,
      confirmedCount: 2,
      nextAction: "Confirm AI configuration",
      operationalStatus: "setup_started",
      provisionState: "PROFILE_REQUIRED",
    })
    const done = (await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken]))?.items.find(entry => entry.reference === armed.prepared.ref)
    expect(done?.nextAction).toBe("Confirm AI configuration")
    expect(done?.customerDisplay).toBe("Setup in progress")
    expect((done?.checklist as Row[]).find(step => step.key === "preferences")).toMatchObject({ state: "complete" })
    expect((done?.checklist as Row[]).find(step => step.key === "agent")).toMatchObject({ state: "planned" })
    expect(await effects(armed.prepared.subscription)).toMatchObject({ live: 0, amount_minor: before.amount_minor, communications: before.communications })
  })

  it("confirms a Complete subscription without creating Guard coverage", async () => {
    const armed = await pay({ product: "COMPLETE", locations: [oven] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    const recorded = await confirm(armed, oven, { patch: { preferences: { voicePresentation: "male" } } })
    expect(recorded).toMatchObject({ status: "success", preferencesComplete: true, nextAction: "Confirm AI configuration", voicePresentation: "male" })
    expect(await effects(armed.prepared.subscription)).toMatchObject({ live: 0, guard_coverages: 0, guard_entitlements: 0 })
  })

  it("keeps overnight wall-clock hours stable across a daylight-saving timestamp", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    const winter = await confirm(armed, high, {
      patch: {
        preferences: { openingHours: openingHours("overnight"), timezone: "Europe/London" },
        confirmation: { customerConfirmedAt: "2026-01-15T12:00:00.000Z" },
      },
    })
    expect(winter).toMatchObject({ status: "success", preferenceVersion: 1 })
    const summer = await confirm(armed, high, {
      version: 1,
      patch: {
        preferences: { openingHours: openingHours("overnight"), greeting: "Thank you for calling Harbour Bakery today." },
        confirmation: { customerConfirmedAt: "2026-07-15T12:00:00.000Z" },
      },
    })
    expect(summer).toMatchObject({ status: "success", preferenceVersion: 2 })
    const rowsFound = await rows<{ hours: string; local_time: string; version: number }>(
      `select version, opening_hours::text as hours,
              to_char(customer_confirmed_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as local_time
       from admin_private.commercial_location_preferences
       where location_id = $1 order by version`,
      [high],
    )
    expect(rowsFound).toHaveLength(2)
    expect(rowsFound[0].hours).toBe(rowsFound[1].hours)
    expect(rowsFound[0].hours).toContain("22:00")
    expect(rowsFound[0].hours).toContain("02:00")
    expect(rowsFound[0].local_time).toBe("2026-01-15 12:00")
    expect(rowsFound[1].local_time).toBe("2026-07-15 13:00")
    expect(await confirm(armed, high, { patch: { preferences: { openingHours: openingHours("bad-break") } } })).toMatchObject({ status: "invalid" })
  })

  it("rejects missing preferences, a bad timezone, and telephone confirmation without attestation", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high, { patch: { drop: "greeting" } })).toMatchObject({ status: "invalid" })
    expect(await confirm(armed, high, { patch: { preferences: { timezone: "GMT" } } })).toMatchObject({ status: "invalid" })
    expect(await confirm(armed, high, { patch: { preferences: { accent: "voice_abc" } } })).toMatchObject({ status: "invalid" })
    expect(await confirm(armed, high, { patch: { confirmation: { attestation: "too short" } } })).toMatchObject({ status: "invalid" })
    expect(await confirm(armed, high, { patch: { preferences: { voicePresentation: "voice_abc123" } } })).toMatchObject({ status: "invalid" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_preferences`)).toEqual([{ count: 0 }])
  })

  it("accepts only verified customer evidence and keeps the original message private", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    const attestation = "Staff reviewed this evidence and it confirms these preferences for this location."
    const missing = randomUUID()
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: missing, messageId: null, attestation: null } },
    })).toMatchObject({ status: "invalid" })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: missing, messageId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })

    async function evidence(input: {
      ref: string
      alias: string
      providerId: string
      customer: string
      business: string
      caseLocation: string
      conversationLocation: string | null
      state: "OPEN" | "UNMATCHED"
      communicationCustomer: string | null
      communicationBusiness: string | null
      senderMatch: string
      loopClass?: string
      autoSubmitted?: string | null
      importStatus?: string
    }) {
      const caseId = randomUUID()
      const conversationId = randomUUID()
      const communicationId = randomUUID()
      const messageId = randomUUID()
      await db.query(
        `insert into public.cases(id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description)
         values ($1, $2, 'PROFILE_RECOVERY', 'RECEIVED', $3, $4, $5, 'Preference evidence case')`,
        [caseId, input.ref, input.customer, input.business, input.caseLocation],
      )
      await db.query(
        `insert into public.conversations(
          id, state, case_id, customer_id, business_id, location_id, reply_alias, subject
        ) values ($1, $2, $3, $4, $5, $6, $7, 'SECRET-EMAIL-SUBJECT')`,
        [
          conversationId,
          input.state,
          input.state === "OPEN" ? caseId : null,
          input.state === "UNMATCHED" ? null : input.customer,
          input.state === "UNMATCHED" ? null : input.business,
          input.conversationLocation,
          input.alias,
        ],
      )
      await db.query(
        `insert into public.communications(
          id, case_id, conversation_id, customer_id, business_id, channel, communication_type, direction,
          recipient, subject, status, sender_address, sent_at
        ) values ($1, $2, $3, $4, $5, 'EMAIL', 'CUSTOMER_REPLY', 'INBOUND', $6, 'SECRET-EMAIL-SUBJECT', 'SENT', $6, now())`,
        [communicationId, caseId, conversationId, input.communicationCustomer, input.communicationBusiness, "alex.begin@example.com"],
      )
      await db.query(
        `insert into public.conversation_messages(
          id, conversation_id, kind, import_status, provider, provider_email_id, body_text,
          sender_address, sender_match, loop_class, auto_submitted
        ) values ($1, $2, 'INBOUND_EMAIL', $3, 'resend', $4, 'SECRET-MESSAGE-BODY', $5, $6, $7, $8)`,
        [
          messageId,
          conversationId,
          input.importStatus ?? "IMPORTED",
          input.providerId,
          "alex.begin@example.com",
          input.senderMatch,
          input.loopClass ?? "NONE",
          input.autoSubmitted ?? null,
        ],
      )
      return { communicationId, messageId }
    }

    const unmatched = await evidence({
      ref: "PR-26-EMLAAA",
      alias: "aa".repeat(16),
      providerId: "emailunm1",
      customer: alex,
      business: bakery,
      caseLocation: high,
      conversationLocation: null,
      state: "UNMATCHED",
      communicationCustomer: alex,
      communicationBusiness: bakery,
      senderMatch: "NONE",
    })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_message", messageId: unmatched.messageId, communicationId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: unmatched.communicationId, messageId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })

    const wrongCustomer = await evidence({
      ref: "PR-26-EMLBBB",
      alias: "bb".repeat(16),
      providerId: "emailcus2",
      customer: alex,
      business: bakery,
      caseLocation: high,
      conversationLocation: high,
      state: "OPEN",
      communicationCustomer: blake,
      communicationBusiness: bakery,
      senderMatch: "MATCHES_VERIFIED_CONTACT",
    })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: wrongCustomer.communicationId, messageId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })

    const wrongBusiness = await evidence({
      ref: "PR-26-EMLCCC",
      alias: "cc".repeat(16),
      providerId: "emailbus3",
      customer: alex,
      business: kitchen,
      caseLocation: oven,
      conversationLocation: oven,
      state: "OPEN",
      communicationCustomer: alex,
      communicationBusiness: kitchen,
      senderMatch: "MATCHES_VERIFIED_CONTACT",
    })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_message", messageId: wrongBusiness.messageId, communicationId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: wrongBusiness.communicationId, messageId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })

    const automated = await evidence({
      ref: "PR-26-EMLDDD",
      alias: "dd".repeat(16),
      providerId: "emailaut4",
      customer: alex,
      business: bakery,
      caseLocation: high,
      conversationLocation: high,
      state: "OPEN",
      communicationCustomer: alex,
      communicationBusiness: bakery,
      senderMatch: "AUTOMATED",
      loopClass: "AUTO_SUBMITTED",
      autoSubmitted: "auto-replied",
    })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_message", messageId: automated.messageId, communicationId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })

    const otherLocation = await evidence({
      ref: "PR-26-EMLEEE",
      alias: "ee".repeat(16),
      providerId: "emailloc5",
      customer: alex,
      business: bakery,
      caseLocation: dock,
      conversationLocation: dock,
      state: "OPEN",
      communicationCustomer: alex,
      communicationBusiness: bakery,
      senderMatch: "MATCHES_VERIFIED_CONTACT",
    })
    expect(await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_message", messageId: otherLocation.messageId, communicationId: null, attestation } },
    })).toMatchObject({ status: "denied", reason: "provenance" })
    const recordedMessage = await confirm(armed, dock, {
      patch: { confirmation: { source: "recorded_message", messageId: otherLocation.messageId, communicationId: null, attestation } },
    })
    expect(recordedMessage).toMatchObject({ status: "success", confirmationSource: "recorded_message" })
    const messageRow = await rows<{ message_id: string; attestation: string }>(
      `select message_id, attestation from admin_private.commercial_location_preferences where location_id = $1`,
      [dock],
    )
    expect(messageRow[0]).toEqual({ message_id: otherLocation.messageId, attestation })
    expect(JSON.stringify(messageRow)).not.toContain("SECRET-MESSAGE-BODY")

    const matchedEmail = await evidence({
      ref: "PR-26-EMLFFF",
      alias: "ff".repeat(16),
      providerId: "emailok06",
      customer: alex,
      business: bakery,
      caseLocation: high,
      conversationLocation: high,
      state: "OPEN",
      communicationCustomer: alex,
      communicationBusiness: bakery,
      senderMatch: "MATCHES_VERIFIED_CONTACT",
    })
    const emailed = await confirm(armed, high, {
      patch: { confirmation: { source: "recorded_email", communicationId: matchedEmail.communicationId, messageId: null, attestation } },
    })
    expect(emailed).toMatchObject({ status: "success", confirmationSource: "recorded_email" })
    const stored = await rows<{ communication_id: string; attestation: string; greeting: string }>(
      `select communication_id, attestation, greeting from admin_private.commercial_location_preferences where location_id = $1`,
      [high],
    )
    expect(stored[0].communication_id).toBe(matchedEmail.communicationId)
    expect(stored[0].attestation).toBe(attestation)
    expect(JSON.stringify(stored)).not.toContain("SECRET-EMAIL-SUBJECT")
    expect(JSON.stringify(stored)).not.toContain("SECRET-MESSAGE-BODY")
  })

  it("rejects the wrong customer, a foreign location, revoked authority, and a closed subscription", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high, { customerId: blake })).toMatchObject({ status: "denied", reason: "customer" })
    expect(await confirm(armed, yard)).toMatchObject({ status: "denied", reason: "location" })
    await db.query(
      `update public.business_memberships
       set status = 'revoked', verified_at = null, verified_by = null
       where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    expect(await confirm(armed, high)).toMatchObject({ status: "denied", reason: "revoked" })
    await db.query(
      `update public.business_memberships
       set status = 'verified', verified_at = now(), verified_by = $3
       where customer_id = $1 and business_id = $2`,
      [alex, bakery, actor],
    )
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`, [armed.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await confirm(armed, high)).toMatchObject({ status: "denied", reason: "inactive" })
  })

  it("rejects an expired period and a subscription with no matching payment evidence", async () => {
    const expired = await pay({ locations: [dock] })
    expect(await begin(expired)).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`,
      [expired.prepared.subscription],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await confirm(expired, dock)).toMatchObject({ status: "denied", reason: "expired" })

    const unpaid = await pay({ product: "COMPLETE", business: kitchen, locations: [oven] })
    expect(await begin(unpaid)).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await confirm(unpaid, oven)).toMatchObject({ status: "denied", reason: "payment" })
  })

  it("replays the same request, rejects a changed payload, and keeps a correction beside the original", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    const request = randomUUID()
    const first = await confirm(armed, high, { request })
    const replay = await confirm(armed, high, { request })
    expect(replay).toEqual(first)
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_preferences`)).toEqual([{ count: 1 }])
    const changed = await confirm(armed, high, { request, patch: { preferences: { greeting: "A different greeting for the same request." } } })
    expect(changed).toEqual({ status: "conflict" })
    const correction = await confirm(armed, high, {
      version: 1,
      patch: { preferences: { greeting: "Thank you for calling the Harbour Bakery team." } },
    })
    expect(correction).toMatchObject({ status: "success", preferenceVersion: 2 })
    const greetings = await rows<{ version: number; greeting: string }>(
      `select version, greeting from admin_private.commercial_location_preferences order by version`,
    )
    expect(greetings.map(row => row.greeting)).toEqual([
      "Thank you for calling Harbour Bakery.",
      "Thank you for calling the Harbour Bakery team.",
    ])
    await db.exec("SAVEPOINT no_overwrite")
    await expect(db.query(`update admin_private.commercial_location_preferences set greeting = 'silent' where version = 1`)).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT no_overwrite")
  })

  it("rejects a stale preference version and a stale subscription version", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high, { version: 4 })).toMatchObject({ status: "conflict", reason: "version" })
    const current = await versions(armed.prepared.subscription)
    expect(await confirm(armed, high, { subscriptionVersion: current.subscription_version + 3 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_preferences`)).toEqual([{ count: 0 }])
  })

  it("does not let a draft satisfy the checklist", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    const linked = await rows<{ entitlement_id: string }>(
      `select entitlement.id as entitlement_id
       from public.product_entitlements entitlement
       join public.service_provisions provision on provision.entitlement_id = entitlement.id
       where entitlement.commercial_subscription_id = $1`,
      [armed.prepared.subscription],
    )
    const current = await versions(armed.prepared.subscription)
    await db.query(
      `insert into admin_private.commercial_location_preferences(
        subscription_id, customer_id, business_id, onboarding_request_id, location_id,
        entitlement_id, version, status, timezone, opening_hours,
        exceptional_hours, out_of_hours, greeting, enquiry_details, callback_instructions,
        callback_windows, urgent_rules, direct_contact_rules, voice_presentation, accent,
        spoken_language, additional_languages, recorded_by, request_id
      ) values (
        $1, $2, $3, $4, $5, $6, 1, 'DRAFT', 'Europe/London', $7::jsonb,
        'No exceptional hours are agreed.', 'Take a message and say the business is closed.',
        'Thank you for calling Harbour Bakery.', '["Caller name"]'::jsonb,
        'Offer a callback only inside the stated windows.', '[]'::jsonb,
        'There is no emergency cover. Take a message for the next working day.',
        'Pass the caller to the business only when they ask for a person.',
        'no_preference', 'British', 'en-GB', '[]'::jsonb, $8, $9
      )`,
      [armed.prepared.subscription, alex, bakery, current.request_id, high, linked[0].entitlement_id, JSON.stringify(openingHours()), actor, randomUUID()],
    )
    const item = (await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken]))?.items[0]
    expect((item?.checklist as Row[]).find(step => step.key === "preferences")).toMatchObject({ state: "planned" })
    expect(item?.nextAction).toBe("Confirm business preferences")
  })

  it("rolls a failed preference insert back with its receipt", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    await db.exec(`
      create function public.fail_preference_v1() returns trigger language plpgsql as $fn$
      begin
        raise exception 'forced preference failure';
      end $fn$;
      create trigger fail_preference before insert on admin_private.commercial_location_preferences
      for each row execute function public.fail_preference_v1();
    `)
    await expect(confirm(armed, high)).rejects.toThrow(/forced preference failure/)
    await db.exec("ROLLBACK TO SAVEPOINT confirm_preferences")
    await db.exec("SAVEPOINT confirm_preferences")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_preferences`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_preference_events`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(
      `select count(*)::int as count from admin_private.commercial_command_receipts where response ->> 'status' = 'success'`,
    )).toEqual([{ count: 0 }])
  })

  it("shows confirmed preferences to the owning customer and not to another customer", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success", preferencesComplete: false })
    const blakeSession = await portalSession("blake.begin@example.com", blakeAuth)
    const own = await rpc<{ subscriptions: Row[] }>("customer_portal_setup_handover_v1", [session])
    const other = await rpc<{ subscriptions: Row[] }>("customer_portal_setup_handover_v1", [blakeSession])
    const seen = own?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    const preferences = seen?.servicePreferences as {
      state: string
      locations: { locationName: string; status: string; greeting?: string; note?: string }[]
    }
    expect(preferences.state).toBe("partial")
    expect(preferences.locations.find(location => location.locationName === "High Street")).toMatchObject({
      status: "recorded",
      greeting: "Thank you for calling Harbour Bakery.",
    })
    expect(preferences.locations.find(location => location.locationName === "Dock")?.status).toBe("needed")
    const text = JSON.stringify(seen)
    expect(text).not.toContain("communicationId")
    expect(text).not.toContain("attestation")
    expect(text).not.toContain(actor)
    expect(text).toContain("You will still confirm the service before it is activated")
    expect(text).toContain("The receptionist is not configured or active")
    expect(JSON.stringify(other)).not.toContain(armed.prepared.ref)
    expect(await rpc("customer_portal_setup_handover_v1", ["b".repeat(64)])).toBeNull()
  })

  it("requires a recent Admin sign-in and does not consume the request", async () => {
    await db.query(`update public.admin_sessions set created_at = now() - interval '31 minutes' where token_hash = $1`, [adminToken])
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toEqual({ status: "reauth_required" })
    await db.query(`update public.admin_sessions set created_at = now() where token_hash = $1`, [adminToken])
    expect(await begin(armed)).toMatchObject({ status: "success" })
    await db.query(`update public.admin_sessions set created_at = now() - interval '31 minutes' where token_hash = $1`, [adminToken])
    expect(await confirm(armed, high)).toEqual({ status: "reauth_required" })
    expect(await rows<{ count: number }>(
      `select count(*)::int as count from admin_private.commercial_location_preferences`,
    )).toEqual([{ count: 0 }])
  })
})
