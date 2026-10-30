/**
 * Guided payment-request email on a disposable database.
 * The migration is applied only inside this test. It is not applied to DEV
 * or Production, and no provider is contacted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { renderPaymentRequest, paymentRequestOpeningSentence } from "../../../../lib/email/payment-request"
import { customerEmailSecurityNote } from "../../../../lib/email/customer-message"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import { sendEmailHandler } from "../communications/handler"
import { createIdempotentMailProvider } from "../communications/mail"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const token = "a".repeat(64)
const origin = "https://customer.example"
const devOrigin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const alexAuth = "55555555-5555-4555-8555-555555555555"
const portalHash = "d".repeat(64)
const openUntil = new Date(Math.ceil(Date.now() / 1000) * 1000 + 3 * 24 * 60 * 60 * 1000).toISOString()
let serial = 0

const agreements: Record<string, { version: string; hash: string }> = {
  GUIDED_RELAUNCH: { version: "PS-2026-10-22.GR", hash: "705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3" },
  GUIDED_REVIEW: { version: "PS-2026-10-22.GV", hash: "56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9" },
  MANAGED_RELAUNCH: { version: "PS-2026-10-22.MR", hash: "725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269" },
}

const ref = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  serial += 1
  return alphabet[serial % alphabet.length] + alphabet[(serial * 3) % alphabet.length] + alphabet[(serial * 5) % alphabet.length] + alphabet[(serial * 7) % alphabet.length] + alphabet[(serial * 11) % alphabet.length] + alphabet[(serial * 13) % alphabet.length]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}','admin@profilerelaunch.com',now());
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${admin}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${admin}',now());
    insert into public.customers(id,full_name,email) values ('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values ('${business}','Bakery');
    insert into public.locations(id,business_id,country) values ('${location}','${business}','UK');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}','email','alex@example.com','${admin}','Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence)
      values ('${customer}','${business}','verified',now(),'${admin}','Membership verified for this payment-request test.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin))
  for (const agreement of Object.values(agreements)) {
    const approved = await rpc("admin_record_owner_paid_service_agreement_approval_v1", [
      token, crypto.randomUUID(), agreement.version, "Disposable payment-request test evidence for this catalogue version only.",
    ])
    expect(approved.status).toBe("confirmed")
  }
}, 180000)

afterAll(async () => { await db.close() })

async function rpc(name: string, args: unknown[]) {
  const value = await db.query<{ value: Record<string, unknown> }>(
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`,
    args,
  )
  return value.rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? 0)
}

const signatures: Record<string, string[]> = {
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
  communication_apply_provider_event_v1: ["p_provider", "p_provider_event_id", "p_event_type", "p_provider_message_id", "p_occurred_at", "p_bounce_class"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const order = signatures[name] ?? Object.keys(args)
      const values = order.map(item => args[item] ?? null)
      return (await db.query<{ value: T }>(`select public.${name}(${values.map((_, index) => `$${index + 1}`).join(",")}) as value`, values)).rows[0].value
    },
  }
}

function occurrences(value: string, needle: string) {
  return value.split(needle).length - 1
}

type Seed = {
  serviceCode?: string
  amount?: number
  model?: "UPFRONT" | "SUCCESS_FEE"
  openAction?: boolean
  expiredAction?: boolean
  obligation?: "DUE" | "PAID" | null
  expiresAt?: string
}

async function seed(options: Seed = {}) {
  const serviceCode = options.serviceCode ?? "GUIDED_RELAUNCH"
  const amount = options.amount ?? (serviceCode === "GUIDED_REVIEW" ? 5900 : serviceCode === "MANAGED_RELAUNCH" ? 29900 : 9900)
  const model = options.model ?? (serviceCode.startsWith("MANAGED") ? "SUCCESS_FEE" : "UPFRONT")
  const state = model === "UPFRONT" ? "ACCEPTED_AWAITING_PAYMENT" : "ACCEPTED_SUCCESS_FEE"
  const obligation = options.obligation === undefined ? (model === "UPFRONT" ? "DUE" : null) : options.obligation
  const caseId = crypto.randomUUID()
  const quote = crypto.randomUUID()
  const version = crypto.randomUUID()
  const snapshot = crypto.randomUUID()
  const order = crypto.randomUUID()
  const acceptanceAction = crypto.randomUUID()
  const acceptance = crypto.randomUUID()
  const obligationId = crypto.randomUUID()
  const paymentAction = crypto.randomUUID()
  await db.query(
    `insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at)
     values ($1,'PROFILE_RECOVERY',$2,$3,$4,'Profile suspended','2026-01-01')`,
    [caseId, customer, business, location],
  )
  const caseRef = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [caseId])).rows[0].public_ref
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,'NONE',0,'NOT_QUALIFIED','SYNTHETIC',$4,0,$4,$5,'ADMIN_RECORDED')`,
    [snapshot, location, serviceCode, amount, admin],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quote, `QT-26-${ref()}`, customer, business, location, caseId, admin],
  )
  const versionInserted = await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1,$2,1,'OFFERED',$3,$4,$5,$6,$7, p.id, p.display_name, $8,
      'Synthetic scope text for this payment-request test.', 'Synthetic exclusions text for this payment-request test.', 'Synthetic success definition for this payment-request test.',
      $9, 'NONE', 0, 0, $9, 'NOT_APPLICABLE', 0, $9, 'GBP', $10, now() + interval '30 days',
      'Synthetic payment timing statement.', 'Synthetic terms reference.', $11, now(), $11
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from limit 1
    returning service_name`,
    [version, quote, customer, business, location, caseId, serviceCode, model, amount, snapshot, admin],
  )
  expect(versionInserted.rows).toHaveLength(1)
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  serial += 1
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,'alex@example.com', now() + interval '2 days', $8, now())`,
    [acceptanceAction, customer, business, location, caseId, version, serial.toString(16).padStart(64, "b"), admin],
  )
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      accepted_at, total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,'alex@example.com',now(),$6,'GBP','NOT_APPLICABLE',0)`,
    [acceptance, quote, version, acceptanceAction, admin, amount],
  )
  await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [version])
  await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [quote])
  const orderRef = `SO-26-${ref()}`
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GBP',$12,'NOT_APPLICABLE',0,$13,now())`,
    [order, orderRef, quote, version, acceptance, customer, business, location, caseId, serviceCode, amount, model, state],
  )
  if (obligation) {
    await db.query(
      `insert into public.payment_obligations(
        id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency,
        tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,$6,'UPFRONT',$7,$8,'GBP','NOT_APPLICABLE',0)`,
      [obligationId, order, quote, version, customer, caseId, obligation, amount],
    )
  }
  const serviceName = String((versionInserted.rows[0] as { service_name: string }).service_name)
  const recordVersion = (await db.query<{ record_version: number }>("select record_version from public.service_orders where id = $1", [order])).rows[0].record_version
  if (options.openAction || options.expiredAction) {
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
        kind, status, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,$7,'GUIDED_PAYMENT','OPEN',$8,'alex@example.com',$9,$10)`,
      [paymentAction, customer, business, location, caseId, order, obligation ? obligationId : null, crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 32), options.expiredAction ? new Date(Date.now() - 3600_000).toISOString() : (options.expiresAt ?? new Date(Date.now() + 4 * 86400_000).toISOString()), admin],
    )
  }
  return { caseId, caseRef, order, orderRef, obligationId, paymentAction, acceptanceAction, serviceName, serviceCode, amount, recordVersion }
}

function payloadFor(row: Awaited<ReturnType<typeof seed>>, overrides: Record<string, unknown> = {}, portal = origin) {
  const rendered = renderPaymentRequest({
    serviceCode: row.serviceCode,
    serviceName: row.serviceName,
    orderRef: row.orderRef,
    caseRef: row.caseRef,
    businessName: "Bakery",
    amountMinor: row.amount,
    currency: "GBP",
    origin: portal,
    replyTo: "cases@profilerelaunch.com",
  })
  return {
    rendered,
    body: {
      serviceOrderId: row.order,
      version: row.recordVersion,
      customerOrigin: portal,
      subject: rendered?.subject ?? "not a payment request",
      bodyText: rendered?.text ?? "Review and accept quotation",
      bodyHtml: rendered?.html ?? "<p>Review and accept quotation</p>",
      fromAddress: "ops@example.com",
      replyTo: "cases@profilerelaunch.com",
      sendEnabled: true,
      ...overrides,
    },
  }
}

async function queue(row: Awaited<ReturnType<typeof seed>>, overrides: Record<string, unknown> = {}, request = crypto.randomUUID(), portal = origin) {
  const prepared = payloadFor(row, overrides, portal)
  const result = await rpc("admin_queue_guided_payment_request_v1", [token, request, prepared.body])
  return { result, ...prepared, request }
}

describe("guided payment-request queue", () => {
  it("reuses one open payment action and queues a single portal email", async () => {
    const row = await seed({ openAction: true })
    const beforeOps = await count("select count(*)::int as n from public.provider_operations")
    const first = await queue(row)
    expect(first.rendered?.buttonLabel).toBe("Pay £99.00 securely")
    expect(first.result).toMatchObject({ status: "success", lifecycle: "QUEUED", deliveryStatus: "NONE", reusedAction: true, replay: false, actionId: row.paymentAction })
    expect(first.result).not.toHaveProperty("actionUrl")
    const stored = await db.query<{ body_text: string; body_html: string; customer_action_id: string; link_key_version: number | null }>(
      "select body_text, body_html, customer_action_id, link_key_version from public.communications where id = $1",
      [first.result.id],
    )
    expect(stored.rows[0].customer_action_id).toBe(row.paymentAction)
    expect(stored.rows[0].link_key_version).toBeNull()
    expect(stored.rows[0].body_text).toContain("Business: Bakery")
    expect(stored.rows[0].body_text).toContain("Pay £99.00 securely")
    expect(stored.rows[0].body_text).toContain(`${origin}/portal/cases/${row.caseRef}/payments`)
    expect(stored.rows[0].body_text).not.toContain("#t=")
    expect(stored.rows[0].body_html).not.toContain("/action/")
    expect(stored.rows[0].body_text).not.toContain("Review and accept quotation")
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [row.order])).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.paymentAction])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where aggregate_id = $1", [first.result.id])).toBe(1)
    const replay = await queue(row, {}, first.request)
    expect(replay.result).toEqual(first.result)
    const again = await queue(row)
    expect(again.result).toMatchObject({ status: "success", replay: true, id: first.result.id, reusedAction: true })
    expect(await count("select count(*)::int as n from public.communications where template_key = 'GUIDED_PAYMENT_REQUEST' and customer_action_id = $1", [row.paymentAction])).toBe(1)
    expect(await count("select count(*)::int as n from public.provider_operations")).toBe(beforeOps)
    const quoted = await queue(row, { bodyText: `${first.rendered?.text ?? ""}\nReview and accept quotation` })
    expect(quoted.result).toMatchObject({ status: "denied", reason: "snapshot_mismatch" })
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.paymentAction])).toBe(1)
  })

  it("creates the payment action only when none is open, including Guided Review £59", async () => {
    const fresh = await seed()
    const queued = await queue(fresh)
    expect(queued.result).toMatchObject({ status: "success", reusedAction: false })
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT' and status = 'OPEN'", [fresh.order])).toBe(1)
    const review = await seed({ serviceCode: "GUIDED_REVIEW", openAction: true })
    const reviewQueued = await queue(review)
    expect(review.serviceName).toBe("Guided Review")
    expect(reviewQueued.rendered?.buttonLabel).toBe("Pay £59.00 securely")
    expect(reviewQueued.result).toMatchObject({ status: "success", reusedAction: true, actionId: review.paymentAction })
    expect(String(reviewQueued.result.id ? (await db.query<{ body_text: string }>("select body_text from public.communications where id = $1", [reviewQueued.result.id])).rows[0].body_text : "")).toContain("Pay £59.00 securely")
  })

  it("queues the accepted £79.20 total and withholds a payment email that has no monitored Reply-To", async () => {
    const discounted = await seed({ amount: 7920, openAction: true })
    const queued = await queue(discounted)
    expect(queued.rendered?.buttonLabel).toBe("Pay £79.20 securely")
    expect(queued.result).toMatchObject({ status: "success", reusedAction: true, actionId: discounted.paymentAction })
    const stored = await db.query<{ body_text: string }>("select body_text from public.communications where id = $1", [queued.result.id])
    expect(stored.rows[0].body_text).toContain("Amount: £79.20 GBP")
    expect(stored.rows[0].body_text).toContain("Pay £79.20 securely")
    expect(stored.rows[0].body_text).toContain("simply reply to this email")
    expect(stored.rows[0].body_text).not.toContain("£99.00")
    expect(stored.rows[0].body_text).not.toContain("contact us through the ProfileRelaunch website")
    expect((await queue(discounted, {
      subject: queued.rendered?.subject,
      bodyText: queued.rendered?.text.replaceAll("£79.20", "£99.00"),
      bodyHtml: queued.rendered?.html.replaceAll("£79.20", "£99.00"),
    })).result).toMatchObject({ status: "denied", reason: "snapshot_mismatch" })
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1", [discounted.paymentAction])).toBe(1)

    const missing = await seed({ openAction: true })
    expect((await queue(missing, { replyTo: "" })).result).toMatchObject({ status: "denied", reason: "reply_to" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [missing.caseId])).toBe(0)
    const disabled = await seed({ openAction: true })
    expect((await queue(disabled, { sendEnabled: false, replyTo: "" })).result).toMatchObject({ status: "denied", reason: "send_disabled" })
    const zero = await seed({ amount: 0, openAction: true })
    expect((await queue(zero)).result).toMatchObject({ status: "denied" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [zero.caseId])).toBe(0)
  })

  it("does not request an upfront fee for Managed, a duplicate action, a mismatch, or a paid order", async () => {
    const managed = await seed({ serviceCode: "MANAGED_RELAUNCH" })
    const managedResult = await rpc("admin_queue_guided_payment_request_v1", [token, crypto.randomUUID(), {
      serviceOrderId: managed.order,
      version: managed.recordVersion,
      customerOrigin: origin,
      subject: "Pay now",
      bodyText: "Pay £299 securely",
      bodyHtml: "<p>Pay £299 securely</p>",
      fromAddress: "ops@example.com",
      sendEnabled: true,
    }])
    expect(managedResult).toMatchObject({ status: "denied", reason: "success_fee" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [managed.caseId])).toBe(0)
    const oneOpen = await seed({ openAction: true })
    await expect(db.query(
      `insert into public.customer_actions(
        customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
        kind, status, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,'GUIDED_PAYMENT','OPEN',$7,'alex@example.com', now() + interval '4 days', $8)`,
      [customer, business, location, oneOpen.caseId, oneOpen.order, oneOpen.obligationId, crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 32), admin],
    )).rejects.toThrow(/customer_actions_one_open_kind_idx/)
    const wrong = await seed({ openAction: true })
    expect((await queue(wrong, { recipient: "other@example.com" })).result).toMatchObject({ status: "denied", reason: "recipient_mismatch" })
    const paid = await seed({ obligation: "PAID" })
    expect((await queue(paid)).result).toMatchObject({ status: "denied", reason: "already_paid" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [paid.caseId])).toBe(0)
  })

  it("cancels an unsent payment email once a receipt is stored and does not send it again", async () => {
    const row = await seed({ openAction: true })
    const queued = await queue(row)
    expect(queued.result.status).toBe("success")
    await db.query("update public.payment_obligations set state = 'PAID' where id = $1", [row.obligationId])
    const operation = crypto.randomUUID()
    const attempt = crypto.randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1,$2,'CREATE_PAYMENT_INTENT','UPFRONT',$3,$4,$5,'SUCCEEDED')`,
      [operation, crypto.randomUUID(), customer, row.order, row.obligationId],
    )
    await db.query(
      `insert into public.payment_attempts(
        id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, succeeded_at
      ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',9900,'GBP',now())`,
      [attempt, row.obligationId, row.order, operation],
    )
    await db.query(
      `insert into public.payment_receipts(
        id, obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor, paid_at
      ) values ($1,$2,$3,$4,$5,9900,'GBP','NOT_APPLICABLE',0,now())`,
      [crypto.randomUUID(), row.obligationId, row.order, customer, attempt],
    )
    expect(await count("select count(*)::int as n from public.communications where id = $1 and lifecycle = 'CANCELLED'", [queued.result.id])).toBe(1)
    const stale = await db.query<{ record_version: number }>("select record_version from public.service_orders where id = $1", [row.order])
    const again = await rpc("admin_queue_guided_payment_request_v1", [token, crypto.randomUUID(), {
      ...payloadFor({ ...row, recordVersion: stale.rows[0].record_version }).body,
    }])
    expect(again).toMatchObject({ status: "denied", reason: "already_paid" })
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1 and lifecycle = 'QUEUED'", [row.paymentAction])).toBe(0)
  })

  it("keeps a suppressed address and an unknown provider acceptance from a second send", async () => {
    await db.query("insert into admin_private.email_suppressions(address_normalized, reason) values ('alex@example.com', 'SUPPRESSED')")
    const suppressed = await seed({ openAction: true })
    expect((await queue(suppressed)).result).toMatchObject({ status: "denied", reason: "suppressed" })
    await db.query("delete from admin_private.email_suppressions where address_normalized = 'alex@example.com'")
    const row = await seed({ openAction: true })
    const queued = await queue(row)
    await db.query("update public.communications set delivery_status = 'ACCEPTANCE_UNKNOWN', first_provider_attempt_at = now() where id = $1", [queued.result.id])
    const again = await queue(row)
    expect(again.result).toMatchObject({ status: "success", replay: true, id: queued.result.id })
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1", [row.paymentAction])).toBe(1)
    await db.query("update public.communications set delivery_status = 'BOUNCED' where id = $1", [queued.result.id])
    const bounced = await queue(row)
    expect(bounced.result).toMatchObject({ status: "success", replay: true, id: queued.result.id, deliveryStatus: "BOUNCED" })
  })

  it("loads the complete portal URL and the provider accepts that payment email once", async () => {
    const sample = "https://customer.example/portal/cases/PR-26-ABCDEF/payments"
    const capturing = "https://[A-Za-z0-9.-]+/portal/cases/(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments"
    const safe = "https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments"
    expect((await db.query<{ value: string }>("select substring($1 from $2) as value", [sample, capturing])).rows[0].value).toBe("PR")
    expect((await db.query<{ value: string }>("select substring($1 from $2) as value", [sample, safe])).rows[0].value).toBe(sample)
    const definition = (await db.query<{ def: string }>(
      "select pg_get_functiondef('public.communication_load_send_v1(uuid,integer)'::regprocedure) as def",
    )).rows[0].def
    expect(definition).toContain(safe)
    expect(definition).not.toContain(capturing)

    const row = await seed({ openAction: true, expiresAt: openUntil })
    const paymentsUrl = `${devOrigin}/portal/cases/${row.caseRef}/payments`
    const beforeOps = await count("select count(*)::int as n from public.provider_operations")
    const beforeCheckout = await count("select count(*)::int as n from public.provider_operations where kind = 'CREATE_CHECKOUT_SESSION'")
    const queued = await queue(row, {}, crypto.randomUUID(), devOrigin)
    expect(queued.result).toMatchObject({ status: "success", reusedAction: true, actionId: row.paymentAction, replay: false })
    expect(queued.result).not.toHaveProperty("actionUrl")
    const storedAction = await db.query<{ id: string; status: string; expires_at: string }>(
      "select id, status, expires_at from public.customer_actions where id = $1",
      [row.paymentAction],
    )
    expect(storedAction.rows[0].status).toBe("OPEN")
    expect(new Date(storedAction.rows[0].expires_at).toISOString()).toBe(openUntil)
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [row.order])).toBe(1)

    const loaded = await rpc("communication_load_send_v1", [queued.result.id, 1])
    expect(loaded).toMatchObject({
      status: "success",
      templateKey: "GUIDED_PAYMENT_REQUEST",
      customerOrigin: devOrigin,
      lifecycle: "QUEUED",
      contentLocked: true,
    })
    expect(loaded.customerOrigin).not.toBe("PR")
    const text = String(loaded.bodyText)
    const html = String(loaded.bodyHtml)
    expect(occurrences(text, paymentsUrl)).toBe(1)
    expect(occurrences(html, paymentsUrl)).toBe(1)
    expect(text).toContain(row.orderRef)
    expect(text).toContain("£99.00 GBP")
    expect(text).toContain("Pay £99.00 securely")
    expect(text).toContain(paymentRequestOpeningSentence)
    expect(text).toContain(customerEmailSecurityNote)
    expect(text).toContain("simply reply to this email")
    expect(`${text}\n${html}`).not.toMatch(/#t=|\/action\//)
    expect(await count("select count(*)::int as n from public.provider_operations")).toBe(beforeOps)

    const provider = createIdempotentMailProvider()
    const idempotencyKey = `send-email:${queued.result.id}:v1`
    const execute = () => sendEmailHandler({}, provider).execute({
      idempotencyKey,
      payload: { communicationId: queued.result.id, contentVersion: 1 },
      rpc: namedRpc(),
    })
    const firstSend = await execute()
    const secondSend = await execute()
    expect(firstSend).toMatchObject({ ok: true, providerAccepted: { communicationId: queued.result.id, provider: "resend" } })
    expect(secondSend.ok).toBe(true)
    expect(provider.effects).toBe(1)
    expect(provider.calls).toBe(2)
    expect(provider.payloads[0].to).toBe("alex@example.com")
    expect(occurrences(provider.payloads[0].text, paymentsUrl)).toBe(1)
    expect(occurrences(String(provider.payloads[0].html), paymentsUrl)).toBe(1)
    expect(provider.payloads[0].text).toContain("Pay £99.00 securely")
    expect(`${provider.payloads[0].text}\n${provider.payloads[0].html}`).not.toMatch(/#t=|\/action\//)
    await rpc("communication_mark_provider_accepted_v1", [queued.result.id, "resend", "msg_payment_once", idempotencyKey])
    expect((await execute()).ok).toBe(true)
    expect(provider.effects).toBe(1)
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [queued.result.id])).rows[0].delivery_status).toBe("PROVIDER_ACCEPTED")
    expect(await count("select count(*)::int as n from public.provider_operations where kind = 'CREATE_CHECKOUT_SESSION'")).toBe(beforeCheckout)
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.paymentAction])).toBe(1)
  })

  it("claims the development payment email once and refuses a second send after unknown acceptance", async () => {
    const row = await seed({ openAction: true, expiresAt: openUntil })
    const queued = await queue(row, {}, crypto.randomUUID(), devOrigin)
    expect(queued.result.status).toBe("success")
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    const claimRequest = crypto.randomUUID()
    const claimed = await rpc("admin_dev_send_email_claim_v1", [token, claimRequest, queued.result.id, true, devOrigin]) as DevSendClaim
    expect(claimed).toMatchObject({ status: "success", replay: false, jobType: "SEND_EMAIL" })
    expect(claimed.idempotencyKey).toBe(`send-email:${queued.result.id}:v1`)
    const provider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: claimed, provider })).toBe("succeeded")
    expect(provider.effects).toBe(1)
    expect(provider.payloads[0].text).toContain(`${devOrigin}/portal/cases/${row.caseRef}/payments`)
    expect(provider.payloads[0].text).not.toMatch(/#t=|\/action\//)
    const again = await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), queued.result.id, true, devOrigin])
    expect(again).toMatchObject({ status: "denied", reason: "already_processed" })
    const replay = await rpc("admin_dev_send_email_claim_v1", [token, claimRequest, queued.result.id, true, devOrigin]) as DevSendClaim
    expect(replay.replay).toBe(true)
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: replay, provider })).toBe("unavailable")
    expect(provider.effects).toBe(1)
    expect(await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), queued.result.id, true, "https://evil.example"])).toMatchObject({ status: "denied", reason: "origin" })

    const unknownRow = await seed({ openAction: true, expiresAt: openUntil })
    const unknownQueued = await queue(unknownRow, {}, crypto.randomUUID(), devOrigin)
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    const unknownClaim = await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), unknownQueued.result.id, true, devOrigin]) as DevSendClaim
    expect(unknownClaim.status).toBe("success")
    let unknownCalls = 0
    const unknown = await sendEmailHandler({}, {
      async send() {
        unknownCalls += 1
        return { ok: false, retryable: true, acceptanceUnknown: true, error: "provider timed out" }
      },
    }).execute({
      idempotencyKey: String(unknownClaim.idempotencyKey),
      payload: unknownClaim.payload ?? {},
      rpc: namedRpc(),
    })
    expect(unknown.ok).toBe(false)
    expect(unknownCalls).toBe(1)
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 second' where id = $1", [unknownClaim.jobId])
    const blocked = await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), unknownQueued.result.id, true, devOrigin])
    expect(blocked).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(unknownCalls).toBe(1)
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [unknownQueued.result.id])).rows[0].delivery_status).toBe("ACCEPTANCE_UNKNOWN")

    const late = await seed({ openAction: true, expiresAt: openUntil })
    const lateQueued = await queue(late, {}, crypto.randomUUID(), devOrigin)
    const jobsBefore = await count("select count(*)::int as n from admin_private.jobs")
    await db.query("update public.admin_sessions set created_at = now() - interval '31 minutes' where token_hash = $1", [token])
    expect(await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), lateQueued.result.id, true, devOrigin])).toEqual({ status: "reauth_required" })
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(jobsBefore)
    await db.query("update public.admin_sessions set created_at = now() - interval '29 minutes' where token_hash = $1", [token])
    expect((await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), lateQueued.result.id, true, devOrigin]) as DevSendClaim).status).toBe("success")
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
  })

  it("queues a held payment email from the customer portal and reuses the open action", async () => {
    await db.query(
      "insert into auth.users(id, email, email_confirmed_at) values ($1, 'alex@example.com', now()) on conflict (id) do nothing",
      [alexAuth],
    )
    await db.query(
      `insert into admin_private.customer_portal_sessions(
        token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at
      ) values ($1, $2, $3, 'alex@example.com', now(), now(), now() + interval '8 hours')
      on conflict (token_hash) do nothing`,
      [portalHash, customer, alexAuth],
    )
    const row = await seed({ openAction: true, expiresAt: openUntil })
    const prepared = payloadFor(row, {}, devOrigin)
    const customerPayload = { ...prepared.body }
    delete (customerPayload as { version?: number }).version
    const beforeOps = await count("select count(*)::int as n from public.provider_operations")
    const first = await rpc("customer_queue_guided_payment_request_v1", [portalHash, crypto.randomUUID(), customerPayload])
    expect(first).toMatchObject({ status: "success", reusedAction: true, actionId: row.paymentAction, replay: false, lifecycle: "QUEUED" })
    expect(first).not.toHaveProperty("actionUrl")
    const held = await db.query<{ available_at: string; promoted_at: string | null }>(
      "select available_at, promoted_at from admin_private.job_outbox where aggregate_id = $1",
      [first.id],
    )
    expect(held.rows[0].promoted_at).toBeNull()
    expect(new Date(held.rows[0].available_at).getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000)
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [row.order])).toBe(1)
    const replay = await rpc("customer_queue_guided_payment_request_v1", [portalHash, crypto.randomUUID(), customerPayload])
    expect(replay).toMatchObject({ status: "success", replay: true, id: first.id, reusedAction: true })
    expect(await count("select count(*)::int as n from public.communications where customer_action_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.paymentAction])).toBe(1)
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    expect(await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), first.id, true, devOrigin])).toMatchObject({ status: "denied", reason: "not_ready" })
    expect(await count("select count(*)::int as n from public.provider_operations")).toBe(beforeOps)
    expect(await count("select count(*)::int as n from public.provider_operations where kind = 'CREATE_CHECKOUT_SESSION'")).toBe(0)
    expect(await rpc("admin_queue_guided_payment_request_v1", [token, crypto.randomUUID(), { ...prepared.body, useCurrentVersion: true }])).toMatchObject({ status: "invalid" })

    const managed = await seed({ serviceCode: "MANAGED_RELAUNCH" })
    expect(await rpc("customer_queue_guided_payment_request_v1", [portalHash, crypto.randomUUID(), {
      serviceOrderId: managed.order,
      customerOrigin: devOrigin,
      subject: "Pay now",
      bodyText: "Pay £299 securely",
      bodyHtml: "<p>Pay £299 securely</p>",
      fromAddress: "ops@example.com",
      sendEnabled: true,
    }])).toMatchObject({ status: "denied", reason: "success_fee" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [managed.caseId])).toBe(0)
    expect(await rpc("customer_queue_guided_payment_request_v1", [portalHash, crypto.randomUUID(), { ...customerPayload, serviceOrderId: crypto.randomUUID() }])).toMatchObject({ status: "denied", reason: "mismatch" })

    await db.query("update public.payment_obligations set state = 'PAID' where id = $1", [row.obligationId])
    const operation = crypto.randomUUID()
    const attempt = crypto.randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1,$2,'CREATE_PAYMENT_INTENT','UPFRONT',$3,$4,$5,'SUCCEEDED')`,
      [operation, crypto.randomUUID(), customer, row.order, row.obligationId],
    )
    await db.query(
      `insert into public.payment_attempts(
        id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, succeeded_at
      ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',9900,'GBP',now())`,
      [attempt, row.obligationId, row.order, operation],
    )
    await db.query(
      `insert into public.payment_receipts(
        id, obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor, paid_at
      ) values ($1,$2,$3,$4,$5,9900,'GBP','NOT_APPLICABLE',0,now())`,
      [crypto.randomUUID(), row.obligationId, row.order, customer, attempt],
    )
    expect(await count("select count(*)::int as n from public.communications where id = $1 and lifecycle = 'CANCELLED' and first_provider_attempt_at is null", [first.id])).toBe(1)
    expect(await rpc("admin_dev_send_email_claim_v1", [token, crypto.randomUUID(), first.id, true, devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await count("select count(*)::int as n from public.provider_operations where service_order_id = $1 and kind = 'CREATE_CHECKOUT_SESSION'", [row.order])).toBe(0)
  })

  it("queues an immediate payment email from the quotation action session and does not duplicate it", async () => {
    await db.query(
      "insert into auth.users(id, email, email_confirmed_at) values ($1, 'alex@example.com', now()) on conflict (id) do nothing",
      [alexAuth],
    )
    const row = await seed()
    const hash = "e".repeat(64)
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [hash, row.acceptanceAction, alexAuth],
    )
    const prepared = payloadFor(row, {}, devOrigin)
    const customerPayload = { ...prepared.body }
    delete (customerPayload as { version?: number }).version
    const obligations = await count("select count(*)::int as n from public.payment_obligations where service_order_id = $1", [row.order])
    const first = await rpc("customer_action_queue_guided_payment_request_v1", [hash, crypto.randomUUID(), customerPayload])
    expect(first).toMatchObject({ status: "success", reusedAction: false, replay: false, lifecycle: "QUEUED", deliveryStatus: "NONE" })
    expect(first).not.toHaveProperty("actionUrl")
    const held = await db.query<{ available_at: string }>(
      "select available_at from admin_private.job_outbox where aggregate_id = $1",
      [first.id],
    )
    expect(new Date(held.rows[0].available_at).getTime()).toBeLessThan(Date.now() + 60_000)
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [row.order])).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_obligations where service_order_id = $1", [row.order])).toBe(obligations)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [row.order])).toBe(0)
    const replay = await rpc("customer_action_queue_guided_payment_request_v1", [hash, crypto.randomUUID(), customerPayload])
    expect(replay).toMatchObject({ status: "success", replay: true, id: first.id, reusedAction: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [row.caseId])).toBe(1)

    const again = await seed()
    const againHash = "f".repeat(64)
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [againHash, again.acceptanceAction, alexAuth],
    )
    const againPayload = { ...payloadFor(again, {}, devOrigin).body }
    delete (againPayload as { version?: number }).version
    const raced = await Promise.all([
      rpc("customer_action_queue_guided_payment_request_v1", [againHash, crypto.randomUUID(), againPayload]),
      rpc("customer_action_queue_guided_payment_request_v1", [againHash, crypto.randomUUID(), againPayload]),
    ])
    const created = raced.filter(item => item.replay === false && item.status === "success")
    expect(created.length).toBeGreaterThanOrEqual(1)
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT' and status = 'OPEN'", [again.order])).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST' and lifecycle <> 'CANCELLED'", [again.caseId])).toBe(1)

    expect(await rpc("customer_action_queue_guided_payment_request_v1", [portalHash, crypto.randomUUID(), customerPayload])).toMatchObject({ status: "unauthorized" })
    expect(await rpc("customer_queue_guided_payment_request_v1", [hash, crypto.randomUUID(), customerPayload])).toMatchObject({ status: "unauthorized" })
    expect(await rpc("customer_action_queue_guided_payment_request_v1", [hash, crypto.randomUUID(), { ...customerPayload, dispatchHoldSeconds: 0 }])).toMatchObject({ status: "invalid" })
    const expiredHash = "1".repeat(64)
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() - interval '1 minute')`,
      [expiredHash, row.acceptanceAction, alexAuth],
    )
    expect(await rpc("customer_action_queue_guided_payment_request_v1", [expiredHash, crypto.randomUUID(), customerPayload])).toMatchObject({ status: "unauthorized" })

    const managed = await seed({ serviceCode: "MANAGED_RELAUNCH" })
    const managedHash = "2".repeat(64)
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [managedHash, managed.acceptanceAction, alexAuth],
    )
    expect(await rpc("customer_action_queue_guided_payment_request_v1", [managedHash, crypto.randomUUID(), {
      serviceOrderId: managed.order,
      customerOrigin: devOrigin,
      subject: "Pay now",
      bodyText: "Pay £299 securely",
      bodyHtml: "<p>Pay £299 securely</p>",
      fromAddress: "ops@example.com",
      replyTo: "cases@profilerelaunch.com",
      sendEnabled: true,
    }])).toMatchObject({ status: "denied", reason: "success_fee" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1", [managed.caseId])).toBe(0)

    const paid = await seed({ obligation: "PAID" })
    const paidHash = "3".repeat(64)
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [paidHash, paid.acceptanceAction, alexAuth],
    )
    const paidPayload = { ...payloadFor(paid, {}, devOrigin).body }
    delete (paidPayload as { version?: number }).version
    expect(await rpc("customer_action_queue_guided_payment_request_v1", [paidHash, crypto.randomUUID(), paidPayload])).toMatchObject({ status: "denied", reason: "already_paid" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [paid.caseId])).toBe(0)

    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
    try {
      const unverified = await seed()
      const unverifiedHash = "4".repeat(64)
      await db.query(
        `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
         values ($1, $2, $3, now() + interval '15 minutes')`,
        [unverifiedHash, unverified.acceptanceAction, alexAuth],
      )
      const unverifiedPayload = { ...payloadFor(unverified, {}, devOrigin).body }
      delete (unverifiedPayload as { version?: number }).version
      expect(await rpc("customer_action_queue_guided_payment_request_v1", [unverifiedHash, crypto.randomUUID(), unverifiedPayload])).toMatchObject({ status: "denied", reason: "contact_unverified" })
      expect(await count("select count(*)::int as n from public.communications where case_id = $1", [unverified.caseId])).toBe(0)
    } finally {
      await db.query(
        `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
         values ($1,'email','alex@example.com',$2,'Verified from a live call with the customer.')`,
        [customer, admin],
      )
    }
    await db.query(
      "update public.business_memberships set status = 'pending', verified_at = null, verified_by = null where customer_id = $1 and business_id = $2",
      [customer, business],
    )
    try {
      const unauthorised = await seed()
      const unauthorisedHash = "5".repeat(64)
      await db.query(
        `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
         values ($1, $2, $3, now() + interval '15 minutes')`,
        [unauthorisedHash, unauthorised.acceptanceAction, alexAuth],
      )
      const unauthorisedPayload = { ...payloadFor(unauthorised, {}, devOrigin).body }
      delete (unauthorisedPayload as { version?: number }).version
      expect(await rpc("customer_action_queue_guided_payment_request_v1", [unauthorisedHash, crypto.randomUUID(), unauthorisedPayload])).toMatchObject({ status: "denied", reason: "authority_unverified" })
      expect(await count("select count(*)::int as n from public.communications where case_id = $1", [unauthorised.caseId])).toBe(0)
    } finally {
      await db.query(
        "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $3 where customer_id = $1 and business_id = $2",
        [customer, business, admin],
      )
    }
  })

  it("dispatches action and portal payment emails through the central request claim", async () => {
    await db.query(
      "insert into auth.users(id, email, email_confirmed_at) values ($1, 'alex@example.com', now()) on conflict (id) do nothing",
      [alexAuth],
    )
    const row = await seed()
    const hash = "7".repeat(64)
    const requestId = crypto.randomUUID()
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [hash, row.acceptanceAction, alexAuth],
    )
    const customerPayload = { ...payloadFor(row, {}, devOrigin).body }
    delete (customerPayload as { version?: number }).version
    const queued = await rpc("customer_action_queue_guided_payment_request_v1", [hash, requestId, customerPayload])
    expect(queued).toMatchObject({ status: "success", lifecycle: "QUEUED" })
    expect(await count("select count(*)::int as n from public.communications where id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [queued.id])).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_v1", [queued.id, devOrigin])).toMatchObject({
      status: "denied",
      reason: "before_activation",
    })
    await db.query("update admin_private.job_outbox set available_at = now() + interval '10 minutes' where aggregate_id = $1", [queued.id])
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [requestId, devOrigin])).toMatchObject({
      status: "denied",
      reason: "not_ready",
    })
    await db.query("update admin_private.job_outbox set available_at = now() where aggregate_id = $1", [queued.id])
    const claimed = await rpc("dev_mail_dispatch_claim_request_v1", [requestId, devOrigin]) as DevSendClaim
    expect(claimed).toMatchObject({ status: "success", jobType: "SEND_EMAIL", replay: false })
    expect(claimed.leaseToken).toEqual(expect.any(String))
    expect(claimed.payload).not.toHaveProperty("recipient")
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [requestId, devOrigin])).toMatchObject({
      status: "conflict",
      reason: "leased",
    })
    const provider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: claimed, provider })).toBe("succeeded")
    expect(provider.effects).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [requestId, devOrigin])).toMatchObject({
      status: "denied",
      reason: "already_processed",
    })
    expect(provider.effects).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [crypto.randomUUID(), devOrigin])).toMatchObject({
      status: "denied",
      reason: "not_queued",
    })
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [requestId, "https://customer.profilerelaunch.com"])).toMatchObject({
      status: "denied",
      reason: "origin",
    })
    expect(await count("select count(*)::int as n from public.communications where id = $1 and delivery_status = 'PROVIDER_ACCEPTED'", [queued.id])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs where id = $1 and status = 'SUCCEEDED'", [claimed.jobId])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.job_attempts where job_id = $1 and lease_owner = 'dev-mail-dispatch'", [claimed.jobId])).toBe(1)

    const held = await seed()
    const heldHash = "8".repeat(64)
    const heldRequest = crypto.randomUUID()
    await db.query(
      `insert into admin_private.customer_portal_sessions(
        token_hash, customer_id, auth_user_id, email_snapshot, authenticated_at, created_at, expires_at
      ) values ($1, $2, $3, 'alex@example.com', now(), now(), now() + interval '8 hours')
      on conflict (token_hash) do nothing`,
      [heldHash, customer, alexAuth],
    )
    const heldPayload = { ...payloadFor(held, {}, devOrigin).body }
    delete (heldPayload as { version?: number }).version
    const heldQueued = await rpc("customer_queue_guided_payment_request_v1", [heldHash, heldRequest, heldPayload])
    expect(heldQueued).toMatchObject({ status: "success" })
    expect(await count("select count(*)::int as n from public.communications where id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [heldQueued.id])).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_v1", [heldQueued.id, devOrigin])).toMatchObject({
      status: "denied",
      reason: "before_activation",
    })
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [heldRequest, devOrigin])).toMatchObject({
      status: "denied",
      reason: "not_ready",
    })
    await db.query("update admin_private.job_outbox set available_at = now() where aggregate_id = $1", [heldQueued.id])
    const heldClaim = await rpc("dev_mail_dispatch_claim_request_v1", [heldRequest, devOrigin]) as DevSendClaim
    const heldProvider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: heldClaim, provider: heldProvider })).toBe("succeeded")
    expect(heldProvider.effects).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where id = $1 and delivery_status = 'PROVIDER_ACCEPTED'", [heldQueued.id])).toBe(1)

    const retry = await seed()
    const retryHash = "9".repeat(64)
    const retryRequest = crypto.randomUUID()
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [retryHash, retry.acceptanceAction, alexAuth],
    )
    const retryPayload = { ...payloadFor(retry, {}, devOrigin).body }
    delete (retryPayload as { version?: number }).version
    expect(await rpc("customer_action_queue_guided_payment_request_v1", [retryHash, retryRequest, retryPayload])).toMatchObject({ status: "success" })
    const retryClaim = await rpc("dev_mail_dispatch_claim_request_v1", [retryRequest, devOrigin]) as DevSendClaim
    const failing = {
      effects: 0,
      async send() {
        this.effects += 1
        return { ok: false as const, retryable: true, error: "Email provider rejected the message" }
      },
    }
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: retryClaim, provider: failing })).toBe("retry")
    expect(failing.effects).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [retryRequest, devOrigin])).toMatchObject({
      status: "denied",
      reason: "acceptance_unknown",
    })
    expect(failing.effects).toBe(1)
    expect(await count(
      "select count(*)::int as n from admin_private.jobs where id = $1 and status = 'RETRY'",
      [retryClaim.jobId],
    )).toBe(1)

    const unknown = await seed()
    const unknownHash = "a".repeat(64)
    const unknownRequest = crypto.randomUUID()
    await db.query(
      `insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [unknownHash, unknown.acceptanceAction, alexAuth],
    )
    const unknownPayload = { ...payloadFor(unknown, {}, devOrigin).body }
    delete (unknownPayload as { version?: number }).version
    const unknownQueued = await rpc("customer_action_queue_guided_payment_request_v1", [unknownHash, unknownRequest, unknownPayload])
    expect(unknownQueued).toMatchObject({ status: "success" })
    const unknownClaim = await rpc("dev_mail_dispatch_claim_request_v1", [unknownRequest, devOrigin]) as DevSendClaim
    const unknownProvider = {
      effects: 0,
      async send() {
        this.effects += 1
        return { ok: false as const, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }
      },
    }
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: unknownClaim, provider: unknownProvider })).toBe("retry")
    expect(unknownProvider.effects).toBe(1)
    expect(await rpc("dev_mail_dispatch_claim_request_v1", [unknownRequest, devOrigin])).toMatchObject({
      status: "denied",
      reason: "acceptance_unknown",
    })
    expect(unknownProvider.effects).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.communications where id = $1 and delivery_status = 'ACCEPTANCE_UNKNOWN'",
      [unknownQueued.id],
    )).toBe(1)

    const claimSignature = "public.dev_mail_dispatch_claim_request_v1(uuid,text)"
    const handoverSignature = "public.customer_record_guided_payment_handover_v1(text,uuid,uuid,text)"
    for (const signature of [claimSignature, handoverSignature]) {
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [signature])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('authenticated', $1, 'EXECUTE') as ok", [signature])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [signature])).rows[0].ok).toBe(true)
    }
    const recorded = await rpc("customer_record_guided_payment_handover_v1", [hash, crypto.randomUUID(), row.order, "queue_unavailable"])
    expect(recorded).toEqual({ status: "recorded" })
    expect(await rpc("customer_record_guided_payment_handover_v1", [hash, crypto.randomUUID(), row.order, "relation missing"])).toEqual({ status: "invalid" })
  })
})
