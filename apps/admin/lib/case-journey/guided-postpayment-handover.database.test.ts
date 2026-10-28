/**
 * Disposable Guided post-payment handover. Settlement is a test-mode provider
 * event inside PGlite. Nothing here connects to a live database, sends mail,
 * or edits a real case.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)
const staffAction = "Prepare the Guided pack for this customer. The upfront payment is already recorded."
const stripeCustomer = "cus_handover1"

type Json = Record<string, unknown> & { status?: string; id?: string; reason?: string; stage?: string; attemptId?: string; providerOperationId?: string; handedOver?: number; examined?: number }

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

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
async function priceId() {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = 'GUIDED_RELAUNCH' and seed_key is not null"))[0].id
}
async function verify() {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email','alex@example.com',$2,$3) on conflict (customer_id, channel) do update set verified_value = excluded.verified_value`,
    [alex, admin, "Verified from a live call with the customer."],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified',now(),$3,$4)
     on conflict (customer_id, business_id) do update
       set status = 'verified', verified_at = now(), verified_by = excluded.verified_by, evidence = excluded.evidence`,
    [alex, business, admin, "Companies House match discussed on a live call."],
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
async function acceptQuote(caseId: string) {
  await verify()
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_draft", {
    customerId: alex, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId(),
    serviceCode: "GUIDED_RELAUNCH",
  }, null])
  if (draft.status !== "success") throw new Error(`draft ${JSON.stringify(draft)}`)
  await rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", { quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }, draft.version])
  const offered = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft.id }, (draft.version as number) + 1])
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
  const accepted = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", paidQuoteCommand({
    quoteVersionId: String(offered.quoteVersionId),
    serviceCode: "GUIDED_RELAUNCH",
    locationId: location,
    amountMinor: 9900,
  })])
  if (accepted.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
  return accepted
}
async function caseVersion(caseId: string) {
  return (await rows<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId]))[0].workflow_version
}
async function caseCmd(caseId: string, operation: string, data: Record<string, unknown>) {
  return rpc<Json>("admin_case_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), operation, {
    note: "Reviewed the caller’s request and confirmed the details.", ...data,
  }])
}
async function guidedToPaymentRequired(caseId: string) {
  await caseCmd(caseId, "plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null })
  await caseCmd(caseId, "transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "PAYMENT_REQUIRED", nextAction: "Customer pays the accepted Guided fee through the existing secure payment action.", due: "2026-12-01T12:00:00Z" })
}
async function orderOf(caseId: string) {
  return (await rows<{ id: string; public_ref: string; amount_minor: number; record_version: number; state: string }>(
    "select id, public_ref, amount_minor, record_version, state from public.service_orders where case_id = $1",
    [caseId],
  ))[0]
}
async function openPayment(orderId: string, version: number) {
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, key(), "issue_guided_payment_action", {
    serviceOrderId: orderId, expiresAt: actionExpiry(), secretHash,
  }, version])
  const pending = hash(token())
  const session = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, alexAuth, "alex@example.com"])
  return { issued, session }
}
async function checkout(caseId: string, suffix: string) {
  const order = await orderOf(caseId)
  const obligationId = (await rows<{ id: string }>(
    "select id from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'",
    [order.id],
  ))[0].id
  const paymentSession = await openPayment(order.id, order.record_version)
  const started = await rpc<Json>("customer_payment_command_v1", [paymentSession.session, key(), "start_checkout", { idempotencyKey: key() }])
  if (started.status !== "success") throw new Error(`checkout ${JSON.stringify(started)}`)
  const mapped = await rpc<Json>("payment_ensure_customer_map_v1", [alex, stripeCustomer])
  if (mapped.status !== "success" && mapped.reason !== "conflicting_customer") {
    if (mapped.status !== "success") throw new Error(`map ${JSON.stringify(mapped)}`)
  }
  await rpc("payment_record_provider_refs_v1", [started.providerOperationId, `cs_${suffix}`, "checkout.session"])
  return { order, obligationId, started }
}
function succeededPayload(order: { id: string; public_ref: string; amount_minor: number }, obligationId: string, started: Json, extra: Record<string, unknown> = {}) {
  return {
    paymentIntentStatus: "succeeded",
    amountMinor: order.amount_minor,
    currency: "gbp",
    stripeCustomerId: stripeCustomer,
    customerId: alex,
    serviceOrderId: order.id,
    obligationId,
    attemptId: started.attemptId,
    providerOperationId: started.providerOperationId,
    orderRef: order.public_ref,
    livemode: false,
    ...extra,
  }
}
async function apply(eventId: string, type: string, objectId: string, payload: Record<string, unknown>) {
  return rpc<Json>("payment_apply_provider_event_v1", [eventId, type, objectId, payload])
}
async function stageOf(caseId: string) {
  return (await rows<{ status: string; work_stage: string; next_action: string; next_action_at: string | null; workflow_version: number }>(
    "select status, work_stage, next_action, next_action_at, workflow_version from public.cases where id = $1",
    [caseId],
  ))[0]
}
async function handoverEvents(caseId: string) {
  return count("select count(*)::int as n from public.case_events where case_id = $1 and event_type = 'GUIDED_PAYMENT_HANDOVER'", [caseId])
}
async function ready(caseId: string, target = "PREPARATION") {
  return (await rows<{ ready: boolean }>(
    "select admin_private.case_stage_ready_v1(c, $2) as ready from public.cases c where c.id = $1",
    [caseId, target],
  ))[0].ready
}
async function privateHandover(caseId: string, source = "reconcile") {
  return (await rows<{ value: Json }>(
    "select admin_private.guided_postpayment_handover_v1($1, $2, $3) as value",
    [caseId, source, key()],
  ))[0].value
}
const handoverSignature = "admin_private.guided_postpayment_handover_v1(uuid,text,uuid)"
async function holdHandover() {
  const def = (await rows<{ def: string }>("select pg_get_functiondef($1::regprocedure) as def", [handoverSignature]))[0].def
  await db.exec(`
    CREATE OR REPLACE FUNCTION admin_private.guided_postpayment_handover_v1(p_case uuid, p_source text, p_request uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
    BEGIN
      RETURN jsonb_build_object('status','skipped','reason','test_hold');
    END;
    $fn$;
  `)
  return def
}
async function unwind() {
  try { await db.exec("rollback") } catch { /* no open transaction */ }
}

async function raiseHandover() {
  const def = (await rows<{ def: string }>("select pg_get_functiondef($1::regprocedure) as def", [handoverSignature]))[0].def
  await db.exec(`
    CREATE OR REPLACE FUNCTION admin_private.guided_postpayment_handover_v1(p_case uuid, p_source text, p_request uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
    BEGIN
      RAISE EXCEPTION 'handover_fault';
    END;
    $fn$;
  `)
  return def
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values ('${alex}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await verify()
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin))
  const approved = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, SYNTHETIC_APPROVAL_REQUEST, SYNTHETIC_APPROVAL_EVIDENCE])
  if (approved.status !== "confirmed") throw new Error(approved.status ?? "approval missing")
}, 180000)

afterEach(async () => { await unwind() })

afterAll(async () => { await db.close() })

describe("guided post-payment handover", () => {
  it("moves one settled Guided case to preparation and ignores a duplicate webhook", async () => {
    const caseId = await insertCase("PR-26-HNDSET")
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    expect(await ready(caseId)).toBe(false)
    const versionBefore = await caseVersion(caseId)
    const workBefore = await count("select count(*)::int as n from public.case_work_events where case_id = $1", [caseId])
    const mailBefore = await count("select count(*)::int as n from public.communications where case_id = $1", [caseId])
    const ledgerBefore = await count("select count(*)::int as n from public.payment_ledger")
    const { order, obligationId, started } = await checkout(caseId, "hndset")
    const checkoutOnly = await apply(`evt_hndset_cs`, "checkout.session.completed", "cs_hndset", {
      mode: "payment", paymentStatus: "unpaid", paymentIntentId: "pi_hndset", livemode: false,
      customerId: alex, serviceOrderId: order.id, obligationId, providerOperationId: started.providerOperationId,
    })
    expect(checkoutOnly.status).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(0)

    const settled = await apply("evt_hndset", "payment_intent.succeeded", "pi_hndset", succeededPayload(order, obligationId, started))
    expect(settled.status).toBe("success")
    const moved = await stageOf(caseId)
    expect(moved).toMatchObject({ status: "UNDER_REVIEW", work_stage: "PREPARATION", next_action: staffAction, next_action_at: null })
    expect(moved.workflow_version).toBe(versionBefore + 1)
    expect(await ready(caseId)).toBe(true)
    expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.case_work_events where case_id = $1", [caseId])).toBe(workBefore)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [caseId])).toBe(mailBefore)
    const audit = await rows<{ actor_id: string | null; outcome: string }>(
      `select actor_id, outcome from public.admin_audit_events
       where target_id = $1 and action = 'CASE_CHANGED' and reason = 'Settled Guided upfront payment handed to preparation.'`,
      [caseId],
    )
    expect(audit).toEqual([{ actor_id: null, outcome: "success" }])
    const event = await rows<{ actor_type: string; receipt_ref: string }>(
      `select actor_type, event_data->>'receiptRef' as receipt_ref
       from public.case_events where case_id = $1 and event_type = 'GUIDED_PAYMENT_HANDOVER'`,
      [caseId],
    )
    expect(event).toEqual([{ actor_type: "SYSTEM", receipt_ref: expect.stringMatching(/^RC-/) }])
    const followUp = await rows<{ status: string; resolution: string; resolved: boolean }>(
      `select status, resolution, resolved_at is not null as resolved
       from public.case_tasks where case_id = $1`,
      [caseId],
    )
    expect(followUp).toEqual([{
      status: "DONE",
      resolution: "The upfront Guided payment is recorded, so this payment follow-up is complete.",
      resolved: true,
    }])
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBe(0)
    const closeAttempt = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, moved.workflow_version, {
        note: "Reviewed the caller’s request and confirmed the details.",
        summary: "The Guided pack is ready for the customer.",
      },
    ])
    expect(closeAttempt).toMatchObject({ status: "denied", reason: "pack" })
    expect(await count("select count(*)::int as n from public.payment_ledger")).toBe(ledgerBefore + 2)

    const replay = await apply("evt_hndset", "payment_intent.succeeded", "pi_hndset", succeededPayload(order, obligationId, started))
    expect(replay).toMatchObject({ status: "success", duplicate: true })
    const second = await apply("evt_hndset_2", "payment_intent.succeeded", "pi_hndset", succeededPayload(order, obligationId, started))
    expect(second.status).toBe("success")
    expect((await stageOf(caseId)).workflow_version).toBe(versionBefore + 1)
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.guided_postpayment_handovers where case_id = $1", [caseId])).toBe(1)
  })

  it("leaves failed, mismatched, foreign and incomplete payments at payment required", async () => {
    const caseId = await insertCase("PR-26-HNDBAD")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndbad")
    const failed = await apply("evt_hndbad_fail", "payment_intent.payment_failed", "pi_hndbad", {
      failureCode: "card_declined", livemode: false, customerId: alex, serviceOrderId: order.id, obligationId,
      providerOperationId: started.providerOperationId,
    })
    expect(failed.status).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(0)
    expect(await handoverEvents(caseId)).toBe(0)

    const wrongAmount = await apply("evt_hndbad_amt", "payment_intent.succeeded", "pi_hndbad", succeededPayload(order, obligationId, started, { amountMinor: 1 }))
    expect(wrongAmount).toMatchObject({ status: "denied", reason: "payment_mismatch" })
    const wrongCustomer = await apply("evt_hndbad_cus", "payment_intent.succeeded", "pi_hndbad", succeededPayload(order, obligationId, started, { stripeCustomerId: "cus_otherhand" }))
    expect(wrongCustomer).toMatchObject({ status: "denied", reason: "payment_mismatch" })
    const otherCase = await insertCase("PR-26-HNDXCS")
    await acceptQuote(otherCase)
    const otherOrder = await orderOf(otherCase)
    const crossed = await apply("evt_hndbad_x", "payment_intent.succeeded", "pi_hndbad", succeededPayload(order, obligationId, started, { serviceOrderId: otherOrder.id }))
    expect(crossed).toMatchObject({ status: "denied", reason: "payment_mismatch" })
    const unrelated = await apply("evt_hndbad_un", "payment_intent.succeeded", "pi_foreign_hand", { livemode: false, paymentIntentStatus: "succeeded" })
    expect(unrelated).toMatchObject({ status: "success", ignored: true })
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect((await stageOf(otherCase)).work_stage).toBe("INITIAL_REVIEW")
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(0)
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId]))[0].state).toBe("FAILED")
    expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
  })

  it("hands over once when the succeeded event arrives before checkout completion", async () => {
    const caseId = await insertCase("PR-26-HNDREV")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndrev")
    const first = await apply("evt_hndrev", "payment_intent.succeeded", "pi_hndrev", succeededPayload(order, obligationId, started))
    expect(first.status).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PREPARATION")
    const laterCheckout = await apply("evt_hndrev_cs", "checkout.session.completed", "cs_hndrev", {
      mode: "payment", paymentStatus: "paid", paymentIntentId: "pi_hndrev", livemode: false,
      customerId: alex, serviceOrderId: order.id, obligationId,
    })
    expect(laterCheckout.status).toBe("success")
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
  })

  it("does not advance a paid obligation until its one matching receipt exists", async () => {
    const caseId = await insertCase("PR-26-HNDPAY")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndpay")
    await db.exec("begin")
    await db.exec("set local session_replication_role = replica")
    await db.query("update public.payment_obligations set state = 'PAID' where id = $1", [obligationId])
    await db.exec("set local session_replication_role = origin")
    const early = await apply("evt_hndpay_early", "payment_intent.succeeded", "pi_hndpay", succeededPayload(order, obligationId, started))
    expect(early).toMatchObject({ status: "success", duplicate: true })
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(0)
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect((await privateHandover(caseId)).reason).toBe("receipt")
    await db.query(
      `insert into public.payment_receipts(
        obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor
      ) select id, service_order_id, customer_id, $2, amount_minor, currency, tax_behaviour, tax_amount_minor
        from public.payment_obligations where id = $1`,
      [obligationId, started.attemptId],
    )
    expect((await privateHandover(caseId)).reason).toBe("customer_work")
    await db.query(
      "select admin_private.complete_payment_action_v1($1, 'GUIDED_PAYMENT', 'receipt_recovered')",
      [order.id],
    )
    const recovered = await privateHandover(caseId)
    expect(recovered.status, JSON.stringify(recovered)).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PREPARATION")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    await unwind()
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(0)
  })

  it("refuses extra obligations, extra receipts, cross-case rows, lost authority, closure and other tracks", async () => {
    const held = await holdHandover()
    const caseId = await insertCase("PR-26-HNDBLK")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndblk")
    expect((await apply("evt_hndblk", "payment_intent.succeeded", "pi_hndblk", succeededPayload(order, obligationId, started))).status).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect((await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason).toBeNull()
    await db.exec(held)

    const quote = await rows<{ quote_id: string; quote_version_id: string; tax_behaviour: string; tax_amount_minor: number }>(
      "select quote_id, quote_version_id, tax_behaviour, tax_amount_minor from public.service_orders where id = $1",
      [order.id],
    )
    const attemptId = started.attemptId

    async function denied(reason: string) {
      await db.exec("set local session_replication_role = origin")
      const result = await privateHandover(caseId)
      expect(result, JSON.stringify(result)).toMatchObject({ status: "denied", reason })
      expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
      expect(await handoverEvents(caseId)).toBe(0)
      expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
    }

    await db.exec("begin")
    await db.exec("drop index public.payment_obligations_one_active_kind_idx")
    await db.exec("set local session_replication_role = replica")
    await db.query(
      `insert into public.payment_obligations(
        service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state,
        amount_minor, currency, tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,'UPFRONT','DUE',9900,'GBP',$6,$7)`,
      [order.id, quote[0].quote_id, quote[0].quote_version_id, alex, caseId, quote[0].tax_behaviour, quote[0].tax_amount_minor],
    )
    await denied("unpaid")
    await db.exec("rollback")

    await db.exec("begin")
    await db.exec("alter table public.payment_receipts drop constraint payment_receipts_obligation_id_key")
    await db.exec("alter table public.payment_receipts drop constraint payment_receipts_payment_attempt_id_key")
    await db.query(
      `insert into public.payment_receipts(
        obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor
      ) select obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor
        from public.payment_receipts where obligation_id = $1`,
      [obligationId],
    )
    await denied("receipt")
    await db.exec("rollback")

    const stranger = await insertCase("PR-26-HNDSTR")
    await db.exec("begin")
    await db.exec("set local session_replication_role = replica")
    await db.query("update public.payment_obligations set case_id = $2 where id = $1", [obligationId, stranger])
    await denied("unpaid")
    await db.exec("rollback")

    await db.exec("begin")
    await db.exec("set local session_replication_role = replica")
    const otherCustomer = randomUUID()
    await db.query("insert into public.customers(id, full_name, email) values ($1, 'Other', 'other-hand@example.com')", [otherCustomer])
    await db.query("update public.payment_receipts set customer_id = $2 where obligation_id = $1", [obligationId, otherCustomer])
    await denied("receipt")
    await db.exec("rollback")

    await db.exec("begin")
    await db.query("update public.business_memberships set status = 'pending', verified_at = null, verified_by = null where customer_id = $1", [alex])
    await denied("authority")
    await db.exec("rollback")

    await db.exec("begin")
    await db.exec("set local session_replication_role = replica")
    await db.query("update public.payment_obligations set state = 'VOID' where id = $1", [obligationId])
    await denied("unpaid")
    await db.exec("rollback")

    await db.exec("begin")
    await db.query("update public.cases set status = 'CANCELLED' where id = $1", [caseId])
    await denied("closed")
    await db.exec("rollback")

    await db.exec("begin")
    await db.query("update public.cases set work_stage = 'FINISHED', status = 'UNDER_REVIEW' where id = $1", [caseId])
    expect(await privateHandover(caseId)).toMatchObject({ status: "already_prepared", stage: "FINISHED" })
    expect(await handoverEvents(caseId)).toBe(0)
    await db.exec("rollback")

    await db.exec("begin")
    await db.query("update public.cases set work_stage = 'PREPARATION', next_action = 'Staff kept this preparation note.' where id = $1", [caseId])
    expect(await privateHandover(caseId)).toMatchObject({ status: "already_prepared", stage: "PREPARATION" })
    expect((await stageOf(caseId)).next_action).toBe("Staff kept this preparation note.")
    await db.exec("rollback")

    await db.exec("begin")
    await db.query("update public.cases set service_track = 'MANAGED' where id = $1", [caseId])
    expect(await privateHandover(caseId)).toMatchObject({ status: "skipped", reason: "not_guided" })
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    await db.exec("rollback")

    const guardCase = await insertCase("PR-26-HNDGRD", "UNDECIDED")
    expect(await privateHandover(guardCase)).toMatchObject({ status: "skipped", reason: "not_guided" })
    expect((await stageOf(guardCase)).work_stage).toBe("INITIAL_REVIEW")

    expect(attemptId).toBeTruthy()
    const handed = await privateHandover(caseId)
    expect(handed.status, JSON.stringify(handed)).toBe("success")
    expect(await privateHandover(caseId)).toMatchObject({ status: "already_handed_over" })
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
  })

  it("blocks open customer work, then the same reconciler recovers the case", async () => {
    const held = await holdHandover()
    const caseId = await insertCase("PR-26-HNDWRK")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndwrk")
    expect((await apply("evt_hndwrk", "payment_intent.succeeded", "pi_hndwrk", succeededPayload(order, obligationId, started))).status).toBe("success")
    await db.exec(held)
    const mailBefore = await count("select count(*)::int as n from public.communications where case_id = $1", [caseId])

    await db.exec("begin")
    await db.query(
      `insert into public.case_tasks(case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy)
       values ($1, 'Send the extra photo', 'CUSTOMER', 'EVIDENCE', now() + interval '2 days', 'Customer still owes a photo', 'UTC', 'MANUAL_QUEUE')`,
      [caseId],
    )
    expect(await privateHandover(caseId)).toMatchObject({ status: "blocked", reason: "customer_work" })
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await handoverEvents(caseId)).toBe(0)
    await db.exec("rollback")

    await db.exec("begin")
    await db.query(
      `insert into public.customer_actions(
        customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot,
        expires_at, created_by, service_order_id, payment_obligation_id
      ) values ($1,$2,$3,$4,'PAYMENT_RECOVERY',$5,'alex@example.com', now() + interval '1 day', $6, $7, $8)`,
      [alex, business, location, caseId, hash(token()), admin, order.id, obligationId],
    )
    expect(await privateHandover(caseId)).toMatchObject({ status: "blocked", reason: "customer_work" })
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    await db.exec("rollback")

    await db.exec("begin")
    await db.query(
      `insert into public.case_tasks(case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy)
       values ($1, 'Call the customer about the listing', 'CUSTOMER', 'FOLLOW_UP', now() + interval '2 days', 'Staff asked for a call', 'UTC', 'MANUAL_QUEUE')`,
      [caseId],
    )
    expect(await privateHandover(caseId)).toMatchObject({ status: "blocked", reason: "unrelated_follow_up" })
    expect(await count(
      "select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN' and title = 'Call the customer about the listing'",
      [caseId],
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN' and title = 'Customer pays the accepted Guided fee through the existing secure payment action.'",
      [caseId],
    )).toBe(1)
    await db.exec("rollback")

    const reconciled = await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])
    expect(reconciled).toMatchObject({ examined: 1, handedOver: 1, disposition: "success" })
    expect((await stageOf(caseId)).work_stage).toBe("PREPARATION")
    expect((await stageOf(caseId)).next_action).toBe(staffAction)
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBe(0)
    expect(await handoverEvents(caseId)).toBe(1)
    const again = await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])
    expect(again).toMatchObject({ status: "success", handedOver: 0, disposition: "already_handed_over" })
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [caseId])).toBe(mailBefore)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
  })

  it("keeps a valid receipt when handover raises, then reconciliation finishes once", async () => {
    const raised = await raiseHandover()
    const caseId = await insertCase("PR-26-HNDFLT")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    const versionBefore = await caseVersion(caseId)
    const { order, obligationId, started } = await checkout(caseId, "hndflt")
    const settled = await apply("evt_hndflt", "payment_intent.succeeded", "pi_hndflt", succeededPayload(order, obligationId, started))
    expect(settled.status).toBe("success")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId]))[0].state).toBe("PAID")
    expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect((await stageOf(caseId)).workflow_version).toBe(versionBefore)
    expect(await count(
      "select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_hndflt' and processed",
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from admin_private.guided_postpayment_handover_failures where case_id = $1 and reason = 'exception' and resolved_at is null",
      [caseId],
    )).toBe(1)
    const sameEvent = await apply("evt_hndflt", "payment_intent.succeeded", "pi_hndflt", succeededPayload(order, obligationId, started))
    expect(sameEvent).toMatchObject({ status: "success", duplicate: true })
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect(await count(
      "select count(*)::int as n from admin_private.guided_postpayment_handover_failures where case_id = $1 and reason = 'exception' and resolved_at is null",
      [caseId],
    )).toBe(1)
    await db.exec(raised)

    const reconciled = await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])
    expect(reconciled.status).toBe("success")
    expect((await stageOf(caseId)).work_stage).toBe("PREPARATION")
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count(
      "select count(*)::int as n from admin_private.guided_postpayment_handover_failures where case_id = $1 and resolved_at is null",
      [caseId],
    )).toBe(0)
    const duplicate = await apply("evt_hndflt_2", "payment_intent.succeeded", "pi_hndflt", succeededPayload(order, obligationId, started))
    expect(duplicate.status).toBe("success")
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect(await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])).toMatchObject({ handedOver: 0, disposition: "already_handed_over" })
  })

  it("lets a staff transition and a webhook produce one preparation without rewriting the other", async () => {
    const held = await holdHandover()
    const staffFirst = await insertCase("PR-26-HNDSTF")
    await acceptQuote(staffFirst)
    await guidedToPaymentRequired(staffFirst)
    const staffCheckout = await checkout(staffFirst, "hndstf")
    expect((await apply("evt_hndstf", "payment_intent.succeeded", "pi_hndstf", succeededPayload(staffCheckout.order, staffCheckout.obligationId, staffCheckout.started))).status).toBe("success")
    await db.exec(held)
    const staffNote = "Staff recorded the preparation plan."
    expect((await caseCmd(staffFirst, "transition", { target: "PREPARATION", nextAction: staffNote, due: null })).status).toBe("success")
    const afterStaff = await stageOf(staffFirst)
    expect(afterStaff).toMatchObject({ work_stage: "PREPARATION", next_action: staffNote, status: "UNDER_REVIEW" })
    const webhookAfterStaff = await apply("evt_hndstf_2", "payment_intent.succeeded", "pi_hndstf", succeededPayload(staffCheckout.order, staffCheckout.obligationId, staffCheckout.started))
    expect(webhookAfterStaff.status).toBe("success")
    expect(await stageOf(staffFirst)).toMatchObject({ work_stage: "PREPARATION", next_action: staffNote, workflow_version: afterStaff.workflow_version })
    expect(await handoverEvents(staffFirst)).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.guided_postpayment_handovers where case_id = $1", [staffFirst])).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [staffCheckout.obligationId])).toBe(1)

    const heldAgain = await holdHandover()
    const webhookFirst = await insertCase("PR-26-HNDWEB")
    await acceptQuote(webhookFirst)
    await guidedToPaymentRequired(webhookFirst)
    const webCheckout = await checkout(webhookFirst, "hndweb")
    expect((await apply("evt_hndweb", "payment_intent.succeeded", "pi_hndweb", succeededPayload(webCheckout.order, webCheckout.obligationId, webCheckout.started))).status).toBe("success")
    const staleVersion = await caseVersion(webhookFirst)
    await db.exec(heldAgain)
    expect((await privateHandover(webhookFirst, "payment_intent.succeeded")).status).toBe("success")
    const stale = await rpc<Json>("admin_case_command_v1", [adminToken, key(), webhookFirst, staleVersion, "transition", {
      note: "Reviewed the caller’s request and confirmed the details.",
      target: "PREPARATION", nextAction: "Staff recorded the preparation plan.", due: null,
    }])
    expect(stale.status).toBe("conflict")
    expect(await stageOf(webhookFirst)).toMatchObject({ work_stage: "PREPARATION", next_action: staffAction })
    expect(await handoverEvents(webhookFirst)).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'to' = 'PREPARATION'",
      [webhookFirst],
    )).toBe(0)
    expect((await orderOf(webhookFirst)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
  })

  it("reconciles a backlog of settled payment-required cases without a built-in reference", async () => {
    const held = await holdHandover()
    const caseId = await insertCase("PR-26-HNDBKL")
    await acceptQuote(caseId)
    await guidedToPaymentRequired(caseId)
    await db.query("update public.case_tasks set status = 'DONE', resolution = 'Payment follow-up is no longer open.', resolved_at = now() where case_id = $1 and status = 'OPEN'", [caseId])
    const { order, obligationId, started } = await checkout(caseId, "hndbkl")
    expect((await apply("evt_hndbkl", "payment_intent.succeeded", "pi_hndbkl", succeededPayload(order, obligationId, started))).status).toBe("success")
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBe(0)
    expect((await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason).toBeNull()
    expect((await stageOf(caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    const otherId = await insertCase("PR-26-HNDSC2")
    await acceptQuote(otherId)
    await guidedToPaymentRequired(otherId)
    await db.query("update public.case_tasks set status = 'DONE', resolution = 'Payment follow-up is no longer open.', resolved_at = now() where case_id = $1 and status = 'OPEN'", [otherId])
    const otherCheckout = await checkout(otherId, "hndsc2")
    expect((await apply("evt_hndsc2", "payment_intent.succeeded", "pi_hndsc2", succeededPayload(otherCheckout.order, otherCheckout.obligationId, otherCheckout.started))).status).toBe("success")
    const otherVersion = await caseVersion(otherId)
    const sql = (await rows<{ src: string }>(
      "select pg_get_functiondef('public.guided_postpayment_reconcile_v1(uuid)'::regprocedure) as src",
    ))[0].src
    expect(sql).toContain("p_case")
    expect(sql).not.toMatch(/FOR candidate/)
    expect(sql).not.toMatch(/PR-26-GHNLB9|SO-26-GHHRGY|RC-26-NSV9PP/)
    await db.exec(held)
    const versionBefore = await caseVersion(caseId)
    const run = await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])
    expect(run).toMatchObject({ examined: 1, handedOver: 1, disposition: "success" })
    expect((await stageOf(otherId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await caseVersion(otherId)).toBe(otherVersion)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [otherCheckout.obligationId])).toBe(1)
    const after = await stageOf(caseId)
    expect(after).toMatchObject({ status: "UNDER_REVIEW", work_stage: "PREPARATION", next_action: staffAction, next_action_at: null })
    expect(after.workflow_version).toBe(versionBefore + 1)
    expect(await rpc<Json>("guided_postpayment_reconcile_v1", [caseId])).toMatchObject({ handedOver: 0, disposition: "already_handed_over" })
    expect((await stageOf(otherId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect(await handoverEvents(caseId)).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).toBe(1)
    expect((await orderOf(caseId)).state).toBe("ACCEPTED_AWAITING_PAYMENT")
  })

  it("keeps the reconciler off browser roles and strict Guided readiness off a paid flag alone", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect((await rows<{ ok: boolean }>("select has_function_privilege($1, 'public.guided_postpayment_reconcile_v1(uuid)', 'EXECUTE') as ok", [role]))[0].ok).toBe(false)
      expect((await rows<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, handoverSignature]))[0].ok).toBe(false)
    }
    expect((await rows<{ ok: boolean }>(
      "select has_function_privilege('service_role', 'public.guided_postpayment_reconcile_v1(uuid)', 'EXECUTE') as ok",
    ))[0].ok).toBe(true)
    const managed = await insertCase("PR-26-HNDMAN", "MANAGED")
    await db.query("update public.cases set work_stage = 'AUTHORIZATION_REQUIRED', status = 'AWAITING_CUSTOMER' where id = $1", [managed])
    expect(await ready(managed)).toBe(false)
    expect(await privateHandover(managed)).toMatchObject({ status: "skipped", reason: "not_guided" })
    expect((await stageOf(managed)).work_stage).toBe("AUTHORIZATION_REQUIRED")
  })
})
