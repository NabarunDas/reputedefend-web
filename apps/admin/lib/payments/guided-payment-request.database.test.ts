/**
 * Guided payment-request email on a disposable database.
 * The migration is applied only inside this test. It is not applied to DEV
 * or Production, and no provider is contacted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { renderPaymentRequest } from "../../../../lib/email/payment-request"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const token = "a".repeat(64)
const origin = "https://customer.example"
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

type Seed = {
  serviceCode?: string
  amount?: number
  model?: "UPFRONT" | "SUCCESS_FEE"
  openAction?: boolean
  expiredAction?: boolean
  obligation?: "DUE" | "PAID" | null
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
      [paymentAction, customer, business, location, caseId, order, obligation ? obligationId : null, crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 32), options.expiredAction ? new Date(Date.now() - 3600_000).toISOString() : new Date(Date.now() + 4 * 86400_000).toISOString(), admin],
    )
  }
  return { caseId, caseRef, order, orderRef, obligationId, paymentAction, serviceName, serviceCode, amount, recordVersion }
}

function payloadFor(row: Awaited<ReturnType<typeof seed>>, overrides: Record<string, unknown> = {}) {
  const rendered = renderPaymentRequest({
    serviceCode: row.serviceCode,
    serviceName: row.serviceName,
    orderRef: row.orderRef,
    caseRef: row.caseRef,
    amountMinor: row.amount,
    currency: "GBP",
    origin,
    replyTo: "cases@profilerelaunch.com",
  })
  return {
    rendered,
    body: {
      serviceOrderId: row.order,
      version: row.recordVersion,
      customerOrigin: origin,
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

async function queue(row: Awaited<ReturnType<typeof seed>>, overrides: Record<string, unknown> = {}, request = crypto.randomUUID()) {
  const prepared = payloadFor(row, overrides)
  const result = await rpc("admin_queue_guided_payment_request_v1", [token, request, prepared.body])
  return { result, ...prepared, request }
}

describe("guided payment-request queue", () => {
  it("reuses one open payment action and queues a single portal email", async () => {
    const row = await seed({ openAction: true })
    const beforeOps = await count("select count(*)::int as n from public.provider_operations")
    const first = await queue(row)
    expect(first.rendered?.buttonLabel).toBe("Pay £99 securely")
    expect(first.result).toMatchObject({ status: "success", lifecycle: "QUEUED", deliveryStatus: "NONE", reusedAction: true, replay: false, actionId: row.paymentAction })
    expect(first.result).not.toHaveProperty("actionUrl")
    const stored = await db.query<{ body_text: string; body_html: string; customer_action_id: string; link_key_version: number | null }>(
      "select body_text, body_html, customer_action_id, link_key_version from public.communications where id = $1",
      [first.result.id],
    )
    expect(stored.rows[0].customer_action_id).toBe(row.paymentAction)
    expect(stored.rows[0].link_key_version).toBeNull()
    expect(stored.rows[0].body_text).toContain("Pay £99 securely")
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
    expect(reviewQueued.rendered?.buttonLabel).toBe("Pay £59 securely")
    expect(reviewQueued.result).toMatchObject({ status: "success", reusedAction: true, actionId: review.paymentAction })
    expect(String(reviewQueued.result.id ? (await db.query<{ body_text: string }>("select body_text from public.communications where id = $1", [reviewQueued.result.id])).rows[0].body_text : "")).toContain("Pay £59 securely")
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
})
