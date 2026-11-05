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
const port = "55494"
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
const north = "a033c000-0000-4000-8000-000000000018"
const northLoc = "a033c000-0000-4000-8000-00000000002b"
const south = "a033c000-0000-4000-8000-000000000019"
const southLoc = "a033c000-0000-4000-8000-00000000002c"

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
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialai",
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
  const suffix = serial.toString(36).toUpperCase().padStart(4, "A").replace(/0/g, "A").replace(/1/g, "B")
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

describe.skipIf(!pgBin)("simultaneous confirm AI configuration", () => {
  let paired: Armed
  let single: Armed

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "commercialai-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "commercialai"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    let index = 0
    for (const entry of migrationChain) {
      const file = join(root, `${index}.sql`)
      index += 1
      await writeFile(file, migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialai",
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
        ('${north}', 'North Bakery'),
        ('${south}', 'South Bakery');
      insert into public.locations(id, business_id, country, location_name) values
        ('${high}', '${bakery}', 'GB', 'High Street'),
        ('${dock}', '${bakery}', 'GB', 'Dock'),
        ('${yard}', '${mill}', 'GB', 'Yard'),
        ('${pierLoc}', '${pier}', 'GB', 'Pier'),
        ('${loftLoc}', '${loft}', 'GB', 'Loft'),
        ('${quayLoc}', '${quay}', 'GB', 'Quay'),
        ('${kilnLoc}', '${kiln}', 'GB', 'Kiln'),
        ('${northLoc}', '${north}', 'GB', 'North'),
        ('${southLoc}', '${south}', 'GB', 'South');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
        ('${alex}', '${mill}', 'verified', now(), '${actor}', 'Mailbox already proved for Mill'),
        ('${alex}', '${pier}', 'verified', now(), '${actor}', 'Mailbox already proved for Pier'),
        ('${alex}', '${loft}', 'verified', now(), '${actor}', 'Mailbox already proved for Loft'),
        ('${alex}', '${quay}', 'verified', now(), '${actor}', 'Mailbox already proved for Quay'),
        ('${alex}', '${north}', 'verified', now(), '${actor}', 'Mailbox already proved for North'),
        ('${alex}', '${south}', 'verified', now(), '${actor}', 'Mailbox already proved for South'),
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
    paired = await offer({ business: bakery, locations: [high, dock], ref: "VC-26-PRFNA2", amount: 7900, version: 41 })
    single = await offer({ business: mill, locations: [yard], ref: "VC-26-PRFNB2", amount: 4900, version: 42 })
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  function configurationBody(armed: Armed, identity: { onboardingRequestId?: string; onboardingVersion?: number }, location: string, agent: string, options: { environment?: "dev" | "production"; preferenceVersion?: number; provisionVersion?: number; configurationVersion?: number; revision?: string } = {}) {
    return {
      customerId: armed.customer,
      businessId: armed.business,
      onboardingRequestId: identity.onboardingRequestId,
      onboardingVersion: identity.onboardingVersion,
      locationId: location,
      preferenceVersion: options.preferenceVersion ?? 1,
      provisionVersion: options.provisionVersion ?? 1,
      configurationVersion: options.configurationVersion ?? 0,
      provider: {
        provider: "telloya_voice",
        environment: options.environment ?? "dev",
        agentRef: agent,
        revision: options.revision ?? "rev-0004",
        chosenVoice: "Harbour",
        chosenLanguage: "en-GB",
        attestation: "The operator recorded this configuration in the provider console.",
        staffConfirmed: true,
      },
    }
  }

  function configurationSql(armed: Armed, request: string, version: number, body: Record<string, unknown>) {
    return `select public.admin_commercial_confirm_ai_configuration_v1('${adminToken}', '${request}', '${armed.subscription}', ${version}, $json$${JSON.stringify(body)}$json$::jsonb)`
  }

  it("keeps one configuration when two commands race for the same location", async () => {
    const started = await payload(paired)
    expect((await call<{ status: string }>(beginSql(paired, randomUUID(), started.version, started.body))).status).toBe("success")
    const prepared = await payload(paired)
    expect((await call<{ status: string }>(confirmSql(paired, randomUUID(), prepared.version, preferenceBody(paired, prepared.body, high, 0, "2026-11-04T15:00:00.000Z")))).status).toBe("success")
    const docked = await payload(paired)
    expect((await call<{ status: string }>(confirmSql(paired, randomUUID(), docked.version, preferenceBody(paired, docked.body, dock, 0, "2026-11-04T15:00:00.000Z")))).status).toBe("success")
    const current = await payload(paired)
    const body = configurationBody(paired, current.body, high, "agent-high-01")
    const [left, right] = await Promise.all([
      call<{ status: string; reason?: string; configurationVersion?: number }>(configurationSql(paired, randomUUID(), current.version, body)),
      call<{ status: string; reason?: string; configurationVersion?: number }>(configurationSql(paired, randomUUID(), current.version, body)),
    ])
    const outcomes = [left, right]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "conflict" && item.reason === "version")).toHaveLength(1)
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where location_id = '${high}'`)).toBe("1")
    expect(await psql(`select state from public.service_provisions where location_id = '${high}'`)).toBe("NUMBER_REQUIRED")
    expect(await psql(`select state from public.service_provisions where location_id = '${dock}'`)).toBe("PROFILE_REQUIRED")
    expect(await psql(`select count(*)::text from public.service_provisions where number_allocated_at is not null or state = 'LIVE'`)).toBe("0")
    expect(await psql(`select count(*)::text from public.product_entitlements where component_code = 'GUARD'`)).toBe("0")
  })

  it("returns the stored configuration when the same request arrives twice together", async () => {
    const started = await payload(single)
    expect((await call<{ status: string }>(beginSql(single, randomUUID(), started.version, started.body))).status).toBe("success")
    const prepared = await payload(single)
    expect((await call<{ status: string }>(confirmSql(single, randomUUID(), prepared.version, preferenceBody(single, prepared.body, yard, 0, "2026-01-15T12:00:00.000Z")))).status).toBe("success")
    const current = await payload(single)
    const request = randomUUID()
    const body = configurationBody(single, current.body, yard, "agent-yard-01")
    const [left, right] = await Promise.all([
      call<Record<string, unknown>>(configurationSql(single, request, current.version, body)),
      call<Record<string, unknown>>(configurationSql(single, request, current.version, body)),
    ])
    expect(left).toMatchObject({ status: "success", configurationVersion: 1, verificationBasis: "OPERATOR_ATTESTED", provisionState: "NUMBER_REQUIRED" })
    expect(right).toEqual(left)
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where subscription_id = '${single.subscription}'`)).toBe("1")
    const changed = { ...body, provider: { ...(body.provider as Record<string, unknown>), agentRef: "agent-yard-02" } }
    expect(await call<{ status: string }>(configurationSql(single, request, current.version, changed))).toEqual({ status: "conflict" })
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where subscription_id = '${single.subscription}'`)).toBe("1")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or number_allocated_at is not null`)).toBe("0")
  })

  async function prepared(spec: { business: string; locations: string[]; ref: string; amount: number; version: number; payer?: Payer }, location: string) {
    const armed = await offer(spec)
    const started = await payload(armed)
    const begun = await call<{ status: string }>(beginSql(armed, randomUUID(), started.version, started.body))
    if (begun.status !== "success") throw new Error(`begin ${JSON.stringify(begun)}`)
    const confirmedAt = "2026-11-04T16:00:00.000Z"
    const preparedPayload = await payload(armed)
    const confirmed = await call<{ status: string }>(confirmSql(armed, randomUUID(), preparedPayload.version, preferenceBody(armed, preparedPayload.body, location, 0, confirmedAt)))
    if (confirmed.status !== "success") throw new Error(`preferences ${JSON.stringify(confirmed)}`)
    return { armed, current: await payload(armed) }
  }

  async function owners(agent: string) {
    return psql(`select count(*)::text || ':' || count(distinct customer_id)::text || ':' || count(distinct business_id)::text || ':' || count(distinct environment)::text from admin_private.commercial_provider_agent_owners where agent_ref = '${agent}'`)
  }

  it("lets exactly one of two customers own the same provider agent", async () => {
    const agent = "agent-shared-01"
    const left = await prepared({ business: quay, locations: [quayLoc], ref: "VC-26-AGENT2", amount: 5100, version: 51 }, quayLoc)
    const right = await prepared({
      business: kiln,
      locations: [kilnLoc],
      ref: "VC-26-AGENT3",
      amount: 5200,
      version: 52,
      payer: { customer: blake, email: blakeEmail, session: blakeSession, stripeCustomer: blakeStripe },
    }, kilnLoc)
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string }>(configurationSql(left.armed, randomUUID(), left.current.version, configurationBody(left.armed, left.current.body, quayLoc, agent))),
      call<{ status: string; reason?: string }>(configurationSql(right.armed, randomUUID(), right.current.version, configurationBody(right.armed, right.current.body, kilnLoc, agent))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "provider")).toHaveLength(1)
    expect(await owners(agent)).toBe("1:1:1:1")
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where agent_ref = '${agent}'`)).toBe("1")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or number_allocated_at is not null`)).toBe("0")
    expect(await psql(`select count(*)::text from public.product_entitlements where component_code = 'GUARD'`)).toBe("0")
  }, 180000)

  it("lets exactly one of two businesses own the same provider agent", async () => {
    const agent = "agent-shared-02"
    const left = await prepared({ business: pier, locations: [pierLoc], ref: "VC-26-AGENT4", amount: 5300, version: 53 }, pierLoc)
    const right = await prepared({ business: loft, locations: [loftLoc], ref: "VC-26-AGENT5", amount: 5400, version: 54 }, loftLoc)
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string }>(configurationSql(left.armed, randomUUID(), left.current.version, configurationBody(left.armed, left.current.body, pierLoc, agent))),
      call<{ status: string; reason?: string }>(configurationSql(right.armed, randomUUID(), right.current.version, configurationBody(right.armed, right.current.body, loftLoc, agent))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "provider")).toHaveLength(1)
    expect(await owners(agent)).toBe("1:1:1:1")
    expect(await psql(`select count(distinct business_id)::text from admin_private.commercial_location_configurations where agent_ref = '${agent}'`)).toBe("1")
    const winner = first.status === "success" ? { armed: left.armed, location: pierLoc } : { armed: right.armed, location: loftLoc }
    const again = await payload(winner.armed)
    const provision = Number(await psql(`select record_version::text from public.service_provisions where location_id = '${winner.location}'`))
    const revised = await call<{ status: string; configurationVersion?: number }>(configurationSql(
      winner.armed,
      randomUUID(),
      again.version,
      configurationBody(winner.armed, again.body, winner.location, agent, { configurationVersion: 1, provisionVersion: provision, revision: "rev-0005" }),
    ))
    expect(revised).toMatchObject({ status: "success", configurationVersion: 2 })
    expect(await owners(agent)).toBe("1:1:1:1")
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where agent_ref = '${agent}'`)).toBe("2")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or number_allocated_at is not null`)).toBe("0")
  }, 180000)

  it("rejects a concurrent Production claim for an agent already owned in DEV", async () => {
    const agent = "agent-shared-03"
    const left = await prepared({ business: north, locations: [northLoc], ref: "VC-26-AGENT6", amount: 5500, version: 55 }, northLoc)
    const right = await prepared({ business: south, locations: [southLoc], ref: "VC-26-AGENT7", amount: 5600, version: 56 }, southLoc)
    const [first, second] = await Promise.all([
      call<{ status: string; reason?: string; environment?: string }>(configurationSql(left.armed, randomUUID(), left.current.version, configurationBody(left.armed, left.current.body, northLoc, agent, { environment: "dev" }))),
      call<{ status: string; reason?: string; environment?: string }>(configurationSql(right.armed, randomUUID(), right.current.version, configurationBody(right.armed, right.current.body, southLoc, agent, { environment: "production" }))),
    ])
    const outcomes = [first, second]
    expect(outcomes.filter(item => item.status === "success")).toHaveLength(1)
    expect(outcomes.filter(item => item.status === "denied" && item.reason === "environment")).toHaveLength(1)
    expect(await owners(agent)).toBe("1:1:1:1")
    expect(await psql(`select count(*)::text from admin_private.commercial_location_configurations where agent_ref = '${agent}'`)).toBe("1")
    expect(await psql(`select environment from admin_private.commercial_provider_agent_owners where agent_ref = '${agent}'`)).toBe(outcomes.find(item => item.status === "success")?.environment ?? "")
    expect(await psql(`select count(*)::text from public.service_provisions where state = 'LIVE' or number_allocated_at is not null or forwarding_instructed_at is not null or agent_test_passed_at is not null`)).toBe("0")
  }, 180000)
})
