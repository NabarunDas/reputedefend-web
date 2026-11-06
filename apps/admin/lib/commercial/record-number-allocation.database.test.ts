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
const sqlPath = new URL("../../../../supabase/migrations/20261105200000_admin_commercial_record_number_allocation_v1.sql", import.meta.url)

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


async function provisionVersion(subscription: string, location: string) {
  const found = await rows<{ record_version: number }>(
    `select provision.record_version
     from public.service_provisions provision
     join public.product_entitlements entitlement on entitlement.id = provision.entitlement_id
     where entitlement.commercial_subscription_id = $1 and provision.location_id = $2`,
    [subscription, location],
  )
  return found[0]?.record_version ?? 1
}

async function configure(
  armed: Awaited<ReturnType<typeof pay>>,
  location: string,
  options: {
    request?: string
    preferenceVersion?: number
    provisionVersion?: number
    configurationVersion?: number
    subscriptionVersion?: number
    customerId?: string
    agentRef?: string
    environment?: "dev" | "production"
    attestation?: string
    staffConfirmed?: boolean
    revision?: string
    drop?: string
  } = {},
) {
  const current = await versions(armed.prepared.subscription)
  const provider: Record<string, unknown> = {
    provider: "telloya_voice",
    environment: options.environment ?? "dev",
    agentRef: options.agentRef ?? `agent-${location.slice(-4)}`,
    revision: options.revision ?? "rev-0004",
    chosenVoice: "Harbour",
    chosenLanguage: "en-GB",
    attestation: options.attestation ?? "The operator recorded this configuration in the provider console.",
    staffConfirmed: options.staffConfirmed ?? true,
  }
  if (options.drop) delete provider[options.drop]
  const body: Record<string, unknown> = {
    customerId: options.customerId ?? alex,
    businessId: armed.prepared.business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: options.preferenceVersion ?? 1,
    provisionVersion: options.provisionVersion ?? await provisionVersion(armed.prepared.subscription, location),
    configurationVersion: options.configurationVersion ?? 0,
    provider,
  }
  return rpc<Row>("admin_commercial_confirm_ai_configuration_v1", [
    adminToken,
    options.request ?? randomUUID(),
    armed.prepared.subscription,
    options.subscriptionVersion ?? current.subscription_version,
    JSON.stringify(body),
  ])
}

async function allocate(
  armed: Awaited<ReturnType<typeof pay>>,
  location: string,
  options: {
    request?: string
    preferenceVersion?: number
    provisionVersion?: number
    configurationVersion?: number
    allocationVersion?: number
    subscriptionVersion?: number
    customerId?: string
    agentRef?: string
    environment?: "dev" | "production"
    e164?: string
    allocationRef?: string
    attestation?: string
    staffConfirmed?: boolean
    revision?: string
    drop?: string
  } = {},
) {
  const current = await versions(armed.prepared.subscription)
  const provider: Record<string, unknown> = {
    provider: "telloya_voice",
    environment: options.environment ?? "dev",
    agentRef: options.agentRef ?? `agent-${location.slice(-4)}`,
    revision: options.revision ?? "rev-0004",
    e164: options.e164 ?? "+441632960441",
    allocationRef: options.allocationRef ?? `evidence-${location.slice(-4)}`,
    attestation: options.attestation ?? "The operator recorded this assigned number from the provider allocation.",
    staffConfirmed: options.staffConfirmed ?? true,
  }
  if (options.drop) delete provider[options.drop]
  const body: Record<string, unknown> = {
    customerId: options.customerId ?? alex,
    businessId: armed.prepared.business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: options.preferenceVersion ?? 1,
    provisionVersion: options.provisionVersion ?? await provisionVersion(armed.prepared.subscription, location),
    configurationVersion: options.configurationVersion ?? 1,
    allocationVersion: options.allocationVersion ?? 0,
    provider,
  }
  return rpc<Row>("admin_commercial_record_number_allocation_v1", [
    adminToken,
    options.request ?? randomUUID(),
    armed.prepared.subscription,
    options.subscriptionVersion ?? current.subscription_version,
    JSON.stringify(body),
  ])
}

async function ready(locations: string[], options: Parameters<typeof pay>[0] = {}) {
  const armed = await pay({ locations, ...options })
  if ((await begin(armed)).status !== "success") throw new Error("begin")
  for (const location of locations) {
    if ((await confirm(armed, location)).status !== "success") throw new Error(`preferences ${location}`)
  }
  for (const location of locations) {
    const configured = await configure(armed, location, { agentRef: `agent-${location.slice(-4)}` })
    if (configured.status !== "success") throw new Error(`configure ${location} ${JSON.stringify(configured)}`)
  }
  return armed
}

describe("audited record number allocation", () => {
  it("keeps the command service-role only and does not buy a number or open routing", async () => {
    const source = readFileSync(sqlPath, "utf8")
    expect(source).toContain("Do not apply 20261105200000 to DEV")
    expect(source).toContain("Do not apply 20261105200000 to Production")
    expect(source).toContain("OPERATOR_ATTESTED")
    expect(source).toContain("telloya-voice-number:")
    expect(source).toContain("commercial_provider_number_owners")
    expect(source).toContain("commercial_authoritative_allocation_id_v1")
    expect(source).toContain("CREATE OR REPLACE FUNCTION admin_private.telloya_voice_binding_guard_v1()")
    expect(source).toContain("SECURITY DEFINER")
    expect(source).toContain("preferences_complete := false")
    expect(source).not.toContain("INDEPENDENTLY_VERIFIED")
    expect(source).not.toContain("INSERT INTO public.telloya_voice_number_bindings")
    expect(source).not.toContain("state = 'LIVE'")
    expect(source).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("'record_number_allocation'")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED|voice_id/i)
    const privilege = await rows<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select has_function_privilege('anon', 'public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)', 'execute') as authenticated,
              has_function_privilege('service_role', 'public.admin_commercial_record_number_allocation_v1(text, uuid, uuid, integer, jsonb)', 'execute') as service`,
    )
    expect(privilege[0]).toEqual({ anon: false, authenticated: false, service: true })
  })

  it("records one Telloya location and leaves forwarding, testing, Guard, and routing untouched", async () => {
    const armed = await ready([high])
    const before = await effects(armed.prepared.subscription)
    const bindings = await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)
    const recorded = await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960441" })
    expect(recorded).toMatchObject({
      status: "success",
      allocationVersion: 1,
      verificationBasis: "OPERATOR_ATTESTED",
      provisionState: "FORWARDING_REQUIRED",
      routingActive: false,
      allocationComplete: true,
      recordedCount: 1,
      locationCount: 1,
      nextAction: "Record forwarding instructions",
      e164: "+441632960441",
    })
    const provision = await rows<{ state: string; binding: string; forwarding: string | null; test_ref: string | null; tested: string | null; confirmed: string | null; live: string | null }>(
      `select state, provider_binding_ref as binding, forwarding_instructed_at as forwarding,
              provider_test_call_ref as test_ref, agent_test_passed_at as tested,
              customer_confirmed_at as confirmed, live_at as live
       from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(provision[0].state).toBe("FORWARDING_REQUIRED")
    expect(provision[0].binding).toMatch(/^alloc:[0-9a-f-]{36}$/)
    expect(provision[0].forwarding).toBeNull()
    expect(provision[0].test_ref).toBeNull()
    expect(provision[0].tested).toBeNull()
    expect(provision[0].confirmed).toBeNull()
    expect(provision[0].live).toBeNull()
    const after = await effects(armed.prepared.subscription)
    expect(after.communications).toBe(before.communications)
    expect(after.guard_coverages).toBe(0)
    expect(after.allocations).toBe(0)
    expect(after.live).toBe(0)
    expect(after.evidence).toBe(before.evidence)
    expect(after.amount_minor).toBe(before.amount_minor)
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual(bindings)
    const handover = (await rows<{ value: Row }>(`select admin_private.commercial_setup_handover_v1($1) as value`, [armed.prepared.subscription]))[0].value
    expect(handover?.message).toBe("Your receptionist number has been recorded. We're preparing the forwarding instructions and final service checks.")
    expect((handover?.checklist as { state: string }[])[3].state).toBe("planned")
    const customer = await rpc<Row>("customer_portal_setup_handover_v1", [session])
    const text = JSON.stringify(customer)
    expect(text).toContain("Your receptionist number has been recorded. We're preparing the forwarding instructions and final service checks.")
    expect(text).not.toContain("+441632960441")
    expect(text).not.toContain("agent-0021")
    expect(text).not.toContain("evidence-0021")
    expect(text).not.toContain("OPERATOR_ATTESTED")
    expect(text).not.toContain("allocationProgress")
    expect(text).not.toContain("forwarding is ready")
    const blakePending = hash(randomBytes(32).toString("hex"))
    expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["blake.begin@example.com", blakePending])).status).toBe("ok")
    expect((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [blakePending])).status).toBe("ok")
    const blakeHash = hash(randomBytes(32).toString("hex"))
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [blakePending, blakeHash, blakeAuth, "blake.begin@example.com"])).status).toBe("ok")
    const other = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [blakeHash]))
    expect(other).not.toContain(armed.prepared.ref)
    expect(other).not.toContain("+441632960441")
  })

  it("records locations independently for Telloya and Complete without marking the number active", async () => {
    const armed = await ready([high, dock])
    const first = await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960451" })
    expect(first).toMatchObject({
      status: "success",
      allocationComplete: false,
      recordedCount: 1,
      locationCount: 2,
      nextAction: "Record provider and number allocation",
      routingActive: false,
    })
    const second = await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960452" })
    expect(second).toMatchObject({
      status: "success",
      allocationComplete: true,
      recordedCount: 2,
      nextAction: "Record forwarding instructions",
    })
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const progress = queue?.items.find(entry => entry.reference === armed.prepared.ref)?.allocationProgress as { recordedCount: number; locationCount: number }
    expect(progress).toMatchObject({ recordedCount: 2, locationCount: 2 })
    const complete = await ready([oven, counter], { product: "COMPLETE", business: kitchen })
    expect(await allocate(complete, oven, { agentRef: "agent-0024", e164: "+441632960461" })).toMatchObject({ status: "success", allocationComplete: false })
    expect(await allocate(complete, counter, { agentRef: "agent-0025", e164: "+441632960462" })).toMatchObject({
      status: "success",
      allocationComplete: true,
      nextAction: "Record forwarding instructions",
    })
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.guard_coverages`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null or agent_test_passed_at is not null`)).toEqual([{ count: 0 }])
  })

  it("rejects a skipped setup step, a missing configuration, and a stale preference or configuration", async () => {
    const unpaid = await pay({ locations: [high] })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021" })).toMatchObject({ status: "denied", reason: "setup" })
    expect(await begin(unpaid)).toMatchObject({ status: "success" })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021" })).toMatchObject({ status: "denied", reason: "preferences" })
    expect(await confirm(unpaid, high)).toMatchObject({ status: "success" })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021" })).toMatchObject({ status: "denied", reason: "configuration" })
    expect(await configure(unpaid, high, { agentRef: "agent-0021" })).toMatchObject({ status: "success" })
    const corrected = await confirm(unpaid, high, { version: 1, patch: { preferences: { greeting: "Thank you for calling the corrected bakery." } } })
    expect(corrected).toMatchObject({ status: "success", preferenceVersion: 2 })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021", preferenceVersion: 2, configurationVersion: 1 })).toMatchObject({ status: "denied", reason: "configuration" })
    expect(await configure(unpaid, high, { agentRef: "agent-0021", preferenceVersion: 2, configurationVersion: 1 })).toMatchObject({ status: "success", configurationVersion: 2 })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021", preferenceVersion: 1, configurationVersion: 1 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await allocate(unpaid, high, { agentRef: "agent-0021", preferenceVersion: 2, configurationVersion: 1 })).toMatchObject({ status: "conflict", reason: "version" })
    const current = await allocate(unpaid, high, { agentRef: "agent-0021", preferenceVersion: 2, configurationVersion: 2, e164: "+441632960471" })
    expect(current).toMatchObject({ status: "success", allocationVersion: 1 })
    expect(await confirm(unpaid, high, { version: 2, patch: { preferences: { greeting: "Thank you for calling after the number was recorded." } } })).toMatchObject({ status: "denied" })
  })

  it("rejects an invalid number, a number already owned, and both inactive and active routing rows", async () => {
    const armed = await ready([high, dock])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "01632960441" })).toMatchObject({ status: "invalid" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+0123456789" })).toMatchObject({ status: "invalid" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", allocationRef: "short", e164: "+441632960481" })).toMatchObject({ status: "invalid" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", attestation: "too short", e164: "+441632960481" })).toMatchObject({ status: "invalid" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", staffConfirmed: false, e164: "+441632960481" })).toMatchObject({ status: "invalid" })
    expect(await allocate(armed, high, { agentRef: "agent-dock-09", e164: "+441632960481" })).toMatchObject({ status: "denied", reason: "provider" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", environment: "production", e164: "+441632960481" })).toMatchObject({ status: "denied", reason: "environment" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960481" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960481", allocationVersion: 0 })).toMatchObject({ status: "denied", reason: "number" })
    const other = await ready([yard], { business: twin })
    expect(await allocate(other, yard, { agentRef: "agent-0026", e164: "+441632960481" })).toMatchObject({ status: "denied", reason: "number" })
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960491', 'agent-foreign1', $1, $2, false)`,
      [twin, yard],
    )
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960491" })).toMatchObject({ status: "denied", reason: "number" })
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960492', 'agent-foreign2', $1, $2, true)`,
      [twin, yard],
    )
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960492" })).toMatchObject({ status: "denied", reason: "number" })
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960493', 'agent-0022', $1, $2, false)`,
      [bakery, dock],
    )
    const kept = await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960493" })
    expect(kept).toMatchObject({ status: "success", routingActive: false })
    expect(await rows<{ active: boolean }>(
      `select active from public.telloya_voice_number_bindings where inbound_to_number = '+441632960493'`,
    )).toEqual([{ active: false }])
    await db.exec("SAVEPOINT owned_agent_active")
    await expect(db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960494', 'agent-0022', $1, $2, true)`,
      [bakery, dock],
    )).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT owned_agent_active")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_provider_number_owners where e164 = '+441632960494'`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual([{ count: 3 }])
  })

  it("replays the same request, rejects a conflicting retry, and keeps allocation history", async () => {
    const armed = await ready([high])
    const provision = await provisionVersion(armed.prepared.subscription, high)
    const request = randomUUID()
    const same = {
      request,
      agentRef: "agent-0021",
      e164: "+441632960501",
      provisionVersion: provision,
      configurationVersion: 1,
      allocationVersion: 0,
      preferenceVersion: 1,
    }
    const first = await allocate(armed, high, same)
    expect(first).toMatchObject({ status: "success", allocationVersion: 1 })
    expect(await allocate(armed, high, same)).toEqual(first)
    expect(await allocate(armed, high, { ...same, e164: "+441632960502" })).toEqual({ status: "conflict" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_allocations`)).toEqual([{ count: 1 }])
    const current = await versions(armed.prepared.subscription)
    const bumped = await provisionVersion(armed.prepared.subscription, high)
    expect(await allocate(armed, high, { subscriptionVersion: current.subscription_version + 2, agentRef: "agent-0021", allocationVersion: 1, configurationVersion: 1, provisionVersion: bumped, e164: "+441632960501" })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await allocate(armed, high, { allocationVersion: 0, agentRef: "agent-0021", configurationVersion: 1, provisionVersion: bumped, e164: "+441632960501" })).toMatchObject({ status: "conflict", reason: "version" })
    const original = await rows<{ allocated: string; binding: string }>(
      `select number_allocated_at as allocated, provider_binding_ref as binding from public.service_provisions where location_id = $1`,
      [high],
    )
    const corrected = await allocate(armed, high, {
      agentRef: "agent-0021",
      e164: "+441632960503",
      allocationRef: "evidence-corrected",
      allocationVersion: 1,
      configurationVersion: 1,
      provisionVersion: bumped,
      preferenceVersion: 1,
    })
    expect(corrected).toMatchObject({ status: "success", allocationVersion: 2, e164: "+441632960503" })
    const history = await rows<{ id: string; version: number; e164: string }>(
      `select id::text as id, version, e164 from admin_private.commercial_location_allocations order by version`,
    )
    const kept = await rows<{ allocated: string; binding: string; state: string; entitlement: string }>(
      `select number_allocated_at as allocated, provider_binding_ref as binding, state, entitlement_id::text as entitlement
       from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(history.map(row => row.e164)).toEqual(["+441632960501", "+441632960503"])
    expect(kept[0].allocated).toEqual(original[0].allocated)
    expect(kept[0].binding).toBe(`alloc:${history[1].id}`)
    expect(kept[0].state).toBe("FORWARDING_REQUIRED")
    expect(await rows<{ id: string | null }>(
      `select admin_private.commercial_authoritative_allocation_id_v1($1::uuid)::text as id`,
      [kept[0].entitlement],
    )).toEqual([{ id: history[1].id }])
    const recorded = await rows<{ value: { recordedCount: number; complete: boolean; admin: { locations: { status: string; e164: string }[] } } }>(
      `select admin_private.commercial_allocation_projection_v1($1) as value`,
      [armed.prepared.subscription],
    )
    expect(recorded[0].value.recordedCount).toBe(1)
    expect(recorded[0].value.complete).toBe(true)
    expect(recorded[0].value.admin.locations[0].status).toBe("recorded")
    expect(recorded[0].value.admin.locations[0].e164).toBe("+441632960503")
    await db.query(`update public.service_provisions set provider_binding_ref = $2 where location_id = $1`, [high, `alloc:${history[0].id}`])
    expect(await rows<{ id: string | null }>(
      `select admin_private.commercial_authoritative_allocation_id_v1($1::uuid)::text as id`,
      [kept[0].entitlement],
    )).toEqual([{ id: null }])
    const stale = await rows<{ value: { recordedCount: number; complete: boolean; admin: { locations: { status: string }[] } } }>(
      `select admin_private.commercial_allocation_projection_v1($1) as value`,
      [armed.prepared.subscription],
    )
    expect(stale[0].value.recordedCount).toBe(0)
    expect(stale[0].value.complete).toBe(false)
    expect(stale[0].value.admin.locations[0].status).toBe("review")
    expect(await rows<{ e164: string; agent: string }>(
      `select e164, agent_ref as agent from admin_private.commercial_provider_number_owners where e164 in ('+441632960501', '+441632960503') order by e164`,
    )).toEqual([
      { e164: "+441632960501", agent: "agent-0021" },
      { e164: "+441632960503", agent: "agent-0021" },
    ])
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_allocation_events`)).toEqual([{ count: 2 }])
    await db.exec("SAVEPOINT no_overwrite")
    await expect(db.query(`update admin_private.commercial_location_allocations set attestation = 'rewritten attestation text'`)).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT no_overwrite")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_allocations`)).toEqual([{ count: 2 }])
  })

  it("refuses a number correction after forwarding evidence and keeps the authoritative reference", async () => {
    const armed = await ready([high])
    const first = await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960531", allocationRef: "evidence-first-a" })
    expect(first).toMatchObject({ status: "success", allocationVersion: 1 })
    const before = await rows<{ allocated: string; binding: string; forwarding: string | null }>(
      `select number_allocated_at as allocated, provider_binding_ref as binding, forwarding_instructed_at as forwarding
       from public.service_provisions where location_id = $1`,
      [high],
    )
    await db.query(`update public.service_provisions set forwarding_instructed_at = now() where location_id = $1`, [high])
    const bumped = await provisionVersion(armed.prepared.subscription, high)
    expect(await allocate(armed, high, {
      agentRef: "agent-0021",
      e164: "+441632960532",
      allocationRef: "evidence-second-b",
      allocationVersion: 1,
      configurationVersion: 1,
      provisionVersion: bumped,
      preferenceVersion: 1,
    })).toMatchObject({ status: "denied", reason: "setup" })
    const after = await rows<{ allocated: string; binding: string; state: string }>(
      `select number_allocated_at as allocated, provider_binding_ref as binding, state from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(after[0].allocated).toEqual(before[0].allocated)
    expect(after[0].binding).toBe(before[0].binding)
    expect(after[0].state).toBe("FORWARDING_REQUIRED")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_allocations`)).toEqual([{ count: 1 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or agent_test_passed_at is not null or customer_confirmed_at is not null or live_at is not null`)).toEqual([{ count: 0 }])
  })

  it("rejects a foreign voice binding for a reserved number or owned agent and keeps a matching inactive binding", async () => {
    const armed = await ready([high, dock])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960541" })).toMatchObject({ status: "success" })
    const rejectedBinding = async (sql: string, params: unknown[]) => {
      await db.exec("SAVEPOINT binding_guard")
      await expect(db.query(sql, params)).rejects.toThrow(/telloya_voice_rejected/)
      await db.exec("ROLLBACK TO SAVEPOINT binding_guard")
    }
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-yard-09', $1, $2, false)`,
      [twin, yard],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-yard-09', $1, $2, true)`,
      [twin, yard],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('production', '+441632960541', 'agent-0021', $1, $2, false)`,
      [bakery, high],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960542', 'agent-0021', $1, $2, false)`,
      [twin, yard],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-other99', $1, $2, false)`,
      [bakery, high],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-0021', $1, $2, false)`,
      [bakery, dock],
    )
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-0021', $1, $2, true)`,
      [bakery, high],
    )
    await db.exec("SAVEPOINT generic_bind")
    await expect(rpc("telloya_voice_bind_number_v1", ["dev", "+441632960541", "agent-0021", bakery, high])).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT generic_bind")
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960541', 'agent-0021', $1, $2, false)`,
      [bakery, high],
    )
    expect(await rows<{ active: boolean; location: string }>(
      `select active, location_id::text as location from public.telloya_voice_number_bindings where inbound_to_number = '+441632960541'`,
    )).toEqual([{ active: false, location: high }])
    await db.exec("SAVEPOINT promote_binding")
    await expect(db.query(
      `update public.telloya_voice_number_bindings set active = true where inbound_to_number = '+441632960541'`,
    )).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT promote_binding")
    expect(await rows<{ active: boolean }>(
      `select active from public.telloya_voice_number_bindings where inbound_to_number = '+441632960541'`,
    )).toEqual([{ active: false }])
    await rejectedBinding(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960546', 'agent-0021', $1, $2, true)`,
      [bakery, high],
    )
    await db.exec("SAVEPOINT generic_other_number")
    await expect(rpc("telloya_voice_bind_number_v1", ["dev", "+441632960547", "agent-0021", bakery, high])).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT generic_other_number")
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960548', 'agent-0021', $1, $2, false)`,
      [bakery, high],
    )
    await db.exec("SAVEPOINT promote_other_number")
    await expect(db.query(
      `update public.telloya_voice_number_bindings set active = true where inbound_to_number = '+441632960548'`,
    )).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT promote_other_number")
    expect(await rows<{ number: string; active: boolean }>(
      `select inbound_to_number as number, active
       from public.telloya_voice_number_bindings
       where agent_id = 'agent-0021'
       order by inbound_to_number`,
    )).toEqual([
      { number: "+441632960541", active: false },
      { number: "+441632960548", active: false },
    ])
    const legacy = await rpc<string>("telloya_voice_bind_number_v1", ["dev", "+441632960543", "agent-legacy1", bakery, high])
    expect(legacy).toMatch(/^[0-9a-f-]{36}$/)
    await db.exec("SAVEPOINT legacy_agent")
    await expect(rpc("telloya_voice_bind_number_v1", ["dev", "+441632960544", "agent-legacy1", bakery, dock])).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT legacy_agent")
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960545', 'agent-legacy2', $1, $2, false)`,
      [bakery, dock],
    )
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings where active`)).toEqual([{ count: 1 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null or agent_test_passed_at is not null`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.guard_coverages`)).toEqual([{ count: 0 }])
  })

  it("refuses a pending allocation when the configured agent already has an active binding", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960561', 'agent-0021', $1, $2, true)`,
      [bakery, high],
    )
    expect(await configure(armed, high, { agentRef: "agent-0021" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960561" })).toMatchObject({ status: "denied", reason: "number" })
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960562" })).toMatchObject({ status: "denied", reason: "routing" })
    expect(await rows<{ count: number }>(
      `select count(*)::int as count from admin_private.commercial_provider_number_owners where e164 in ('+441632960561', '+441632960562')`,
    )).toEqual([{ count: 0 }])
    expect(await rows<{ number: string; active: boolean }>(
      `select inbound_to_number as number, active from public.telloya_voice_number_bindings where agent_id = 'agent-0021'`,
    )).toEqual([{ number: "+441632960561", active: true }])
    expect(await rows<{ state: string; allocated: string | null }>(
      `select state, number_allocated_at as allocated from public.service_provisions where location_id = $1`,
      [high],
    )).toEqual([{ state: "NUMBER_REQUIRED", allocated: null }])
  })

  it("rolls a failed allocation back with its receipt and provision", async () => {
    const armed = await ready([high])
    await db.exec(`
      create function public.fail_allocation_v1() returns trigger language plpgsql as $fn$
      begin
        raise exception 'forced allocation failure';
      end $fn$;
      create trigger fail_allocation before insert on admin_private.commercial_location_allocations
      for each row execute function public.fail_allocation_v1();
    `)
    await expect(allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960511" })).rejects.toThrow(/forced allocation failure/)
    await db.exec("ROLLBACK TO SAVEPOINT confirm_preferences")
    await db.exec("SAVEPOINT confirm_preferences")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_allocations`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_provider_number_owners`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where number_allocated_at is not null or state = 'FORWARDING_REQUIRED'`)).toEqual([{ count: 0 }])
  })

  it("rejects revoked authority, a cancelled subscription, and an ended or unpaid period", async () => {
    const armed = await ready([high])
    await db.query(
      `update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960521" })).toMatchObject({ status: "denied", reason: "revoked" })
    await db.query(
      `update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $3 where customer_id = $1 and business_id = $2`,
      [alex, bakery, actor],
    )
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`, [armed.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960521" })).toMatchObject({ status: "denied", reason: "inactive" })

    const expired = await ready([yard], { business: twin })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`, [expired.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await allocate(expired, yard, { agentRef: "agent-0026", e164: "+441632960522" })).toMatchObject({ status: "denied", reason: "expired" })

    const unpaid = await ready([oven], { product: "COMPLETE", business: kitchen })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await allocate(unpaid, oven, { agentRef: "agent-0024", e164: "+441632960523" })).toMatchObject({ status: "denied", reason: "payment" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_allocations`)).toEqual([{ count: 0 }])
  })
})

const forwardingNotice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."
const forwardingSqlPath = new URL("../../../../supabase/migrations/20261106003939_admin_commercial_record_forwarding_instructions_v1.sql", import.meta.url)

function forwardingText(number: string) {
  return `1. Keep ${number} for the telephone provider. This is the number calls can be sent to once the receptionist is approved. 2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line. 3. ${forwardingNotice}`
}

async function instruct(
  armed: Awaited<ReturnType<typeof pay>>,
  location: string,
  options: {
    request?: string
    status?: "DRAFT" | "SHARED"
    allocationId?: string
    allocationVersion?: number
    instructionVersion?: number
    preferenceVersion?: number
    provisionVersion?: number
    configurationVersion?: number
    subscriptionVersion?: number
    customerId?: string
    environment?: "dev" | "production"
    forwardingMode?: string
    carrierKnown?: boolean
    carrierName?: string | null
    customerTelephone?: string | null
    instructionText?: string
    attestation?: string
    staffConfirmed?: boolean
    e164?: string
    drop?: string
  } = {},
) {
  const current = await versions(armed.prepared.subscription)
  const allocation = (await rows<{ id: string; version: number; e164: string }>(
    `select id::text as id, version, e164
     from admin_private.commercial_location_allocations
     where subscription_id = $1 and location_id = $2
     order by version desc
     limit 1`,
    [armed.prepared.subscription, location],
  ))[0]
  const instruction: Record<string, unknown> = {
    environment: options.environment ?? "dev",
    forwardingMode: options.forwardingMode ?? "UNANSWERED_BUSY_UNREACHABLE",
    carrierKnown: options.carrierKnown ?? false,
    carrierName: options.carrierKnown ? options.carrierName ?? "Example Carrier" : null,
    customerTelephone: options.customerTelephone ?? null,
    instructionRevision: "guide-0001",
    instructionText: options.instructionText ?? forwardingText(options.e164 ?? allocation?.e164 ?? "+441632960441"),
    attestation: options.attestation ?? "The operator prepared these forwarding notes from the recorded allocation.",
    staffConfirmed: options.staffConfirmed ?? true,
    status: options.status ?? "SHARED",
  }
  if (options.drop) delete instruction[options.drop]
  const body = {
    customerId: options.customerId ?? alex,
    businessId: armed.prepared.business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: options.preferenceVersion ?? 1,
    provisionVersion: options.provisionVersion ?? await provisionVersion(armed.prepared.subscription, location),
    configurationVersion: options.configurationVersion ?? 1,
    allocationId: options.allocationId ?? allocation?.id,
    allocationVersion: options.allocationVersion ?? allocation?.version ?? 1,
    instructionVersion: options.instructionVersion ?? 0,
    instruction,
  }
  return rpc<Row>("admin_commercial_record_forwarding_instructions_v1", [
    adminToken,
    options.request ?? randomUUID(),
    armed.prepared.subscription,
    options.subscriptionVersion ?? current.subscription_version,
    JSON.stringify(body),
  ])
}

describe("audited record forwarding instructions", () => {
  it("keeps the command service-role only and does not enable forwarding", () => {
    const source = readFileSync(forwardingSqlPath, "utf8")
    expect(source).toContain("Do not apply 20261106003939 to DEV")
    expect(source).toContain("Do not apply 20261106003939 to Production")
    expect(source).toContain("OPERATOR_ATTESTED")
    expect(source).toContain("FORWARDING_REQUIRED")
    expect(source).toContain("TEST_REQUIRED")
    expect(source).toContain(forwardingNotice)
    expect(source).toContain("preferences_complete := false")
    expect(source).not.toContain("INDEPENDENTLY_VERIFIED")
    expect(source).not.toContain("INSERT INTO public.telloya_voice_number_bindings")
    expect(source).not.toContain("state = 'LIVE'")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED|voice_id/i)
    expect(source).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_record_forwarding_instructions_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_record_forwarding_instructions_v1(text, uuid, uuid, integer, jsonb)")
  })

  it("keeps a Telloya draft internal and shares the current number without enabling forwarding", async () => {
    const armed = await ready([high])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960441" })).toMatchObject({ status: "success" })
    const before = await effects(armed.prepared.subscription)
    const bindings = await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)
    const allocated = await rows<{ allocated: string; binding: string }>(
      `select number_allocated_at as allocated, provider_binding_ref as binding from public.service_provisions where location_id = $1`,
      [high],
    )
    const draft = await instruct(armed, high, { status: "DRAFT", forwardingMode: "UNANSWERED", carrierKnown: false })
    expect(draft).toMatchObject({ status: "success", sharingStatus: "DRAFT", instructionVersion: 1, forwardingInstructed: false, provisionState: "FORWARDING_REQUIRED", routingActive: false })
    const hidden = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(hidden).not.toContain("+441632960441")
    expect(hidden).not.toContain("agent-0021")
    expect(hidden).not.toContain("OPERATOR_ATTESTED")
    expect(hidden).not.toContain("forwardingProgress")
    const shared = await instruct(armed, high, { status: "SHARED", instructionVersion: 1, forwardingMode: "UNANSWERED" })
    expect(shared).toMatchObject({
      status: "success",
      sharingStatus: "SHARED",
      instructionVersion: 2,
      forwardingInstructed: true,
      provisionState: "TEST_REQUIRED",
      routingActive: false,
      e164: "+441632960441",
      nextAction: "Verify AI receptionist test call",
    })
    const provision = await rows<{ state: string; allocated: string; binding: string; forwarding: string | null; test_ref: string | null; tested: string | null; confirmed: string | null; live: string | null }>(
      `select state, number_allocated_at as allocated, provider_binding_ref as binding, forwarding_instructed_at as forwarding,
              provider_test_call_ref as test_ref, agent_test_passed_at as tested, customer_confirmed_at as confirmed, live_at as live
       from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(provision[0].state).toBe("TEST_REQUIRED")
    expect(provision[0].allocated).toEqual(allocated[0].allocated)
    expect(provision[0].binding).toBe(allocated[0].binding)
    expect(provision[0].forwarding).not.toBeNull()
    expect(provision[0].test_ref).toBeNull()
    expect(provision[0].tested).toBeNull()
    expect(provision[0].confirmed).toBeNull()
    expect(provision[0].live).toBeNull()
    const after = await effects(armed.prepared.subscription)
    expect(after.communications).toBe(before.communications)
    expect(after.live).toBe(0)
    expect(after.amount_minor).toBe(before.amount_minor)
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual(bindings)
    const handover = (await rows<{ value: Row }>(`select admin_private.commercial_setup_handover_v1($1) as value`, [armed.prepared.subscription]))[0].value
    expect((handover?.checklist as { state: string }[])[3].state).toBe("complete")
    expect((handover?.checklist as { state: string }[])[4].state).toBe("planned")
    expect((handover?.checklist as { state: string }[])[5].state).toBe("planned")
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain("+441632960441")
    expect(customer).toContain("Unanswered calls")
    expect(customer).toContain(forwardingNotice)
    expect(customer).toContain("Instructions ready — service testing pending")
    expect(customer).not.toContain("agent-0021")
    expect(customer).not.toContain("OPERATOR_ATTESTED")
    expect(customer).not.toContain("forwardingProgress")
    expect(customer).not.toContain("allocationId")
    const blakePending = hash(randomBytes(32).toString("hex"))
    expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["blake.begin@example.com", blakePending])).status).toBe("ok")
    expect((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [blakePending])).status).toBe("ok")
    const blakeHash = hash(randomBytes(32).toString("hex"))
    expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [blakePending, blakeHash, blakeAuth, "blake.begin@example.com"])).status).toBe("ok")
    const otherCustomer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [blakeHash]))
    expect(otherCustomer).not.toContain("+441632960441")
    expect(otherCustomer).not.toContain(armed.prepared.ref)
    const originalForwarding = provision[0].forwarding
    const revised = await instruct(armed, high, { status: "SHARED", instructionVersion: 2, forwardingMode: "BUSY", instructionText: forwardingText("+441632960441").replace("UNANSWERED", "BUSY") })
    expect(revised).toMatchObject({ status: "success", instructionVersion: 3, sharingStatus: "SHARED" })
    const kept = await rows<{ forwarding: string; state: string }>(
      `select forwarding_instructed_at as forwarding, state from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(kept[0].forwarding).toEqual(originalForwarding)
    expect(kept[0].state).toBe("TEST_REQUIRED")
    expect(await instruct(armed, high, { status: "DRAFT", instructionVersion: 3 })).toMatchObject({ status: "denied", reason: "setup" })
    await db.exec("SAVEPOINT forwarding_bind")
    await expect(db.query(
      `select public.telloya_voice_bind_number_v1('dev', '+441632960441', 'agent-0021', $1, $2)`,
      [bakery, high],
    )).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT forwarding_bind")
  })

  it("shares one location of a multi-location Telloya subscription and keeps the other number hidden", async () => {
    const armed = await ready([high, dock])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960451" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960452" })).toMatchObject({ status: "success" })
    const shared = await instruct(armed, high, { status: "SHARED", forwardingMode: "BUSY", carrierKnown: true, carrierName: "Example Carrier" })
    expect(shared).toMatchObject({ status: "success", sharedCount: 1, locationCount: 2, forwardingInstructed: true })
    const dockProvision = await rows<{ state: string; forwarding: string | null }>(
      `select state, forwarding_instructed_at as forwarding from public.service_provisions where location_id = $1`,
      [dock],
    )
    expect(dockProvision[0]).toEqual({ state: "FORWARDING_REQUIRED", forwarding: null })
    const handover = (await rows<{ value: Row }>(`select admin_private.commercial_setup_handover_v1($1) as value`, [armed.prepared.subscription]))[0].value
    expect((handover?.checklist as { state: string }[])[3].state).toBe("planned")
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain("+441632960451")
    expect(customer).toContain("Busy calls")
    expect(customer).toContain("Example Carrier")
    expect(customer).not.toContain("+441632960452")
    expect(customer).not.toContain("agent-0022")
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const progress = queue?.items.find(entry => entry.reference === armed.prepared.ref)?.forwardingProgress as { sharedCount: number; locationCount: number; locations: { locationName: string; status: string }[] }
    expect(progress.sharedCount).toBe(1)
    expect(progress.locationCount).toBe(2)
    expect(progress.locations.map(location => location.status).sort()).toEqual(["needed", "shared"])
  })

  it("shares both locations of a Complete subscription without activating either service", async () => {
    const armed = await ready([oven, counter], { product: "COMPLETE", business: kitchen })
    expect(await allocate(armed, oven, { agentRef: "agent-0024", e164: "+441632960461" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, counter, { agentRef: "agent-0025", e164: "+441632960462" })).toMatchObject({ status: "success" })
    expect(await instruct(armed, oven, { status: "SHARED", forwardingMode: "UNREACHABLE" })).toMatchObject({ status: "success", sharedCount: 1, locationCount: 2 })
    expect(await instruct(armed, counter, { status: "SHARED", forwardingMode: "UNANSWERED_BUSY_UNREACHABLE" })).toMatchObject({
      status: "success",
      sharedCount: 2,
      locationCount: 2,
      nextAction: "Verify AI receptionist test call",
    })
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain("+441632960461")
    expect(customer).toContain("+441632960462")
    expect(customer).toContain("Unreachable calls")
    expect(customer).toContain("Unanswered, busy, and unreachable calls")
    expect(customer).not.toContain("agent-0024")
    expect(customer).not.toContain("agent-0025")
    expect(await rows<{ live: number }>(
      `select count(*)::int as live from public.service_provisions where state = 'LIVE' or agent_test_passed_at is not null or customer_confirmed_at is not null or live_at is not null`,
    )).toEqual([{ live: 0 }])
  })

  it("rejects an invalid, stale, or unrelated allocation and a corrected allocation invalidates the earlier review", async () => {
    const armed = await ready([high, dock])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960471", allocationRef: "evidence-first" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960472" })).toMatchObject({ status: "success" })
    const first = (await rows<{ id: string }>(
      `select id::text as id from admin_private.commercial_location_allocations where location_id = $1`,
      [high],
    ))[0]
    const other = (await rows<{ id: string }>(
      `select id::text as id from admin_private.commercial_location_allocations where location_id = $1`,
      [dock],
    ))[0]
    expect(await instruct(armed, high, { allocationId: randomUUID() })).toMatchObject({ status: "denied", reason: "allocation" })
    expect(await instruct(armed, high, { allocationId: other.id })).toMatchObject({ status: "denied", reason: "allocation" })
    expect(await instruct(armed, high, { allocationVersion: 9 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await instruct(armed, high, { status: "DRAFT" })).toMatchObject({ status: "success", sharingStatus: "DRAFT" })
    const bumped = await provisionVersion(armed.prepared.subscription, high)
    expect(await allocate(armed, high, {
      agentRef: "agent-0021",
      e164: "+441632960473",
      allocationRef: "evidence-corrected",
      allocationVersion: 1,
      configurationVersion: 1,
      provisionVersion: bumped,
      preferenceVersion: 1,
    })).toMatchObject({ status: "success", allocationVersion: 2 })
    const projection = await rows<{ value: { admin: { locations: { locationId: string; status: string; allocationId: string }[] } } }>(
      `select admin_private.commercial_forwarding_projection_v1($1) as value`,
      [armed.prepared.subscription],
    )
    const reviewed = projection[0].value.admin.locations.find(location => location.locationId === high)
    expect(reviewed?.status).toBe("review")
    expect(reviewed?.allocationId).not.toBe(first.id)
    expect(await instruct(armed, high, { allocationId: first.id, instructionVersion: 1, e164: "+441632960471" })).toMatchObject({ status: "denied", reason: "allocation" })
    const shared = await instruct(armed, high, { instructionVersion: 1, e164: "+441632960473" })
    expect(shared).toMatchObject({ status: "success", sharingStatus: "SHARED", e164: "+441632960473" })
    const binding = await rows<{ binding: string; forwarding: string | null }>(
      `select provider_binding_ref as binding, forwarding_instructed_at as forwarding from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(binding[0].binding).toBe(`alloc:${reviewed?.allocationId}`)
    expect(binding[0].forwarding).not.toBeNull()
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_forwarding_instructions where location_id = $1`, [high])).toEqual([{ count: 2 }])
  })

  it("replays one request and rejects a conflicting retry", async () => {
    const armed = await ready([high])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960481" })).toMatchObject({ status: "success" })
    const request = randomUUID()
    const first = await instruct(armed, high, { request, status: "DRAFT" })
    expect(first).toMatchObject({ status: "success", instructionVersion: 1 })
    expect(await instruct(armed, high, { request, status: "DRAFT" })).toEqual(first)
    expect(await instruct(armed, high, { request, status: "SHARED" })).toEqual({ status: "conflict" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_forwarding_instructions`)).toEqual([{ count: 1 }])
    expect(await rows<{ forwarding: string | null }>(`select forwarding_instructed_at as forwarding from public.service_provisions where location_id = $1`, [high])).toEqual([{ forwarding: null }])
  })

  it("rejects revoked authority, an ended period, and an unpaid subscription", async () => {
    const armed = await ready([high])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960491" })).toMatchObject({ status: "success" })
    await db.query(
      `update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    expect(await instruct(armed, high)).toMatchObject({ status: "denied", reason: "revoked" })
    await db.query(
      `update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $3 where customer_id = $1 and business_id = $2`,
      [alex, bakery, actor],
    )

    const expired = await ready([yard], { business: twin })
    expect(await allocate(expired, yard, { agentRef: "agent-0026", e164: "+441632960492" })).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`, [expired.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await instruct(expired, yard)).toMatchObject({ status: "denied", reason: "expired" })

    const unpaid = await ready([oven], { product: "COMPLETE", business: kitchen })
    expect(await allocate(unpaid, oven, { agentRef: "agent-0024", e164: "+441632960493" })).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await instruct(unpaid, oven)).toMatchObject({ status: "denied", reason: "payment" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_forwarding_instructions`)).toEqual([{ count: 0 }])
  })

  it("rejects another customer and does not disclose the number before sharing", async () => {
    const armed = await ready([high])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960494" })).toMatchObject({ status: "success" })
    expect(await instruct(armed, high, { customerId: blake, status: "DRAFT" })).toMatchObject({ status: "denied", reason: "customer" })
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).not.toContain("+441632960494")
    expect(customer).not.toContain("agent-0021")
  })
})

const testSqlPath = new URL("../../../../supabase/migrations/20261106120000_admin_commercial_verify_agent_test_call_v1.sql", import.meta.url)
const passedConversation = "Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live."

function stamp(value: unknown, offsetMs: number) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value))
  return new Date(parsed + offsetMs).toISOString()
}

function assessment(patch: Record<string, unknown> = {}) {
  return {
    attestation: "I reviewed this controlled agent conversation against the confirmed preferences.",
    avoidsUnsupportedPromises: true,
    businessHours: true,
    callbackWindows: true,
    callerIdentity: true,
    conclusion: true,
    enquiryDetails: true,
    escalation: true,
    greeting: true,
    languageVoice: true,
    staffConfirmed: true,
    ...patch,
  }
}

async function evidenceBody(location: string, patch: Record<string, unknown> = {}) {
  const found = await rows<{ at: string | Date }>(
    `select agent_configured_at as at from public.service_provisions where location_id = $1`,
    [location],
  )
  return {
    agentId: `agent-${location.slice(-4)}`,
    agentVersion: 4,
    agentVersionQuality: "present",
    availability: "retrieved",
    callId: `call${location.slice(-4)}ok`,
    callStatus: "ended",
    callType: "web_call",
    disconnectionReason: "user_hangup",
    endedAt: stamp(found[0].at, 2000),
    environment: "dev",
    providerError: false,
    startedAt: stamp(found[0].at, 1000),
    testScope: "AGENT_DIRECT",
    ...patch,
  }
}

async function serviceRow(location: string) {
  return (await rows<{
    state: string
    allocated: string
    binding: string
    forwarding: string
    test_ref: string | null
    outcome: string | null
    tested: string | null
    confirmed: string | null
    live: string | null
  }>(
    `select state, number_allocated_at as allocated, provider_binding_ref as binding, forwarding_instructed_at as forwarding,
            provider_test_call_ref as test_ref, provider_test_outcome as outcome, agent_test_passed_at as tested,
            customer_confirmed_at as confirmed, live_at as live
     from public.service_provisions where location_id = $1`,
    [location],
  ))[0]
}

async function verify(
  armed: Awaited<ReturnType<typeof pay>>,
  location: string,
  options: {
    request?: string
    evidence?: Record<string, unknown>
    qa?: Record<string, unknown>
    dropEvidence?: string
    dropQa?: string
    configurationVersion?: number
    allocationVersion?: number
    instructionVersion?: number
    instructionId?: string
    provisionVersion?: number
    preferenceVersion?: number
    subscriptionVersion?: number
    customerId?: string
    body?: Record<string, unknown>
  } = {},
) {
  const current = await versions(armed.prepared.subscription)
  const allocation = (await rows<{ id: string; version: number }>(
    `select id::text as id, version from admin_private.commercial_location_allocations
     where subscription_id = $1 and location_id = $2 order by version desc limit 1`,
    [armed.prepared.subscription, location],
  ))[0]
  const instruction = (await rows<{ id: string; version: number }>(
    `select id::text as id, version from admin_private.commercial_forwarding_instructions
     where subscription_id = $1 and location_id = $2 order by version desc limit 1`,
    [armed.prepared.subscription, location],
  ))[0]
  const evidence: Record<string, unknown> = { ...(await evidenceBody(location, options.evidence)) }
  if (!options.evidence || !("agentVersionQuality" in options.evidence)) {
    evidence.agentVersionQuality = evidence.agentVersion == null ? "missing" : "present"
  }
  const qa: Record<string, unknown> = { ...assessment(options.qa) }
  if (options.dropEvidence) delete evidence[options.dropEvidence]
  if (options.dropQa) delete qa[options.dropQa]
  const body = options.body ?? {
    customerId: options.customerId ?? alex,
    businessId: armed.prepared.business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: options.preferenceVersion ?? 1,
    provisionVersion: options.provisionVersion ?? await provisionVersion(armed.prepared.subscription, location),
    configurationVersion: options.configurationVersion ?? 1,
    allocationId: allocation.id,
    allocationVersion: options.allocationVersion ?? allocation.version,
    instructionId: options.instructionId ?? instruction.id,
    instructionVersion: options.instructionVersion ?? instruction.version,
    evidence,
    qa,
  }
  const result = await rpc<Row>("admin_commercial_verify_agent_test_call_v1", [
    adminToken,
    options.request ?? randomUUID(),
    armed.prepared.subscription,
    options.subscriptionVersion ?? current.subscription_version,
    JSON.stringify(body),
  ])
  return Object.assign(result, { body, subscriptionVersion: options.subscriptionVersion ?? current.subscription_version })
}

/**
 * Direct insert used by verification tests.
 * The initiation command is the product path that binds a provider create response.
 * This fixture is not that command and does not call a provider.
 */
async function simulateProviderCreatedTest(
  subscription: string,
  location: string,
  callId: string,
  patch: {
    agentRef?: string
    environment?: string
    businessId?: string
    locationId?: string
    providerRevision?: string
    createdAt?: string
    boundAt?: string
    windowStartsAt?: string
    windowEndsAt?: string
    omitBinding?: boolean
    bindingCallId?: string
  } = {},
) {
  const cfg = (await rows<{
    id: string
    customer_id: string
    business_id: string
    entitlement_id: string
    version: number
    agent_ref: string
    provider_revision: string
    environment: string
  }>(
    `select id::text as id, customer_id::text as customer_id, business_id::text as business_id, entitlement_id::text as entitlement_id,
            version, agent_ref, provider_revision, environment
     from admin_private.commercial_location_configurations
     where subscription_id = $1 and location_id = $2
     order by version desc limit 1`,
    [subscription, location],
  ))[0]
  const configured = (await rows<{ at: string | Date }>(
    `select agent_configured_at as at from public.service_provisions where location_id = $1`,
    [location],
  ))[0].at
  const boundAt = patch.boundAt ?? stamp(configured, 1000)
  const createdAt = patch.createdAt ?? stamp(boundAt, -30000)
  const windowStartsAt = patch.windowStartsAt ?? stamp(createdAt, -30000)
  const windowEndsAt = patch.windowEndsAt ?? stamp(boundAt, 30 * 60 * 1000)
  const sessionRef = `TS-26-${randomBytes(4).toString("hex").toUpperCase()}`
  const intent = (await rows<{ id: string }>(
    `insert into admin_private.commercial_agent_test_intents(
       subscription_id, customer_id, business_id, entitlement_id, location_id, actor_id,
       configuration_id, configuration_version, agent_ref, provider_revision, environment,
       window_starts_at, window_ends_at, test_session_ref, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     returning id::text as id`,
    [
      subscription,
      cfg.customer_id,
      patch.businessId ?? cfg.business_id,
      cfg.entitlement_id,
      patch.locationId ?? location,
      adminUser,
      cfg.id,
      cfg.version,
      patch.agentRef ?? cfg.agent_ref,
      patch.providerRevision ?? cfg.provider_revision,
      patch.environment ?? cfg.environment,
      windowStartsAt,
      windowEndsAt,
      sessionRef,
      createdAt,
    ],
  ))[0]
  if (patch.omitBinding) return { intentId: intent.id, bindingId: null, sessionRef }
  const binding = (await rows<{ id: string }>(
    `insert into admin_private.commercial_agent_test_bindings(intent_id, provider_call_id, bound_at)
     values ($1,$2,$3) returning id::text as id`,
    [intent.id, patch.bindingCallId ?? callId, boundAt],
  ))[0]
  return { intentId: intent.id, bindingId: binding.id, sessionRef }
}

async function shared(location: string, e164: string, options: { ready?: Parameters<typeof ready>[1]; agentRef?: string } = {}) {
  const armed = await ready([location], options.ready)
  expect(await allocate(armed, location, { agentRef: options.agentRef ?? `agent-${location.slice(-4)}`, e164 })).toMatchObject({ status: "success" })
  expect(await instruct(armed, location, { status: "SHARED" })).toMatchObject({ status: "success", provisionState: "TEST_REQUIRED" })
  return armed
}

describe("audited AI receptionist test call", () => {
  it("keeps the command service-role only and does not place a call", () => {
    const source = readFileSync(testSqlPath, "utf8")
    expect(source).toContain("Do not apply 20261106120000 to DEV")
    expect(source).toContain("Do not apply 20261106120000 to Production")
    expect(source).toContain("must not be applied to hosted DEV")
    expect(source).toContain("AGENT_DIRECT")
    expect(source).toContain("PENDING_VERIFICATION")
    expect(source).toContain("VERIFIED_PASSED")
    expect(source).toContain("VERIFIED_FAILED")
    expect(source).toContain("REQUIRES_REVIEW")
    expect(source).toContain("pre-authorised")
    expect(source).toContain("commercial_agent_test_bindings")
    expect(source).toContain("commercial_agent_test_revision_number_v1")
    expect(source).toContain("rev-[0-9]{4}")
    expect(source).toContain("typed call id")
    expect(source).not.toContain("commercial_agent_test_trust_call_v1")
    expect(source).not.toContain("p_call_id")
    expect(source).not.toContain("SERVER_BOUND")
    const routeSource = readFileSync(new URL("./verify-agent-test-call.ts", import.meta.url), "utf8")
    expect(routeSource).not.toContain("commercial_agent_test_trust_call_v1")
    expect(routeSource).not.toContain("commercial_agent_test_bindings")
    expect(source).toContain("AWAITING_CONFIRMATION")
    expect(source).toContain("TEST_REQUIRED")
    expect(source).toContain(passedConversation)
    expect(source).toContain("preferences_complete := false")
    expect(source).not.toContain("INDEPENDENTLY_VERIFIED")
    expect(source).not.toContain("INSERT INTO public.telloya_voice_number_bindings")
    expect(source).not.toContain("state = 'LIVE'")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED|voice_id/i)
    expect(source).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_verify_agent_test_call_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_verify_agent_test_call_v1(text, uuid, uuid, integer, jsonb)")
  })

  it("maps rev-0004 to provider version 4 and leaves an unrecognised revision unpassed", async () => {
    expect(await rows<{ revision: string; version: number | null }>(
      `select revision, admin_private.commercial_agent_test_revision_number_v1(revision) as version
       from (values
         ('rev-0004'), ('rev-0005'), ('rev-0000'), ('rev-4'), ('rev-00004'),
         ('4'), ('0004'), ('REV-0004'), ('rev-0004 '), ('rev-00a4'), ('note-0004')
       ) as sample(revision)`,
    )).toEqual([
      { revision: "rev-0004", version: 4 },
      { revision: "rev-0005", version: 5 },
      { revision: "rev-0000", version: 0 },
      { revision: "rev-4", version: null },
      { revision: "rev-00004", version: null },
      { revision: "4", version: null },
      { revision: "0004", version: null },
      { revision: "REV-0004", version: null },
      { revision: "rev-0004 ", version: null },
      { revision: "rev-00a4", version: null },
      { revision: "note-0004", version: null },
    ])
    expect(await rows<{ version: number | null }>(
      `select admin_private.commercial_agent_test_revision_number_v1(null) as version`,
    )).toEqual([{ version: null }])
    expect(await rows<{ allowed: boolean }>(
      `select has_function_privilege('service_role', 'admin_private.commercial_agent_test_revision_number_v1(text)', 'execute') as allowed`,
    )).toEqual([{ allowed: false }])
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    expect(await configure(armed, high, { revision: "note-0004", agentRef: "agent-0021" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, high, { revision: "note-0004", agentRef: "agent-0021", e164: "+441632960681" })).toMatchObject({ status: "success" })
    expect(await instruct(armed, high, { status: "SHARED" })).toMatchObject({ status: "success", provisionState: "TEST_REQUIRED" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021badrev")
    expect(await verify(armed, high, { evidence: { callId: "call0021badrev", agentVersion: 4 } })).toMatchObject({
      evidenceOutcome: "REQUIRES_REVIEW",
      testPassed: false,
      provisionState: "TEST_REQUIRED",
    })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
  })

  it("records a verified direct agent test and replays the same request", async () => {
    const armed = await shared(high, "+441632960601")
    const before = await serviceRow(high)
    const request = randomUUID()
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021ok")
    const passed = await verify(armed, high, { request })
    expect(passed).toMatchObject({
      status: "success",
      evidenceOutcome: "VERIFIED_PASSED",
      evidenceVersion: 1,
      provisionState: "AWAITING_CONFIRMATION",
      testPassed: true,
      routingActive: false,
      forwardingVerified: false,
      nextAction: "Confirm readiness for the final telephone connection",
    })
    const replay = await verify(armed, high, { request, subscriptionVersion: passed.subscriptionVersion, body: passed.body })
    expect(replay).toMatchObject({
      status: "success",
      evidenceOutcome: "VERIFIED_PASSED",
      evidenceVersion: 1,
      provisionState: "AWAITING_CONFIRMATION",
    })
    const after = await serviceRow(high)
    expect(after.state).toBe("AWAITING_CONFIRMATION")
    expect(after.outcome).toBe("PASSED")
    expect(after.test_ref).toBe("call0021ok")
    expect(after.tested).toBeTruthy()
    expect(after.allocated).toEqual(before.allocated)
    expect(after.binding).toBe(before.binding)
    expect(after.forwarding).toEqual(before.forwarding)
    expect(after.confirmed).toBeNull()
    expect(after.live).toBeNull()
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_agent_test_evidence`)).toEqual([{ count: 1 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or customer_confirmed_at is not null or live_at is not null`)).toEqual([{ count: 0 }])
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain(passedConversation)
    expect(customer).not.toContain("call0021ok")
    expect(customer).not.toContain("agent-0021")
    expect(customer).not.toContain("testProgress")
    expect(customer).not.toContain("Call forwarding verified")
    expect(customer).not.toContain("Your telephone line is connected")
    expect(customer).not.toContain("Your receptionist is answering calls")
    expect(customer).not.toContain("Service activated")
    const again = await verify(armed, high, { evidence: { callId: "call0021new", agentVersion: null } })
    expect(again).toMatchObject({ status: "denied", reason: "setup" })
    expect((await serviceRow(high)).test_ref).toBe("call0021ok")
    await db.exec("SAVEPOINT test_binding")
    await expect(db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('dev', '+441632960601', 'agent-0021', $1, $2, true)`,
      [bakery, high],
    )).rejects.toThrow(/telloya_voice_rejected/)
    await db.exec("ROLLBACK TO SAVEPOINT test_binding")
    const changed = await verify(armed, high, {
      request,
      subscriptionVersion: passed.subscriptionVersion,
      body: { ...passed.body, evidence: { ...(passed.body.evidence as Record<string, unknown>), callId: "call0021new" } },
    })
    expect(changed).toMatchObject({ status: "conflict" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_agent_test_evidence`)).toEqual([{ count: 1 }])
  })

  it("keeps failed, unfinished, unknown, and mismatched calls without advancing the service", async () => {
    const armed = await shared(high, "+441632960611")
    const failed = await verify(armed, high, { evidence: { providerError: true, callId: "call0021err" } })
    expect(failed).toMatchObject({ status: "success", evidenceOutcome: "VERIFIED_FAILED", testPassed: false, provisionState: "TEST_REQUIRED", forwardingVerified: false })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
    expect(await verify(armed, high, { evidence: { availability: "not_found", callId: "call0021miss", agentId: null, callStatus: null, callType: null, startedAt: null, endedAt: null } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { agentId: "agent-other", callId: "call0021bad" } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED" })
    expect(await verify(armed, high, { evidence: { environment: "production", callId: "call0021env" } })).toMatchObject({ status: "denied", reason: "environment" })
    expect(await verify(armed, high, { evidence: { callStatus: "ongoing", callId: "call0021run", endedAt: null } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { callStatus: "error", callId: "call0021bad2" } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED" })
    expect(await verify(armed, high, { evidence: { availability: "unavailable", callId: "call0021gap", agentId: null, callStatus: null, callType: null, startedAt: null, endedAt: null } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", providerStatus: "unavailable" })
    expect(await verify(armed, high, { evidence: { callType: "phone_call", callId: "call0021phn" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { agentVersion: 5, callId: "call0021old" } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED" })
    expect(await verify(armed, high, { evidence: { agentVersion: "rev-0004", callId: "call0021txt" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { agentVersion: "4", callId: "call0021str" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    const configured = await rows<{ at: string | Date }>(`select agent_configured_at as at from public.service_provisions where location_id = $1`, [high])
    expect(await verify(armed, high, { evidence: { callId: "call0021early", startedAt: stamp(configured[0].at, -3600000), endedAt: stamp(configured[0].at, -3500000) } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { callId: "call0021qa" }, qa: { greeting: false } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    const missing = randomUUID()
    expect(await verify(armed, high, { request: missing, qa: { staffConfirmed: false } })).toMatchObject({ status: "invalid" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_command_receipts where request_id = $1`, [missing])).toEqual([{ count: 0 }])
    expect(await verify(armed, high, { configurationVersion: 2, evidence: { callId: "call0021cfg" } })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await verify(armed, high, { allocationVersion: 9, evidence: { callId: "call0021alc" } })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await verify(armed, high, { instructionVersion: 9, evidence: { callId: "call0021ins" } })).toMatchObject({ status: "conflict", reason: "version" })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
    expect((await serviceRow(high)).test_ref).toBeNull()
    const history = await rows<{ outcome: string }>(`select outcome from admin_private.commercial_agent_test_evidence order by version`)
    expect(history.map(row => row.outcome)).toContain("VERIFIED_FAILED")
    expect(history.some(row => row.outcome === "VERIFIED_PASSED")).toBe(false)
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021yes")
    const passed = await verify(armed, high, { evidence: { callId: "call0021yes", agentVersion: 4 } })
    expect(passed).toMatchObject({ evidenceOutcome: "VERIFIED_PASSED", provisionState: "AWAITING_CONFIRMATION" })
    expect(await rows<{ outcome: string }>(`select outcome from admin_private.commercial_agent_test_evidence where outcome = 'VERIFIED_FAILED'`)).not.toEqual([])
    await db.exec("SAVEPOINT test_append")
    await expect(db.query(`delete from admin_private.commercial_agent_test_evidence`)).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT test_append")
  })

  it("does not reuse one passed call for another location", async () => {
    const first = await ready([high, dock])
    expect(await allocate(first, high, { agentRef: "agent-0021", e164: "+441632960621" })).toMatchObject({ status: "success" })
    expect(await allocate(first, dock, { agentRef: "agent-0022", e164: "+441632960623" })).toMatchObject({ status: "success" })
    expect(await instruct(first, high, { status: "SHARED" })).toMatchObject({ status: "success" })
    expect(await instruct(first, dock, { status: "SHARED" })).toMatchObject({ status: "success" })
    await simulateProviderCreatedTest(first.prepared.subscription, high, "callshared01")
    expect(await verify(first, high, { evidence: { callId: "callshared01" } })).toMatchObject({ evidenceOutcome: "VERIFIED_PASSED" })
    expect(await verify(first, dock, { evidence: { callId: "callshared01", agentId: "agent-0022", agentVersion: null } })).toMatchObject({ status: "denied", reason: "call" })
    expect((await serviceRow(dock)).state).toBe("TEST_REQUIRED")
    expect((await serviceRow(high)).test_ref).toBe("callshared01")
    const second = await shared(yard, "+441632960622", { ready: { business: twin }, agentRef: "agent-0026" })
    expect(await verify(second, yard, { evidence: { callId: "callshared01", agentId: "agent-0026", agentVersion: null } })).toMatchObject({ status: "denied", reason: "call" })
    expect((await serviceRow(yard)).state).toBe("TEST_REQUIRED")
  })

  it("rejects a revoked, unpaid, or expired subscription", async () => {
    const revoked = await shared(high, "+441632960631")
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where customer_id = $1 and business_id = $2`, [alex, bakery])
    await db.exec("set local session_replication_role = origin")
    expect(await verify(revoked, high)).toMatchObject({ status: "denied", reason: "revoked" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $3 where customer_id = $1 and business_id = $2`, [alex, bakery, actor])
    await db.exec("set local session_replication_role = origin")

    const expired = await shared(yard, "+441632960632", { ready: { business: twin }, agentRef: "agent-0026" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`, [expired.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await verify(expired, yard, { evidence: { agentId: "agent-0026" } })).toMatchObject({ status: "denied", reason: "expired" })

    const unpaid = await shared(oven, "+441632960633", { ready: { product: "COMPLETE", business: kitchen }, agentRef: "agent-0024" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await verify(unpaid, oven, { evidence: { agentId: "agent-0024", callId: "call0024ok" } })).toMatchObject({ status: "denied", reason: "payment" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_agent_test_evidence`)).toEqual([{ count: 0 }])
  })

  it("advances one location without treating another location as tested", async () => {
    const armed = await ready([high, dock])
    expect(await allocate(armed, high, { agentRef: "agent-0021", e164: "+441632960641" })).toMatchObject({ status: "success" })
    expect(await allocate(armed, dock, { agentRef: "agent-0022", e164: "+441632960642" })).toMatchObject({ status: "success" })
    expect(await instruct(armed, high, { status: "SHARED" })).toMatchObject({ status: "success" })
    expect(await instruct(armed, dock, { status: "SHARED" })).toMatchObject({ status: "success" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "callhigh001")
    expect(await verify(armed, high, { evidence: { callId: "callhigh001" } })).toMatchObject({
      evidenceOutcome: "VERIFIED_PASSED",
      nextAction: "Verify AI receptionist test call",
    })
    expect((await serviceRow(high)).state).toBe("AWAITING_CONFIRMATION")
    expect((await serviceRow(dock)).state).toBe("TEST_REQUIRED")
    expect((await serviceRow(dock)).test_ref).toBeNull()
    const handover = (await rows<{ value: Row }>(`select admin_private.commercial_setup_handover_v1($1) as value`, [armed.prepared.subscription]))[0].value
    expect((handover.checklist as { key: string; state: string }[]).find(step => step.key === "test")?.state).toBe("planned")
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain(passedConversation)
    expect(customer).toContain("The conversation test has not been recorded.")
    expect(customer).not.toContain("callhigh001")
    expect(customer).not.toContain("agent-0021")
    expect(customer).not.toContain("testProgress")
    await simulateProviderCreatedTest(armed.prepared.subscription, dock, "calldock001")
    expect(await verify(armed, dock, { evidence: { callId: "calldock001", agentId: "agent-0022" } })).toMatchObject({
      evidenceOutcome: "VERIFIED_PASSED",
      nextAction: "Confirm readiness for the final telephone connection",
    })
    const finished = (await rows<{ value: Row }>(`select admin_private.commercial_setup_handover_v1($1) as value`, [armed.prepared.subscription]))[0].value
    expect(finished.message).toBe(passedConversation)
    expect((finished.checklist as { key: string; state: string }[]).find(step => step.key === "test")?.state).toBe("complete")
    expect((finished.checklist as { key: string; state: string }[]).find(step => step.key === "activation")?.state).toBe("planned")
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or live_at is not null`)).toEqual([{ count: 0 }])
  })

  it("passes only a server-bound, versioned, finished controlled test", async () => {
    const armed = await shared(high, "+441632960651")
    const current = await versions(armed.prepared.subscription)
    const allocation = (await rows<{ id: string; version: number }>(
      `select id::text as id, version from admin_private.commercial_location_allocations where location_id = $1`,
      [high],
    ))[0]
    const instruction = (await rows<{ id: string; version: number }>(
      `select id::text as id, version from admin_private.commercial_forwarding_instructions where location_id = $1`,
      [high],
    ))[0]
    expect(await rpc<Row>("admin_commercial_agent_test_preflight_v1", [
      adminToken,
      armed.prepared.subscription,
      current.subscription_version,
      alex,
      bakery,
      high,
      "dev",
      current.request_id,
      current.request_version,
      1,
      1,
      allocation.id,
      allocation.version,
      instruction.id,
      instruction.version,
      await provisionVersion(armed.prepared.subscription, high),
    ])).toEqual({ status: "eligible" })
    expect(await rpc<Row>("admin_commercial_agent_test_preflight_v1", [
      adminToken,
      armed.prepared.subscription,
      current.subscription_version,
      alex,
      twin,
      yard,
      "dev",
      current.request_id,
      current.request_version,
      1,
      1,
      allocation.id,
      allocation.version,
      instruction.id,
      instruction.version,
      1,
    ])).toMatchObject({ status: "denied" })
    expect(await verify(armed, high, { evidence: { callId: "call0021web" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", testPassed: false })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
    expect(JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))).not.toContain(passedConversation)
    expect(await verify(armed, high, { evidence: { callId: "call0021nil", agentVersion: null } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    expect(await verify(armed, high, { evidence: { callId: "call0021dif", agentVersion: 5 } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021txt")
    expect(await verify(armed, high, { evidence: { callId: "call0021txt", agentVersion: "rev-0004" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", testPassed: false })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021str")
    expect(await verify(armed, high, { evidence: { callId: "call0021str", agentVersion: "4" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", testPassed: false })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021run")
    expect(await verify(armed, high, { evidence: { callId: "call0021run", callStatus: "ongoing", endedAt: null } })).toMatchObject({ evidenceOutcome: "PENDING_VERIFICATION" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021reg")
    expect(await verify(armed, high, { evidence: { callId: "call0021reg", callStatus: "registered", startedAt: null, endedAt: null } })).toMatchObject({ evidenceOutcome: "PENDING_VERIFICATION" })
    const same = stamp((await rows<{ at: string | Date }>(`select agent_configured_at as at from public.service_provisions where location_id = $1`, [high]))[0].at, 1000)
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021zero")
    expect(await verify(armed, high, { evidence: { callId: "call0021zero", startedAt: same, endedAt: same } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021notime")
    expect(await verify(armed, high, { evidence: { callId: "call0021notime", startedAt: null, endedAt: null } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021bad")
    expect(await verify(armed, high, { evidence: { callId: "call0021bad", providerError: true } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED", testPassed: false })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021qa2")
    expect(await verify(armed, high, { evidence: { callId: "call0021qa2" }, qa: { greeting: false } })).toMatchObject({ evidenceOutcome: "VERIFIED_FAILED" })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021ok2")
    expect(await verify(armed, high, { evidence: { callId: "call0021ok2" } })).toMatchObject({ evidenceOutcome: "VERIFIED_PASSED", provisionState: "AWAITING_CONFIRMATION", forwardingVerified: false })
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or live_at is not null or customer_confirmed_at is not null`)).toEqual([{ count: 0 }])
  })

  it("accepts only a pre-authorised intent with a matching provider binding", async () => {
    const armed = await shared(high, "+441632960661")
    expect(await rows<{ name: string | null }>(`select to_regprocedure('admin_private.commercial_agent_test_trust_call_v1(text,uuid,uuid,text)')::text as name`)).toEqual([{ name: null }])
    expect(await rows<{ name: string }>(
      `select procedure.proname as name
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname in ('admin_private', 'public')
         and procedure.prokind = 'f'
         and procedure.prosrc ~* 'insert[[:space:]]+into[[:space:]]+admin_private\\.commercial_agent_test_bindings'
       order by procedure.proname`,
    )).toEqual([{ name: "admin_commercial_bind_agent_test_call_v1" }])
    expect(await rows<{ allowed: boolean }>(
      `select has_table_privilege('service_role', 'admin_private.commercial_agent_test_intents', 'INSERT') as allowed`,
    )).toEqual([{ allowed: false }])
    expect(await rows<{ allowed: boolean }>(
      `select has_table_privilege('service_role', 'admin_private.commercial_agent_test_bindings', 'INSERT') as allowed`,
    )).toEqual([{ allowed: false }])
    expect(await verify(armed, high, { evidence: { callId: "call0021bare" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", testPassed: false, provisionState: "TEST_REQUIRED" })
    expect(JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))).not.toContain(passedConversation)
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021only", { omitBinding: true })
    expect(await verify(armed, high, { evidence: { callId: "call0021only" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021miss", { bindingCallId: "call0021else" })
    expect(await verify(armed, high, { evidence: { callId: "call0021miss" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021biz", { businessId: twin })
    expect(await verify(armed, high, { evidence: { callId: "call0021biz" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021loc", { locationId: dock })
    expect(await verify(armed, high, { evidence: { callId: "call0021loc" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021agt", { agentRef: "agent-other" })
    expect(await verify(armed, high, { evidence: { callId: "call0021agt" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021env2", { environment: "production" })
    expect(await verify(armed, high, { evidence: { callId: "call0021env2" } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW" })
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021once")
    await db.exec("SAVEPOINT reuse_binding")
    await expect(simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021once", { locationId: dock })).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT reuse_binding")
    await db.exec("SAVEPOINT outside_window")
    await expect(simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021out", {
      createdAt: new Date().toISOString(),
      windowStartsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      windowEndsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      boundAt: new Date(Date.now() + 70 * 60 * 1000).toISOString(),
    })).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT outside_window")
    await db.exec("SAVEPOINT early_binding")
    const now = Date.now()
    await expect(simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021back", {
      createdAt: new Date(now).toISOString(),
      boundAt: new Date(now - 60 * 60 * 1000).toISOString(),
      windowStartsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      windowEndsAt: new Date(now + 60 * 60 * 1000).toISOString(),
    })).rejects.toThrow(/pre-authorised window/)
    await db.exec("ROLLBACK TO SAVEPOINT early_binding")
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.service_provisions set agent_configured_at = now() - interval '3 hours' where location_id = $1`, [high])
    await db.exec("set local session_replication_role = origin")
    const started = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const ended = new Date(Date.now() - 29 * 60 * 1000).toISOString()
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021skew", {
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      boundAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      windowStartsAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      windowEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    expect(await verify(armed, high, { evidence: { callId: "call0021skew", startedAt: started, endedAt: ended } })).toMatchObject({ evidenceOutcome: "REQUIRES_REVIEW", testPassed: false })
    expect((await serviceRow(high)).state).toBe("TEST_REQUIRED")
    await simulateProviderCreatedTest(armed.prepared.subscription, high, "call0021fit", {
      createdAt: new Date(Date.parse(started) - 30000).toISOString(),
      boundAt: started,
      windowStartsAt: new Date(Date.parse(started) - 60000).toISOString(),
      windowEndsAt: new Date(Date.parse(started) + 30 * 60 * 1000).toISOString(),
    })
    expect(await verify(armed, high, { evidence: { callId: "call0021fit", startedAt: started, endedAt: ended } })).toMatchObject({ evidenceOutcome: "VERIFIED_PASSED", provisionState: "AWAITING_CONFIRMATION", forwardingVerified: false })
    const customer = JSON.stringify(await rpc<Row>("customer_portal_setup_handover_v1", [session]))
    expect(customer).toContain(passedConversation)
    expect(customer).not.toContain("call0021fit")
    expect(customer).not.toContain("call0021bare")
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or live_at is not null`)).toEqual([{ count: 0 }])
  })

  it("opens a controlled web call only from the server response and leaves the service unactivated", async () => {
    const source = readFileSync(new URL("../../../../supabase/migrations/20261106200000_admin_commercial_initiate_agent_test_call_v1.sql", import.meta.url), "utf8")
    expect(source).toContain("Do not apply 20261106200000 to hosted DEV")
    expect(source).toContain("Do not apply 20261106200000 to Production")
    expect(source).not.toContain("commercial_agent_test_trust_call_v1")
    expect(source).not.toContain("p_call_id")
    expect(source).not.toContain("state = 'LIVE'")
    expect(source).not.toContain("INSERT INTO public.telloya_voice_number_bindings")
    expect(source).not.toMatch(/\bretell\b/i)
    expect(await rows<{ name: string }>(
      `select proname as name from pg_proc
       where prokind = 'f' and pronamespace = 'public'::regnamespace
         and prosrc ilike '%insert into admin_private.commercial_agent_test_bindings%'
       order by proname`,
    )).toEqual([{ name: "admin_commercial_bind_agent_test_call_v1" }])
    expect(await rows<{ allowed: boolean }>(
      `select has_function_privilege('anon', 'public.admin_commercial_prepare_agent_test_call_v1(text,uuid,uuid,integer,text,jsonb)', 'execute') as allowed`,
    )).toEqual([{ allowed: false }])
    expect(await rows<{ allowed: boolean }>(
      `select has_function_privilege('service_role', 'public.admin_commercial_bind_agent_test_call_v1(text,uuid,uuid,integer,text,jsonb)', 'execute') as allowed`,
    )).toEqual([{ allowed: true }])

    const denied = await pay({ locations: [high] })
    expect(await begin(denied)).toMatchObject({ status: "success" })
    expect(await confirm(denied, high)).toMatchObject({ status: "success" })
    expect(await configure(denied, high, { revision: "note-0004", agentRef: "agent-0021" })).toMatchObject({ status: "success" })
    expect(await allocate(denied, high, { revision: "note-0004", agentRef: "agent-0021", e164: "+441632960691" })).toMatchObject({ status: "success" })
    expect(await instruct(denied, high, { status: "SHARED" })).toMatchObject({ status: "success", provisionState: "TEST_REQUIRED" })
    const deniedRequest = randomUUID()
    expect(await rpc<Row>("admin_commercial_prepare_agent_test_call_v1", [
      adminToken,
      deniedRequest,
      denied.prepared.subscription,
      (await versions(denied.prepared.subscription)).subscription_version,
      "dev",
      JSON.stringify(await initiationContext(denied, high)),
    ])).toMatchObject({ status: "denied", reason: "revision" })
    expect(await rows<{ count: number }>(
      `select count(*)::int as count from admin_private.commercial_agent_test_intents where initiation_request_id = $1`,
      [deniedRequest],
    )).toEqual([{ count: 0 }])

    const armed = await shared(yard, "+441632960692", { ready: { business: twin }, agentRef: "agent-0026" })
    const request = randomUUID()
    const context = await initiationContext(armed, yard)
    const prepared = await rpc<Row>("admin_commercial_prepare_agent_test_call_v1", [
      adminToken,
      request,
      armed.prepared.subscription,
      (await versions(armed.prepared.subscription)).subscription_version,
      "dev",
      JSON.stringify(context),
    ])
    expect(prepared).toMatchObject({ status: "prepared", agentRef: "agent-0026", agentVersion: 4, environment: "dev" })
    expect(prepared).not.toHaveProperty("callId")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_agent_test_bindings`)).toEqual([{ count: 0 }])
    expect((await serviceRow(yard)).state).toBe("TEST_REQUIRED")
    const bound = await rpc<Row>("admin_commercial_bind_agent_test_call_v1", [
      adminToken,
      request,
      armed.prepared.subscription,
      (await versions(armed.prepared.subscription)).subscription_version,
      "dev",
      JSON.stringify({ ...context, providerCallId: "calldockweb1", reportedAgentId: "agent-0026", reportedAgentVersion: 4, callType: "web_call" }),
    ])
    expect(bound).toMatchObject({
      status: "success",
      callId: "calldockweb1",
      agentVersion: 4,
      provisionState: "TEST_REQUIRED",
      forwardingVerified: false,
      testPassed: false,
    })
    const binding = (await rows<{ bound_at: string | Date }>(
      `select bound_at from admin_private.commercial_agent_test_bindings where provider_call_id = 'calldockweb1'`,
    ))[0]
    const started = binding.bound_at instanceof Date ? binding.bound_at.toISOString() : new Date(binding.bound_at).toISOString()
    const ended = new Date(Date.parse(started) + 60_000).toISOString()
    expect(await verify(armed, yard, {
      evidence: { callId: "calldockweb1", agentId: "agent-0026", agentVersion: 4, startedAt: started, endedAt: ended },
    })).toMatchObject({ evidenceOutcome: "VERIFIED_PASSED", provisionState: "AWAITING_CONFIRMATION", forwardingVerified: false, testPassed: true })
    const replay = await rpc<Row>("admin_commercial_prepare_agent_test_call_v1", [
      adminToken,
      request,
      armed.prepared.subscription,
      (await versions(armed.prepared.subscription)).subscription_version,
      "dev",
      JSON.stringify(context),
    ])
    expect(replay).toMatchObject({ status: "bound", callId: "calldockweb1" })
    expect(await rpc<Row>("admin_commercial_bind_agent_test_call_v1", [
      adminToken,
      randomUUID(),
      armed.prepared.subscription,
      (await versions(armed.prepared.subscription)).subscription_version,
      "dev",
      JSON.stringify({ ...context, providerCallId: "calltyped001", reportedAgentId: "agent-0022", reportedAgentVersion: 4, callType: "web_call" }),
    ])).toMatchObject({ status: "denied", reason: "intent" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE' or live_at is not null`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.telloya_voice_number_bindings`)).toEqual([{ count: 0 }])
  })
})

async function initiationContext(armed: Awaited<ReturnType<typeof pay>>, location: string) {
  const current = await versions(armed.prepared.subscription)
  const allocation = (await rows<{ id: string; version: number }>(
    `select id::text as id, version from admin_private.commercial_location_allocations
     where subscription_id = $1 and location_id = $2 order by version desc limit 1`,
    [armed.prepared.subscription, location],
  ))[0]
  const instruction = (await rows<{ id: string; version: number }>(
    `select id::text as id, version from admin_private.commercial_forwarding_instructions
     where subscription_id = $1 and location_id = $2 order by version desc limit 1`,
    [armed.prepared.subscription, location],
  ))[0]
  return {
    customerId: alex,
    businessId: armed.prepared.business,
    onboardingRequestId: current.request_id,
    onboardingVersion: current.request_version,
    locationId: location,
    preferenceVersion: 1,
    provisionVersion: await provisionVersion(armed.prepared.subscription, location),
    configurationVersion: 1,
    allocationId: allocation.id,
    allocationVersion: allocation.version,
    instructionId: instruction.id,
    instructionVersion: instruction.version,
  }
}
