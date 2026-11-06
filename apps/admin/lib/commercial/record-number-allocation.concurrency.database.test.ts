/**
 * Two real PostgreSQL sessions starting setup for one paid subscription.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 */
import { execFile as execFileCb } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { migrationSql } from "../recovery/harness"
import { migrationChain } from "../recovery/manifest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55495"
const alex = "a033c000-0000-4000-8000-0000000000a1"
const alexAuth = "a033c000-0000-4000-8000-0000000000d4"
const actor = "a033c000-0000-4000-8000-0000000000aa"
const adminUser = "11111111-1111-4111-8111-111111111111"
const bakery = "a033c000-0000-4000-8000-000000000011"
const mill = "a033c000-0000-4000-8000-000000000012"
const high = "a033c000-0000-4000-8000-000000000021"
const dock = "a033c000-0000-4000-8000-000000000022"
const yard = "a033c000-0000-4000-8000-000000000026"
const email = "alex.ai-concurrent@example.com"
const stripeCustomer = "cus_NffrFeUfNV2Hib"
const adminToken = "a".repeat(64)
const challenge = "c".repeat(64)
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const reason = "Begin setup after the verified payment."

let root = ""
let dataDir = ""
let socketDir = ""
let session = ""
let blakeSession = ""
let serial = 0
const blake = "a033c000-0000-4000-8000-0000000000b2"
const blakeAuth = "a033c000-0000-4000-8000-0000000000d5"
const blakeEmail = "blake.ai-concurrent@example.com"
const blakeStripe = "cus_BlakeOwnerAi01"
const pier = "a033c000-0000-4000-8000-000000000014"
const pierLoc = "a033c000-0000-4000-8000-000000000027"
const loft = "a033c000-0000-4000-8000-000000000015"
const loftLoc = "a033c000-0000-4000-8000-000000000028"
const quay = "a033c000-0000-4000-8000-000000000016"
const quayLoc = "a033c000-0000-4000-8000-000000000029"
const kiln = "a033c000-0000-4000-8000-000000000017"
const kilnLoc = "a033c000-0000-4000-8000-00000000002a"
const hearth = "a033c000-0000-4000-8000-00000000001d"
const hearthLoc = "a033c000-0000-4000-8000-00000000002d"
const north = "a033c000-0000-4000-8000-000000000018"
const northLoc = "a033c000-0000-4000-8000-00000000002b"
const south = "a033c000-0000-4000-8000-000000000019"
const southLoc = "a033c000-0000-4000-8000-00000000002c"
const lane = "a033c000-0000-4000-8000-00000000001e"
const laneLoc = "a033c000-0000-4000-8000-00000000002e"
const gate = "a033c000-0000-4000-8000-00000000001f"
const gateLoc = "a033c000-0000-4000-8000-00000000002f"

type Payer = {
  customer: string
  email: string
  session: string
  stripeCustomer: string
}

type Armed = {
  subscription: string
  business: string
  customer: string
  request: string
  locations: string[]
}

const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialalloc",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=60000" }, maxBuffer: 8 * 1024 * 1024 })
  return result.stdout.trim()
}

async function call<T>(sql: string): Promise<T> {
  const text = await psql(sql)
  if (!text) throw new Error(`empty result for ${sql.slice(0, 120)}`)
  return JSON.parse(text) as T
}

function stripeIds() {
  serial += 1
  const suffix = `T${serial.toString(36).toUpperCase().padStart(4, "A")}`
  return {
    priceId: `price_BeginRace${suffix}`,
    sessionId: `cs_test_beginrace${suffix}`,
    eventId: `evt_beginrace${suffix}`,
    invoiceId: `in_beginrace${suffix}`,
    stripeSubscriptionId: `sub_beginrace${suffix}`,
  }
}

async function offer(spec: { business: string; locations: string[]; ref: string; amount: number; version: number; payer?: Payer }) {
  const payer = spec.payer ?? { customer: alex, email, session, stripeCustomer }
  const plan = randomUUID()
  const subscription = randomUUID()
  const request = randomUUID()
  const terms = `TELLOYA-RACE-${spec.version}`
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  const title = "Telloya service agreement"
  const body = "This agreement covers the named Telloya service for the selected locations only."
  const cancellation = "Cancel in writing before the next billing date."
  await psql(`
    insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values (
      '${plan}', 'TELLOYA', ${spec.version}, 'DRAFT',
      now() - interval '30 days' + make_interval(mins => ${spec.version}),
      'MONTH', 'GBP', ${spec.amount}, 'NOT_APPLICABLE', '${terms}'
    );
    insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
      values ('${plan}', 'TELLOYA', ${spec.locations.length}, 'LOCATION');
    update public.plan_versions
      set effective_to = now() - interval '30 days' + make_interval(mins => ${spec.version})
      where product_code = 'TELLOYA' and status = 'APPROVED' and effective_to is null;
    update public.plan_versions set status = 'APPROVED', approved_by = '${actor}', approved_at = now() where id = '${plan}';
    insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      '${randomUUID()}', 'TELLOYA', '${terms}', '${title}', '${body}', '${cancellation}',
      admin_private.commercial_agreement_hash_v1('TELLOYA', '${terms}', '${title}', '${body}', '${cancellation}', '${confirmations.replace(/'/g, "''")}'::jsonb),
      '${confirmations.replace(/'/g, "''")}'::jsonb, 'APPROVED', '${actor}', now()
    );
    insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
    ) values (
      '${subscription}', '${spec.ref}', '${payer.customer}', '${spec.business}', 'VOICE', '${plan}', 'BILLABLE', 'DRAFT',
      ${spec.amount}, 'GBP', 'NOT_APPLICABLE', 'MONTH', '${terms}'
    );
    insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
      values ('${subscription}', 'TELLOYA', ${spec.locations.length}, ${spec.locations.length});
    update public.commercial_subscriptions set state = 'OFFERED' where id = '${subscription}';
    insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ('${request}', '${payer.customer}', '${spec.business}', '${payer.email}', 'TELLOYA', 'VOICE', 'OFFERED', '${subscription}');
    insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values
      ${spec.locations.map(location => `('${request}', '${location}')`).join(", ")};
    insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    ) values (
      '${randomUUID()}', '${plan}', 'GROWTH', 'Growth', 300, false, ${spec.amount}, null, 25,
      admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, ${spec.amount}, null, 25),
      'APPROVED', '${actor}', now()
    );
  `)
  const version = Number(await psql(`select record_version::text from public.commercial_subscriptions where id = '${subscription}'`))
  const consent = {
    offerVersion: version,
    priceMinor: spec.amount,
    taxBehaviour: "NOT_APPLICABLE",
    taxMinor: null,
    cadence: "MONTH",
    agreementRef: terms,
    agreementAccepted: true,
    recurringConsent: true,
    confirmations: { business_authority: true },
    conditions: {
      tier: "Growth",
      includedMinutes: 300,
      minutesRollover: false,
      baseAmountMinor: spec.amount,
      guardIncluded: false,
      guardUnitMinor: null,
      guardQuantity: 0,
      overagePermitted: true,
      overageRateMinor: 25,
      overageOptIn: false,
      overageCapMinor: null,
    },
  }
  const accepted = await call<{ status: string }>(
    `select public.customer_portal_commercial_offer_command_v1('${payer.session}', '${randomUUID()}', '${spec.ref}', $json$${JSON.stringify(consent)}$json$::jsonb)`,
  )
  if (accepted.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
  const started = await call<{ status: string; priceOperationId: string; providerOperationId: string; acceptanceId: string }>(
    `select public.customer_portal_commercial_payment_prepare_v1('${payer.session}', '${randomUUID()}', '${spec.ref}')`,
  )
  if (started.status !== "success") throw new Error(`prepare ${JSON.stringify(started)}`)
  const ids = stripeIds()
  const priced = await call<{ status: string }>(
    `select public.commercial_payment_record_price_v1('${started.priceOperationId}', '${ids.priceId}', 'prod_${ids.priceId.slice(6, 18)}')`,
  )
  if (priced.status !== "success") throw new Error(`price ${JSON.stringify(priced)}`)
  const recorded = await call<{ status: string }>(
    `select public.commercial_payment_record_checkout_v1('${started.providerOperationId}', '${ids.sessionId}')`,
  )
  if (recorded.status !== "success") throw new Error(`checkout ${JSON.stringify(recorded)}`)
  await psql(`select public.payment_receive_stripe_event_v1('${ids.eventId}', 'invoice.paid', '${ids.invoiceId}', false)`)
  const leased = await call<{ jobId: string; leaseToken: string }>(
    `select public.commercial_payment_invoice_claim_v1('${ids.eventId}', '${ids.priceId}', '${payer.stripeCustomer}')`,
  )
  const facts = {
    eventId: ids.eventId,
    invoiceId: ids.invoiceId,
    checkoutSessionId: ids.sessionId,
    stripeCustomerId: payer.stripeCustomer,
    stripeSubscriptionId: ids.stripeSubscriptionId,
    checkoutSubscriptionId: ids.stripeSubscriptionId,
    stripePriceId: ids.priceId,
    currency: "gbp",
    invoiceStatus: "paid",
    amountDueMinor: spec.amount,
    amountPaidMinor: spec.amount,
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
    subscriptionCustomerId: payer.stripeCustomer,
    subscriptionPriceId: ids.priceId,
    subscriptionQuantity: 1,
    subscriptionPeriodStart: periodStart,
    subscriptionPeriodEnd: periodEnd,
    commercialCustomerId: payer.customer,
    commercialSubscriptionId: subscription,
    acceptanceId: started.acceptanceId,
    checkoutOperationId: started.providerOperationId,
    checkoutMode: "subscription",
    checkoutStatus: "complete",
    checkoutPaymentStatus: "paid",
    checkoutLivemode: false,
    checkoutCustomerId: payer.stripeCustomer,
    conflictingMetadata: false,
    checkoutMetadataCustomerId: payer.customer,
    checkoutMetadataSubscriptionId: subscription,
    checkoutMetadataAcceptanceId: started.acceptanceId,
    checkoutMetadataOperationId: started.providerOperationId,
    subscriptionMetadataCustomerId: payer.customer,
    subscriptionMetadataSubscriptionId: subscription,
    subscriptionMetadataAcceptanceId: started.acceptanceId,
    subscriptionMetadataOperationId: started.providerOperationId,
  }
  const settled = await call<{ status: string }>(
    `select public.commercial_payment_settle_initial_invoice_v1('${leased.jobId}', '${leased.leaseToken}', $json$${JSON.stringify(facts)}$json$::jsonb)`,
  )
  if (settled.status !== "settled") throw new Error(`settle ${JSON.stringify(settled)}`)
  return { subscription, business: spec.business, customer: payer.customer, request, locations: spec.locations } satisfies Armed
}

async function payload(armed: Armed, note = reason) {
  const current = JSON.parse(await psql(`
    select json_build_object(
      'subscriptionVersion', subscription.record_version,
      'requestId', request.id,
      'requestVersion', request.record_version
    )::text
    from public.commercial_subscriptions subscription
    join public.onboarding_requests request on request.commercial_subscription_id = subscription.id
    where subscription.id = '${armed.subscription}' and request.state not in ('CLOSED', 'DECLINED')
  `)) as { subscriptionVersion: number; requestId: string; requestVersion: number }
  return {
    version: current.subscriptionVersion,
    body: {
      customerId: armed.customer,
      businessId: armed.business,
      onboardingRequestId: current.requestId,
      onboardingVersion: current.requestVersion,
      reason: note,
    },
  }
}

function beginSql(armed: Armed, request: string, version: number, body: Record<string, unknown>) {
  return `select public.admin_commercial_begin_setup_v1('${adminToken}', '${request}', '${armed.subscription}', ${version}, $json$${JSON.stringify(body)}$json$::jsonb)`
}


function preferenceBody(armed: Armed, identity: { onboardingRequestId?: string; onboardingVersion?: number; customerId?: string; businessId?: string }, location: string, version: number, confirmedAt: string) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  return {
    customerId: armed.customer,
    businessId: armed.business,
    onboardingRequestId: identity.onboardingRequestId,
    onboardingVersion: identity.onboardingVersion,
    locationId: location,
    preferenceVersion: version,
    preferences: {
      timezone: "Europe/London",
      openingHours: days.map(day => day === "sunday"
        ? { day, closed: true, opens: null, closes: null, breaks: [] }
        : { day, closed: false, opens: "09:00", closes: "17:30", breaks: day === "monday" ? [{ starts: "12:00", ends: "12:30" }] : [] }),
      exceptionalHours: "No exceptional hours are agreed.",
      outOfHours: "Take a message and say the business is closed.",
      greeting: "Thank you for calling Harbour Bakery.",
      enquiryDetails: ["Caller name", "Callback number"],
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
    },
    confirmation: {
      source: "telephone",
      communicationId: null,
      messageId: null,
      attestation: "The customer confirmed these preferences by telephone.",
      customerConfirmedAt: confirmedAt,
    },
  }
}

function confirmSql(armed: Armed, request: string, version: number, body: Record<string, unknown>) {
  return `select public.admin_commercial_confirm_preferences_v1('${adminToken}', '${request}', '${armed.subscription}', ${version}, $json$${JSON.stringify(body)}$json$::jsonb)`
}


describe.skipIf(!pgBin)("simultaneous telephone number allocation", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "commercialalloc-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "commercialalloc"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    let index = 0
    for (const entry of migrationChain) {
      const file = join(root, `${index}.sql`)
      index += 1
      await writeFile(file, migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialalloc",
        "-v", "ON_ERROR_STOP=1", "-f", file,
      ], { maxBuffer: 8 * 1024 * 1024 })
    }
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${alexAuth}', '${email}', now()),
        ('${blakeAuth}', '${blakeEmail}', now()),
        ('${actor}', 'actor.ai-concurrent@example.com', now()),
        ('${adminUser}', 'admin@profilerelaunch.com', now());
      insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${adminUser}', true)
        on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
      insert into public.customers(id, full_name, email) values
        ('${alex}', 'Alex Baker', '${email}'),
        ('${blake}', 'Blake Miller', '${blakeEmail}');
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
        ('${alex}', 'email', '${email}', '${actor}', 'Verified from a live call with the customer.'),
        ('${blake}', 'email', '${blakeEmail}', '${actor}', 'Verified from a live call with the second customer.');
      insert into public.businesses(id, display_name) values
        ('${bakery}', 'Harbour Bakery'),
        ('${mill}', 'Mill Bakery'),
        ('${pier}', 'Pier Bakery'),
        ('${loft}', 'Loft Bakery'),
        ('${quay}', 'Quay Bakery'),
        ('${kiln}', 'Kiln Bakery'),
        ('${hearth}', 'Hearth Bakery'),
        ('${north}', 'North Bakery'),
        ('${south}', 'South Bakery'),
        ('${lane}', 'Lane Bakery'),
        ('${gate}', 'Gate Bakery');
      insert into public.locations(id, business_id, country, location_name) values
        ('${high}', '${bakery}', 'GB', 'High Street'),
        ('${dock}', '${bakery}', 'GB', 'Dock'),
        ('${yard}', '${mill}', 'GB', 'Yard'),
        ('${pierLoc}', '${pier}', 'GB', 'Pier'),
        ('${loftLoc}', '${loft}', 'GB', 'Loft'),
        ('${quayLoc}', '${quay}', 'GB', 'Quay'),
        ('${kilnLoc}', '${kiln}', 'GB', 'Kiln'),
        ('${hearthLoc}', '${hearth}', 'GB', 'Hearth'),
        ('${northLoc}', '${north}', 'GB', 'North'),
        ('${southLoc}', '${south}', 'GB', 'South'),
        ('${laneLoc}', '${lane}', 'GB', 'Lane'),
        ('${gateLoc}', '${gate}', 'GB', 'Gate');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
        ('${alex}', '${mill}', 'verified', now(), '${actor}', 'Mailbox already proved for Mill'),
        ('${alex}', '${pier}', 'verified', now(), '${actor}', 'Mailbox already proved for Pier'),
        ('${alex}', '${loft}', 'verified', now(), '${actor}', 'Mailbox already proved for Loft'),
        ('${alex}', '${quay}', 'verified', now(), '${actor}', 'Mailbox already proved for Quay'),
        ('${alex}', '${hearth}', 'verified', now(), '${actor}', 'Mailbox already proved for Hearth'),
        ('${alex}', '${north}', 'verified', now(), '${actor}', 'Mailbox already proved for North'),
        ('${alex}', '${south}', 'verified', now(), '${actor}', 'Mailbox already proved for South'),
        ('${alex}', '${lane}', 'verified', now(), '${actor}', 'Mailbox already proved for Lane'),
        ('${alex}', '${gate}', 'verified', now(), '${actor}', 'Mailbox already proved for Gate'),
        ('${blake}', '${kiln}', 'verified', now(), '${actor}', 'Mailbox already proved for Kiln');
      insert into public.product_catalogue(code, name, kind, status) values ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT')
        on conflict (code) do nothing;
      insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values
        ('${alex}', '${stripeCustomer}'),
        ('${blake}', '${blakeStripe}');
    `)
    const pending = hash(randomBytes(32).toString("hex"))
    const started = await call<{ status: string }>(`select public.customer_portal_begin_login_v1('${email}', '${pending}')`)
    if (started.status !== "ok") throw new Error(started.status)
    const confirmed = await call<{ status: string }>(`select public.customer_portal_confirm_otp_sent_v1('${pending}')`)
    if (confirmed.status !== "ok") throw new Error(confirmed.status)
    session = hash(randomBytes(32).toString("hex"))
    const finished = await call<{ status: string }>(
      `select public.customer_portal_finish_otp_v1('${pending}', '${session}', '${alexAuth}', '${email}')`,
    )
    if (finished.status !== "ok") throw new Error(JSON.stringify(finished))
    const blakePending = hash(randomBytes(32).toString("hex"))
    const blakeStarted = await call<{ status: string }>(`select public.customer_portal_begin_login_v1('${blakeEmail}', '${blakePending}')`)
    if (blakeStarted.status !== "ok") throw new Error(blakeStarted.status)
    const blakeConfirmed = await call<{ status: string }>(`select public.customer_portal_confirm_otp_sent_v1('${blakePending}')`)
    if (blakeConfirmed.status !== "ok") throw new Error(blakeConfirmed.status)
    blakeSession = hash(randomBytes(32).toString("hex"))
    const blakeFinished = await call<{ status: string }>(
      `select public.customer_portal_finish_otp_v1('${blakePending}', '${blakeSession}', '${blakeAuth}', '${blakeEmail}')`,
    )
    if (blakeFinished.status !== "ok") throw new Error(JSON.stringify(blakeFinished))
    if (await psql(`select public.admin_begin_otp_v1('${challenge}')`) !== adminUser) throw new Error("admin otp did not start")
    if (await psql(`select public.admin_attempt_otp_v1('${challenge}')`) !== adminUser) throw new Error("admin otp was not attempted")
    if (await psql(`select public.admin_finish_otp_v1('${challenge}', '${adminToken}', '${adminUser}')`) !== "t") throw new Error("admin otp did not finish")
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  function configurationBody(armed: Armed, identity: { onboardingRequestId?: string; onboardingVersion?: number }, location: string, agent: string, environment: "dev" | "production" = "dev") {
    return {
      customerId: armed.customer,
      businessId: armed.business,
      onboardingRequestId: identity.onboardingRequestId,
      onboardingVersion: identity.onboardingVersion,
      locationId: location,
      preferenceVersion: 1,
      provisionVersion: 1,
      configurationVersion: 0,
      provider: {
        provider: "telloya_voice",
        environment,
        agentRef: agent,
        revision: "rev-0004",
        chosenVoice: "Harbour",
        chosenLanguage: "en-GB",
        attestation: "The operator recorded this configuration in the provider console.",
        staffConfirmed: true,
      },
    }
  }

  function allocationBody(armed: Armed, identity: { onboardingRequestId?: string; onboardingVersion?: number }, location: string, agent: string, e164: string, environment: "dev" | "production", provisionVersion: number) {
    return {
      customerId: armed.customer,
      businessId: armed.business,
      onboardingRequestId: identity.onboardingRequestId,
      onboardingVersion: identity.onboardingVersion,
      locationId: location,
      preferenceVersion: 1,
      provisionVersion,
      configurationVersion: 1,
      allocationVersion: 0,
      provider: {
        provider: "telloya_voice",
        environment,
        agentRef: agent,
        revision: "rev-0004",
        e164,
        allocationRef: `evidence-${location.slice(0, 8)}`,
        attestation: "The operator recorded this assigned number from the provider allocation.",
        staffConfirmed: true,
      },
    }
  }

  async function configured(spec: { business: string; locations: string[]; ref: string; amount: number; version: number; payer?: Payer }, location: string, agent: string, environment: "dev" | "production" = "dev") {
    const armed = await offer(spec)
    const started = await payload(armed)
    const begun = await call<{ status: string }>(beginSql(armed, randomUUID(), started.version, started.body))
    if (begun.status !== "success") throw new Error(`begin ${JSON.stringify(begun)}`)
    const preparedPayload = await payload(armed)
    const confirmed = await call<{ status: string }>(confirmSql(armed, randomUUID(), preparedPayload.version, preferenceBody(armed, preparedPayload.body, location, 0, "2026-11-04T16:00:00.000Z")))
    if (confirmed.status !== "success") throw new Error(`preferences ${JSON.stringify(confirmed)}`)
    const current = await payload(armed)
    const configuredResult = await call<{ status: string }>(
      `select public.admin_commercial_confirm_ai_configuration_v1('${adminToken}', '${randomUUID()}', '${armed.subscription}', ${current.version}, $json$${JSON.stringify(configurationBody(armed, current.body, location, agent, environment))}$json$::jsonb)`,
    )
    if (configuredResult.status !== "success") throw new Error(`configure ${JSON.stringify(configuredResult)}`)
    const provision = Number(await psql(`select record_version::text from public.service_provisions where location_id = '${location}'`))
    return { armed, current: await payload(armed), provision, agent, environment }
  }

  function allocateSql(armed: Armed, request: string, version: number, body: Record<string, unknown>) {
    return `select public.admin_commercial_record_number_allocation_v1('${adminToken}', '${request}', '${armed.subscription}', ${version}, $json$${JSON.stringify(body)}$json$::jsonb)`
  }

  it("lets exactly one of two customers reserve the same telephone number", async () => {
    const number = "+441632961001"
    const left = await configured({ business: quay, locations: [quayLoc], ref: "VC-26-NUMALA", amount: 6100, version: 71 }, quayLoc, "agent-quay-01")
    const right = await configured({
      business: kiln,
      locations: [kilnLoc],
      ref: "VC-26-NUMAL2",
      amount: 6200,
      version: 72,
      payer: { customer: blake, email: blakeEmail, session: blakeSession, stripeCustomer: blakeStripe },
    }, kilnLoc, "agent-kiln-01")
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string }>(allocateSql(left.armed, randomUUID(), left.current.version, allocationBody(left.armed, left.current.body, quayLoc, left.agent, number, "dev", left.provision))),
      call<{ status: string; reason?: string }>(allocateSql(right.armed, randomUUID(), right.current.version, allocationBody(right.armed, right.current.body, kilnLoc, right.agent, number, "dev", right.provision))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "number")).toHaveLength(1)
    expect(await psql(`select count(*)::text from admin_private.commercial_provider_number_owners where e164 = '${number}'`)).toBe("1")
    expect(await psql(`select count(*)::text from admin_private.commercial_location_allocations where e164 = '${number}'`)).toBe("1")
    expect(await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}'`)).toBe("0")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null or agent_test_passed_at is not null`)).toBe("0")
  }, 180000)

  it("lets exactly one of two businesses reserve the same telephone number", async () => {
    const number = "+441632961002"
    const left = await configured({ business: pier, locations: [pierLoc], ref: "VC-26-NUMAL3", amount: 6300, version: 73 }, pierLoc, "agent-pier-01")
    const right = await configured({ business: loft, locations: [loftLoc], ref: "VC-26-NUMAL4", amount: 6400, version: 74 }, loftLoc, "agent-loft-01")
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string }>(allocateSql(left.armed, randomUUID(), left.current.version, allocationBody(left.armed, left.current.body, pierLoc, left.agent, number, "dev", left.provision))),
      call<{ status: string; reason?: string }>(allocateSql(right.armed, randomUUID(), right.current.version, allocationBody(right.armed, right.current.body, loftLoc, right.agent, number, "dev", right.provision))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "number")).toHaveLength(1)
    expect(await psql(`select count(distinct business_id)::text from admin_private.commercial_provider_number_owners where e164 = '${number}'`)).toBe("1")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'FORWARDING_REQUIRED' and location_id in ('${pierLoc}', '${loftLoc}')`)).toBe("1")
  }, 180000)

  it("rejects a concurrent Production claim for a number already reserved in DEV", async () => {
    const number = "+441632961003"
    const left = await configured({ business: north, locations: [northLoc], ref: "VC-26-NUMAL5", amount: 6500, version: 75 }, northLoc, "agent-north-1", "dev")
    const right = await configured({ business: south, locations: [southLoc], ref: "VC-26-NUMAL6", amount: 6600, version: 76 }, southLoc, "agent-south-1", "production")
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string; environment?: string }>(allocateSql(left.armed, randomUUID(), left.current.version, allocationBody(left.armed, left.current.body, northLoc, left.agent, number, "dev", left.provision))),
      call<{ status: string; reason?: string; environment?: string }>(allocateSql(right.armed, randomUUID(), right.current.version, allocationBody(right.armed, right.current.body, southLoc, right.agent, number, "production", right.provision))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "environment")).toHaveLength(1)
    expect(await psql(`select count(*)::text || ':' || count(distinct environment)::text from admin_private.commercial_provider_number_owners where e164 = '${number}'`)).toBe("1:1")
    expect(await psql(`select environment from admin_private.commercial_provider_number_owners where e164 = '${number}'`)).toBe(outcomes.find(item => item.status === "success")?.environment ?? "")
    expect(await psql(`select count(*)::text from public.telloya_voice_number_bindings`)).toBe("0")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null`)).toBe("0")
  }, 180000)

  it("does not let a concurrent binding and reservation give one number two owners", async () => {
    const number = "+441632961004"
    const reserved = await configured({ business: bakery, locations: [high], ref: "VC-26-NUMAL7", amount: 6700, version: 77 }, high, "agent-high-01")
    const bindingSql = `insert into public.telloya_voice_number_bindings(environment, inbound_to_number, agent_id, business_id, location_id, active) values ('dev', '${number}', 'agent-yard-09', '${mill}', '${yard}', false)`
    const [allocation, binding] = await Promise.all([
      call<{ status: string; reason?: string }>(allocateSql(reserved.armed, randomUUID(), reserved.current.version, allocationBody(reserved.armed, reserved.current.body, high, reserved.agent, number, "dev", reserved.provision))).then(
        value => ({ ok: true, value, error: "" }),
        (error: { message?: string }) => ({ ok: false, value: { status: "error" }, error: error.message ?? "" }),
      ),
      execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialalloc",
        "-v", "ON_ERROR_STOP=1", "-c", bindingSql,
      ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=60000" }, maxBuffer: 8 * 1024 * 1024 }).then(
        () => ({ ok: true, error: "" }),
        (error: { stderr?: string; message?: string }) => ({ ok: false, error: `${error.stderr ?? ""}\n${error.message ?? ""}` }),
      ),
    ])
    expect(`${allocation.error}\n${binding.error}`).not.toMatch(/deadlock detected/i)
    const owners = await psql(`select count(*)::text from admin_private.commercial_provider_number_owners where e164 = '${number}'`)
    const bindings = await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}'`)
    const ownerLocation = await psql(`select coalesce(string_agg(location_id::text, ','), '') from admin_private.commercial_provider_number_owners where e164 = '${number}'`)
    const bindingLocation = await psql(`select coalesce(string_agg(location_id::text, ','), '') from public.telloya_voice_number_bindings where inbound_to_number = '${number}'`)
    if (allocation.ok && allocation.value.status === "success") {
      expect(binding.ok).toBe(false)
      expect(binding.error).toMatch(/telloya_voice_rejected/)
      expect(owners).toBe("1")
      expect(ownerLocation).toBe(high)
      expect(bindings).toBe("0")
    } else {
      expect(allocation.value).toMatchObject({ status: "denied", reason: "number" })
      expect(binding.ok).toBe(true)
      expect(owners).toBe("0")
      expect(bindings).toBe("1")
      expect(bindingLocation).toBe(yard)
    }
    expect(ownerLocation === yard && bindingLocation === high).toBe(false)
    expect(await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}' and active`)).toBe("0")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or forwarding_instructed_at is not null or agent_test_passed_at is not null or customer_confirmed_at is not null`)).toBe("0")
  }, 180000)

  it("does not let the generic binding command activate a number during reservation", async () => {
    const number = "+441632961005"
    const reserved = await configured({ business: mill, locations: [yard], ref: "VC-26-NUMAL8", amount: 6800, version: 78 }, yard, "agent-yard-01")
    const bindSql = `select public.telloya_voice_bind_number_v1('dev', '${number}', 'agent-yard-01', '${mill}', '${yard}')`
    const [allocation, binding] = await Promise.all([
      call<{ status: string; reason?: string }>(allocateSql(reserved.armed, randomUUID(), reserved.current.version, allocationBody(reserved.armed, reserved.current.body, yard, reserved.agent, number, "dev", reserved.provision))).then(
        value => ({ ok: true, value, error: "" }),
        (error: { message?: string }) => ({ ok: false, value: { status: "error" }, error: error.message ?? "" }),
      ),
      execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialalloc",
        "-v", "ON_ERROR_STOP=1", "-c", bindSql,
      ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=60000" }, maxBuffer: 8 * 1024 * 1024 }).then(
        () => ({ ok: true, error: "" }),
        (error: { stderr?: string; message?: string }) => ({ ok: false, error: `${error.stderr ?? ""}\n${error.message ?? ""}` }),
      ),
    ])
    expect(`${allocation.error}\n${binding.error}`).not.toMatch(/deadlock detected/i)
    const owners = await psql(`select count(*)::text from admin_private.commercial_provider_number_owners where e164 = '${number}'`)
    const activeBindings = await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}' and active`)
    if (allocation.ok && allocation.value.status === "success") {
      expect(binding.ok).toBe(false)
      expect(binding.error).toMatch(/telloya_voice_rejected/)
      expect(owners).toBe("1")
      expect(await psql(`select agent_ref from admin_private.commercial_provider_number_owners where e164 = '${number}'`)).toBe("agent-yard-01")
      expect(activeBindings).toBe("0")
    } else {
      expect(allocation.value).toMatchObject({ status: "denied", reason: "number" })
      expect(binding.ok).toBe(true)
      expect(owners).toBe("0")
      expect(activeBindings).toBe("1")
    }
    expect(owners === "1" && activeBindings === "1").toBe(false)
    expect(await psql(`select count(*)::text from public.service_provisions where location_id = '${yard}' and (state = 'LIVE' or forwarding_instructed_at is not null)`)).toBe("0")
  }, 180000)

  it("does not let the generic binding command activate an owned agent on another number during reservation", async () => {
    const number = "+441632961008"
    const other = "+441632961009"
    const reserved = await configured({ business: hearth, locations: [hearthLoc], ref: "VC-26-NUMAL9", amount: 6900, version: 79 }, hearthLoc, "agent-hearth1")
    const bindSql = `select public.telloya_voice_bind_number_v1('dev', '${other}', 'agent-hearth1', '${hearth}', '${hearthLoc}')`
    const [allocation, binding] = await Promise.all([
      call<{ status: string; reason?: string }>(allocateSql(reserved.armed, randomUUID(), reserved.current.version, allocationBody(reserved.armed, reserved.current.body, hearthLoc, reserved.agent, number, "dev", reserved.provision))).then(
        value => ({ ok: true, value, error: "" }),
        (error: { message?: string }) => ({ ok: false, value: { status: "error" }, error: error.message ?? "" }),
      ),
      execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialalloc",
        "-v", "ON_ERROR_STOP=1", "-c", bindSql,
      ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=60000" }, maxBuffer: 8 * 1024 * 1024 }).then(
        () => ({ ok: true, error: "" }),
        (error: { stderr?: string; message?: string }) => ({ ok: false, error: `${error.stderr ?? ""}\n${error.message ?? ""}` }),
      ),
    ])
    expect(`${allocation.error}\n${binding.error}`).not.toMatch(/deadlock detected/i)
    const owners = await psql(`select count(*)::text from admin_private.commercial_provider_number_owners where agent_ref = 'agent-hearth1'`)
    const activeBindings = await psql(`select count(*)::text from public.telloya_voice_number_bindings where agent_id = 'agent-hearth1' and active`)
    if (allocation.ok && allocation.value.status === "success") {
      expect(binding.ok).toBe(false)
      expect(binding.error).toMatch(/telloya_voice_rejected/)
      expect(owners).toBe("1")
      expect(await psql(`select e164 from admin_private.commercial_provider_number_owners where agent_ref = 'agent-hearth1'`)).toBe(number)
      expect(activeBindings).toBe("0")
    } else {
      expect(allocation.value).toMatchObject({ status: "denied", reason: "routing" })
      expect(binding.ok).toBe(true)
      expect(owners).toBe("0")
      expect(activeBindings).toBe("1")
      expect(await psql(`select inbound_to_number from public.telloya_voice_number_bindings where agent_id = 'agent-hearth1' and active`)).toBe(other)
    }
    expect(owners === "1" && activeBindings === "1").toBe(false)
    expect(await psql(`select count(*)::text from public.service_provisions where location_id = '${hearthLoc}' and (state = 'LIVE' or forwarding_instructed_at is not null)`)).toBe("0")
  }, 180000)

  it("lets exactly one of two instruction records share the same location", async () => {
    const number = "+441632961010"
    const notice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."
    const prepared = await configured({ business: lane, locations: [laneLoc], ref: "VC-26-NUMALB", amount: 7000, version: 80 }, laneLoc, "agent-lane-01")
    const allocated = await call<{ status: string }>(allocateSql(
      prepared.armed,
      randomUUID(),
      prepared.current.version,
      allocationBody(prepared.armed, prepared.current.body, laneLoc, prepared.agent, number, "dev", prepared.provision),
    ))
    expect(allocated.status).toBe("success")
    const current = await payload(prepared.armed)
    const allocationId = await psql(`select id::text from admin_private.commercial_location_allocations where location_id = '${laneLoc}'`)
    const provision = await psql(`select record_version::text from public.service_provisions where location_id = '${laneLoc}'`)
    const allocatedAt = await psql(`select number_allocated_at::text from public.service_provisions where location_id = '${laneLoc}'`)
    const instruction = {
      environment: "dev",
      forwardingMode: "UNANSWERED_BUSY_UNREACHABLE",
      carrierKnown: false,
      carrierName: null,
      customerTelephone: null,
      instructionRevision: "guide-0001",
      instructionText: `1. Keep ${number} for the telephone provider. This is the number calls can be sent to once the receptionist is approved. 2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line. 3. ${notice}`,
      attestation: "The operator prepared these forwarding notes from the recorded allocation.",
      staffConfirmed: true,
      status: "SHARED",
    }
    const body = {
      customerId: prepared.armed.customer,
      businessId: prepared.armed.business,
      onboardingRequestId: current.body.onboardingRequestId,
      onboardingVersion: current.body.onboardingVersion,
      locationId: laneLoc,
      preferenceVersion: 1,
      provisionVersion: Number(provision),
      configurationVersion: 1,
      allocationId,
      allocationVersion: 1,
      instructionVersion: 0,
      instruction,
    }
    const sql = (request: string) => `select public.admin_commercial_record_forwarding_instructions_v1('${adminToken}', '${request}', '${prepared.armed.subscription}', ${current.version}, $json$${JSON.stringify(body)}$json$::jsonb)`
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string }>(sql(randomUUID())),
      call<{ status: string; reason?: string }>(sql(randomUUID())),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "conflict")).toHaveLength(1)
    expect(await psql(`select count(*)::text from admin_private.commercial_forwarding_instructions where location_id = '${laneLoc}' and status = 'SHARED'`)).toBe("1")
    expect(await psql(`select state from public.service_provisions where location_id = '${laneLoc}'`)).toBe("TEST_REQUIRED")
    expect(await psql(`select number_allocated_at::text from public.service_provisions where location_id = '${laneLoc}'`)).toBe(allocatedAt)
    expect(await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}'`)).toBe("0")
    expect(await psql(`select count(*)::text from public.service_provisions where location_id = '${laneLoc}' and (state = 'LIVE' or agent_test_passed_at is not null or customer_confirmed_at is not null or live_at is not null or provider_test_call_ref is not null)`)).toBe("0")
  }, 180000)

  it("lets exactly one of two test-call records claim the same provider call", async () => {
    const number = "+441632961011"
    const notice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."
    const prepared = await configured({ business: gate, locations: [gateLoc], ref: "VC-26-NUMALC", amount: 7100, version: 81 }, gateLoc, "agent-gate-01")
    const allocated = await call<{ status: string }>(allocateSql(
      prepared.armed,
      randomUUID(),
      prepared.current.version,
      allocationBody(prepared.armed, prepared.current.body, gateLoc, prepared.agent, number, "dev", prepared.provision),
    ))
    expect(allocated.status).toBe("success")
    const current = await payload(prepared.armed)
    const allocationId = await psql(`select id::text from admin_private.commercial_location_allocations where location_id = '${gateLoc}'`)
    const provision = await psql(`select record_version::text from public.service_provisions where location_id = '${gateLoc}'`)
    const allocatedAt = await psql(`select number_allocated_at::text from public.service_provisions where location_id = '${gateLoc}'`)
    const forwarding = await psql(`select forwarding_instructed_at::text from public.service_provisions where location_id = '${gateLoc}'`)
    const instruction = {
      environment: "dev",
      forwardingMode: "UNANSWERED_BUSY_UNREACHABLE",
      carrierKnown: false,
      carrierName: null,
      customerTelephone: null,
      instructionRevision: "guide-0001",
      instructionText: `1. Keep ${number} for the telephone provider. This is the number calls can be sent to once the receptionist is approved. 2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line. 3. ${notice}`,
      attestation: "The operator prepared these forwarding notes from the recorded allocation.",
      staffConfirmed: true,
      status: "SHARED",
    }
    const sharedBody = {
      customerId: prepared.armed.customer,
      businessId: prepared.armed.business,
      onboardingRequestId: current.body.onboardingRequestId,
      onboardingVersion: current.body.onboardingVersion,
      locationId: gateLoc,
      preferenceVersion: 1,
      provisionVersion: Number(provision),
      configurationVersion: 1,
      allocationId,
      allocationVersion: 1,
      instructionVersion: 0,
      instruction,
    }
    const shared = await call<{ status: string }>(`select public.admin_commercial_record_forwarding_instructions_v1('${adminToken}', '${randomUUID()}', '${prepared.armed.subscription}', ${current.version}, $json$${JSON.stringify(sharedBody)}$json$::jsonb)`)
    expect(shared.status).toBe("success")
    const fresh = await payload(prepared.armed)
    const instructionId = await psql(`select id::text from admin_private.commercial_forwarding_instructions where location_id = '${gateLoc}'`)
    const provisionAfter = await psql(`select record_version::text from public.service_provisions where location_id = '${gateLoc}'`)
    const startedAt = await psql(`select to_json(agent_configured_at + interval '1 second') #>> '{}' from public.service_provisions where location_id = '${gateLoc}'`)
    const endedAt = await psql(`select to_json(agent_configured_at + interval '2 second') #>> '{}' from public.service_provisions where location_id = '${gateLoc}'`)
    const evidence = {
      agentId: "agent-gate-01",
      agentVersion: 4,
      agentVersionQuality: "present",
      availability: "retrieved",
      callId: "callgate0001",
      callStatus: "ended",
      callType: "web_call",
      disconnectionReason: "user_hangup",
      endedAt,
      environment: "dev",
      providerError: false,
      startedAt,
      testScope: "AGENT_DIRECT",
    }
    const qa = {
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
    }
    const verifyBody = {
      customerId: prepared.armed.customer,
      businessId: prepared.armed.business,
      onboardingRequestId: fresh.body.onboardingRequestId,
      onboardingVersion: fresh.body.onboardingVersion,
      locationId: gateLoc,
      preferenceVersion: 1,
      provisionVersion: Number(provisionAfter),
      configurationVersion: 1,
      allocationId,
      allocationVersion: 1,
      instructionId,
      instructionVersion: 1,
      evidence,
      qa,
    }
    const simulatedBinding = await psql(`
      WITH cfg AS (
        SELECT id, subscription_id, customer_id, business_id, entitlement_id, location_id, version, agent_ref, provider_revision, environment
        FROM admin_private.commercial_location_configurations
        WHERE subscription_id = '${prepared.armed.subscription}' AND location_id = '${gateLoc}'
        ORDER BY version DESC LIMIT 1
      ),
      timing AS (
        SELECT agent_configured_at + interval '1 second' AS started
        FROM public.service_provisions WHERE location_id = '${gateLoc}'
      ),
      intent AS (
        INSERT INTO admin_private.commercial_agent_test_intents(
          subscription_id, customer_id, business_id, entitlement_id, location_id, actor_id,
          configuration_id, configuration_version, agent_ref, provider_revision, environment,
          window_starts_at, window_ends_at, test_session_ref, created_at
        )
        SELECT cfg.subscription_id, cfg.customer_id, cfg.business_id, cfg.entitlement_id, cfg.location_id,
               '${adminUser}', cfg.id, cfg.version, cfg.agent_ref, cfg.provider_revision, cfg.environment,
               timing.started - interval '1 minute', timing.started + interval '30 minutes',
               'TS-26-A11C0DE1', timing.started - interval '30 seconds'
        FROM cfg CROSS JOIN timing
        RETURNING id
      )
      INSERT INTO admin_private.commercial_agent_test_bindings(intent_id, provider_call_id, bound_at)
      SELECT intent.id, 'callgate0001', (SELECT started FROM timing) FROM intent
      RETURNING id::text
    `)
    expect(simulatedBinding.split("\n")[0]).toMatch(/^[0-9a-f-]{36}$/)
    const sql = (request: string) => `select public.admin_commercial_verify_agent_test_call_v1('${adminToken}', '${request}', '${prepared.armed.subscription}', ${fresh.version}, $json$${JSON.stringify(verifyBody)}$json$::jsonb)`
    const [first, second] = await Promise.all([
      call<{ status: string; evidenceOutcome?: string; reason?: string }>(sql(randomUUID())),
      call<{ status: string; evidenceOutcome?: string; reason?: string }>(sql(randomUUID())),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success" && item.evidenceOutcome === "VERIFIED_PASSED")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "conflict" && item.reason === "version")).toHaveLength(1)
    expect(await psql(`select count(*)::text from admin_private.commercial_agent_test_evidence where provider_call_id = 'callgate0001' and outcome = 'VERIFIED_PASSED'`)).toBe("1")
    expect(await psql(`select state from public.service_provisions where location_id = '${gateLoc}'`)).toBe("AWAITING_CONFIRMATION")
    expect(await psql(`select provider_test_outcome from public.service_provisions where location_id = '${gateLoc}'`)).toBe("PASSED")
    expect(await psql(`select number_allocated_at::text from public.service_provisions where location_id = '${gateLoc}'`)).toBe(allocatedAt)
    expect(await psql(`select forwarding_instructed_at is not null from public.service_provisions where location_id = '${gateLoc}'`)).toBe("t")
    expect(forwarding).toBe("")
    expect(await psql(`select count(*)::text from public.telloya_voice_number_bindings where inbound_to_number = '${number}'`)).toBe("0")
    expect(await psql(`select count(*)::text from public.service_provisions where location_id = '${gateLoc}' and (state = 'LIVE' or customer_confirmed_at is not null or live_at is not null)`)).toBe("0")
  }, 180000)
})

