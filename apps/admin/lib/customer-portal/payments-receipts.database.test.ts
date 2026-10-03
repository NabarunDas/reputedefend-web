import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, migrationSql, preparePlatform } from "../recovery/harness"

const migration = "20261003224746_customer_portal_payments_receipts_v1.sql"
const db = new PGlite()

const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; orderId?: string }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

async function priceId(code: string) {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = $1 and seed_key is not null", [code]))[0].id
}

async function verify(id = alex, email = "alex@example.com") {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4) on conflict (customer_id, channel) do update set verified_value = excluded.verified_value`,
    [id, email, admin, "Verified from a live call with the customer."],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified',now(),$3,$4) on conflict (customer_id, business_id) do update set status = 'verified'`,
    [id, business, admin, "Companies House match discussed on a live call."],
  )
}

async function insertCase(reference: string, track = "GUIDED") {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,'Profile suspended', now(), now(), $6)`,
    [id, reference, alex, business, location, track],
  )
  return id
}

async function acceptQuote(caseId: string, serviceCode = "GUIDED_RELAUNCH") {
  await verify()
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_draft", {
    customerId: alex, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId(serviceCode),
    serviceCode,
  }, null])
  await rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", { quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }, draft.version])
  await rpc("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft.id }, (draft.version as number) + 1])
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_quote_acceptance_action", {
    quoteId: draft.id, expiresAt: actionExpiry(), secretHash,
  }, null])
  const pending = hash(token())
  const session = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, alexAuth, "alex@example.com"])
  const accepted = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  return { accepted, session, quoteId: draft.id as string }
}

async function caseVersion(caseId: string) {
  return (await rows<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId]))[0].workflow_version
}

async function caseCmd(caseId: string, operation: string, data: Record<string, unknown>) {
  return rpc("admin_case_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), operation, {
    note: "Reviewed the caller’s request and confirmed the details.", ...data,
  }])
}

async function guidedToPaymentRequired(caseId: string) {
  await caseCmd(caseId, "plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null })
  await caseCmd(caseId, "transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
}

async function issueAndOpen(kind: "issue_guided_payment_action" | "issue_managed_setup_action" | "issue_recovery_action" | "issue_invoice_fallback", orderId: string, extra: Record<string, unknown> = {}) {
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, key(), kind, {
    serviceOrderId: orderId, expiresAt: actionExpiry(), secretHash, ...extra,
  }, 1])
  const pending = hash(token())
  const session = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, alexAuth, "alex@example.com"])
  return { issued, session, actionId: issued.id as string }
}

async function selector(actionId: string) {
  return (await rows<{ value: string }>("select admin_private.customer_portal_action_selector_v1($1) as value", [actionId]))[0].value
}

function leak(value: unknown) {
  const serialised = JSON.stringify(value)
  expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  expect(serialised).not.toMatch(/cus_|pi_|cs_|pm_|in_|sk_|stripe|hostedInvoice|provider_receipt|storage/i)
  return serialised
}

let alexSession = ""
let samSession = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await verify()
  await verify(sam, "sam@example.com")
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

describe("customer portal payments and receipts", () => {
  it("adds functions only and keeps the legacy payment command delegated", () => {
    const sql = migrationSql(migration)
    expect(sql).not.toMatch(/create table/i)
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on/i)
    expect(sql).not.toMatch(/execute\s+['$]/i)
    expect(sql).not.toMatch(/\bformat\s*\(/i)
    expect(sql).toContain("customer_payment_apply_v1")
    expect(sql).not.toContain("customer_action_command_core_v1")
  })

  it("shows an owned guided payment and refuses another customer, a bad session and a forged scope", async () => {
    const reference = "PR-26-PAYGUD"
    const caseId = await insertCase(reference)
    const { accepted } = await acceptQuote(caseId)
    expect(accepted.status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const order = (await rows<{ id: string; public_ref: string; amount_minor: number }>("select id, public_ref, amount_minor from public.service_orders where case_id = $1", [caseId]))[0]
    const opened = await issueAndOpen("issue_guided_payment_action", order.id)
    const view = await rpc<{ cases: Array<{ reference: string; orders: Array<{ orderRef: string; amountMinor: number; obligations: Array<{ state: string; amountMinor: number }>; receipts: unknown[] }>; actions: Array<{ kind: string; selector: string }> }> }>("customer_portal_payments_v1", [alexSession])
    const mine = view.cases.find(item => item.reference === reference)
    expect(mine?.orders[0]).toMatchObject({
      orderRef: order.public_ref,
      amountMinor: order.amount_minor,
      obligations: [{ state: "DUE", amountMinor: order.amount_minor }],
      receipts: [],
    })
    expect(mine?.actions.map(action => action.kind)).toEqual(["guided_payment"])
    leak(view)
    expect(await rpc("customer_portal_case_payments_v1", [samSession, reference])).toEqual({ found: false })
    expect(await rpc("customer_portal_case_payments_v1", [alexSession, "PR-26-ZZZZZZ"])).toEqual({ found: false })
    expect(await rpc("customer_portal_payments_v1", [hash(token())])).toBeNull()
    await db.query(
      `update admin_private.customer_portal_login_rate
       set last_requested_at = now() - interval '2 minutes',
           window_started_at = now() - interval '31 minutes',
           send_count = 0
       where customer_id = $1`,
      [alex],
    )
    const revoked = await portalSession("alex@example.com", alexAuth)
    await rpc("customer_portal_sign_out_v1", [revoked])
    expect(await rpc("customer_portal_payments_v1", [revoked])).toBeNull()
    expect(await rpc("customer_portal_payments_v1", [alexSession])).not.toBeNull()
    const actionSelector = await selector(opened.actionId)
    const denied = await rpc<Json>("customer_portal_payment_command_v1", [
      samSession, key(), reference, actionSelector, "start_checkout", { idempotencyKey: key() },
    ])
    expect(denied.status).toBe("not_found")
    expect(await count("select count(*)::int as n from public.payment_attempts")).toBe(0)
  })

  it("prepares checkout once, replays the same request, and does not mark the obligation paid", async () => {
    const reference = "PR-26-PAYCHK"
    const caseId = await insertCase(reference)
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const order = (await rows<{ id: string }>("select id from public.service_orders where case_id = $1", [caseId]))[0]
    const opened = await issueAndOpen("issue_guided_payment_action", order.id)
    const actionSelector = await selector(opened.actionId)
    const request = key()
    const data = { idempotencyKey: request }
    const first = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, request, reference, actionSelector, "start_checkout", data])
    const second = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, request, reference, actionSelector, "start_checkout", data])
    expect(first.status).toBe("success")
    expect(second).toEqual(first)
    expect(await count("select count(*)::int as n from public.payment_attempts where service_order_id = $1 and status = 'CREATED'", [order.id])).toBe(1)
    expect((await rows<{ state: string }>("select state from public.payment_obligations where service_order_id = $1", [order.id]))[0].state).toBe("DUE")
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(0)
    const again = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, key(), reference, actionSelector, "start_checkout", { idempotencyKey: key() }])
    expect(again.status).toBe("success")
    expect(again.reused).toBe(true)
    expect(await count("select count(*)::int as n from public.payment_attempts where service_order_id = $1 and status in ('CREATED','SUBMITTED','REQUIRES_ACTION')", [order.id])).toBe(1)
    const conflict = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, request, reference, actionSelector, "confirm_consent", { accepted: true }])
    expect(conflict.status).toBe("conflict")
    const legacy = await rpc<Json>("customer_payment_command_v1", [opened.session, key(), "start_checkout", { idempotencyKey: key() }])
    expect(legacy.status).toBe("success")
    expect(legacy.reused).toBe(true)
    expect(await count("select count(*)::int as n from public.payment_attempts where service_order_id = $1", [order.id])).toBe(1)
    expect(await rpc<Json>("customer_payment_command_v1", [opened.session, key(), "mark_paid", {}])).toMatchObject({ status: "unavailable" })
    expect(await rpc<Json>("customer_action_command_v1", [opened.session, key(), "accept", { accepted: true }])).toMatchObject({ status: "unavailable" })
  })

  it("records managed consent without a charge and keeps the canonical consent text", async () => {
    const reference = "PR-26-PAYMNG"
    const caseId = await insertCase(reference, "MANAGED")
    await acceptQuote(caseId, "MANAGED_RELAUNCH")
    const order = (await rows<{ id: string; amount_minor: number }>("select id, amount_minor from public.service_orders where case_id = $1", [caseId]))[0]
    const opened = await issueAndOpen("issue_managed_setup_action", order.id)
    const actionSelector = await selector(opened.actionId)
    const view = await rpc<{ cases: Array<{ orders: Array<{ paymentModel: string; consent: { recorded: boolean; text: string | null }; consentOfferText: string | null; paymentMethodSaved: boolean }> }> }>("customer_portal_payments_v1", [alexSession])
    const managed = view.cases.find(item => item.reference === reference)
    expect(managed?.orders[0].paymentModel).toBe("SUCCESS_FEE")
    expect(managed?.orders[0].consent).toEqual({ recorded: false, text: null })
    expect(managed?.orders[0].consentOfferText).toContain("No service fee is charged today.")
    expect(managed?.orders[0].paymentMethodSaved).toBe(false)
    leak(view)
    const consent = await rpc<Json>("customer_portal_payment_command_v1", [
      alexSession, key(), reference, actionSelector, "confirm_consent", { accepted: true },
    ])
    expect(consent.status).toBe("success")
    expect(await count("select count(*)::int as n from public.payment_consents where service_order_id = $1", [order.id])).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_attempts where service_order_id = $1", [order.id])).toBe(0)
    expect(await count("select count(*)::int as n from public.provider_operations where service_order_id = $1", [order.id])).toBe(0)
    const same = key()
    const first = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, same, reference, actionSelector, "confirm_consent", { accepted: true }])
    const second = await rpc<Json>("customer_portal_payment_command_v1", [alexSession, same, reference, actionSelector, "confirm_consent", { accepted: true }])
    expect(second).toEqual(first)
    expect(await count("select count(*)::int as n from public.payment_consents where service_order_id = $1", [order.id])).toBe(1)
    const legacy = await rpc<Json>("customer_payment_command_v1", [opened.session, key(), "confirm_consent", { accepted: true }])
    expect(legacy.status).toBe("success")
    expect(await count("select count(*)::int as n from public.payment_consents where service_order_id = $1", [order.id])).toBe(1)
  })

  it("projects paid, failed, authentication, void and invoice states without provider secrets", async () => {
    const reference = "PR-26-PAYSTA"
    const caseId = await insertCase(reference)
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const order = (await rows<{ id: string; public_ref: string; amount_minor: number; currency: string; tax_behaviour: string; tax_amount_minor: number }>(
      "select id, public_ref, amount_minor, currency, tax_behaviour, tax_amount_minor from public.service_orders where case_id = $1",
      [caseId],
    ))[0]
    const obligation = (await rows<{ id: string }>("select id from public.payment_obligations where service_order_id = $1", [order.id]))[0]
    await db.query("update public.payment_obligations set state = 'FAILED' where id = $1", [obligation.id])
    const failed = await rpc<{ case: { orders: Array<{ obligations: Array<{ state: string }> }> } }>("customer_portal_case_payments_v1", [alexSession, reference])
    expect(failed.case.orders[0].obligations[0].state).toBe("FAILED")
    await db.query("update public.payment_obligations set state = 'AUTHENTICATION_REQUIRED' where id = $1", [obligation.id])
    const recovery = await issueAndOpen("issue_recovery_action", order.id, { obligationId: obligation.id })
    const recovered = await rpc("customer_portal_case_payments_v1", [alexSession, reference])
    const body = recovered as { case: { orders: Array<{ obligations: Array<{ state: string; invoice: { status: string; hostedAvailable: boolean } | null }>; receipts: Array<{ selector: string }> }>; actions: Array<{ kind: string }> } }
    expect(body.case.orders[0].obligations[0].state).toBe("AUTHENTICATION_REQUIRED")
    expect(body.case.actions.map(action => action.kind)).toContain("recovery")
    const operation = randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status, provider_object_id, provider_object_type)
       values ($1, $2, 'CREATE_INVOICE', 'INVOICE', $3, $4, $5, 'SUCCEEDED', 'in_secretinvoice', 'invoice')`,
      [operation, randomUUID(), alex, order.id, obligation.id],
    )
    const invoice = randomUUID()
    await db.query(
      `insert into public.payment_invoices(
        id, obligation_id, service_order_id, customer_id, provider_operation_id, amount_minor, currency,
        tax_behaviour, tax_amount_minor, status, provider_invoice_id, hosted_invoice_url
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ISSUED','in_secretinvoice','https://invoice.stripe.com/i/secret-hosted')`,
      [invoice, obligation.id, order.id, alex, operation, order.amount_minor, order.currency, order.tax_behaviour, order.tax_amount_minor],
    )
    const invoiceAction = await issueAndOpen("issue_invoice_fallback", order.id, { obligationId: obligation.id })
    const projected = await rpc<typeof body>("customer_portal_case_payments_v1", [alexSession, reference])
    expect(projected.case.orders[0].obligations[0].invoice).toEqual({ status: "ISSUED", hostedAvailable: true })
    leak(projected)
    const target = await rpc<{ status: string; hostedInvoiceUrl?: string }>("customer_portal_invoice_target_v1", [
      alexSession, reference, await selector(invoiceAction.actionId),
    ])
    expect(target.status).toBe("redirect")
    expect(target.hostedInvoiceUrl).toContain("https://")
    expect(await rpc("customer_portal_invoice_target_v1", [samSession, reference, await selector(invoiceAction.actionId)])).toEqual({ status: "not_found" })
    const checkout = await rpc<Json>("customer_portal_payment_command_v1", [
      alexSession, key(), reference, await selector(invoiceAction.actionId), "start_checkout", { idempotencyKey: key() },
    ])
    expect(checkout.status).toBe("unavailable")
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligation.id]))[0].state).toBe("AUTHENTICATION_REQUIRED")
    const attempt = randomUUID()
    const attemptOperation = randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1,$2,'CREATE_CHECKOUT_SESSION','UPFRONT',$3,$4,$5,'SUCCEEDED')`,
      [attemptOperation, randomUUID(), alex, order.id, obligation.id],
    )
    await db.query(
      `insert into public.payment_attempts(
        id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, stripe_payment_intent_id
      ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',$5,$6,'pi_secretreceipt')`,
      [attempt, obligation.id, order.id, attemptOperation, order.amount_minor, order.currency],
    )
    const receipt = randomUUID()
    await db.query(
      `insert into public.payment_receipts(
        id, obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency,
        tax_behaviour, tax_amount_minor, stripe_payment_intent_id, stripe_charge_id, provider_receipt_url
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pi_secretreceipt','ch_secretcharge','https://pay.stripe.com/receipts/secret')`,
      [receipt, obligation.id, order.id, alex, attempt, order.amount_minor, order.currency, order.tax_behaviour, order.tax_amount_minor],
    )
    await db.query("update public.payment_obligations set state = 'PAID' where id = $1", [obligation.id])
    const paid = await rpc<typeof body>("customer_portal_case_payments_v1", [alexSession, reference])
    expect(paid.case.orders[0].obligations[0].state).toBe("PAID")
    expect(paid.case.actions.map(action => action.kind)).not.toContain("guided_payment")
    expect(paid.case.orders[0].receipts).toHaveLength(1)
    leak(paid)
    const download = await rpc<Record<string, unknown>>("customer_portal_receipt_v1", [alexSession, paid.case.orders[0].receipts[0].selector])
    expect(download).toMatchObject({ status: "ok", reference, orderRef: order.public_ref, amountMinor: order.amount_minor, currency: "GBP" })
    leak(download)
    expect(await rpc("customer_portal_receipt_v1", [samSession, paid.case.orders[0].receipts[0].selector])).toEqual({ status: "not_found" })
    expect(await rpc("customer_portal_receipt_v1", [hash(token()), paid.case.orders[0].receipts[0].selector])).toBeNull()
    await db.query("update public.cases set status = 'CLOSED', closed_at = now() where id = $1", [caseId])
    const closed = await rpc<Json>("customer_portal_payment_command_v1", [
      alexSession, key(), reference, await selector(recovery.actionId), "start_checkout", { idempotencyKey: key() },
    ])
    expect(closed.status).toBe("unavailable")
  })

  it("keeps every pre-existing command-core action kind available to its own function", async () => {
    const core = (await rows<{ def: string }>("select pg_get_functiondef('admin_private.customer_action_command_core_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(core).toContain("GUARD_PERMISSION")
    expect(core).toContain("accept_guard_permission_v1")
    expect(core).toContain("QUOTE_ACCEPTANCE")
    expect(core).toContain("AGREEMENT_ACCEPTANCE")
    expect(core).toContain("AUTHORIZATION_REVOCATION")
    expect(core).toContain("customer_commercial_apply_v1")
    expect(core).not.toContain("customer_payment_apply_v1")
    const payment = (await rows<{ def: string }>("select pg_get_functiondef('public.customer_payment_command_v1(text,uuid,text,jsonb)'::regprocedure) as def"))[0].def
    expect(payment).toContain("customer_payment_apply_v1")
    expect(payment).toContain("confirm_consent")
    expect(payment).toContain("start_checkout")
    const commercial = (await rows<{ def: string }>("select pg_get_functiondef('admin_private.customer_commercial_apply_v1(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid,text)'::regprocedure) as def"))[0].def
    expect(commercial).toContain("QUOTE_ACCEPTANCE")
    expect(commercial).toContain("AGREEMENT_ACCEPTANCE")
    expect(commercial).toContain("AUTHORIZATION_REVOCATION")
    const caseId = await insertCase("PR-26-PAYCRD")
    const { accepted } = await acceptQuote(caseId)
    expect(accepted).toMatchObject({ status: "success" })
    expect(await count("select count(*)::int as n from public.service_orders where case_id = $1", [caseId])).toBe(1)
  })

  it("keeps the new functions service-role only", async () => {
    const publicFns = [
      "public.customer_portal_payments_v1(text)",
      "public.customer_portal_case_payments_v1(text,text)",
      "public.customer_portal_payment_command_v1(text,uuid,text,text,text,jsonb)",
      "public.customer_portal_receipt_v1(text,text)",
      "public.customer_portal_invoice_target_v1(text,text,text)",
      "public.customer_payment_command_v1(text,uuid,text,jsonb)",
    ]
    const privateFns = [
      "admin_private.customer_payment_apply_v1(uuid,uuid,uuid,text,text,jsonb,text,uuid,uuid,text)",
      "admin_private.customer_portal_receipt_selector_v1(uuid)",
      "admin_private.customer_portal_case_payments_body_v1(uuid,uuid,text)",
    ]
    const can = async (role: string, signature: string) =>
      (await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]))[0].ok
    for (const role of ["public", "anon", "authenticated"]) {
      for (const signature of [...publicFns, ...privateFns]) expect(await can(role, signature), `${role} ${signature}`).toBe(false)
    }
    for (const signature of publicFns) expect(await can("service_role", signature)).toBe(true)
    for (const signature of privateFns) expect(await can("service_role", signature)).toBe(false)
  })
})
