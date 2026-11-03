import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const alex = "a033a000-0000-4000-8000-0000000000a1"
const sam = "a033a000-0000-4000-8000-0000000000b2"
const alexAuth = "a033a000-0000-4000-8000-0000000000d4"
const samAuth = "a033a000-0000-4000-8000-0000000000e5"
const actor = "a033a000-0000-4000-8000-0000000000aa"
const bakery = "a033a000-0000-4000-8000-000000000011"
const yard = "a033a000-0000-4000-8000-000000000012"
const kitchen = "a033a000-0000-4000-8000-000000000015"
const revokedShop = "a033a000-0000-4000-8000-000000000014"
const high = "a033a000-0000-4000-8000-000000000021"
const dock = "a033a000-0000-4000-8000-000000000022"
const yardLoc = "a033a000-0000-4000-8000-000000000023"
const oven = "a033a000-0000-4000-8000-000000000024"
const pass = "a033a000-0000-4000-8000-000000000025"

type Row = Record<string, unknown>
let alexSession = ""
let samSession = ""
let planNumber = 40

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

async function offer(options: {
  ref: string
  customer?: string
  business?: string
  product?: "TELLOYA" | "COMPLETE"
  locations?: string[]
  cadence?: "MONTH" | "YEAR" | "ONCE"
  amount?: number
  tax?: "NOT_APPLICABLE" | "INCLUSIVE" | "EXCLUSIVE"
  taxMinor?: number | null
  guardQuantity?: number
  guardUnit?: number
  state?: string
  replica?: boolean
}) {
  const product = options.product ?? "TELLOYA"
  const terms = `${product}-PAY-${options.ref.slice(-4)}`
  const guardQuantity = options.guardQuantity ?? (product === "COMPLETE" ? 1 : 0)
  const locations = options.locations ?? (product === "COMPLETE" ? [yardLoc] : [high, dock])
  const quantity = Math.max(locations.length, 1)
  const id = randomUUID()
  const version = ++planNumber
  const limit = Math.max(quantity, guardQuantity, 1)
  const amount = options.amount ?? 4900
  const tax = options.tax ?? "NOT_APPLICABLE"
  const taxMinor = tax === "NOT_APPLICABLE" ? null : (options.taxMinor ?? 980)
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, $2, $3, 'DRAFT', now() - interval '30 days' + make_interval(mins => $3), $4, 'GBP', $5, $7, $6)`,
    [id, product, version, options.cadence ?? "MONTH", amount, terms, tax],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
     values ($1, 'TELLOYA', $2, 'LOCATION')`,
    [id, limit],
  )
  if (product === "COMPLETE") {
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       values ($1, 'GUARD', $2, 'LOCATION')`,
      [id, limit],
    )
  }
  await db.query(
    `update public.plan_versions
     set effective_to = now() - interval '30 days' + make_interval(mins => $2)
     where product_code = $1 and status = 'APPROVED' and effective_to is null`,
    [product, version],
  )
  await db.query(`update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`, [id, actor])
  await agreement(product, terms)
  const subscription = randomUUID()
  const business = options.business ?? bakery
  const customer = options.customer ?? alex
  if (options.replica) await db.exec("set local session_replication_role = replica")
  await db.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, tax_amount_minor, cadence_snapshot, terms_ref
    ) values ($1, $2, $3, $4, 'VOICE', $5, 'BILLABLE', 'DRAFT', $6, 'GBP', $7, $8, $9, $10)`,
    [subscription, options.ref, customer, business, id, amount, tax, taxMinor, options.cadence ?? "MONTH", terms],
  )
  await db.query(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ($1, 'TELLOYA', 1, $2)`,
    [subscription, limit],
  )
  if (guardQuantity > 0) {
    await db.query(
      `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
       values ($1, 'GUARD', $2, $3)`,
      [subscription, guardQuantity, limit],
    )
  }
  const nextState = options.state ?? "OFFERED"
  if (nextState !== "DRAFT") {
    await db.query(`update public.commercial_subscriptions set state = $2 where id = $1`, [subscription, nextState])
  }
  if (options.replica) await db.exec("set local session_replication_role = origin")
  const request = randomUUID()
  await db.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.pay@example.com', $4, 'VOICE', 'OFFERED', $5)`,
    [request, customer, business, product, subscription],
  )
  for (const location of locations) {
    await db.query(
      `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2)`,
      [request, location],
    )
  }
  const guardUnit = guardQuantity > 0 ? (options.guardUnit ?? 999) : null
  const base = amount - (guardUnit ?? 0) * guardQuantity
  const commercial = {
    tier: "Growth",
    includedMinutes: 300,
    minutesRollover: false,
    baseAmountMinor: base,
    guardIncluded: guardQuantity > 0,
    guardUnitMinor: guardUnit,
    guardQuantity,
    overagePermitted: true,
    overageRateMinor: 25,
  }
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
    subscription, terms, version: versionRow[0].record_version, ref: options.ref, conditions: commercial,
    amount, cadence: options.cadence ?? "MONTH", taxBehaviour: tax, taxMinor,
  }
}

function consent(prepared: {
  version: number
  terms: string
  amount?: number
  cadence?: string
  taxBehaviour?: string
  taxMinor?: number | null
  conditions: Record<string, unknown>
}, overageOptIn = false, overageCapMinor: number | null = null) {
  return {
    offerVersion: prepared.version,
    priceMinor: prepared.amount ?? 4900,
    taxBehaviour: prepared.taxBehaviour ?? "NOT_APPLICABLE",
    taxMinor: prepared.taxMinor ?? null,
    cadence: prepared.cadence ?? "MONTH",
    agreementRef: prepared.terms,
    agreementAccepted: true,
    recurringConsent: prepared.cadence !== "ONCE",
    confirmations: { business_authority: true },
    conditions: { ...prepared.conditions, overageOptIn, overageCapMinor },
  }
}

async function accept(session: string, prepared: Awaited<ReturnType<typeof offer>>, overageOptIn = false, overageCapMinor: number | null = null) {
  const result = await rpc<Row | null>("customer_portal_commercial_offer_command_v1", [
    session, randomUUID(), prepared.ref, JSON.stringify(consent(prepared, overageOptIn, overageCapMinor)),
  ])
  if (result?.status !== "success") throw new Error(`acceptance failed: ${JSON.stringify(result)}`)
  return result
}

function prepare(session: string, selector: string, request = randomUUID(), livemode?: boolean) {
  const args: unknown[] = [session, request, selector]
  if (livemode !== undefined) args.push(livemode)
  return rpc<Row | null>("customer_portal_commercial_payment_prepare_v1", args)
}

async function counts() {
  const found = await rows<{
    preparations: number
    prices: number
    checkouts: number
    evidence: number
    entitlements: number
    guard_subscriptions: number
    recovery: number
    active: number
  }>(
    `select
      (select count(*)::int from public.commercial_checkout_preparations) as preparations,
      (select count(*)::int from public.provider_operations where purpose = 'COMMERCIAL_PRICE') as prices,
      (select count(*)::int from public.provider_operations where purpose = 'COMMERCIAL_CHECKOUT') as checkouts,
      (select count(*)::int from public.commercial_payment_evidence) as evidence,
      (select count(*)::int from public.product_entitlements) as entitlements,
      (select count(*)::int from public.guard_subscriptions) as guard_subscriptions,
      (select count(*)::int from public.paid_service_acceptances) as recovery,
      (select count(*)::int from public.commercial_subscriptions where state = 'ACTIVE') as active`,
  )
  return found[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec("BEGIN")
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.pay@example.com', now()),
      ('${samAuth}', 'sam.pay@example.com', now()),
      ('${actor}', 'actor.pay@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.pay@example.com'),
      ('${sam}', 'Sam Cole', 'sam.pay@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.pay@example.com', '${actor}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam.pay@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values
      ('${bakery}', 'Harbour Bakery'),
      ('${yard}', 'North Yard'),
      ('${kitchen}', 'Complete Kitchen'),
      ('${revokedShop}', 'Revoked Roastery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock'),
      ('${yardLoc}', '${yard}', 'GB', 'Yard Gate'),
      ('${oven}', '${kitchen}', 'GB', 'Oven'),
      ('${pass}', '${kitchen}', 'GB', 'Pass');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery'),
      ('${alex}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Yard'),
      ('${alex}', '${kitchen}', 'verified', now(), '${actor}', 'Mailbox already proved for Kitchen'),
      ('${alex}', '${revokedShop}', 'verified', now(), '${actor}', 'Mailbox already proved before revocation'),
      ('${sam}', '${yard}', 'verified', now(), '${actor}', 'Mailbox already proved for Sam');
  `)
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  alexSession = await portalSession("alex.pay@example.com", alexAuth)
  samSession = await portalSession("sam.pay@example.com", samAuth)
}, 300000)

beforeEach(async () => {
  await db.exec("SAVEPOINT commercial_payment")
})

afterEach(async () => {
  await db.exec("ROLLBACK TO SAVEPOINT commercial_payment")
})

afterAll(async () => {
  await db.exec("ROLLBACK")
  await db.close()
})

describe("commercial payment preparation", () => {
  it("keeps the preparation functions and table away from customer roles", async () => {
    const privilege = await rows<{ anon_ok: boolean; auth_ok: boolean; service_ok: boolean; table_ok: boolean }>(
      `select
        has_function_privilege('anon', 'public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean)', 'EXECUTE') as anon_ok,
        has_function_privilege('authenticated', 'public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean)', 'EXECUTE') as auth_ok,
        has_function_privilege('service_role', 'public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean)', 'EXECUTE') as service_ok,
        has_table_privilege('anon', 'public.commercial_checkout_preparations', 'SELECT') as table_ok`,
    )
    expect(privilege[0]).toEqual({ anon_ok: false, auth_ok: false, service_ok: true, table_ok: false })
  })

  it("reserves one monthly checkout for the accepted offer and does not activate it", async () => {
    const prepared = await offer({ ref: "VC-26-PAY2AB" })
    await accept(alexSession, prepared)
    const before = await counts()
    const request = randomUUID()
    const first = await prepare(alexSession, prepared.ref, request)
    expect(first).toMatchObject({
      status: "success",
      existing: false,
      state: "PAYMENT_PENDING",
      amountMinor: 4900,
      currency: "GBP",
      cadence: "MONTH",
      productName: "Telloya",
      overageOptIn: false,
      guardQuantity: 0,
      guardChargeMinor: 0,
      providerOperationStatus: "PENDING",
    })
    expect(first?.customerId).toBe(alex)
    expect(first?.commercialSubscriptionId).toBe(prepared.subscription)
    expect(JSON.stringify(first)).not.toMatch(/checkoutUrl|success_url/)
    const again = await prepare(alexSession, prepared.ref, request)
    expect(again).toEqual({ ...first, existing: true })
    const receipt = await rows<{ response: Row }>(
      `select response from admin_private.customer_commercial_command_receipts where request_id = $1`,
      [request],
    )
    expect(receipt[0].response).toEqual(first)
    const later = await prepare(alexSession, prepared.ref)
    expect(later).toMatchObject({ status: "success", existing: true, providerOperationId: first?.providerOperationId, priceOperationId: first?.priceOperationId })
    const after = await counts()
    expect(after.preparations).toBe(before.preparations + 1)
    expect(after.prices).toBe(before.prices + 1)
    expect(after.checkouts).toBe(before.checkouts + 1)
    expect(after.evidence).toBe(before.evidence)
    expect(after.entitlements).toBe(before.entitlements)
    expect(after.guard_subscriptions).toBe(before.guard_subscriptions)
    expect(after.recovery).toBe(before.recovery)
    expect(after.active).toBe(0)
    const state = await rows<{ state: string; stripe_subscription_id: string | null }>(
      `select state, stripe_subscription_id from public.commercial_subscriptions where id = $1`,
      [prepared.subscription],
    )
    expect(state[0]).toEqual({ state: "PAYMENT_PENDING", stripe_subscription_id: null })
    const seen = await rpc<Row>("customer_portal_commercial_offer_v1", [alexSession, prepared.ref])
    expect(seen).toMatchObject({
      status: "accepted",
      payment: { state: "started", cadence: "MONTH", totalMinor: 4900, guardChargeMinor: null },
    })
    expect(String(seen.nextStep)).toContain("Returning from a payment page does not record a payment")
    expect(JSON.stringify(seen)).not.toMatch(/cus_|sub_|price_|providerOperationId/)
  })

  it("refuses an unaccepted, withdrawn, foreign, revoked, or unsigned offer", async () => {
    const open = await offer({ ref: "VC-26-PAY2AC" })
    expect(await prepare(alexSession, open.ref)).toMatchObject({ status: "unavailable" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [open.subscription]))[0].state).toBe("OFFERED")

    const withdrawn = await offer({ ref: "VC-26-PAY2AD", business: yard })
    await accept(alexSession, withdrawn)
    await db.query(
      `update public.commercial_subscriptions set state = 'CANCELED', canceled_at = now() where id = $1`,
      [withdrawn.subscription],
    )
    expect(await prepare(alexSession, withdrawn.ref)).toMatchObject({ status: "unavailable" })

    const owned = await offer({ ref: "VC-26-PAY2AE", business: kitchen, locations: [oven] })
    await accept(alexSession, owned)
    expect(await prepare(samSession, owned.ref)).toMatchObject({ status: "unavailable" })
    expect(await prepare(hash("missing-session"), owned.ref)).toBeNull()
    expect((await counts()).preparations).toBe(0)

    const revoked = await offer({ ref: "VC-26-PAY2AF", business: revokedShop, locations: [], replica: true })
    await db.query(
      `update public.business_memberships
       set status = 'revoked', verified_at = null, verified_by = null
       where business_id = $1`,
      [revokedShop],
    )
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set state = 'ACCEPTED' where id = $1`, [revoked.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await prepare(alexSession, revoked.ref)).toMatchObject({ status: "unavailable" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [revoked.subscription]))[0].state).toBe("ACCEPTED")
  })

  it("does not prepare a changed price, a yearly cadence, a live-mode mismatch, or an existing Stripe subscription", async () => {
    const priced = await offer({ ref: "VC-26-PAY2AG" })
    await accept(alexSession, priced)
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set amount_minor = amount_minor + 1 where id = $1`, [priced.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await prepare(alexSession, priced.ref)).toMatchObject({ status: "conflict" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [priced.subscription]))[0].state).toBe("ACCEPTED")

    const yearly = await offer({ ref: "VC-26-PAY2AH", business: yard, cadence: "YEAR", amount: 50000 })
    await accept(alexSession, yearly)
    const unsupported = await prepare(alexSession, yearly.ref)
    expect(unsupported).toMatchObject({ status: "unsupported", cadence: "YEAR", currency: "GBP" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [yearly.subscription]))[0].state).toBe("ACCEPTED")
    const seen = await rpc<Row>("customer_portal_commercial_offer_v1", [alexSession, yearly.ref])
    expect(seen.payment).toMatchObject({ state: "unsupported", cadence: "YEAR" })

    const lane = await offer({ ref: "VC-26-PAY2AJ", business: kitchen, locations: [oven, pass] })
    await accept(alexSession, lane)
    expect(await prepare(alexSession, lane.ref, randomUUID(), true)).toMatchObject({ status: "lane_mismatch" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [lane.subscription]))[0].state).toBe("ACCEPTED")
  })

  it("does not prepare an accepted subscription that has no acceptance record", async () => {
    const unsigned = await offer({ ref: "VC-26-PAY2AK", business: yard, locations: [yardLoc], replica: true, state: "ACCEPTED" })
    expect(await prepare(alexSession, unsigned.ref)).toMatchObject({ status: "unavailable" })
    expect((await counts()).preparations).toBe(0)
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [unsigned.subscription]))[0].state).toBe("ACCEPTED")
  })

  it("keeps an existing provider subscription and a non-GBP snapshot from becoming a checkout", async () => {
    const existing = await offer({ ref: "VC-26-PAY2AL" })
    await accept(alexSession, existing)
    await db.query(
      `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, 'cus_existingcustomer1')`,
      [alex],
    )
    await db.query(
      `update public.commercial_subscriptions
       set stripe_customer_id = 'cus_existingcustomer1', stripe_subscription_id = 'sub_existingcommercial1'
       where id = $1`,
      [existing.subscription],
    )
    expect(await prepare(alexSession, existing.ref)).toMatchObject({ status: "conflict", reason: "existing_subscription" })
    expect((await counts()).preparations).toBe(0)

    const foreign = await offer({ ref: "VC-26-PAY2AM", business: yard, amount: 6400 })
    await accept(alexSession, foreign)
    const subCheck = await rows<{ name: string }>(
      `select conname as name from pg_constraint
       where conrelid = 'public.commercial_subscriptions'::regclass
         and pg_get_constraintdef(oid) like '%GBP%'`,
    )
    const acceptanceCheck = await rows<{ name: string }>(
      `select conname as name from pg_constraint
       where conrelid = 'public.commercial_offer_acceptances'::regclass
         and pg_get_constraintdef(oid) like '%GBP%'`,
    )
    await db.query(`alter table public.commercial_subscriptions drop constraint ${subCheck[0].name}`)
    await db.query(`alter table public.commercial_offer_acceptances drop constraint ${acceptanceCheck[0].name}`)
    await db.exec("set local session_replication_role = replica")
    await db.query(`update public.commercial_subscriptions set currency = 'USD' where id = $1`, [foreign.subscription])
    await db.query(`update public.commercial_offer_acceptances set currency = 'USD' where subscription_id = $1`, [foreign.subscription])
    await db.exec("set local session_replication_role = origin")
    expect(await prepare(alexSession, foreign.ref)).toMatchObject({ status: "unsupported", cadence: "MONTH", currency: "USD" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [foreign.subscription]))[0].state).toBe("ACCEPTED")
  })

  it("prices Complete Guard quantity inside the accepted total and does not bill overage", async () => {
    const complete = await offer({
      ref: "VC-26-PAY2AN",
      business: kitchen,
      product: "COMPLETE",
      locations: [oven, pass],
      amount: 8900,
      guardQuantity: 2,
      guardUnit: 999,
    })
    await accept(alexSession, complete, true, 2500)
    const started = await prepare(alexSession, complete.ref)
    expect(started).toMatchObject({
      status: "success",
      productName: "Complete",
      amountMinor: 8900,
      guardQuantity: 2,
      guardChargeMinor: 1998,
      overageOptIn: true,
      overageCapMinor: 2500,
    })
    expect(Number(started?.amountMinor)).toBe(8900)
    const stored = await rows<{ amount_minor: number; overage_opt_in: boolean; overage_cap_minor: number }>(
      `select amount_minor, overage_opt_in, overage_cap_minor
       from public.commercial_checkout_preparations where subscription_id = $1`,
      [complete.subscription],
    )
    expect(stored[0]).toEqual({ amount_minor: 8900, overage_opt_in: true, overage_cap_minor: 2500 })
    const other = await offer({ ref: "VC-26-PAY2AP", business: yard, amount: 5100 })
    await accept(alexSession, other)
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where public_ref = 'VC-26-PAY2AP'`))[0].state).toBe("ACCEPTED")
    const notice = await rpc<Row[]>("customer_portal_commercial_payment_notice_v1", [alexSession])
    expect(notice.map(item => item.offerRef).sort()).toEqual(["VC-26-PAY2AN", "VC-26-PAY2AP"])
    expect(JSON.stringify(notice)).not.toMatch(/cus_|sub_|price_|cs_/)
    expect(await rpc("customer_portal_commercial_payment_notice_v1", [hash("no-session")])).toBeNull()

    const price = await rpc<Row>("commercial_payment_record_price_v1", [started?.priceOperationId, "price_completeguard1", "prod_completeguard1"])
    expect(price).toMatchObject({ status: "success", activated: false })
    const checkout = await rpc<Row>("commercial_payment_record_checkout_v1", [started?.providerOperationId, "cs_completeguard01"])
    expect(checkout).toMatchObject({ status: "success", activated: false, providerOperationStatus: "SUBMITTED" })
    const replay = await rpc<Row>("commercial_payment_record_checkout_v1", [started?.providerOperationId, "cs_completeguard01"])
    expect(replay).toMatchObject({ status: "success", activated: false })
    const sub = await rows<{ state: string; stripe_subscription_id: string | null; status: string }>(
      `select sub.state, sub.stripe_subscription_id, op.status
       from public.commercial_subscriptions sub
       join public.provider_operations op on op.commercial_subscription_id = sub.id and op.purpose = 'COMMERCIAL_CHECKOUT'
       where sub.id = $1`,
      [complete.subscription],
    )
    expect(sub[0]).toEqual({ state: "PAYMENT_PENDING", stripe_subscription_id: null, status: "SUBMITTED" })
    expect((await counts()).evidence).toBe(0)
    expect((await counts()).active).toBe(0)
    await expect(db.query(
      `update public.commercial_subscriptions set state = 'ACTIVE' where id = $1`,
      [complete.subscription],
    )).rejects.toThrow(/trusted payment evidence/)
  })

  it("does not reserve checkout for an accepted offer whose tax is not yet supported", async () => {
    const exclusive = await offer({ ref: "VC-26-PAY2AR", tax: "EXCLUSIVE", taxMinor: 980 })
    await accept(alexSession, exclusive)
    const before = await counts()
    const refused = await prepare(alexSession, exclusive.ref)
    expect(refused).toMatchObject({ status: "unsupported", cadence: "MONTH", currency: "GBP", taxBehaviour: "EXCLUSIVE" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [exclusive.subscription]))[0].state).toBe("ACCEPTED")
    expect(await counts()).toEqual(before)
    const seen = await rpc<Row>("customer_portal_commercial_offer_v1", [alexSession, exclusive.ref])
    expect(seen).toMatchObject({
      status: "accepted",
      taxBehaviour: "EXCLUSIVE",
      priceMinor: 4900,
      totalMinor: 5880,
      payment: { state: "unsupported", cadence: "MONTH", totalMinor: 5880, guardChargeMinor: null },
    })
    expect(String(seen.nextStep)).toContain("not ready for secure payment")

    const inclusive = await offer({ ref: "VC-26-PAY2AS", business: yard, tax: "INCLUSIVE", taxMinor: 817, amount: 4900 })
    await accept(alexSession, inclusive)
    expect(await prepare(alexSession, inclusive.ref)).toMatchObject({ status: "unsupported", taxBehaviour: "INCLUSIVE" })
    expect((await rows<{ state: string }>(`select state from public.commercial_subscriptions where id = $1`, [inclusive.subscription]))[0].state).toBe("ACCEPTED")
    expect((await counts()).preparations).toBe(0)
    expect((await counts()).prices).toBe(0)
    expect((await counts()).checkouts).toBe(0)
    const inclusiveSeen = await rpc<Row>("customer_portal_commercial_offer_v1", [alexSession, inclusive.ref])
    expect(inclusiveSeen).toMatchObject({
      taxBehaviour: "INCLUSIVE",
      totalMinor: 4900,
      payment: { state: "unsupported", totalMinor: 4900 },
    })
  })
})
