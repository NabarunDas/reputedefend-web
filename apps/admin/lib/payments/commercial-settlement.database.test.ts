import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a033a000-0000-4000-8000-0000000000a1"
const alexAuth = "a033a000-0000-4000-8000-0000000000d4"
const actor = "a033a000-0000-4000-8000-0000000000aa"
const bakery = "a033a000-0000-4000-8000-000000000011"
const kitchen = "a033a000-0000-4000-8000-000000000015"
const high = "a033a000-0000-4000-8000-000000000021"
const dock = "a033a000-0000-4000-8000-000000000022"
const oven = "a033a000-0000-4000-8000-000000000024"
const stripeCustomer = "cus_NffrFeUfNV2Hib"
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"

type Row = Record<string, unknown>
let session = ""
let planNumber = 80
const refs = ["VC-26-SET2AB", "VC-26-SET2AC", "VC-26-SET2AD", "VC-26-SET2AE", "VC-26-SET2AF", "VC-26-SET2AG", "VC-26-SET2AH", "VC-26-SET2AJ", "VC-26-SET2AK", "VC-26-SET2AL", "VC-26-SET2AM", "VC-26-SET2AN"]
let refNumber = 0

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

async function portalSession() {
  const pending = hash(randomBytes(32).toString("hex"))
  const started = await rpc<{ status: string }>("customer_portal_begin_login_v1", ["alex.settle@example.com", pending])
  if (started.status !== "ok") throw new Error(started.status)
  const confirmed = await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(confirmed.status)
  const sessionHash = hash(randomBytes(32).toString("hex"))
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, alexAuth, "alex.settle@example.com"])
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
  const ref = refs[refNumber]
  refNumber += 1
  if (!ref) throw new Error("test reference exhausted")
  const terms = `${product}-SET-${ref.slice(-4)}`
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
    ) values ($1, $2, $3, 'alex.settle@example.com', $4, 'VOICE', 'OFFERED', $5)`,
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
    subscription, ref, amount, product, business, request,
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
    agreementRef: `${prepared.product}-SET-${prepared.ref.slice(-4)}`,
    agreementAccepted: true,
    recurringConsent: true,
    confirmations: { business_authority: true },
    conditions: { ...prepared.conditions, overageOptIn: false, overageCapMinor: null },
  }
}

async function preparedCheckout(options: {
  product?: "TELLOYA" | "COMPLETE"
  business?: string
  locations?: string[]
  amount?: number
  priceId?: string
  sessionId?: string
}) {
  const product = options.product ?? "TELLOYA"
  const prepared = await offer(
    product,
    options.business ?? (product === "COMPLETE" ? kitchen : bakery),
    options.locations ?? (product === "COMPLETE" ? [oven] : [high, dock]),
    options.amount ?? (product === "COMPLETE" ? 14900 : 7900),
  )
  const accepted = await rpc<Row>("customer_portal_commercial_offer_command_v1", [
    session, randomUUID(), prepared.ref, JSON.stringify(consent(prepared)),
  ])
  if (accepted?.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
  const started = await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), prepared.ref])
  if (started?.status !== "success") throw new Error(`prepare ${JSON.stringify(started)}`)
  const priceId = options.priceId ?? (product === "COMPLETE" ? "price_1P2abcDEF3ghiJKM" : "price_1P2abcDEF3ghiJKL")
  const sessionId = options.sessionId ?? (product === "COMPLETE" ? "cs_test_b2C3d4E5f6G7h8I9j0K1l2M3n4" : "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2")
  const priced = await rpc<Row>("commercial_payment_record_price_v1", [started.priceOperationId, priceId, `prod_${priceId.slice(6, 18)}`])
  if (priced?.status !== "success") throw new Error(`price ${JSON.stringify(priced)}`)
  await db.query(
    `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2) on conflict (customer_id) do nothing`,
    [alex, stripeCustomer],
  )
  const recorded = await rpc<Row>("commercial_payment_record_checkout_v1", [started.providerOperationId, sessionId])
  if (recorded?.status !== "success") throw new Error(`checkout ${JSON.stringify(recorded)}`)
  return { prepared, started, priceId, sessionId, amount: prepared.amount }
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

function facts(options: {
  eventId: string
  invoiceId: string
  priceId: string
  sessionId: string
  amount: number
  subscriptionId?: string
  identity: ReturnType<typeof commercialIdentity>
  overrides?: Record<string, unknown>
}) {
  const subscriptionId = options.subscriptionId ?? "sub_1P2abcDEF3ghiJKL"
  return {
    eventId: options.eventId,
    invoiceId: options.invoiceId,
    checkoutSessionId: options.sessionId,
    stripeCustomerId: stripeCustomer,
    stripeSubscriptionId: subscriptionId,
    checkoutSubscriptionId: subscriptionId,
    stripePriceId: options.priceId,
    currency: "gbp",
    invoiceStatus: "paid",
    amountDueMinor: options.amount,
    amountPaidMinor: options.amount,
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
    subscriptionPriceId: options.priceId,
    subscriptionQuantity: 1,
    subscriptionPeriodStart: periodStart,
    subscriptionPeriodEnd: periodEnd,
    ...options.identity,
    ...options.overrides,
  }
}

async function receive(eventId: string, invoiceId: string, type = "invoice.paid", livemode = false) {
  return rpc<Row>("payment_receive_stripe_event_v1", [eventId, type, invoiceId, livemode])
}

async function claim(eventId: string, priceId: string, customer = stripeCustomer) {
  return rpc<Row>("commercial_payment_invoice_claim_v1", [eventId, priceId, customer])
}

async function settle(jobId: unknown, lease: unknown, body: Record<string, unknown>) {
  return rpc<Row>("commercial_payment_settle_initial_invoice_v1", [jobId, lease, JSON.stringify(body)])
}

async function evidenceCount() {
  const found = await rows<{ count: number }>("select count(*)::int as count from public.commercial_payment_evidence")
  return found[0].count
}

async function effects() {
  const found = await rows<{
    entitlements: number
    provisions: number
    communications: number
    guard_subscriptions: number
    guard_coverages: number
    evidence: number
  }>(
    `select
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.service_provisions) as provisions,
      (select count(*)::int from public.communications) as communications,
      (select count(*)::int from public.guard_subscriptions) as guard_subscriptions,
      (select count(*)::int from public.guard_coverages) as guard_coverages,
      (select count(*)::int from public.commercial_payment_evidence) as evidence`,
  )
  return found[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.settle@example.com', now()),
      ('${actor}', 'actor.settle@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.settle@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.settle@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${kitchen}', 'Complete Kitchen');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${oven}', '${kitchen}', 'GB', 'Oven');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${kitchen}', 'verified', now(), '${actor}', 'Mailbox already proved for Kitchen');
  `)
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  session = await portalSession()
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT settlement")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT settlement")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("atomic commercial payment settlement", () => {
  it("keeps the settlement command away from browser roles and rejects a verified flag", async () => {
    const privilege = await rows<{ anon_ok: boolean; auth_ok: boolean; service_ok: boolean }>(
      `select
        has_function_privilege('anon', 'public.commercial_payment_settle_initial_invoice_v1(uuid, uuid, jsonb)', 'EXECUTE') as anon_ok,
        has_function_privilege('authenticated', 'public.commercial_payment_settle_initial_invoice_v1(uuid, uuid, jsonb)', 'EXECUTE') as auth_ok,
        has_function_privilege('service_role', 'public.commercial_payment_settle_initial_invoice_v1(uuid, uuid, jsonb)', 'EXECUTE') as service_ok`,
    )
    expect(privilege[0]).toEqual({ anon_ok: false, auth_ok: false, service_ok: true })
    const claimPrivilege = await rows<{ anon_ok: boolean }>(
      `select has_function_privilege('anon', 'public.commercial_payment_invoice_claim_v1(text, text, text)', 'EXECUTE') as anon_ok`,
    )
    expect(claimPrivilege[0].anon_ok).toBe(false)
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    await receive(eventId, "in_1P2abcDEF3ghiJKL")
    const leased = await claim(eventId, armed.priceId)
    expect(leased.status).toBe("success")
    const flagged = await settle(leased.jobId, leased.leaseToken, { verified: true })
    expect(flagged).toMatchObject({ status: "denied", reason: "invalid", retryable: false })
    expect(await evidenceCount()).toBe(0)
    expect((await rows<{ state: string }>(
      `select state from public.commercial_subscriptions where id = $1`,
      [armed.prepared.subscription],
    ))[0].state).toBe("PAYMENT_PENDING")
  })

  it("settles one paid Telloya invoice and leaves the service unprovisioned", async () => {
    const before = await effects()
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    const invoiceId = "in_1P2abcDEF3ghiJKL"
    expect(await receive(eventId, invoiceId)).toMatchObject({ status: "success", duplicate: false })
    expect(await receive(eventId, invoiceId)).toMatchObject({ status: "success", duplicate: true })
    const leased = await claim(eventId, armed.priceId)
    expect(leased.status).toBe("success")
    const body = facts({ eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount, identity: commercialIdentity(armed) })
    const settled = await settle(leased.jobId, leased.leaseToken, body)
    expect(settled).toMatchObject({ status: "settled", state: "ACTIVE", retryable: false })
    const evidence = await rows<Row>(
      `select subscription_id, amount_minor, currency, provider_event_id, period_start, period_end
       from public.commercial_payment_evidence`,
    )
    expect(evidence).toEqual([{
      subscription_id: armed.prepared.subscription,
      amount_minor: 7900,
      currency: "GBP",
      provider_event_id: eventId,
      period_start: new Date(periodStart),
      period_end: new Date(periodEnd),
    }])
    const subscription = await rows<Row>(
      `select state, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end
       from public.commercial_subscriptions where id = $1`,
      [armed.prepared.subscription],
    )
    expect(subscription[0]).toMatchObject({
      state: "ACTIVE",
      stripe_customer_id: stripeCustomer,
      stripe_subscription_id: "sub_1P2abcDEF3ghiJKL",
    })
    expect(new Date(String(subscription[0].current_period_start)).toISOString()).toBe(periodStart)
    expect(new Date(String(subscription[0].current_period_end)).toISOString()).toBe(periodEnd)
    const audit = await rows<Row>(
      `select from_state, to_state, reason, request_id from public.commercial_subscription_events
       where subscription_id = $1 and to_state = 'ACTIVE'`,
      [armed.prepared.subscription],
    )
    expect(audit).toEqual([{
      from_state: "PAYMENT_PENDING",
      to_state: "ACTIVE",
      reason: "verified_initial_invoice",
      request_id: leased.jobId,
    }])
    const receipt = await rows<{ processed: boolean }>(
      `select processed from admin_private.stripe_event_receipts where provider_event_id = $1`,
      [eventId],
    )
    expect(receipt[0].processed).toBe(true)
    const job = await rows<{ status: string }>(`select status from admin_private.jobs where id = $1`, [leased.jobId])
    expect(job[0].status).toBe("SUCCEEDED")
    const again = await claim(eventId, armed.priceId)
    expect(again).toMatchObject({ status: "denied", reason: "already_processed" })
    const replay = await settle(leased.jobId, randomUUID(), body)
    expect(replay).toMatchObject({ status: "already_processed" })
    expect(await evidenceCount()).toBe(1)
    const after = await effects()
    expect(after).toEqual({ ...before, evidence: before.evidence + 1 })
    const products = await rpc<Row>("customer_portal_products_v1", [session])
    const text = JSON.stringify(products)
    expect(text).toContain("Payment received. Your AI receptionist setup has not started.")
    expect(text).toContain("\"status\":\"not_subscribed\"")
    expect(text).not.toContain("Monitoring setup is pending")
    expect(text).not.toContain("businessId")
    expect(text).not.toContain("\"status\":\"active\"")
    expect(text).not.toContain("Ready for use")
    expect(text).not.toMatch(/cus_|sub_|si_|amount_minor|provider_event/)
    const projected = await rows<{ value: Row }>(
      `select admin_private.customer_portal_onboarding_projection_v1(
        'IN_REVIEW', 'verified', true, 2, true, 'ACTIVE', false, null, false
      ) as value`,
    )
    expect(projected[0].value).toMatchObject({
      stage: "service_setup",
      statusLabel: "Service setup",
      nextStep: "Payment is recorded. Service setup has not started.",
    })
    expect(projected[0].value.completed).not.toContain("Ready for use")
    expect(projected[0].value.completed).not.toContain("Service setup recorded")
  })

  it("settles one paid Complete invoice without opening Guard coverage", async () => {
    const before = await effects()
    const armed = await preparedCheckout({ product: "COMPLETE" })
    const eventId = "evt_1P2abcDEF3ghiJKM"
    const invoiceId = "in_1P2abcDEF3ghiJKM"
    await receive(eventId, invoiceId)
    const leased = await claim(eventId, armed.priceId)
    const settled = await settle(leased.jobId, leased.leaseToken, facts({
      eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount,
      subscriptionId: "sub_1P2abcDEF3ghiJKM", identity: commercialIdentity(armed),
    }))
    expect(settled).toMatchObject({ status: "settled", state: "ACTIVE" })
    const evidence = await rows<{ amount_minor: number; provider_event_id: string }>(
      `select amount_minor, provider_event_id from public.commercial_payment_evidence`,
    )
    expect(evidence).toEqual([{ amount_minor: 14900, provider_event_id: eventId }])
    expect(await effects()).toEqual({ ...before, evidence: before.evidence + 1 })
    const products = await rpc<{ businesses?: Array<Row> }>("customer_portal_products_v1", [session])
    const kitchenView = (products.businesses ?? []).find(business => business.businessName === "Complete Kitchen") as Row | undefined
    const guard = kitchenView?.guard as Row | undefined
    const guardLocations = (guard?.locations ?? []) as Array<Row>
    expect(guard?.status).toBe("pending")
    expect(guardLocations).toEqual([expect.objectContaining({
      locationName: "Oven",
      status: "pending",
      monitoringRecorded: false,
      allocation: null,
      nextStep: "Included in your package. Monitoring setup is pending.",
    })])
    expect(JSON.stringify(products)).not.toContain("businessId")
    expect(JSON.stringify(products)).not.toContain("not_subscribed")
    expect(JSON.stringify(guard)).not.toContain("Ready for use")
  })

  it("does not apply a paid overlay to the other business when display names match", async () => {
    const left = "a033a000-0000-4000-8000-000000000031"
    const right = "a033a000-0000-4000-8000-000000000032"
    const leftLocation = "a033a000-0000-4000-8000-000000000033"
    const rightLocation = "a033a000-0000-4000-8000-000000000034"
    const before = await effects()
    await db.query(
      `insert into public.businesses(id, display_name) values ($1, 'Shared Counter'), ($2, 'Shared Counter')`,
      [left, right],
    )
    await db.query(
      `insert into public.locations(id, business_id, country, location_name) values
        ($1, $2, 'GB', 'Counter Till'),
        ($3, $4, 'GB', 'Counter Oven')`,
      [leftLocation, left, rightLocation, right],
    )
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ($1, $2, 'verified', now(), $3, 'Mailbox already proved for the left counter'),
        ($1, $4, 'verified', now(), $3, 'Mailbox already proved for the right counter')`,
      [alex, left, actor, right],
    )
    const telloya = await preparedCheckout({
      product: "TELLOYA", business: left, locations: [leftLocation], amount: 7900,
      priceId: "price_1P2abcDEF3ghiJKL", sessionId: "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2",
    })
    const complete = await preparedCheckout({
      product: "COMPLETE", business: right, locations: [rightLocation], amount: 14900,
      priceId: "price_1P2abcDEF3ghiJKM", sessionId: "cs_test_b2C3d4E5f6G7h8I9j0K1l2M3n4",
    })
    await receive("evt_1P2abcDEF3ghiJKL", "in_1P2abcDEF3ghiJKL")
    await receive("evt_1P2abcDEF3ghiJKM", "in_1P2abcDEF3ghiJKM")
    const telloyaLease = await claim("evt_1P2abcDEF3ghiJKL", telloya.priceId)
    const completeLease = await claim("evt_1P2abcDEF3ghiJKM", complete.priceId)
    expect(await settle(telloyaLease.jobId, telloyaLease.leaseToken, facts({
      eventId: "evt_1P2abcDEF3ghiJKL", invoiceId: "in_1P2abcDEF3ghiJKL", priceId: telloya.priceId,
      sessionId: telloya.sessionId, amount: telloya.amount, identity: commercialIdentity(telloya),
    }))).toMatchObject({ status: "settled" })
    expect(await settle(completeLease.jobId, completeLease.leaseToken, facts({
      eventId: "evt_1P2abcDEF3ghiJKM", invoiceId: "in_1P2abcDEF3ghiJKM", priceId: complete.priceId,
      sessionId: complete.sessionId, amount: complete.amount, subscriptionId: "sub_1P2abcDEF3ghiJKM",
      identity: commercialIdentity(complete),
    }))).toMatchObject({ status: "settled" })
    const products = await rpc<{ businesses?: Array<{ businessName?: string; telloya?: Row; guard?: Row }> }>("customer_portal_products_v1", [session])
    const shared = (products.businesses ?? []).filter(business => business.businessName === "Shared Counter")
    expect(shared).toHaveLength(2)
    const till = shared.find(business => JSON.stringify(business.telloya).includes("Counter Till"))
    const oven = shared.find(business => JSON.stringify(business.guard).includes("Counter Oven"))
    expect(till?.guard).toMatchObject({ status: "not_subscribed", locations: [] })
    expect(JSON.stringify(till?.telloya)).toContain("Payment received. Your AI receptionist setup has not started.")
    expect(oven?.guard).toMatchObject({
      status: "pending",
      locations: [expect.objectContaining({
        locationName: "Counter Oven",
        status: "pending",
        monitoringRecorded: false,
        allocation: null,
        nextStep: "Included in your package. Monitoring setup is pending.",
      })],
    })
    expect(JSON.stringify(oven?.telloya)).toContain("Payment received. Your AI receptionist setup has not started.")
    expect(JSON.stringify(products)).not.toContain("businessId")
    expect(await effects()).toEqual({ ...before, evidence: before.evidence + 2 })
  })

  it("does not apply the same event twice, including another caller and an expired lease", async () => {
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    const invoiceId = "in_1P2abcDEF3ghiJKL"
    await receive(eventId, invoiceId)
    const first = await claim(eventId, armed.priceId)
    const second = await claim(eventId, armed.priceId)
    expect(second).toMatchObject({ status: "conflict", reason: "leased" })
    const body = facts({ eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount, identity: commercialIdentity(armed) })
    await db.exec("SAVEPOINT crash")
    expect(await settle(first.jobId, first.leaseToken, body)).toMatchObject({ status: "settled" })
    await db.exec("ROLLBACK TO SAVEPOINT crash")
    expect(await evidenceCount()).toBe(0)
    expect((await rows<{ state: string }>(
      `select state from public.commercial_subscriptions where id = $1`,
      [armed.prepared.subscription],
    ))[0].state).toBe("PAYMENT_PENDING")
    const resumed = await settle(first.jobId, first.leaseToken, body)
    expect(resumed).toMatchObject({ status: "settled" })
    expect(await evidenceCount()).toBe(1)
    expect(await claim(eventId, armed.priceId)).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await settle(first.jobId, randomUUID(), body)).toMatchObject({ status: "already_processed" })
    expect(await evidenceCount()).toBe(1)

    const other = await preparedCheckout({
      product: "COMPLETE",
      priceId: "price_1P2abcDEF3ghiJKM",
      sessionId: "cs_test_b2C3d4E5f6G7h8I9j0K1l2M3n4",
    })
    const otherEvent = "evt_1P2abcDEF3ghiJKM"
    await receive(otherEvent, "in_1P2abcDEF3ghiJKM")
    const leased = await claim(otherEvent, other.priceId)
    await db.query(`update admin_private.jobs set lease_expires_at = now() - interval '1 minute' where id = $1`, [leased.jobId])
    const restarted = await claim(otherEvent, other.priceId)
    expect(restarted.status).toBe("success")
    expect(restarted.leaseToken).not.toBe(leased.leaseToken)
    const otherBody = facts({
      eventId: otherEvent, invoiceId: "in_1P2abcDEF3ghiJKM", priceId: other.priceId, sessionId: other.sessionId,
      amount: other.amount, subscriptionId: "sub_1P2abcDEF3ghiJKM", identity: commercialIdentity(other),
    })
    expect(await settle(restarted.jobId, leased.leaseToken, otherBody)).toMatchObject({ status: "denied", reason: "lease" })
    expect(await evidenceCount()).toBe(1)
    expect(await settle(restarted.jobId, restarted.leaseToken, otherBody)).toMatchObject({ status: "settled" })
    expect(await evidenceCount()).toBe(2)
  })

  it("rejects a mismatched provider identity, amount, environment, or payment state without writing evidence", async () => {
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    const invoiceId = "in_1P2abcDEF3ghiJKL"
    await receive(eventId, invoiceId)
    const leased = await claim(eventId, armed.priceId)
    const base = () => facts({ eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount, identity: commercialIdentity(armed) })
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ stripeCustomerId: "cus_WrongCustomer111", subscriptionCustomerId: "cus_WrongCustomer111", checkoutCustomerId: "cus_WrongCustomer111" }, "customer"],
      [{ stripeSubscriptionId: "sub_wrongsubscription1" }, "subscription"],
      [{ checkoutSessionId: "cs_test_wrongSessionValue0001" }, "preparation"],
      [{ stripePriceId: "price_wrongpricevalue1", subscriptionPriceId: "price_wrongpricevalue1" }, "preparation"],
      [{ currency: "usd" }, "currency"],
      [{ amountPaidMinor: 1, amountDueMinor: 1 }, "amount"],
      [{ quantity: 2 }, "quantity"],
      [{ livemode: true }, "livemode"],
      [{ invoiceStatus: "open" }, "invoice_unpaid"],
      [{ invoiceStatus: "uncollectible" }, "payment_failed"],
      [{ invoiceStatus: "void" }, "payment_failed"],
      [{ subscriptionStatus: "incomplete" }, "subscription"],
      [{ refunded: true }, "refund"],
      [{ disputed: true }, "dispute"],
      [{ acceptanceId: "00000000-0000-4000-8000-000000000099", checkoutMetadataAcceptanceId: "00000000-0000-4000-8000-000000000099", subscriptionMetadataAcceptanceId: "00000000-0000-4000-8000-000000000099" }, "metadata_acceptance"],
      [{ checkoutOperationId: "00000000-0000-4000-8000-000000000098", checkoutMetadataOperationId: "00000000-0000-4000-8000-000000000098", subscriptionMetadataOperationId: "00000000-0000-4000-8000-000000000098" }, "metadata_operation"],
      [{ conflictingMetadata: true }, "conflicting_metadata"],
      [{ checkoutMode: "payment" }, "session"],
      [{ checkoutSubscriptionId: "sub_otherSub0000001" }, "subscription"],
      [{ commercialCustomerId: "00000000-0000-4000-8000-000000000097" }, "metadata_customer"],
      [{
        invoiceMetadataCustomerId: alex,
        invoiceMetadataSubscriptionId: armed.prepared.subscription,
        invoiceMetadataAcceptanceId: "00000000-0000-4000-8000-000000000096",
        invoiceMetadataOperationId: String(armed.started.providerOperationId),
      }, "metadata_acceptance"],
    ]
    for (const [overrides, reason] of cases) {
      await db.exec("SAVEPOINT mismatch")
      const result = await settle(leased.jobId, leased.leaseToken, { ...base(), ...overrides })
      expect(result.reason, JSON.stringify(overrides)).toBe(reason)
      expect(await evidenceCount()).toBe(0)
      await db.exec("ROLLBACK TO SAVEPOINT mismatch")
    }
    const incomplete: Record<string, unknown> = { ...base() }
    delete incomplete.acceptanceId
    await db.exec("SAVEPOINT incomplete")
    expect(await settle(leased.jobId, leased.leaseToken, incomplete)).toMatchObject({ status: "pending", reason: "provider_incomplete" })
    expect(await evidenceCount()).toBe(0)
    await db.exec("ROLLBACK TO SAVEPOINT incomplete")
    expect((await rows<{ state: string }>(
      `select state from public.commercial_subscriptions where id = $1`,
      [armed.prepared.subscription],
    ))[0].state).toBe("PAYMENT_PENDING")
  })

  it("rejects an overlapping period, revoked authority, and a subscription that is already active or canceled", async () => {
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    const invoiceId = "in_1P2abcDEF3ghiJKL"
    await receive(eventId, invoiceId)
    const leased = await claim(eventId, armed.priceId)
    const body = facts({ eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount, identity: commercialIdentity(armed) })
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.commercial_payment_evidence(
        subscription_id, period_start, period_end, amount_minor, currency, provider_event_id
      ) values ($1, $2, $3, 7900, 'GBP', 'evt_olderperiod1')`,
      [armed.prepared.subscription, periodStart, periodEnd],
    )
    await db.exec("set local session_replication_role = origin")
    expect(await settle(leased.jobId, leased.leaseToken, body)).toMatchObject({ status: "mismatch", reason: "period" })
    await db.exec("set local session_replication_role = replica")
    await db.query(`delete from public.commercial_payment_evidence where provider_event_id = 'evt_olderperiod1'`)
    await db.exec("set local session_replication_role = origin")
    await db.query(
      `update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where business_id = $1`,
      [bakery],
    )
    expect(await settle(leased.jobId, leased.leaseToken, body)).toMatchObject({ status: "mismatch", reason: "membership" })
    await db.query(
      `update public.business_memberships
       set status = 'verified', verified_at = now(), verified_by = $2 where business_id = $1`,
      [bakery, actor],
    )
    await db.query(`update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`, [armed.prepared.subscription])
    expect(await settle(leased.jobId, leased.leaseToken, body)).toMatchObject({ status: "mismatch", reason: "cancellation" })
    expect(await evidenceCount()).toBe(0)
  })

  it("does not activate a second time and keeps Guard and Recovery claims unchanged", async () => {
    const armed = await preparedCheckout({})
    const eventId = "evt_1P2abcDEF3ghiJKL"
    const invoiceId = "in_1P2abcDEF3ghiJKL"
    await receive(eventId, invoiceId)
    const leased = await claim(eventId, armed.priceId)
    const body = facts({ eventId, invoiceId, priceId: armed.priceId, sessionId: armed.sessionId, amount: armed.amount, identity: commercialIdentity(armed) })
    await db.exec("SAVEPOINT active")
    await expect(db.query(
      `update public.commercial_subscriptions set state = 'ACTIVE' where id = $1`,
      [armed.prepared.subscription],
    )).rejects.toThrow(/trusted payment evidence/)
    await db.exec("ROLLBACK TO SAVEPOINT active")
    expect(await settle(leased.jobId, leased.leaseToken, body)).toMatchObject({ status: "settled" })
    const secondEvent = "evt_1P2abcDEF3ghiJKN"
    await receive(secondEvent, "in_1P2abcDEF3ghiJKN")
    const second = await claim(secondEvent, armed.priceId)
    expect(second.status).toBe("success")
    const later = facts({
      eventId: secondEvent, invoiceId: "in_1P2abcDEF3ghiJKN", priceId: armed.priceId, sessionId: armed.sessionId,
      amount: armed.amount, identity: commercialIdentity(armed),
      overrides: { periodStart: "2026-12-01T00:00:00.000Z", periodEnd: "2027-01-01T00:00:00.000Z", subscriptionPeriodStart: "2026-12-01T00:00:00.000Z", subscriptionPeriodEnd: "2027-01-01T00:00:00.000Z" },
    })
    expect(await settle(second.jobId, second.leaseToken, later)).toMatchObject({ status: "mismatch", reason: "prior_settlement" })
    expect(await evidenceCount()).toBe(1)
    const recovery = await receive("evt_recoveryintent1", "pi_recoveryintent1", "payment_intent.succeeded")
    expect(recovery.status).toBe("success")
    expect(await rpc<Row>("commercial_payment_invoice_claim_v1", ["evt_recoveryintent1", armed.priceId, stripeCustomer])).toMatchObject({
      status: "denied", reason: "unsupported",
    })
    expect(await rpc<Row>("dev_payment_event_claim_v1", [eventId, true])).toMatchObject({ status: "denied", reason: "guard_event" })
    const definition = await rows<{ def: string }>(
      `select pg_get_functiondef('public.dev_payment_event_claim_v1(text, boolean)'::regprocedure) as def`,
    )
    expect(definition[0].def).toContain("invoice.%")
    await db.exec("SAVEPOINT direct")
    await expect(db.query(
      `insert into public.commercial_payment_evidence(
        subscription_id, period_start, period_end, amount_minor, currency, provider_event_id
      ) values ($1, now(), now() + interval '1 day', 7900, 'GBP', 'evt_directinsert1')`,
      [armed.prepared.subscription],
    )).rejects.toThrow(/trusted invoice binding/)
    await db.exec("ROLLBACK TO SAVEPOINT direct")
  })

  it("does not grant an entitlement, provision a service, or send mail from the settlement file", () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261104190000_customer_commercial_payment_settlement_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("INSERT INTO public.product_entitlements")
    expect(sql).not.toContain("INSERT INTO public.service_provisions")
    expect(sql).not.toContain("INSERT INTO public.communications")
    expect(sql).not.toContain("INSERT INTO public.guard_coverages")
    expect(sql).toContain("Do not apply 20261104190000 to DEV")
    expect(sql).toContain("Do not apply 20261104190000 to Production")
  })
})
