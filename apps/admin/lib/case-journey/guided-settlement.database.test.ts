/**
 * A paid Guided order stays ACCEPTED_AWAITING_PAYMENT in the database.
 * Steps 7, 10 and 11 have to read that state, together with a PAID obligation
 * and a receipt, as settled. This rehearsal never connects to a live database.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import type { CaseFlowFacts } from "../case-flow/model"
import { narrowCaseFlowFacts, requiredCase } from "../case-flow/projection"
import { presentJourneyClosure } from "./closure"
import { presentJourneyOutcome } from "./outcome"
import { presentCaseJourney } from "./present"
import type { CaseDetail } from "../cases/model"
import type { MoneyOrder } from "../payments/model"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const summary = "The listing was restored and the customer can see it."
const note = "Reviewed the caller’s request and confirmed the details."
const capabilities = { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false }
let serial = 0

const ref = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  serial += 1
  return alphabet[serial % alphabet.length] + alphabet[(serial * 3) % alphabet.length] + alphabet[(serial * 5) % alphabet.length] + alphabet[(serial * 7) % alphabet.length] + alphabet[(serial * 11) % alphabet.length] + alphabet[(serial * 13) % alphabet.length]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 180000)

afterAll(async () => {
  await db.close()
})

async function paidGuidedOrder() {
  const quote = crypto.randomUUID()
  const version = crypto.randomUUID()
  const snapshot = crypto.randomUUID()
  const order = crypto.randomUUID()
  const obligation = crypto.randomUUID()
  const receipt = crypto.randomUUID()
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN','GUIDED_RELAUNCH','NONE',0,'NOT_QUALIFIED','SYNTHETIC',9900,0,9900,$3,'ADMIN_RECORDED')`,
    [snapshot, location, uid],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quote, `QT-26-${ref()}`, customer, business, location, caseId, uid],
  )
  const versionInserted = await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1,$2,1,'OFFERED',$3,$4,$5,$6,'GUIDED_RELAUNCH', p.id, 'GUIDED_RELAUNCH', 'UPFRONT',
      'Synthetic scope text for this settlement test.', 'Synthetic exclusions text for this settlement test.', 'Synthetic success definition for this settlement test.',
      9900, 'NONE', 0, 0, 9900, 'NOT_APPLICABLE', 0, 9900, 'GBP', $7, now() + interval '30 days',
      'Synthetic payment timing statement.', 'Synthetic terms reference for settlement.', $8, now(), $8
    from public.price_versions p
    where p.service_code = 'GUIDED_RELAUNCH' and p.status = 'APPROVED'
    order by p.effective_from limit 1
    returning id`,
    [version, quote, customer, business, location, caseId, snapshot, uid],
  )
  expect(versionInserted.rows).toHaveLength(1)
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  const action = crypto.randomUUID()
  const acceptance = crypto.randomUUID()
  serial += 1
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,'alex@example.com', now() + interval '2 days', $8, now())`,
    [action, customer, business, location, caseId, version, serial.toString(16).padStart(64, "b"), uid],
  )
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      accepted_at, total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,'alex@example.com',now(),9900,'GBP','NOT_APPLICABLE',0)`,
    [acceptance, quote, version, action, uid],
  )
  await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [version])
  await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [quote])
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'GUIDED_RELAUNCH',9900,'GBP','UPFRONT','NOT_APPLICABLE',0,'ACCEPTED_AWAITING_PAYMENT',now())`,
    [order, `SO-26-${ref()}`, quote, version, acceptance, customer, business, location, caseId],
  )
  await db.query(
    `insert into public.payment_obligations(
      id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency,
      tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,$6,'UPFRONT','PAID',9900,'GBP','NOT_APPLICABLE',0)`,
    [obligation, order, quote, version, customer, caseId],
  )
  const operation = crypto.randomUUID()
  const attempt = crypto.randomUUID()
  await db.query(
    `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
     values ($1,$2,'CREATE_PAYMENT_INTENT','UPFRONT',$3,$4,$5,'SUCCEEDED')`,
    [operation, crypto.randomUUID(), customer, order, obligation],
  )
  await db.query(
    `insert into public.payment_attempts(
      id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, succeeded_at
    ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',9900,'GBP',now())`,
    [attempt, obligation, order, operation],
  )
  await db.query(
    `insert into public.payment_receipts(
      id, obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor, paid_at
    ) values ($1,$2,$3,$4,$5,9900,'GBP','NOT_APPLICABLE',0,now())`,
    [receipt, obligation, order, customer, attempt],
  )
  return { quote, order, obligation, receipt }
}

function detailFor(source: CaseFlowFacts): CaseDetail {
  return {
    id: source.caseId,
    reference: source.reference,
    type: source.caseType,
    stage: "OUTCOME_REVIEW",
    track: "GUIDED",
    status: source.caseStatus,
    client: "Alex",
    business: "Bakery",
    assigned: true,
    priority: "NORMAL",
    nextAction: "",
    due: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 2,
    outcome: "RESTORED",
    summary: source.outcomeSummary,
    priorityReason: "",
    firstResponseDue: null,
    issue: "Profile suspended",
    reviewUrl: null,
    customerId: customer,
    businessId: business,
    locationId: location,
    events: [],
    tasks: [],
    submissions: [],
    transitions: [],
    customerPreview: { reference: source.reference, type: source.caseType, summary: source.outcomeSummary, notes: [] },
  }
}

describe("paid Guided settlement from the database projection", () => {
  it("lets Steps 7, 10 and 11 treat ACCEPTED_AWAITING_PAYMENT with a paid receipt as settled", async () => {
    await db.exec(`
      insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
      insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
        on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
      insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
      insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
      insert into public.businesses(id,display_name) values('${business}','Bakery');
      insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
      insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at)
        values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');
    `)
    await db.query("update public.cases set service_track='GUIDED', work_stage='OUTCOME_REVIEW', status='UNDER_REVIEW' where id=$1", [caseId])
    const paid = await paidGuidedOrder()
    const stored = await db.query<{ state: string }>("select state from public.service_orders where id=$1", [paid.order])
    expect(stored.rows[0].state).toBe("ACCEPTED_AWAITING_PAYMENT")

    const version = await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [caseId])
    const recorded = await db.query<{ value: { status: string } }>(
      "select public.admin_case_command_v1($1,$2,$3,$4,'record_outcome',$5::jsonb) as value",
      [token, crypto.randomUUID(), caseId, version.rows[0].workflow_version, JSON.stringify({ note, outcome: "RESTORED", summary })],
    )
    expect(recorded.rows[0].value.status).toBe("success")

    const payload = (await db.query<{ value: unknown }>(
      "select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value",
      [token, [caseId]],
    )).rows[0].value
    const facts = requiredCase(narrowCaseFlowFacts(payload, [caseId], capabilities), caseId)
    expect(facts.payment.orders).toHaveLength(1)
    expect(facts.payment.orders[0]).toMatchObject({
      orderId: paid.order,
      paymentModel: "UPFRONT",
      orderState: stored.rows[0].state,
      obligationKind: "UPFRONT",
      obligationState: "PAID",
      receiptRecorded: true,
    })
    expect(facts.commercial.quotes).toEqual([expect.objectContaining({ status: "ACCEPTED", orderId: paid.order })])

    const now = "2026-10-20T12:00:00.000Z"
    const journey = presentCaseJourney(facts, now)
    expect(journey.steps.find(step => step.id === "SERVICE_ACTIVATION")?.state).toBe("COMPLETED")
    expect(journey.steps.find(step => step.id === "OUTCOME_BILLING")?.state).toBe("COMPLETED")

    const money: MoneyOrder = {
      orderId: paid.order,
      orderRef: "SO-26-SETTLED",
      customerId: customer,
      caseId,
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: 9900,
      currency: "GBP",
      paymentModel: "UPFRONT",
      orderState: "ACCEPTED_AWAITING_PAYMENT",
      version: 1,
      obligationId: paid.obligation,
      obligationKind: "UPFRONT",
      obligationState: "PAID",
      setupReady: false,
      consentId: null,
      approvalId: null,
      receiptId: paid.receipt,
      invoiceId: null,
      invoiceStatus: null,
      acceptedEvidence: [],
    }
    const recordedBilling = { submissions: [], caseTrack: "GUIDED", caseOutcome: "RESTORED", caseStatus: facts.caseStatus, moneyOrders: [money] }
    const outcome = presentJourneyOutcome({ facts, now, recorded: recordedBilling })
    expect(outcome.panel.headline).toBe("Settled")
    expect(outcome.panel.requirements.find(item => item.label === "Billing position")?.state).toBe("Met")
    const closure = presentJourneyClosure({
      facts,
      now,
      recorded: recordedBilling,
      detail: detailFor(facts),
      precedingComplete: true,
    })
    expect(closure.panel.blockers).not.toContain("The billing position is not ready.")
    expect(closure.panel.commands?.close).toBe(true)
    expect(closure.panel.locked).toEqual({ outcome: "RESTORED", summary: facts.outcomeSummary })

    const precedingComplete = journey.steps.filter(step => step.id !== "CLOSURE").every(step => step.state === "COMPLETED" || step.state === "NOT_APPLICABLE")
    const actual = presentJourneyClosure({
      facts,
      now,
      recorded: recordedBilling,
      detail: detailFor(facts),
      precedingComplete,
    })
    expect(actual.panel.blockers).not.toContain("The billing position is not ready.")

    const current = await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [caseId])
    const closed = await db.query<{ value: { status: string } }>(
      "select public.admin_case_command_v1($1,$2,$3,$4,'close',$5::jsonb) as value",
      [token, crypto.randomUUID(), caseId, current.rows[0].workflow_version, JSON.stringify({ note, outcome: "RESTORED", summary })],
    )
    expect(closed.rows[0].value.status).toBe("success")
    const row = await db.query<{ status: string; outcome: string }>("select status, outcome from public.cases where id=$1", [caseId])
    expect(row.rows[0]).toMatchObject({ status: "CLOSED", outcome: "RESTORED" })
  })
})
