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
const sqlPath = new URL("../../../../supabase/migrations/20261105172055_admin_commercial_confirm_ai_configuration_v1.sql", import.meta.url)

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

describe("audited confirm AI configuration", () => {
  it("keeps the command service-role only and does not read the feature flag", async () => {
    const source = readFileSync(sqlPath, "utf8")
    expect(source).toContain("Do not apply 20261105172055 to DEV")
    expect(source).toContain("Do not apply 20261105172055 to Production")
    expect(source).toContain("OPERATOR_ATTESTED")
    expect(source).not.toContain("INDEPENDENTLY_VERIFIED")
    expect(source).toContain("REVOKE ALL ON FUNCTION public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)")
    expect(source).toContain("'confirm_ai_configuration'")
    expect(source).toContain("'preferences_superseded'")
    expect(source).not.toMatch(/\bretell\b|\bResend\b|ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED|voice_id/i)
    const privilege = await rows<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select
        has_function_privilege('anon', 'public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.admin_commercial_confirm_ai_configuration_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE') as service`,
    )
    expect(privilege[0]).toEqual({ anon: false, authenticated: false, service: true })
    const handover = await rows<{ definition: string }>(
      `select pg_get_functiondef('admin_private.commercial_setup_handover_v1(uuid)'::regprocedure) as definition`,
    )
    expect(handover[0].definition).toContain("preferences_complete := false")
    expect(handover[0].definition).toContain("commercial_configuration_projection_v1")
    expect(await rpc("admin_commercial_confirm_ai_configuration_v1", ["b".repeat(64), randomUUID(), randomUUID(), 1, JSON.stringify({})])).toMatchObject({ status: "unauthorized" })
  })

  it("rejects configuration before setup and before every preference is confirmed", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "setup" })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "preferences" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success", preferencesComplete: false })
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "preferences" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 0 }])
  })

  it("records one Telloya location and leaves number, forwarding, testing and activation untouched", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success", preferencesComplete: true })
    const before = await effects(armed.prepared.subscription)
    const recorded = await configure(armed, high, { agentRef: "agent-high-01" })
    expect(recorded).toMatchObject({
      status: "success",
      locationName: "High Street",
      configurationVersion: 1,
      preferenceVersion: 1,
      environment: "dev",
      verificationBasis: "OPERATOR_ATTESTED",
      configurationComplete: true,
      recordedCount: 1,
      locationCount: 1,
      operationalStatus: "setup_started",
      nextAction: "Record provider and number allocation",
      provisionState: "NUMBER_REQUIRED",
    })
    const after = await effects(armed.prepared.subscription)
    expect(after.live).toBe(0)
    expect(after.guard_entitlements).toBe(0)
    expect(after.guard_coverages).toBe(before.guard_coverages)
    expect(after.communications).toBe(before.communications)
    expect(after.evidence).toBe(before.evidence)
    expect(after.amount_minor).toBe(before.amount_minor)
    expect(after.provider_fields).toBe(0)
    const stored = await rows<{
      state: string
      agent_configured_at: string | null
      profile_ready_at: string | null
      number_allocated_at: string | null
      forwarding_instructed_at: string | null
      agent_test_passed_at: string | null
      customer_confirmed_at: string | null
      live_at: string | null
      verification_basis: string
      greeting: string
    }>(
      `select provision.state, provision.agent_configured_at, provision.profile_ready_at,
              provision.number_allocated_at, provision.forwarding_instructed_at,
              provision.agent_test_passed_at, provision.customer_confirmed_at, provision.live_at,
              config.verification_basis, config.greeting
       from public.service_provisions provision
       join admin_private.commercial_location_configurations config on config.location_id = provision.location_id
       where provision.location_id = $1`,
      [high],
    )
    expect(stored[0].state).toBe("NUMBER_REQUIRED")
    expect(stored[0].agent_configured_at).not.toBeNull()
    expect(stored[0].profile_ready_at).not.toBeNull()
    expect(stored[0].number_allocated_at).toBeNull()
    expect(stored[0].forwarding_instructed_at).toBeNull()
    expect(stored[0].agent_test_passed_at).toBeNull()
    expect(stored[0].customer_confirmed_at).toBeNull()
    expect(stored[0].live_at).toBeNull()
    expect(stored[0].verification_basis).toBe("OPERATOR_ATTESTED")
    expect(stored[0].greeting).toBe("Thank you for calling Harbour Bakery.")
    const own = await rpc<{ subscriptions: Row[] }>("customer_portal_setup_handover_v1", [session])
    const seen = own?.subscriptions.find(entry => entry.reference === armed.prepared.ref)
    const text = JSON.stringify(seen)
    expect(text).not.toContain("agent-high-01")
    expect(text).not.toContain("attestation")
    expect(text).toContain("Your AI receptionist configuration has been recorded")
    expect(text).not.toContain("can answer calls")
    const checklist = seen?.checklist as Row[]
    expect(checklist.find(step => step.key === "agent")).toMatchObject({ state: "complete" })
    expect(checklist.find(step => step.key === "number")).toMatchObject({ state: "planned" })
    expect(checklist.find(step => step.key === "test")).toMatchObject({ state: "planned" })
    expect(checklist.find(step => step.key === "activation")).toMatchObject({ state: "planned" })
  })

  it("records Telloya locations independently and a Complete subscription the same way", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    expect(await confirm(armed, dock)).toMatchObject({ status: "success", preferencesComplete: true })
    const first = await configure(armed, high, { agentRef: "agent-high-01" })
    expect(first).toMatchObject({
      status: "success",
      configurationComplete: false,
      recordedCount: 1,
      locationCount: 2,
      nextAction: "Confirm AI configuration",
      provisionState: "NUMBER_REQUIRED",
    })
    const second = await configure(armed, dock, { agentRef: "agent-dock-01" })
    expect(second).toMatchObject({
      status: "success",
      configurationComplete: true,
      recordedCount: 2,
      nextAction: "Record provider and number allocation",
    })
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const item = queue?.items.find(entry => entry.reference === armed.prepared.ref)
    const progress = item?.configurationProgress as { recordedCount: number; locationCount: number; locations: { locationName: string; status: string }[] }
    expect(progress).toMatchObject({ recordedCount: 2, locationCount: 2 })
    expect(progress.locations.every(location => location.status === "recorded")).toBe(true)

    const complete = await pay({ product: "COMPLETE", business: kitchen, locations: [oven, counter] })
    expect(await begin(complete)).toMatchObject({ status: "success" })
    expect(await confirm(complete, oven)).toMatchObject({ status: "success" })
    expect(await confirm(complete, counter)).toMatchObject({ preferencesComplete: true })
    expect(await configure(complete, oven, { agentRef: "agent-oven-01" })).toMatchObject({ status: "success", configurationComplete: false })
    expect(await configure(complete, counter, { agentRef: "agent-counter-01" })).toMatchObject({
      status: "success",
      configurationComplete: true,
      nextAction: "Record provider and number allocation",
    })
    const guard = await rows<{ count: number }>(`select count(*)::int as count from public.guard_coverages`)
    expect(guard[0].count).toBe(0)
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'LIVE'`)).toEqual([{ count: 0 }])
  })

  it("rejects the wrong customer, a foreign location, revoked authority, and an inactive or unpaid subscription", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    expect(await configure(armed, high, { customerId: blake, agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "customer" })
    expect(await configure(armed, yard, { agentRef: "agent-yard-01" })).toMatchObject({ status: "denied", reason: "location" })
    await db.query(
      `update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where customer_id = $1 and business_id = $2`,
      [alex, bakery],
    )
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "revoked" })
    await db.query(
      `update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $3 where customer_id = $1 and business_id = $2`,
      [alex, bakery, actor],
    )
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`, [armed.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "inactive" })

    const expired = await pay({ business: twin, locations: [yard] })
    expect(await begin(expired)).toMatchObject({ status: "success" })
    expect(await confirm(expired, yard)).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set current_period_end = now() - interval '1 day' where id = $1`, [expired.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await configure(expired, yard, { agentRef: "agent-yard-02" })).toMatchObject({ status: "denied", reason: "expired" })

    const unpaid = await pay({ product: "COMPLETE", business: kitchen, locations: [oven] })
    expect(await begin(unpaid)).toMatchObject({ status: "success" })
    expect(await confirm(unpaid, oven)).toMatchObject({ status: "success" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where subscription_id = $1`, [unpaid.prepared.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await configure(unpaid, oven, { agentRef: "agent-oven-01" })).toMatchObject({ status: "denied", reason: "payment" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 0 }])
  })

  it("rejects missing attestation, a reused agent, and an environment mismatch", async () => {
    const armed = await pay({ locations: [high, dock] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    expect(await confirm(armed, dock)).toMatchObject({ status: "success" })
    expect(await configure(armed, high, { attestation: "too short", agentRef: "agent-high-01" })).toMatchObject({ status: "invalid" })
    expect(await configure(armed, high, { staffConfirmed: false, agentRef: "agent-high-01" })).toMatchObject({ status: "invalid" })
    expect(await configure(armed, high, { agentRef: "short", })).toMatchObject({ status: "invalid" })
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "success" })
    expect(await configure(armed, dock, { agentRef: "agent-high-01" })).toMatchObject({ status: "denied", reason: "provider" })
    await db.query(
      `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active)
       values ('production', '+441632960441', 'agent-dock-01', $1, $2, false)`,
      [bakery, dock],
    )
    expect(await configure(armed, dock, { agentRef: "agent-dock-01", environment: "dev" })).toMatchObject({ status: "denied", reason: "environment" })
    expect(await configure(armed, dock, { agentRef: "agent-dock-01", environment: "production" })).toMatchObject({ status: "success", environment: "production" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations where location_id = $1`, [dock])).toEqual([{ count: 1 }])
  })

  it("replays the same request, rejects a conflicting retry, and keeps history append-only", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    const request = randomUUID()
    const same = { request, agentRef: "agent-high-01", provisionVersion: 1, configurationVersion: 0, preferenceVersion: 1 }
    const first = await configure(armed, high, same)
    expect(await configure(armed, high, same)).toEqual(first)
    expect(await configure(armed, high, { ...same, agentRef: "agent-high-02" })).toEqual({ status: "conflict" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 1 }])
    const current = await versions(armed.prepared.subscription)
    expect(await configure(armed, high, { subscriptionVersion: current.subscription_version + 2, agentRef: "agent-high-01", configurationVersion: 1 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await configure(armed, high, { preferenceVersion: 4, agentRef: "agent-high-01", configurationVersion: 1 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await configure(armed, high, { provisionVersion: 9, agentRef: "agent-high-01", configurationVersion: 1 })).toMatchObject({ status: "conflict", reason: "version" })
    expect(await configure(armed, high, { configurationVersion: 0, agentRef: "agent-high-01" })).toMatchObject({ status: "conflict", reason: "version" })
    await db.exec("SAVEPOINT no_overwrite")
    await expect(db.query(`update admin_private.commercial_location_configurations set greeting = 'silent'`)).rejects.toThrow()
    await db.exec("ROLLBACK TO SAVEPOINT no_overwrite")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 1 }])
  })

  it("makes a newer preference require review and keeps the old configuration", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success", preferenceVersion: 1 })
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toMatchObject({ status: "success", provisionState: "NUMBER_REQUIRED" })
    const corrected = await confirm(armed, high, {
      version: 1,
      patch: { preferences: { greeting: "Thank you for calling the corrected bakery." } },
    })
    expect(corrected).toMatchObject({ status: "success", preferenceVersion: 2, nextAction: "Confirm AI configuration" })
    const provision = await rows<{ state: string; agent_configured_at: string | null }>(
      `select state, agent_configured_at from public.service_provisions where location_id = $1`,
      [high],
    )
    expect(provision[0]).toMatchObject({ state: "PROFILE_REQUIRED", agent_configured_at: null })
    const history = await rows<{ version: number; greeting: string }>(
      `select version, greeting from admin_private.commercial_location_configurations order by version`,
    )
    expect(history).toEqual([{ version: 1, greeting: "Thank you for calling Harbour Bakery." }])
    const queue = await rpc<{ items: Row[] }>("admin_commercial_setup_queue_v1", [adminToken])
    const progress = queue?.items.find(entry => entry.reference === armed.prepared.ref)?.configurationProgress as { reviewCount: number; locations: { status: string }[] }
    expect(progress.reviewCount).toBe(1)
    expect(progress.locations[0].status).toBe("review")
    expect(await configure(armed, high, { preferenceVersion: 1, configurationVersion: 1, agentRef: "agent-high-01" })).toMatchObject({ status: "conflict", reason: "version" })
    const refreshed = await configure(armed, high, { preferenceVersion: 2, configurationVersion: 1, agentRef: "agent-high-01" })
    expect(refreshed).toMatchObject({ status: "success", configurationVersion: 2, preferenceVersion: 2, provisionState: "NUMBER_REQUIRED" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 2 }])
    expect(await rows<{ count: number }>(
      `select count(*)::int as count from admin_private.commercial_configuration_events where operation = 'preferences_superseded'`,
    )).toEqual([{ count: 1 }])
  })

  it("rolls a failed configuration insert back with its receipt", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    await db.exec(`
      create function public.fail_configuration_v1() returns trigger language plpgsql as $fn$
      begin
        raise exception 'forced configuration failure';
      end $fn$;
      create trigger fail_configuration before insert on admin_private.commercial_location_configurations
      for each row execute function public.fail_configuration_v1();
    `)
    await expect(configure(armed, high, { agentRef: "agent-high-01" })).rejects.toThrow(/forced configuration failure/)
    await db.exec("ROLLBACK TO SAVEPOINT confirm_preferences")
    await db.exec("SAVEPOINT confirm_preferences")
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_configuration_events`)).toEqual([{ count: 0 }])
    expect(await rows<{ count: number }>(`select count(*)::int as count from public.service_provisions where state = 'NUMBER_REQUIRED'`)).toEqual([{ count: 0 }])
  })

  it("requires a recent Admin sign-in and does not consume the request", async () => {
    const armed = await pay({ locations: [high] })
    expect(await begin(armed)).toMatchObject({ status: "success" })
    expect(await confirm(armed, high)).toMatchObject({ status: "success" })
    await db.query(`update public.admin_sessions set created_at = now() - interval '31 minutes' where token_hash = $1`, [adminToken])
    expect(await configure(armed, high, { agentRef: "agent-high-01" })).toEqual({ status: "reauth_required" })
    expect(await rows<{ count: number }>(`select count(*)::int as count from admin_private.commercial_location_configurations`)).toEqual([{ count: 0 }])
    await db.query(`update public.admin_sessions set created_at = now() where token_hash = $1`, [adminToken])
  })
})
