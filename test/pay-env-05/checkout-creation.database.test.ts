/**
 * Offline Checkout creation for one accepted Guided order.
 * Calls the real customer payment command. The Stripe SDK is mocked at
 * customers.create and checkout.sessions.create. No network call and no
 * connected Stripe resource.
 *
 * This file is its own TypeScript project. It is outside the Admin and
 * Customer programs so neither Next build typechecks the other app's modules
 * through it. `npm run typecheck:pay-env-05` is the static check.
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

const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_synthetic"
const testKey = "rk_test_placeholdernotarealkey"
const origin = "https://customer.example.test"

const bridge = vi.hoisted(() => ({
  failSessions: false,
  calls: [] as string[],
  constructed: [] as string[],
  customers: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> }>,
  customerReads: [] as string[],
  customerUpdates: [] as Array<{ id: string; params: { email?: string }; options: Record<string, unknown> }>,
  customerRecord: null as { id: string; email: string | null; metadata: Record<string, string>; livemode: boolean } | null,
  sessions: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> }>,
  stored: null as Record<string, unknown> | null,
  rpc: (async () => {
    throw new Error("database bridge is not ready")
  }) as (name: string, args: Record<string, unknown>) => Promise<unknown>,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      bridge.constructed.push(key)
    }
    customers = {
      create: async (params: { email?: string; metadata?: Record<string, string> }, options: Record<string, unknown>) => {
        bridge.customers.push({ params, options })
        bridge.customerRecord = {
          id: "cus_synthcreate",
          email: params.email ?? null,
          metadata: params.metadata ?? {},
          livemode: false,
        }
        return { ...bridge.customerRecord }
      },
      retrieve: async (id: string) => {
        bridge.customerReads.push(id)
        if (!bridge.customerRecord || bridge.customerRecord.id !== id) throw new Error(`missing customer ${id}`)
        return { ...bridge.customerRecord }
      },
      update: async (id: string, params: { email?: string }, options: Record<string, unknown>) => {
        bridge.customerUpdates.push({ id, params, options })
        bridge.customerRecord = { ...bridge.customerRecord!, email: params.email ?? null }
        return { ...bridge.customerRecord }
      },
    }
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
          bridge.sessions.push({ params, options })
          if (bridge.failSessions) throw new Error("checkout create failed")
          bridge.stored = {
            id: "cs_synthcreate",
            url: checkoutUrl,
            livemode: false,
            mode: "payment",
            status: "open",
          }
          return bridge.stored
        },
        retrieve: async (id: string) => {
          if (!bridge.stored || bridge.stored.id !== id) throw new Error(`missing checkout ${id}`)
          return bridge.stored
        },
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

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const alexAuth = "66666666-6666-4666-8666-666666666666"
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
}

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; quoteVersionId?: string }

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
    bridge.calls.push(name)
    const keys = named[name]
    if (!keys) throw new Error(name)
    return rpc(name, keys.map(key => (key in args ? args[key] : null)))
  }
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values ('${alex}', 'Alex Example', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4)`,
    [alex, "alex@example.com", admin, "Verified from a live call with the customer."],
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
  bridge.failSessions = false
  bridge.calls.length = 0
  bridge.constructed.length = 0
  bridge.customers.length = 0
  bridge.customerReads.length = 0
  bridge.customerUpdates.length = 0
  bridge.customerRecord = null
  bridge.sessions.length = 0
  bridge.stored = null
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
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

describe("synthetic Checkout creation", () => {
  it("creates one test-mode Checkout for the accepted order and reuses it", async () => {
    const caseId = randomUUID()
    await db.query(
      `insert into public.cases(
        id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
        information_accurate_at, privacy_accepted_at, service_track
      ) values ($1,'PR-26-SYNCH6','PROFILE_RECOVERY',$2,$3,$4,'Profile suspended', now(), now(), 'GUIDED')`,
      [caseId, alex, business, location],
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
    const order = (await rows<{ id: string; public_ref: string; amount_minor: number }>(
      "select id, public_ref, amount_minor from public.service_orders where case_id = $1",
      [caseId],
    ))[0]
    expect(order.amount_minor).toBeGreaterThan(0)
    const obligationId = (await rows<{ id: string; state: string; amount_minor: number }>(
      "select id, state, amount_minor from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'",
      [order.id],
    ))[0]
    expect(obligationId.state).toBe("DUE")
    expect(obligationId.amount_minor).toBe(order.amount_minor)
    const shown = await rpc<{ status: string; serviceCode: string; amountMinor: number; currency: string; verifiedEmail: string }>(
      "payment_checkout_presentation_v1", [alex, order.id],
    )
    expect(shown).toEqual({
      status: "success",
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: order.amount_minor,
      currency: "GBP",
      verifiedEmail: "alex@example.com",
    })
    const foreign = await rpc<Record<string, unknown>>("payment_checkout_presentation_v1", [
      "77777777-7777-4777-8777-777777777777", order.id,
    ])
    expect(foreign).toEqual({ status: "denied", reason: "order_mismatch" })
    expect(JSON.stringify(foreign)).not.toContain("alex@")
    await db.query("delete from public.customer_contact_verifications where customer_id = $1 and channel = 'email'", [alex])
    const hidden = await rpc<Record<string, unknown>>("payment_checkout_presentation_v1", [alex, order.id])
    expect(hidden).toEqual({ status: "denied", reason: "email_unverified" })
    expect(JSON.stringify(hidden)).not.toContain("@")
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1,'email',$2,$3,$4)`,
      [alex, "alex@example.com", admin, "Verified from a live call with the customer."],
    )
    const paymentSecret = hash(token())
    const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, requestId(), "issue_guided_payment_action", {
      serviceOrderId: order.id, expiresAt: actionExpiry(), secretHash: paymentSecret,
    }, 1])
    expect(issued.status).toBe("success")
    const raw = token()
    const pendingPay = hash(token())
    await rpc("customer_action_exchange_v1", [issued.id, paymentSecret, pendingPay])
    await rpc("customer_action_begin_otp_v1", [pendingPay])
    await rpc("customer_action_confirm_otp_sent_v1", [pendingPay])
    await rpc("customer_action_finish_otp_v1", [pendingPay, hash(raw), alexAuth, "alex@example.com"])

    bridge.failSessions = true
    bridge.calls.length = 0
    const failed = await paymentCommand(pay(raw, requestId()))
    expect(failed.status).toBe(503)
    expect(bridge.calls).toEqual([
      "payment_provider_lane_status_v1",
      "customer_payment_command_v1",
      "payment_provider_lane_status_v1",
      "payment_checkout_presentation_v1",
      "payment_provider_lane_status_v1",
      "payment_prepare_customer_v1",
      "payment_record_customer_map_v1",
    ])
    expect(bridge.customers).toHaveLength(1)
    expect(bridge.sessions).toHaveLength(1)
    expect(bridge.stored).toBeNull()
    expect(await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId.id])).toEqual([{ state: "DUE" }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toEqual([{ n: 0 }])
    expect(await rows<{ stripe_checkout_session_id: string | null }>(
      "select stripe_checkout_session_id from public.payment_attempts where obligation_id = $1",
      [obligationId.id],
    )).toEqual([{ stripe_checkout_session_id: null }])

    bridge.failSessions = false
    bridge.calls.length = 0
    bridge.sessions.length = 0
    if (bridge.customerRecord) bridge.customerRecord.email = null
    bridge.customerReads.length = 0
    bridge.customerUpdates.length = 0
    const created = await paymentCommand(pay(raw, requestId()))
    expect(created.status).toBe(200)
    await expect(created.json()).resolves.toMatchObject({ status: "ok", checkoutUrl, mode: "payment" })
    expect(bridge.customers).toHaveLength(1)
    expect(bridge.sessions).toHaveLength(1)
    expect(bridge.calls).toEqual([
      "payment_provider_lane_status_v1",
      "customer_payment_command_v1",
      "payment_provider_lane_status_v1",
      "payment_checkout_presentation_v1",
      "payment_provider_lane_status_v1",
      "payment_prepare_customer_v1",
      "payment_record_provider_refs_v1",
    ])
    const attempt = (await rows<{ id: string; provider_operation_id: string; stripe_checkout_session_id: string }>(
      `select att.id, att.provider_operation_id, att.stripe_checkout_session_id
       from public.payment_attempts att where att.obligation_id = $1`,
      [obligationId.id],
    ))[0]
    const operation = (await rows<{ idempotency_key: string }>(
      "select idempotency_key from public.provider_operations where id = $1",
      [attempt.provider_operation_id],
    ))[0]
    const metadata = {
      customerId: alex,
      serviceOrderId: order.id,
      obligationId: obligationId.id,
      attemptId: attempt.id,
      providerOperationId: attempt.provider_operation_id,
      orderRef: order.public_ref,
    }
    expect(bridge.customers[0]).toEqual({
      params: { email: "alex@example.com", metadata: { customerId: alex } },
      options: { idempotencyKey: expect.any(String) },
    })
    expect(JSON.stringify(bridge.customers[0].params)).not.toContain("attacker@")
    expect(bridge.customerUpdates).toEqual([{
      id: "cus_synthcreate",
      params: { email: "alex@example.com" },
      options: { idempotencyKey: expect.stringMatching(/^cus-email-[a-f0-9]{40}$/) },
    }])
    expect(String(bridge.customerUpdates[0].options.idempotencyKey)).not.toContain("alex@")
    expect(bridge.customerReads).toEqual(["cus_synthcreate"])
    expect(bridge.sessions[0].options).toEqual({ idempotencyKey: operation.idempotency_key })
    expect(bridge.sessions[0].params).toEqual({
      mode: "payment",
      customer: "cus_synthcreate",
      success_url: `${origin}/pay/return?order=${order.public_ref}`,
      cancel_url: `${origin}/pay/return?order=${order.public_ref}`,
      client_reference_id: attempt.id,
      payment_method_types: ["card"],
      payment_intent_data: { metadata },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: order.amount_minor,
          product_data: {
            name: "Guided Relaunch",
            description: expect.stringContaining("One-time upfront fee"),
          },
        },
      }],
      metadata,
    })
    expect(JSON.stringify(bridge.sessions[0].params)).not.toContain("attacker@")
    expect(JSON.stringify(bridge.sessions[0].params)).not.toContain("ProfileRelaunch service")
    expect(JSON.stringify(bridge.sessions[0].params)).not.toMatch(/reinstate|£99/)
    expect(attempt.stripe_checkout_session_id).toBe("cs_synthcreate")
    expect(await rows<{ n: number }>("select count(*)::int as n from public.stripe_customer_maps where customer_id = $1", [alex])).toEqual([{ n: 1 }])
    expect(await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId.id])).toEqual([{ state: "DUE" }])
    expect(bridge.constructed.every(key => key === testKey)).toBe(true)

    bridge.calls.length = 0
    const reused = await paymentCommand(pay(raw, requestId()))
    expect(reused.status).toBe(200)
    await expect(reused.json()).resolves.toMatchObject({ status: "ok", checkoutUrl, mode: "payment" })
    expect(bridge.customers).toHaveLength(1)
    expect(bridge.sessions).toHaveLength(1)
    expect(bridge.calls).toEqual([
      "payment_provider_lane_status_v1",
      "customer_payment_command_v1",
      "payment_provider_lane_status_v1",
    ])
    expect(bridge.sessions).toHaveLength(1)
    expect(bridge.customerUpdates).toHaveLength(1)
    expect(bridge.customerReads).toEqual(["cus_synthcreate"])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toEqual([{ n: 0 }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.payment_attempts where obligation_id = $1", [obligationId.id])).toEqual([{ n: 1 }])
  })
})
