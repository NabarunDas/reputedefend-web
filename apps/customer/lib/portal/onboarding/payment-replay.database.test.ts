import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../../../../admin/lib/recovery/harness"
import { createFakePaymentProvider } from "../../../../../lib/payments/fake"
import { openCommercialCheckout } from "./payment-command"

const db = new PGlite()
const alex = "a033a100-0000-4000-8000-0000000000a1"
const alexAuth = "a033a100-0000-4000-8000-0000000000d4"
const actor = "a033a100-0000-4000-8000-0000000000aa"
const bakery = "a033a100-0000-4000-8000-000000000011"
const high = "a033a100-0000-4000-8000-000000000021"
const dock = "a033a100-0000-4000-8000-000000000022"
const origin = "https://customer.profilerelaunch.com"
const stripeCustomer = "cus_replaycommercial1"

type Row = Record<string, unknown>

function explain(error: unknown) {
  const current = error as { message?: string; cause?: { message?: string } }
  return current.cause?.message || current.message || String(error)
}

async function q(sql: string, params: unknown[] = []) {
  try {
    return await db.query(sql, params)
  } catch (error) {
    throw new Error(`sql failed: ${explain(error)}\n${sql.slice(0, 180)}`)
  }
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await db.query<T>(sql, params)).rows
  } catch (error) {
    throw new Error(`sql failed: ${explain(error)}\n${sql}`)
  }
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  try {
    return (await db.query<{ value: T }>(sql, args)).rows[0].value
  } catch (error) {
    throw new Error(`${name} failed: ${explain(error)}`)
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.replay@example.com', now()),
      ('${actor}', 'actor.replay@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Replay', 'alex.replay@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.replay@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values ('${bakery}', 'Replay Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Replay Bakery');
  `)
  await q(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT')
     on conflict (code) do nothing`,
  )
}, 300000)

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

it("replays the current Checkout and refuses a stale or ineligible receipt", async () => {
  const pending = hash(randomBytes(32).toString("hex"))
  expect((await rpc<{ status: string }>("customer_portal_begin_login_v1", ["alex.replay@example.com", pending])).status).toBe("ok")
  expect((await rpc<{ status: string }>("customer_portal_confirm_otp_sent_v1", [pending])).status).toBe("ok")
  const session = hash(randomBytes(32).toString("hex"))
  expect((await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, session, alexAuth, "alex.replay@example.com"])).status).toBe("ok")

  const plan = randomUUID()
  const terms = "TELLOYA-PAY-2AT"
  await q(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, 'TELLOYA', 1, 'DRAFT', now() - interval '30 days', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', $2)`,
    [plan, terms],
  )
  await q(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
     values ($1, 'TELLOYA', 2, 'LOCATION')`,
    [plan],
  )
  await q(`update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`, [plan, actor])
  const title = "Telloya service agreement"
  const body = "This agreement covers the named Telloya service for the selected locations only."
  const cancellation = "Cancel in writing before the next billing date."
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  await q(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      $1, 'TELLOYA', $2, $3, $4, $5,
      admin_private.commercial_agreement_hash_v1('TELLOYA', $2, $3, $4, $5, $6::jsonb),
      $6::jsonb, 'APPROVED', $7, now()
    )`,
    [randomUUID(), terms, title, body, cancellation, confirmations, actor],
  )
  const subscription = randomUUID()
  await q(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, tax_amount_minor, cadence_snapshot, terms_ref
    ) values ($1, 'VC-26-PAY2AT', $2, $3, 'VOICE', $4, 'BILLABLE', 'DRAFT', 4900, 'GBP', 'NOT_APPLICABLE', null, 'MONTH', $5)`,
    [subscription, alex, bakery, plan, terms],
  )
  await q(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ($1, 'TELLOYA', 1, 2)`,
    [subscription],
  )
  await q(`update public.commercial_subscriptions set state = 'OFFERED' where id = $1`, [subscription])
  const requestRow = randomUUID()
  await q(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.replay@example.com', 'TELLOYA', 'VOICE', 'OFFERED', $4)`,
    [requestRow, alex, bakery, subscription],
  )
  for (const location of [high, dock]) {
    await q(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)`,
      [requestRow, location],
    )
  }
  await q(
    `insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    ) values (
      $1, $2, 'GROWTH', 'Growth', 300, false, 4900, null, 25,
      admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, null, 25),
      'APPROVED', $3, now()
    )`,
    [randomUUID(), plan, actor],
  )
  const version = (await rows<{ record_version: number }>(
    `select record_version from public.commercial_subscriptions where id = $1`,
    [subscription],
  ))[0].record_version
  const accepted = await rpc<Row>("customer_portal_commercial_offer_command_v1", [
    session,
    randomUUID(),
    "VC-26-PAY2AT",
    JSON.stringify({
      offerVersion: version,
      priceMinor: 4900,
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
        baseAmountMinor: 4900,
        guardIncluded: false,
        guardUnitMinor: null,
        guardQuantity: 0,
        overagePermitted: true,
        overageRateMinor: 25,
        overageOptIn: false,
        overageCapMinor: null,
      },
    }),
  ])
  expect(accepted.status).toBe("success")

  const requestA = randomUUID()
  const first = await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, requestA, "VC-26-PAY2AT"])
  expect(first).toMatchObject({
    status: "success",
    existing: false,
    checkoutSessionId: null,
    providerOperationStatus: "PENDING",
    amountMinor: 4900,
  })

  const provider = createFakePaymentProvider()
  const price = await provider.createRecurringPrice({
    idempotencyKey: String(first.priceIdempotencyKey),
    amountMinor: 4900,
    currency: "GBP",
    priceVersionId: String(first.acceptanceId),
    providerOperationId: String(first.priceOperationId),
    commercial: {
      productName: "Telloya",
      customerId: alex,
      commercialSubscriptionId: subscription,
      acceptanceId: String(first.acceptanceId),
      taxBehaviour: "NOT_APPLICABLE",
    },
  })
  expect(await rpc<Row>("commercial_payment_record_price_v1", [first.priceOperationId, price.priceId, price.productId])).toMatchObject({
    status: "success",
    activated: false,
  })
  const checkout = await provider.createSubscriptionCheckout({
    idempotencyKey: String(first.idempotencyKey),
    stripeCustomerId: stripeCustomer,
    stripePriceId: price.priceId,
    successUrl: `${origin}/pay/return`,
    cancelUrl: `${origin}/pay/return`,
    metadata: {
      customerId: alex,
      commercialSubscriptionId: subscription,
      acceptanceId: String(first.acceptanceId),
      providerOperationId: String(first.providerOperationId),
    },
  })
  expect(checkout.amountMinor).toBe(0)
  expect((await provider.retrieveCheckout(checkout.id))?.amountMinor).toBe(4900)
  expect(await rpc<Row>("commercial_payment_record_checkout_v1", [first.providerOperationId, checkout.id])).toMatchObject({
    status: "success",
    activated: false,
    providerOperationStatus: "SUBMITTED",
  })
  await q(
    `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2)`,
    [alex, stripeCustomer],
  )

  const replay = await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, requestA, "VC-26-PAY2AT"])
  expect(replay).toMatchObject({
    status: "success",
    existing: true,
    checkoutSessionId: checkout.id,
    stripePriceId: price.priceId,
    stripeCustomerId: stripeCustomer,
    providerOperationStatus: "SUBMITTED",
    providerOperationId: first.providerOperationId,
    priceOperationId: first.priceOperationId,
    idempotencyKey: first.idempotencyKey,
    priceIdempotencyKey: first.priceIdempotencyKey,
    amountMinor: 4900,
  })
  const receipt = (await rows<{ response: Row }>(
    `select response from admin_private.customer_commercial_command_receipts where request_id = $1`,
    [requestA],
  ))[0].response
  expect(receipt).toMatchObject({
    status: "success",
    checkoutSessionId: null,
    providerOperationStatus: "PENDING",
    providerOperationId: first.providerOperationId,
    idempotencyKey: first.idempotencyKey,
  })
  expect(await rows<{ receipts: number }>(
    `select count(*)::int as receipts from admin_private.customer_commercial_command_receipts where request_id = $1`,
    [requestA],
  )).toEqual([{ receipts: 1 }])

  const opened = await openCommercialCheckout(origin, replay as Parameters<typeof openCommercialCheckout>[1], provider)
  expect(opened.status).toBe(200)
  expect(await opened.json()).toMatchObject({ status: "ok" })
  expect(provider.checkouts).toBe(1)

  const requestB = randomUUID()
  const other = await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, requestB, "VC-26-PAY2AT"])
  expect(other.checkoutSessionId).toBe(checkout.id)
  expect(other.providerOperationId).toBe(first.providerOperationId)
  const reused = await openCommercialCheckout(origin, other as Parameters<typeof openCommercialCheckout>[1], provider)
  expect(reused.status).toBe(200)
  expect(provider.checkouts).toBe(1)

  const stored = provider.objects.get(checkout.id) as { amountMinor: number | null }
  stored.amountMinor = 0
  const prepared = replay as Parameters<typeof openCommercialCheckout>[1]
  expect((await openCommercialCheckout(origin, prepared, provider)).status).toBe(409)
  stored.amountMinor = null
  expect((await openCommercialCheckout(origin, prepared, provider)).status).toBe(409)
  stored.amountMinor = 1
  expect((await openCommercialCheckout(origin, prepared, provider)).status).toBe(409)
  stored.amountMinor = 4900
  expect((await openCommercialCheckout(origin, prepared, provider)).status).toBe(200)
  expect(provider.checkouts).toBe(1)

  await q(
    `update public.business_memberships
     set status = 'revoked', verified_at = null, verified_by = null
     where customer_id = $1 and business_id = $2`,
    [alex, bakery],
  )
  expect(await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, requestA, "VC-26-PAY2AT"])).toMatchObject({
    status: "unavailable",
  })
  expect(provider.checkouts).toBe(1)

  await q(
    `update public.business_memberships
     set status = 'verified', verified_at = now(), verified_by = $3
     where customer_id = $1 and business_id = $2`,
    [alex, bakery, actor],
  )
  await db.exec("SAVEPOINT active_closed")
  await expect(db.query(`update public.commercial_subscriptions set state = 'ACTIVE' where id = $1`, [subscription])).rejects.toThrow(/trusted payment evidence/)
  await db.exec("ROLLBACK TO SAVEPOINT active_closed")
  await q(
    `update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`,
    [subscription],
  )
  expect(await rpc<Row>("customer_portal_commercial_payment_prepare_v1", [session, requestA, "VC-26-PAY2AT"])).toMatchObject({
    status: "unavailable",
  })
  expect(provider.checkouts).toBe(1)
  const totals = (await rows<{ preparations: number; prices: number; checkouts: number; evidence: number; active: number }>(
    `select
      (select count(*)::int from public.commercial_checkout_preparations) as preparations,
      (select count(*)::int from public.provider_operations where purpose = 'COMMERCIAL_PRICE') as prices,
      (select count(*)::int from public.provider_operations where purpose = 'COMMERCIAL_CHECKOUT') as checkouts,
      (select count(*)::int from public.commercial_payment_evidence) as evidence,
      (select count(*)::int from public.commercial_subscriptions where state = 'ACTIVE') as active`,
  ))[0]
  expect(totals).toEqual({ preparations: 1, prices: 1, checkouts: 1, evidence: 0, active: 0 })
  expect((await rows<{ response: Row }>(
    `select response from admin_private.customer_commercial_command_receipts where request_id = $1`,
    [requestA],
  ))[0].response).toMatchObject({ checkoutSessionId: null, providerOperationStatus: "PENDING" })
}, 300000)
