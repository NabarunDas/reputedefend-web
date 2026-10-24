/**
 * An accepted service order can be recorded on the case without another
 * service choice and without marking the obligation paid.
 * This rehearsal never connects to a live database.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "22222222-2222-4222-8222-222222222223"
const business = "33333333-3333-4333-8333-333333333333"
const otherBusiness = "33333333-3333-4333-8333-333333333334"
const location = "44444444-4444-4444-8444-444444444444"
const token = "a".repeat(64)
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
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
    insert into public.customers(id,full_name,email) values
      ('${customer}','Alex','alex@example.com'),
      ('${otherCustomer}','Sam','sam@example.com');
    insert into public.businesses(id,display_name) values ('${business}','Bakery'), ('${otherBusiness}','Other Bakery');
    insert into public.locations(id,business_id,country) values ('${location}','${business}','UK');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence)
      values ('${customer}','${business}','verified',now(),'${uid}','Membership verified for this reconcile test.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, uid))
  await db.exec(syntheticPurchasingEstablishmentSql(otherBusiness, uid))
  for (const agreement of Object.values(agreements)) {
    const approved = await rpc("admin_record_owner_paid_service_agreement_approval_v1", [
      token, crypto.randomUUID(), agreement.version, "Disposable reconcile test evidence for this catalogue version only.",
    ])
    expect(approved.status).toBe("confirmed")
  }
}, 180000)

afterAll(async () => {
  await db.close()
})

async function rpc(name: string, args: unknown[]) {
  const value = await db.query<{ value: { status: string; reason?: string; track?: string; stage?: string; serviceCode?: string; orderId?: string } }>(
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`,
    args,
  )
  return value.rows[0].value
}

type Seed = {
  serviceCode?: string
  orderServiceCode?: string
  amount?: number
  model?: "UPFRONT" | "SUCCESS_FEE" | "RECURRING_MONTHLY"
  state?: string
  obligation?: "DUE" | "PAID" | null
  obligationAmount?: number
  customerId?: string
  caseCustomerId?: string
  businessId?: string
  assessment?: boolean
  intake?: boolean
  verification?: boolean
  pathway?: "GUIDED" | "MANAGED"
  secondOrder?: boolean
}

async function seed(options: Seed = {}) {
  const serviceCode = options.serviceCode ?? "GUIDED_RELAUNCH"
  const orderServiceCode = options.orderServiceCode ?? serviceCode
  const amount = options.amount ?? (serviceCode === "GUIDED_REVIEW" ? 5900 : serviceCode === "MANAGED_RELAUNCH" ? 29900 : serviceCode === "MANAGED_REVIEW" ? 14900 : serviceCode === "RELAUNCH_GUARD" ? 999 : 9900)
  const model = options.model ?? (serviceCode.startsWith("MANAGED") ? "SUCCESS_FEE" : serviceCode === "RELAUNCH_GUARD" ? "RECURRING_MONTHLY" : "UPFRONT")
  const state = options.state ?? (model === "UPFRONT" ? "ACCEPTED_AWAITING_PAYMENT" : model === "SUCCESS_FEE" ? "ACCEPTED_SUCCESS_FEE" : "ACCEPTED_RECURRING")
  const obligation = options.obligation === undefined ? (model === "UPFRONT" ? "DUE" : null) : options.obligation
  const obligationAmount = options.obligationAmount ?? amount
  const caseCustomer = options.caseCustomerId ?? customer
  const orderCustomer = options.customerId ?? caseCustomer
  const email = orderCustomer === otherCustomer ? "sam@example.com" : "alex@example.com"
  const orderBusiness = options.businessId ?? business
  const caseId = crypto.randomUUID()
  const quote = crypto.randomUUID()
  const version = crypto.randomUUID()
  const snapshot = crypto.randomUUID()
  const order = crypto.randomUUID()
  const action = crypto.randomUUID()
  const acceptance = crypto.randomUUID()
  const paid = crypto.randomUUID()
  const obligationId = crypto.randomUUID()
  await db.query(
    `insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at)
     values ($1,'PROFILE_RECOVERY',$2,$3,$4,'Profile suspended','2026-01-01')`,
    [caseId, caseCustomer, business, location],
  )
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,'NONE',0,'NOT_QUALIFIED','SYNTHETIC',$4,0,$4,$5,'ADMIN_RECORDED')`,
    [snapshot, location, serviceCode, amount, uid],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quote, `QT-26-${ref()}`, orderCustomer, orderBusiness, location, caseId, uid],
  )
  const versionInserted = await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1,$2,1,'OFFERED',$3,$4,$5,$6,$7, p.id, $7, $8,
      'Synthetic scope text for this reconciliation test.', 'Synthetic exclusions text for this reconciliation test.', 'Synthetic success definition for this reconciliation test.',
      $9, 'NONE', 0, 0, $9, 'NOT_APPLICABLE', 0, $9, 'GBP', $10, now() + interval '30 days',
      'Synthetic payment timing statement.', 'Synthetic terms reference.', $11, now(), $11
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from limit 1
    returning id, commercial_agreement_version, commercial_agreement_hash`,
    [version, quote, orderCustomer, orderBusiness, location, caseId, serviceCode, model, amount, snapshot, uid],
  )
  expect(versionInserted.rows).toHaveLength(1)
  const bound = versionInserted.rows[0] as { commercial_agreement_version: string; commercial_agreement_hash: string }
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  serial += 1
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,$8, now() + interval '2 days', $9, now())`,
    [action, orderCustomer, orderBusiness, location, caseId, version, serial.toString(16).padStart(64, "b"), email, uid],
  )
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      accepted_at, total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,$6,now(),$7,'GBP','NOT_APPLICABLE',0)`,
    [acceptance, quote, version, action, uid, email, amount],
  )
  await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [version])
  await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [quote])
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GBP',$12,'NOT_APPLICABLE',0,$13,now())`,
    [order, `SO-26-${ref()}`, quote, version, acceptance, orderCustomer, orderBusiness, location, caseId, orderServiceCode, amount, model, state],
  )
  if (obligation) {
    await db.query(
      `insert into public.payment_obligations(
        id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency,
        tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,$6,'UPFRONT',$7,$8,'GBP','NOT_APPLICABLE',0)`,
      [obligationId, order, quote, version, orderCustomer, caseId, obligation, obligationAmount],
    )
  }
  const agreement = agreements[orderServiceCode] ?? agreements[serviceCode]
  await db.query(
    `insert into public.paid_service_acceptances(
      id, request_id, payload_fingerprint, customer_id, business_id, location_id, case_id, customer_action_id,
      quote_id, quote_version_id, quote_acceptance_id, service_order_id, accepted_by_auth_user_id,
      agreement_version, agreement_hash, agreement_body, service_code, payment_model, amount_minor, currency,
      business_purpose_text, business_purpose_accepted_at, terms_accepted_at, fee_basis_kind, fee_basis_text,
      fee_basis_accepted_at, payment_distinction, quotation_snapshot
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Synthetic accepted agreement body.',$16,$17,$18,'GBP',
      'I confirm that I am acting for the business named on this quotation.', now(), now(),
      $19, $20, $21, '{"collectsUpfront":true}'::jsonb, '{}'::jsonb
    )`,
    [
      paid, crypto.randomUUID(), "c".repeat(32), orderCustomer, orderBusiness, location, caseId, action,
      quote, version, acceptance, order, uid, agreement?.version ?? bound.commercial_agreement_version, agreement?.hash ?? bound.commercial_agreement_hash,
      orderServiceCode, model, amount,
      model === "SUCCESS_FEE" ? "MANAGED_CONTINGENT_SUCCESS_FEE_V1" : model === "RECURRING_MONTHLY" ? "GUARD_RECURRING_CONSENT_V1" : null,
      model === "SUCCESS_FEE" ? "Managed success fee is payable only after documented success." : model === "RECURRING_MONTHLY" ? "Relaunch Guard renews monthly and is separate from this recovery case." : null,
      model === "UPFRONT" ? null : new Date().toISOString(),
    ],
  )
  if (options.assessment !== false) {
    await db.query(
      `insert into public.case_assessments(
        case_id, version_number, status, findings, evidence_considered, recommended_action, service_pathway,
        rationale, risks, basis, basis_fingerprint, drafted_by, reviewed_by, reviewed_at, approved_by, approved_at
      ) values ($1,1,'APPROVED',
        'The profile was suspended and the ownership letter matches the bakery.',
        'One accepted ownership letter is on the case file.',
        'Recommend a pathway and leave the accepted order to choose the service.',
        $2,
        'The accepted evidence is enough for an approved assessment.',
        'Google may still refuse the recovery request.',
        '{"source":"synthetic"}'::jsonb, md5('synthetic'), $3, $3, now(), $3, now())`,
      [caseId, options.pathway ?? "GUIDED", uid],
    )
  }
  if (options.intake !== false) {
    await db.query(
      `insert into public.case_work_events(case_id, actor_id, event, note, details)
       values ($1,$2,'INTAKE_REVIEW','Reviewed the intake before reconciliation.','{"outcome":"REVIEWED"}'::jsonb)`,
      [caseId, uid],
    )
  }
  if (options.verification !== false) {
    await db.query(
      `insert into public.case_work_events(case_id, actor_id, event, note, details)
       values ($1,$2,'BUSINESS_VERIFICATION','Recorded the preliminary screening.','{"outcome":"PRELIMINARY_COMPLETE"}'::jsonb)`,
      [caseId, uid],
    )
  }
  if (options.secondOrder) {
    const quote2 = crypto.randomUUID()
    const version2 = crypto.randomUUID()
    const snapshot2 = crypto.randomUUID()
    const order2 = crypto.randomUUID()
    const action2 = crypto.randomUUID()
    const acceptance2 = crypto.randomUUID()
    await db.query(
      `insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
        policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,'NONE',0,'NOT_QUALIFIED','SYNTHETIC',$4,0,$4,$5,'ADMIN_RECORDED')`,
      [snapshot2, location, serviceCode, amount, uid],
    )
    await db.query(
      `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
       values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
      [quote2, `QT-26-${ref()}`, orderCustomer, orderBusiness, location, caseId, uid],
    )
    await db.query(
      `insert into public.quote_versions(
        id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
        discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
      )
      select $1,$2,1,'OFFERED',$3,$4,$5,$6,$7, p.id, $7, $8,
        'Synthetic scope text for the second order.', 'Synthetic exclusions text for the second order.', 'Synthetic success definition for the second order.',
        $9, 'NONE', 0, 0, $9, 'NOT_APPLICABLE', 0, $9, 'GBP', $10, now() + interval '30 days',
        'Synthetic payment timing statement.', 'Synthetic terms reference.', $11, now(), $11
      from public.price_versions p where p.service_code = $7 and p.status = 'APPROVED' limit 1`,
      [version2, quote2, orderCustomer, orderBusiness, location, caseId, serviceCode, model, amount, snapshot2, uid],
    )
    await db.query("update public.quotes set current_version_id = $1 where id = $2", [version2, quote2])
    serial += 1
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
        expected_email_snapshot, expires_at, created_by, completed_at
      ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,$8, now() + interval '2 days', $9, now())`,
      [action2, orderCustomer, orderBusiness, location, caseId, version2, serial.toString(16).padStart(64, "c"), email, uid],
    )
    await db.query(
      `insert into public.quote_acceptances(
        id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
        accepted_at, total_amount_minor, currency, tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,$6,now(),$7,'GBP','NOT_APPLICABLE',0)`,
      [acceptance2, quote2, version2, action2, uid, email, amount],
    )
    await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [version2])
    await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [quote2])
    await db.query(
      `insert into public.service_orders(
        id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
        service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GBP',$12,'NOT_APPLICABLE',0,$13,now())`,
      [order2, `SO-26-${ref()}`, quote2, version2, acceptance2, orderCustomer, orderBusiness, location, caseId, serviceCode, amount, model, state],
    )
  }
  return { caseId, quote, version, order, obligationId, amount, bound }
}

async function versionOf(caseId: string) {
  const row = await db.query<{ workflow_version: number; service_track: string; work_stage: string; status: string }>(
    "select workflow_version, service_track, work_stage, status from public.cases where id = $1",
    [caseId],
  )
  return row.rows[0]
}

async function reconcile(caseId: string, version?: number, request = crypto.randomUUID()) {
  const expected = version ?? (await versionOf(caseId)).workflow_version
  return rpc("admin_reconcile_accepted_service_v1", [token, request, caseId, expected])
}

describe("accepted service reconciliation", () => {
  it("keeps acceptance from failing when reconciliation is refused, and does not take payment inside acceptance", async () => {
    const definition = await db.query<{ def: string }>("select pg_get_functiondef('admin_private.record_paid_service_acceptance_v1(public.customer_actions, uuid, uuid, jsonb)'::regprocedure) as def")
    expect(definition.rows[0].def).toContain("reconcile_accepted_service_apply_v1")
    expect(definition.rows[0].def).toContain("EXCEPTION WHEN OTHERS")
    const privilege = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.admin_reconcile_accepted_service_v1(text,uuid,uuid,integer)', 'EXECUTE') as ok",
    )
    expect(privilege.rows[0].ok).toBe(false)
    const livemode = await db.query<{ expected: boolean }>("select admin_private.payment_expected_livemode_v1() as expected")
    expect(livemode.rows[0].expected).toBe(false)
  })

  it("records Guided Relaunch £99 and leaves the obligation due", async () => {
    const seeded = await seed()
    const before = await db.query<{ total_amount_minor: number; status: string }>("select total_amount_minor, status from public.quote_versions where id = $1", [seeded.version])
    const request = crypto.randomUUID()
    const result = await reconcile(seeded.caseId, 1, request)
    expect(result).toMatchObject({ status: "success", reason: "reconciled", track: "GUIDED", stage: "PAYMENT_REQUIRED", serviceCode: "GUIDED_RELAUNCH" })
    const after = await versionOf(seeded.caseId)
    expect(after.service_track).toBe("GUIDED")
    expect(after.work_stage).toBe("PAYMENT_REQUIRED")
    expect(after.status).toBe("AWAITING_CUSTOMER")
    const obligation = await db.query<{ state: string }>("select state from public.payment_obligations where service_order_id = $1", [seeded.order])
    expect(obligation.rows[0].state).toBe("DUE")
    const quote = await db.query<{ total_amount_minor: number; status: string }>("select total_amount_minor, status from public.quote_versions where id = $1", [seeded.version])
    expect(quote.rows[0]).toEqual(before.rows[0])
    const providers = await db.query<{ count: number }>("select count(*)::int as count from public.provider_operations where service_order_id = $1", [seeded.order])
    expect(providers.rows[0].count).toBe(0)
    const paymentActions = await db.query<{ count: number }>("select count(*)::int as count from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [seeded.order])
    expect(paymentActions.rows[0].count).toBe(0)
    const hops = await db.query<{ event: string; details: { from?: string; to?: string } }>(
      "select event, details from public.case_work_events where case_id = $1 and event = 'transition' order by id",
      [seeded.caseId],
    )
    expect(hops.rows.map(row => `${row.details.from}->${row.details.to}`)).toEqual([
      "INITIAL_REVIEW->ASSESSMENT_READY",
      "ASSESSMENT_READY->SERVICE_SELECTION",
      "SERVICE_SELECTION->PAYMENT_REQUIRED",
    ])
    const replay = await reconcile(seeded.caseId, 1, request)
    expect(replay).toEqual(result)
    const again = await reconcile(seeded.caseId)
    expect(again.reason).toBe("already_reconciled")
    expect((await versionOf(seeded.caseId)).work_stage).toBe("PAYMENT_REQUIRED")
    expect((await db.query<{ state: string }>("select state from public.payment_obligations where id = $1", [seeded.obligationId])).rows[0].state).toBe("DUE")
  })

  it("records Guided Review at £59 and Managed without an upfront obligation", async () => {
    const review = await seed({ serviceCode: "GUIDED_REVIEW", amount: 5900, pathway: "MANAGED" })
    const reviewResult = await reconcile(review.caseId)
    expect(reviewResult).toMatchObject({ status: "success", track: "GUIDED", serviceCode: "GUIDED_REVIEW" })
    expect((await db.query<{ amount_minor: number; state: string }>("select amount_minor, state from public.payment_obligations where service_order_id = $1", [review.order])).rows[0]).toEqual({ amount_minor: 5900, state: "DUE" })
    const pathway = await db.query<{ details: { assessmentPathway?: string } }>(
      "select details from public.case_work_events where case_id = $1 and event = 'reconcile_accepted_service'",
      [review.caseId],
    )
    expect(pathway.rows[0].details.assessmentPathway).toBe("MANAGED")

    const managed = await seed({ serviceCode: "MANAGED_RELAUNCH", pathway: "MANAGED" })
    const managedResult = await reconcile(managed.caseId)
    expect(managedResult).toMatchObject({ status: "success", track: "MANAGED", stage: "AUTHORIZATION_REQUIRED", serviceCode: "MANAGED_RELAUNCH" })
    const managedObligations = await db.query("select id from public.payment_obligations where service_order_id = $1", [managed.order])
    expect(managedObligations.rows).toHaveLength(0)
    const managedPayments = await db.query<{ count: number }>("select count(*)::int as count from public.customer_actions where case_id = $1 and kind = 'GUIDED_PAYMENT'", [managed.caseId])
    expect(managedPayments.rows[0].count).toBe(0)
  })

  it("refuses mismatches, duplicates, missing proof, the wrong party, a stale version, revoked authority and Guard", async () => {
    const mismatch = await seed({ orderServiceCode: "GUIDED_REVIEW", amount: 9900 })
    expect((await reconcile(mismatch.caseId)).reason).toBe("mismatch")
    expect((await versionOf(mismatch.caseId)).service_track).toBe("UNDECIDED")

    const duplicate = await seed({ secondOrder: true })
    expect((await reconcile(duplicate.caseId)).reason).toBe("ambiguous_orders")

    const missingAssessment = await seed({ assessment: false })
    expect((await reconcile(missingAssessment.caseId)).reason).toBe("missing_assessment")
    const missingIntake = await seed({ intake: false })
    expect((await reconcile(missingIntake.caseId)).reason).toBe("missing_intake")

    const wrongCustomer = await seed({ customerId: otherCustomer })
    expect((await reconcile(wrongCustomer.caseId)).reason).toBe("mismatch")
    const wrongBusiness = await seed({ businessId: otherBusiness })
    expect((await reconcile(wrongBusiness.caseId)).reason).toBe("mismatch")
    const emptyCase = crypto.randomUUID()
    await db.query(
      `insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description)
       values ($1,'PROFILE_RECOVERY',$2,$3,$4,'Another case')`,
      [emptyCase, customer, business, location],
    )
    expect((await reconcile(emptyCase)).reason).toBe("not_found")

    const stale = await seed()
    expect((await reconcile(stale.caseId, 99)).reason).toBe("stale_version")
    expect((await versionOf(stale.caseId)).work_stage).toBe("INITIAL_REVIEW")

    const revoked = await seed()
    await db.query("update public.business_memberships set status = 'revoked', verified_at = null, verified_by = null where customer_id = $1", [customer])
    expect((await reconcile(revoked.caseId)).reason).toBe("revoked_authority")
    await db.query(
      "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $2 where customer_id = $1",
      [customer, uid],
    )
    expect((await versionOf(revoked.caseId)).service_track).toBe("UNDECIDED")

    const unmatched = await seed({ obligationAmount: 100 })
    expect((await reconcile(unmatched.caseId)).reason).toBe("unmatched_payment")

    const guard = await seed({ serviceCode: "RELAUNCH_GUARD", model: "RECURRING_MONTHLY", state: "ACCEPTED_RECURRING", obligation: null, assessment: false, intake: false, verification: false })
    expect((await reconcile(guard.caseId)).reason).toBe("guard_separate")
    expect((await versionOf(guard.caseId)).service_track).toBe("UNDECIDED")
  })

  it("does not treat an expired payment action as settlement", async () => {
    const seeded = await seed()
    serial += 1
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id, kind, status,
        secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,$6,$7,'GUIDED_PAYMENT','OPEN',$8,'alex@example.com', now() - interval '1 day', $9)`,
      [crypto.randomUUID(), customer, business, location, seeded.caseId, seeded.order, seeded.obligationId, serial.toString(16).padStart(64, "d"), uid],
    )
    const result = await reconcile(seeded.caseId)
    expect(result.status).toBe("success")
    const action = await db.query<{ status: string }>("select status from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [seeded.order])
    expect(action.rows[0].status).toBe("OPEN")
    const obligation = await db.query<{ state: string }>("select state from public.payment_obligations where id = $1", [seeded.obligationId])
    expect(obligation.rows[0].state).toBe("DUE")
  })
})
