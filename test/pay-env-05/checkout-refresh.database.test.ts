/**
 * Explicit refresh of one unpaid Guided Checkout.
 * The Stripe SDK is mocked. No network call and no connected Stripe resource.
 * The accepted order and its obligation stay the same.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PGlite } from "@electric-sql/pglite"
import { syntheticPurchasingEstablishmentSql } from "../../apps/admin/lib/commercial/purchasing-establishment.fixture"
import { paidQuoteCommand } from "../../apps/admin/lib/commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../../apps/admin/lib/commercial/paid-service-approval.fixture"
import { applyChain, preparePlatform } from "../../apps/admin/lib/recovery/harness"
import { sessionCookie } from "../../apps/customer/lib/config"
import { portalSessionCookieName } from "../../apps/customer/lib/portal/config"

const origin = "https://customer.example.test"
const testKey = "rk_test_placeholdernotarealkey"

type Session = {
  id: string
  url: string
  livemode: boolean
  mode: string
  status: string
  payment_status: string
  amount_total: number
  currency: string
  metadata: Record<string, string>
  customer: string | null
  payment_intent: string | null
}

const bridge = vi.hoisted(() => ({
  race: false,
  creates: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> }>,
  expireCalls: [] as Array<{ id: string; options: Record<string, unknown> }>,
  expiredIds: [] as string[],
  byKey: new Map<string, Session>(),
  byId: new Map<string, Session>(),
  customer: null as { id: string; email: string | null; metadata: Record<string, string>; livemode: boolean } | null,
  intents: new Map<string, { id: string; status: string; livemode: boolean; amount: number; currency: string; metadata: Record<string, string> }>(),
  rpc: (async () => {
    throw new Error("database bridge is not ready")
  }) as (name: string, args: Record<string, unknown>) => Promise<unknown>,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(_key: string) {}
    customers = {
      create: async (params: { email?: string; metadata?: Record<string, string> }) => {
        bridge.customer = {
          id: "cus_refresh",
          email: params.email ?? null,
          metadata: params.metadata ?? {},
          livemode: false,
        }
        return { ...bridge.customer }
      },
      retrieve: async (id: string) => {
        if (!bridge.customer || bridge.customer.id !== id) throw new Error(`missing customer ${id}`)
        return { ...bridge.customer }
      },
      update: async (id: string, params: { email?: string }) => {
        if (!bridge.customer || bridge.customer.id !== id) throw new Error(`missing customer ${id}`)
        bridge.customer = { ...bridge.customer, email: params.email ?? null }
        return { ...bridge.customer }
      },
    }
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
          bridge.creates.push({ params, options })
          const idempotencyKey = String(options.idempotencyKey)
          const existing = bridge.byKey.get(idempotencyKey)
          if (existing) return existing
          const line = (params.line_items as Array<{ price_data: { unit_amount: number; product_data: { name: string } } }>)[0]
          const session: Session = {
            id: `cs_test_${bridge.byKey.size + 1}`,
            url: `https://checkout.stripe.com/c/pay/cs_test_${bridge.byKey.size + 1}`,
            livemode: false,
            mode: "payment",
            status: "open",
            payment_status: "unpaid",
            amount_total: line.price_data.unit_amount,
            currency: "gbp",
            metadata: { ...(params.metadata as Record<string, string>) },
            customer: typeof params.customer === "string" ? params.customer : null,
            payment_intent: null,
          }
          bridge.byKey.set(idempotencyKey, session)
          bridge.byId.set(session.id, session)
          return session
        },
        retrieve: async (id: string) => {
          const session = bridge.byId.get(id)
          if (!session) throw new Error(`missing checkout ${id}`)
          return session
        },
        expire: async (id: string, _params: Record<string, unknown>, options: Record<string, unknown>) => {
          bridge.expireCalls.push({ id, options })
          const session = bridge.byId.get(id)
          if (!session) throw new Error(`missing checkout ${id}`)
          if (bridge.race) {
            session.status = "complete"
            session.payment_status = "paid"
            throw new Error("payment completed before expire")
          }
          if (session.status !== "open" || session.payment_status !== "unpaid") {
            throw new Error(`cannot expire ${session.status}`)
          }
          session.status = "expired"
          bridge.expiredIds.push(id)
          return session
        },
      },
    }
    paymentIntents = {
      retrieve: async (id: string) => {
        const intent = bridge.intents.get(id)
        if (!intent) throw new Error(`missing intent ${id}`)
        return intent
      },
    }
  },
}))

vi.mock("../../apps/customer/lib/backend.ts", async importOriginal => {
  const actual = await importOriginal<typeof import("../../apps/customer/lib/backend.ts")>()
  return {
    ...actual,
    backend: () => ({ rpc: (name: string, args: Record<string, unknown> = {}) => bridge.rpc(name, args) }),
  }
})

import { paymentCommand } from "../../apps/customer/lib/action/payment"
import { portalPaymentCommand } from "../../apps/customer/lib/portal/payments/command"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const blake = "88888888-8888-4888-8888-888888888888"
const blakeAuth = "99999999-9999-4999-8999-999999999999"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "b".repeat(64)

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const requestId = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

const named: Record<string, string[]> = {
  payment_provider_lane_status_v1: [],
  customer_payment_command_v1: ["p_token_hash", "p_request", "p_operation", "p_data"],
  payment_prepare_customer_v1: ["p_customer", "p_livemode"],
  payment_checkout_presentation_v1: ["p_customer", "p_service_order"],
  payment_record_customer_map_v1: ["p_operation", "p_stripe_customer_id"],
  payment_record_provider_refs_v1: ["p_operation", "p_object_id", "p_object_type", "p_status"],
  payment_replace_expired_checkout_v1: ["p_operation", "p_livemode"],
  customer_portal_checkout_attempt_v1: ["p_token_hash", "p_reference", "p_selector", "p_request"],
  customer_portal_checkout_refresh_v1: ["p_token_hash", "p_request", "p_reference", "p_selector", "p_operation", "p_livemode"],
}

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; quoteVersionId?: string; providerOperationId?: string; replay?: boolean }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function priceId(code: string) {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = $1 and seed_key is not null", [code]))[0].id
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  bridge.rpc = async (name, args = {}) => {
    const keys = named[name]
    if (!keys) throw new Error(name)
    return rpc(name, keys.map(key => (key in args ? args[key] : null)))
  }
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${blakeAuth}', 'blake@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Example', 'alex@example.com'),
      ('${blake}', 'Blake Example', 'blake@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4), ($5,'email',$6,$3,$4)`,
    [alex, "alex@example.com", admin, "Verified from a live call with the customer.", blake, "blake@example.com"],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified',now(),$3,$4)`,
    [alex, business, admin, "Companies House match discussed on a live call."],
  )
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin))
  const approved = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, SYNTHETIC_APPROVAL_REQUEST, SYNTHETIC_APPROVAL_EVIDENCE])
  if (approved.status !== "confirmed") throw new Error(approved.status ?? "approval missing")
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(() => {
  bridge.race = false
  bridge.creates.length = 0
  bridge.expireCalls.length = 0
  bridge.expiredIds.length = 0
  bridge.byKey.clear()
  bridge.byId.clear()
  bridge.customer = { id: "cus_refresh", email: "alex@example.com", metadata: { customerId: alex }, livemode: false }
  bridge.intents.clear()
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
  vi.stubEnv("PAYMENTS_PROVIDER_MODE", "stripe_test")
  vi.stubEnv("STRIPE_SECRET_KEY", testKey)
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "")
})
afterEach(() => vi.unstubAllEnvs())

function pay(rawSession: string, idempotency: string) {
  return new NextRequest(`${origin}/api/action/payment`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotency,
      cookie: `${sessionCookie}=${rawSession}`,
    },
    body: JSON.stringify({
      operation: "start_checkout",
      productName: "ProfileRelaunch service",
      email: "attacker@example.com",
      amountMinor: 1,
    }),
  })
}

function refresh(portalToken: string, reference: string, selector: string, idempotency: string, extra: Record<string, unknown> = {}) {
  return new NextRequest(`${origin}/api/portal/payments`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotency,
      cookie: `${portalSessionCookieName()}=${portalToken}`,
    },
    body: JSON.stringify({
      reference,
      selector,
      operation: "refresh_checkout",
      confirmation: {},
      ...extra,
    }),
  })
}

async function openGuided(reference: string) {
  const caseId = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,'Profile suspended', now(), now(), 'GUIDED')`,
    [caseId, reference, alex, business, location],
  )
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, requestId(), "create_draft", {
    customerId: alex, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId("GUIDED_RELAUNCH"),
    serviceCode: "GUIDED_RELAUNCH",
  }, null])
  await rpc("admin_quote_command_v1", [adminToken, requestId(), "set_draft_tax", { quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }, draft.version])
  const offered = await rpc<Json>("admin_quote_command_v1", [adminToken, requestId(), "offer", { quoteId: draft.id }, (draft.version as number) + 1])
  const secretHash = hash(token())
  const issuedQuote = await rpc<Json>("admin_quote_command_v1", [adminToken, requestId(), "create_quote_acceptance_action", {
    quoteId: draft.id, expiresAt: actionExpiry(), secretHash,
  }, null])
  const pending = hash(token())
  const quoteSession = hash(token())
  await rpc("customer_action_exchange_v1", [issuedQuote.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, quoteSession, alexAuth, "alex@example.com"])
  expect(await rpc<Json>("customer_action_command_v1", [quoteSession, requestId(), "accept", paidQuoteCommand({
    quoteVersionId: String(offered.quoteVersionId),
    serviceCode: "GUIDED_RELAUNCH",
  })])).toMatchObject({ status: "success" })
  const version = async () => (await rows<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId]))[0].workflow_version
  for (const [operation, data] of [
    ["plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null }],
    ["transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
    ["transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
    ["transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
  ] as const) {
    await rpc("admin_case_command_v1", [adminToken, requestId(), caseId, await version(), operation, {
      note: "Reviewed the caller’s request and confirmed the details.", ...data,
    }])
  }
  const order = (await rows<{ id: string; public_ref: string; amount_minor: number; state: string }>(
    "select id, public_ref, amount_minor, state from public.service_orders where case_id = $1",
    [caseId],
  ))[0]
  const obligation = (await rows<{ id: string; state: string; amount_minor: number }>(
    "select id, state, amount_minor from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'",
    [order.id],
  ))[0]
  const paymentSecret = hash(token())
  const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, requestId(), "issue_guided_payment_action", {
    serviceOrderId: order.id, expiresAt: actionExpiry(), secretHash: paymentSecret,
  }, 1])
  const raw = token()
  const pendingPay = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, paymentSecret, pendingPay])
  await rpc("customer_action_begin_otp_v1", [pendingPay])
  await rpc("customer_action_confirm_otp_sent_v1", [pendingPay])
  await rpc("customer_action_finish_otp_v1", [pendingPay, hash(raw), alexAuth, "alex@example.com"])
  const opened = await paymentCommand(pay(raw, requestId()))
  expect(opened.status).toBe(200)
  const portalToken = token()
  await db.query(
    `insert into admin_private.customer_portal_sessions(
      token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at
    ) values ($1, $2, $3, 'alex@example.com', now(), now(), now() + interval '8 hours')`,
    [hash(portalToken), alex, alexAuth],
  )
  const selector = (await rows<{ value: string }>(
    "select admin_private.customer_portal_action_selector_v1($1) as value",
    [issued.id],
  ))[0].value
  const attempt = (await rows<{ provider_operation_id: string; stripe_checkout_session_id: string }>(
    "select provider_operation_id, stripe_checkout_session_id from public.payment_attempts where obligation_id = $1",
    [obligation.id],
  ))[0]
  return { caseId, reference, order, obligation, portalToken, selector, attempt, raw }
}

function sessionCount() {
  return bridge.byId.size
}

describe("explicit unpaid checkout refresh", () => {
  it("expires one open test session and opens a branded replacement for the same obligation", async () => {
    const opened = await openGuided("PR-26-RFSHAB")
    expect(opened.order.amount_minor).toBe(9900)
    expect(opened.obligation.amount_minor).toBe(9900)
    expect(opened.order.state).toBe("ACCEPTED_AWAITING_PAYMENT")
    const stored = bridge.byId.get(opened.attempt.stripe_checkout_session_id)
    expect(stored?.status).toBe("open")
    const ordersBefore = await rows<{ n: number }>("select count(*)::int as n from public.service_orders where case_id = $1", [opened.caseId])
    const obligationsBefore = await rows<{ n: number }>("select count(*)::int as n from public.payment_obligations where service_order_id = $1", [opened.order.id])

    const reused = await paymentCommand(pay(opened.raw, requestId()))
    expect(reused.status).toBe(200)
    expect(bridge.expiredIds).toEqual([])
    expect(sessionCount()).toBe(1)

    stored!.metadata = { ...stored!.metadata, customerId: blake }
    const mismatched = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(mismatched.status).toBe(409)
    const mismatchedBody = await mismatched.json()
    expect(mismatchedBody).toMatchObject({
      message: "We couldn't close the old payment page. No payment has been taken. Please try again shortly.",
    })
    expect(JSON.stringify(mismatchedBody)).not.toMatch(/cs_|pi_|alex@|successful/)
    stored!.metadata = { ...bridge.creates[0].params.metadata as Record<string, string> }
    expect(bridge.expiredIds).toEqual([])

    stored!.amount_total = 100
    const stale = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(stale.status).toBe(409)
    stored!.amount_total = 9900
    expect(bridge.expiredIds).toEqual([])

    stored!.livemode = true
    const live = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(live.status).toBe(503)
    expect(JSON.stringify(await live.json())).not.toMatch(/cs_|pi_|alex@/)
    stored!.livemode = false
    expect(bridge.expiredIds).toEqual([])

    stored!.payment_intent = "pi_processing"
    bridge.intents.set("pi_processing", { id: "pi_processing", status: "processing", livemode: false, amount: 9900, currency: "gbp", metadata: {} })
    const processing = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(await processing.json()).toEqual({ status: "ok", confirming: true, message: "We're confirming your payment." })
    stored!.payment_intent = null
    expect(bridge.expiredIds).toEqual([])
    expect(sessionCount()).toBe(1)

    const blakeToken = token()
    await db.query(
      `insert into admin_private.customer_portal_sessions(
        token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at
      ) values ($1, $2, $3, 'blake@example.com', now(), now(), now() + interval '8 hours')`,
      [hash(blakeToken), blake, blakeAuth],
    )
    const foreign = await portalPaymentCommand(refresh(blakeToken, opened.reference, opened.selector, requestId()))
    expect(foreign.status).toBe(404)
    expect(bridge.expiredIds).toEqual([])

    const forged = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId(), { checkoutSessionId: "cs_browser" }))
    expect(forged.status).toBe(401)
    expect(bridge.expiredIds).toEqual([])

    bridge.race = true
    const raced = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(await raced.json()).toEqual({ status: "ok", confirming: true, message: "We're confirming your payment." })
    expect(sessionCount()).toBe(1)
    expect(bridge.expiredIds).toEqual([])
    bridge.race = false
    stored!.status = "open"
    stored!.payment_status = "unpaid"

    const key = requestId()
    const created = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, key))
    expect(created.status).toBe(200)
    const createdBody = await created.json()
    expect(createdBody.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/)
    expect(createdBody.checkoutUrl).not.toBe(stored!.url)
    expect(bridge.expiredIds).toEqual([opened.attempt.stripe_checkout_session_id])
    expect(bridge.expireCalls.at(-1)?.options).toEqual({ idempotencyKey: opened.attempt.provider_operation_id })
    const fresh = [...bridge.byId.values()].find(item => item.id !== opened.attempt.stripe_checkout_session_id)
    expect(fresh?.amount_total).toBe(9900)
    expect(fresh?.customer).toBe("cus_refresh")
    expect(bridge.customer?.email).toBe("alex@example.com")
    const freshCreate = bridge.creates.find(call => {
      const line = (call.params.line_items as Array<{ price_data: { product_data: { name: string }; unit_amount: number } }>)[0]
      return line.price_data.product_data.name === "Guided Relaunch" && call !== bridge.creates[0]
    })
    expect(freshCreate?.params).toEqual(expect.objectContaining({
      mode: "payment",
      customer: "cus_refresh",
      line_items: [expect.objectContaining({
        price_data: expect.objectContaining({
          currency: "gbp",
          unit_amount: 9900,
          product_data: expect.objectContaining({ name: "Guided Relaunch" }),
        }),
      })],
    }))
    expect(JSON.stringify(freshCreate?.params)).not.toMatch(/attacker@|ProfileRelaunch service|https:\/\/checkout/)
    expect(sessionCount()).toBe(2)

    const again = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, key))
    expect(again.status).toBe(200)
    expect((await again.json()).checkoutUrl).toBe(createdBody.checkoutUrl)
    expect(bridge.expiredIds).toEqual([opened.attempt.stripe_checkout_session_id])
    expect(sessionCount()).toBe(2)

    const resumed = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(resumed.status).toBe(200)
    expect((await resumed.json()).checkoutUrl).toBe(fresh?.url)
    expect(bridge.expiredIds).toEqual([opened.attempt.stripe_checkout_session_id])
    expect(sessionCount()).toBe(2)

    const replay = await rpc<Json>("payment_replace_expired_checkout_v1", [opened.attempt.provider_operation_id, false])
    expect(replay).toMatchObject({ status: "success", replay: true })
    expect(replay.providerOperationId).not.toBe(opened.attempt.provider_operation_id)
    const active = await rows<{ n: number; stripe_checkout_session_id: string }>(
      `select count(*)::int as n, min(stripe_checkout_session_id) as stripe_checkout_session_id
       from public.payment_attempts where obligation_id = $1 and status in ('CREATED','SUBMITTED','REQUIRES_ACTION')`,
      [opened.obligation.id],
    )
    expect(active).toEqual([{ n: 1, stripe_checkout_session_id: fresh?.id }])
    expect(await rows<{ state: string; amount_minor: number }>(
      "select state, amount_minor from public.payment_obligations where id = $1",
      [opened.obligation.id],
    )).toEqual([{ state: "DUE", amount_minor: 9900 }])
    expect(await rows<{ state: string }>("select state from public.service_orders where id = $1", [opened.order.id])).toEqual([{ state: "ACCEPTED_AWAITING_PAYMENT" }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.service_orders where case_id = $1", [opened.caseId])).toEqual(ordersBefore)
    expect(await rows<{ n: number }>("select count(*)::int as n from public.payment_obligations where service_order_id = $1", [opened.order.id])).toEqual(obligationsBefore)
    expect(await rows<{ n: number }>("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [opened.order.id])).toEqual([{ n: 0 }])
    const storedIds = await rows<{ stripe_checkout_session_id: string | null }>(
      "select stripe_checkout_session_id from public.payment_attempts where obligation_id = $1",
      [opened.obligation.id],
    )
    expect(storedIds.every(row => row.stripe_checkout_session_id == null || /^cs_test_/.test(row.stripe_checkout_session_id))).toBe(true)
    expect(JSON.stringify(storedIds)).not.toContain("https://")
  }, 180000)

  it("replaces an already expired unpaid session without a second expire call", async () => {
    const opened = await openGuided("PR-26-RFSHCD")
    const stored = bridge.byId.get(opened.attempt.stripe_checkout_session_id)!
    stored.status = "expired"
    const before = bridge.expireCalls.length
    const response = await portalPaymentCommand(refresh(opened.portalToken, opened.reference, opened.selector, requestId()))
    expect(response.status).toBe(200)
    expect(bridge.expireCalls.length).toBe(before)
    expect(bridge.expiredIds).not.toContain(stored.id)
    expect(sessionCount()).toBe(2)
    const fresh = [...bridge.byId.values()].find(item => item.status === "open")
    expect(fresh?.amount_total).toBe(9900)
    const line = (bridge.creates.at(-1)?.params.line_items as Array<{ price_data: { product_data: { name: string } } }>)[0]
    expect(line.price_data.product_data.name).toBe("Guided Relaunch")
    expect(await rows<{ n: number }>(
      "select count(*)::int as n from public.payment_obligations where service_order_id = $1",
      [opened.order.id],
    )).toEqual([{ n: 1 }])
  }, 180000)
})
