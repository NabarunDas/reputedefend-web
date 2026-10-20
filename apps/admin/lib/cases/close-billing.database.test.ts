import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const reviewCase = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const note = "Reviewed the caller’s request and confirmed the details."
const summary = "The listing was restored and the customer can see it."
let serial = 0

type CommandResult = { status: string; id?: string }
type CaseRow = { status: string; work_stage: string; outcome: string | null; closure_summary: string; closed_at: string | null; workflow_version: number }

async function rpc(name: string, args: unknown[] = []): Promise<CommandResult> {
  return (await db.query<{ value: CommandResult }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)'; CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')'; CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';"))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    readdirSync(dir).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_foundation_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_workspace_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_prepared_packs_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_customer_actions_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_case_pack_access_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_evidence_upload_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_jobs_outbox_operational_health_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_communications_outgoing_mail_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_incoming_mail_conversations_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_catalogue_quotes_orders_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_stripe_payments_v1.sql"))!,
    "20261019183000_admin_journey_10b_record_outcome_v1.sql",
    "20261019235000_admin_journey_12a_close_billing_v1.sql",
  ]) await db.exec(read(name))
}, 90000)

afterAll(async () => { await db.close() })

async function wipeCommercial() {
  await db.exec(`
    alter table public.payment_receipts disable trigger payment_receipts_immutable;
    alter table public.payment_ledger disable trigger payment_ledger_immutable;
    alter table public.success_fee_approvals disable trigger success_fee_approvals_immutable;
    alter table public.quote_acceptances disable trigger quote_acceptances_immutable;
    alter table public.quote_discount_snapshots disable trigger quote_discount_snapshots_immutable;
    alter table public.quote_events disable trigger quote_events_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    delete from public.payment_receipts;
    delete from public.payment_ledger;
    delete from public.payment_attempts;
    delete from public.provider_operations;
    delete from public.payment_obligations;
    delete from public.success_fee_approvals;
    delete from public.case_document_events;
    delete from public.case_document_versions;
    delete from public.case_documents;
    delete from public.service_orders;
    delete from public.quote_acceptances;
    delete from public.customer_action_events;
    delete from public.customer_actions;
    delete from public.quote_events;
    update public.quotes set current_version_id = null;
    delete from public.quote_versions;
    delete from public.quotes;
    delete from public.quote_discount_snapshots;
    alter table public.payment_receipts enable trigger payment_receipts_immutable;
    alter table public.payment_ledger enable trigger payment_ledger_immutable;
    alter table public.success_fee_approvals enable trigger success_fee_approvals_immutable;
    alter table public.quote_acceptances enable trigger quote_acceptances_immutable;
    alter table public.quote_discount_snapshots enable trigger quote_discount_snapshots_immutable;
    alter table public.quote_events enable trigger quote_events_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
  `)
}

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;`)
  await wipeCommercial()
  await db.exec(`
    delete from public.case_submission_results;
    delete from public.case_submissions;
    delete from public.case_tasks;
    delete from public.case_work_events;
    delete from admin_private.case_command_receipts;
    delete from public.admin_audit_events;
    delete from public.cases;
    delete from public.locations;
    delete from public.businesses;
    delete from public.customers;
    delete from public.admin_sessions;
    delete from public.admin_identity;
    delete from auth.users;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.customers(id,full_name,email) values('${otherCustomer}','Blair','blair@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${reviewCase}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-01');`)
})

const row = (id = caseId) => db.query<CaseRow>("select status, work_stage, outcome, closure_summary, closed_at, workflow_version from public.cases where id=$1", [id]).then(result => result.rows[0])
const command = async (operation: string, data: Record<string, unknown>, version?: number, request = key(), id = caseId) => rpc("admin_case_command_v1", [token, request, id, version ?? (await row(id)).workflow_version, operation, { note, ...data }])
const events = (id = caseId) => db.query<{ event: string }>("select event from public.case_work_events where case_id=$1 order by id", [id]).then(result => result.rows)
const audits = (id = caseId) => db.query<{ action: string }>("select action from public.admin_audit_events where target_id=$1", [id]).then(result => result.rows)
const ref = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  serial += 1
  return alphabet[serial % alphabet.length] + alphabet[(serial * 3) % alphabet.length] + alphabet[(serial * 5) % alphabet.length] + alphabet[(serial * 7) % alphabet.length] + alphabet[(serial * 11) % alphabet.length] + alphabet[(serial * 13) % alphabet.length]
}

async function prepare(track: "GUIDED" | "MANAGED", stage = "OUTCOME_REVIEW", id = caseId) {
  await db.query("update public.cases set service_track=$2, work_stage=$3 where id=$1", [id, track, stage])
}

async function commercial(options: {
  track: "GUIDED" | "MANAGED"
  caseId?: string
  customerId?: string
  orderCaseId?: string
  orderCustomerId?: string
  obligationCaseId?: string
  obligationCustomerId?: string
  obligation?: "PAID" | "DUE" | "FAILED" | "VOID" | "none"
  receipt?: boolean
  attempt?: boolean
  approvalOutcome?: string
}) {
  const id = options.caseId ?? caseId
  const owner = options.customerId ?? customer
  const orderOwner = options.orderCustomerId ?? owner
  const obligationOwner = options.obligationCustomerId ?? orderOwner
  const orderCase = options.orderCaseId ?? id
  const obligationCase = options.obligationCaseId ?? orderCase
  const managed = options.track === "MANAGED"
  const quote = crypto.randomUUID()
  const version = crypto.randomUUID()
  const snapshot = crypto.randomUUID()
  const quoteRef = `QT-26-${ref()}`
  const orderRef = `SO-26-${ref()}`
  const service = managed ? "MANAGED_RELAUNCH" : "GUIDED_RELAUNCH"
  const model = managed ? "SUCCESS_FEE" : "UPFRONT"
  const state = managed ? "ACCEPTED_SUCCESS_FEE" : "ACCEPTED_AWAITING_PAYMENT"
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,'NONE',0,'NOT_QUALIFIED','SYNTHETIC',9900,0,9900,$4,'ADMIN_RECORDED')`,
    [snapshot, location, service, uid],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quote, quoteRef, owner, business, location, id, uid],
  )
  const versionInserted = await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor, currency,
      discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1,$2,1,'OFFERED',$3,$4,$5,$6,$7, p.id, $7, $8,
      'Synthetic scope text for this closure test.', 'Synthetic exclusions text for this closure test.', 'Synthetic success definition for this closure test.',
      9900, 'NONE', 0, 0, 9900, 'NOT_APPLICABLE', 0, 9900, 'GBP', $9, now() + interval '30 days',
      'Synthetic payment timing statement.', 'Synthetic terms reference for closure.', $10, now(), $10
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from limit 1
    returning id`,
    [version, quote, owner, business, location, id, service, model, snapshot, uid],
  )
  expect(versionInserted.rows).toHaveLength(1)
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quote])
  const action = crypto.randomUUID()
  const acceptance = crypto.randomUUID()
  const order = crypto.randomUUID()
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, quote_version_id, kind, status, secret_hash,
      expected_email_snapshot, expires_at, created_by, completed_at
    ) values ($1,$2,$3,$4,$5,$6,'QUOTE_ACCEPTANCE','COMPLETED',$7,'alex@example.com', now() + interval '2 days', $8, now())`,
    [action, owner, business, location, id, version, serial.toString(16).padStart(64, "b"), uid],
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
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,9900,'GBP',$11,'NOT_APPLICABLE',0,$12,now())`,
    [order, orderRef, quote, version, acceptance, orderOwner, business, location, orderCase, service, model, state],
  )
  if (options.obligation === "none" || (options.obligation === undefined && !options.receipt)) return { quote, order }
  const obligationState = options.obligation ?? "PAID"
  const obligation = crypto.randomUUID()
  let approval: string | null = null
  if (managed) {
    const document = crypto.randomUUID()
    const evidence = crypto.randomUUID()
    approval = crypto.randomUUID()
    await db.query(
      "insert into public.case_documents(id, case_id, title, created_by) values ($1,$2,'Outcome evidence',$3)",
      [document, id, uid],
    )
    await db.query(
      `insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes, storage_bucket, storage_key, created_by
      ) values ($1,$2,1,'evidence.pdf','application/pdf',1200,'evidence',$3,$4)`,
      [evidence, document, `cases/${id}/documents/${document}/versions/${evidence}`, uid],
    )
    await db.query(
      `insert into public.success_fee_approvals(
        id, service_order_id, case_id, quote_version_id, outcome, success_definition, outcome_evidence_version_id,
        evidence_note, approval_reason, amount_minor, currency, discount_amount_minor, tax_behaviour, tax_amount_minor,
        payment_method_ready, approved_by
      ) values ($1,$2,$3,$4,$5,'Restored the listed profile.',$6,'Outcome evidence accepted after review.','Approved after the restored outcome evidence was checked.',9900,'GBP',0,'NOT_APPLICABLE',0,false,$7)`,
      [approval, order, id, version, options.approvalOutcome ?? "RESTORED", evidence, uid],
    )
  }
  await db.query(
    `insert into public.payment_obligations(
      id, service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state, amount_minor, currency,
      tax_behaviour, tax_amount_minor, success_fee_approval_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,9900,'GBP','NOT_APPLICABLE',0,$9)`,
    [obligation, order, quote, version, obligationOwner, obligationCase, managed ? "SUCCESS_FEE" : "UPFRONT", obligationState, approval],
  )
  if (options.attempt) {
    const operation = crypto.randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1,$2,'CREATE_CHECKOUT_SESSION',$3,$4,$5,$6,'SUCCEEDED')`,
      [operation, crypto.randomUUID(), managed ? "INVOICE" : "UPFRONT", obligationOwner, order, obligation],
    )
    await db.query(
      `insert into public.payment_attempts(
        id, obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency, succeeded_at
      ) values ($1,$2,$3,$4,1,'CHECKOUT','SUCCEEDED',9900,'GBP',now())`,
      [crypto.randomUUID(), obligation, order, operation],
    )
  }
  if (options.receipt ?? obligationState === "PAID") {
    const operation = crypto.randomUUID()
    const attempt = crypto.randomUUID()
    await db.query(
      `insert into public.provider_operations(id, idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
       values ($1,$2,'CREATE_PAYMENT_INTENT',$3,$4,$5,$6,'SUCCEEDED')`,
      [operation, crypto.randomUUID(), managed ? "INVOICE" : "UPFRONT", obligationOwner, order, obligation],
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
      [crypto.randomUUID(), obligation, order, obligationOwner, attempt],
    )
  }
  return { quote, order, obligation }
}

describe("close billing prerequisites", () => {
  it("closes a paid Guided case and refuses an unpaid one, a missing receipt, a failed payment and an unconfirmed checkout", async () => {
    await prepare("GUIDED")
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    expect((await row()).status).not.toBe("CLOSED")
    expect(await events()).toHaveLength(0)
    expect(await audits()).toHaveLength(0)

    await commercial({ track: "GUIDED", obligation: "DUE", receipt: false })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "GUIDED", obligation: "FAILED", receipt: false })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: false })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "GUIDED", obligation: "DUE", receipt: false, attempt: true })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    expect((await row()).closed_at).toBeNull()
    expect(await events()).toHaveLength(0)

    await wipeCommercial()
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: true })
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("success")
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("success")
    const closed = await row()
    expect(closed.status).toBe("CLOSED")
    expect(closed.work_stage).toBe("FINISHED")
    expect(closed.outcome).toBe("RESTORED")
    expect(closed.closure_summary).toBe(summary)
    expect(closed.closed_at).not.toBeNull()
  })

  it("closes a settled qualifying Managed case and an unsuccessful case without a fee, and refuses a contradictory fee", async () => {
    await prepare("MANAGED")
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await commercial({ track: "MANAGED", obligation: "DUE", receipt: false })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await db.exec("update public.payment_obligations set state='PAID'")
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "MANAGED", obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("success")
    expect((await row()).status).toBe("CLOSED")

    await prepare("MANAGED", "OUTCOME_REVIEW", reviewCase)
    expect((await command("close", { outcome: "NOT_REMOVED", summary }, undefined, key(), reviewCase)).status).toBe("success")
    expect((await row(reviewCase)).status).toBe("CLOSED")

    await db.exec(`update public.cases set status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW', outcome=null, closure_summary='', closed_at=null where id='${caseId}'`)
    await wipeCommercial()
    await prepare("MANAGED")
    expect((await command("close", { outcome: "NOT_RESTORED", summary })).status).toBe("success")
    expect((await row()).status).toBe("CLOSED")

    await db.exec(`update public.cases set status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW', outcome=null, closure_summary='', closed_at=null where id='${caseId}'`)
    await commercial({ track: "MANAGED", obligation: "DUE", receipt: false })
    expect((await command("close", { outcome: "NOT_RESTORED", summary })).status).toBe("prerequisite")
    expect((await row()).status).not.toBe("CLOSED")
    await db.exec("update public.payment_obligations set state='VOID'")
    expect((await command("close", { outcome: "NOT_RESTORED", summary })).status).toBe("success")
  })

  it("refuses the wrong customer, the wrong case and a second order", async () => {
    await prepare("GUIDED")
    await commercial({ track: "GUIDED", orderCustomerId: otherCustomer, obligationCustomerId: otherCustomer, obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "GUIDED", orderCaseId: reviewCase, obligationCaseId: reviewCase, obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    await wipeCommercial()
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: true })
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    expect((await row()).status).not.toBe("CLOSED")
    expect(await events()).toHaveLength(0)
  })

  it("keeps a withdrawal cancelled only when the commercial rule still holds", async () => {
    await prepare("GUIDED", "INITIAL_REVIEW")
    expect((await command("close", { outcome: "WITHDRAWN", summary })).status).toBe("prerequisite")
    expect((await row()).status).not.toBe("CANCELLED")
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "WITHDRAWN", summary })).status).toBe("success")
    expect((await row()).status).toBe("CANCELLED")
    expect((await row()).work_stage).toBe("FINISHED")

    await prepare("MANAGED", "INITIAL_REVIEW", reviewCase)
    expect((await command("close", { outcome: "WITHDRAWN", summary }, undefined, key(), reviewCase)).status).toBe("success")
    expect((await row(reviewCase)).status).toBe("CANCELLED")
    await db.exec(`update public.cases set status='UNDER_REVIEW', work_stage='INITIAL_REVIEW', outcome=null, closure_summary='', closed_at=null where id='${reviewCase}'`)
    await commercial({ track: "MANAGED", caseId: reviewCase, obligation: "PAID", receipt: true })
    expect((await command("close", { outcome: "WITHDRAWN", summary }, undefined, key(), reviewCase)).status).toBe("prerequisite")
    expect((await row(reviewCase)).status).not.toBe("CANCELLED")
  })

  it("preserves a stale version, an unauthorised operator, a repeated close and the other commands", async () => {
    await prepare("GUIDED")
    await commercial({ track: "GUIDED", obligation: "PAID", receipt: true })
    const version = (await row()).workflow_version
    expect((await command("note", { visibility: "INTERNAL" })).status).toBe("success")
    expect((await command("close", { outcome: "RESTORED", summary }, version)).status).toBe("conflict")
    expect((await row()).status).not.toBe("CLOSED")
    expect(await rpc("admin_case_command_v1", ["bad", key(), caseId, (await row()).workflow_version, "close", { note, outcome: "RESTORED", summary }])).toEqual({ status: "unauthorized" })

    const request = key()
    expect((await command("close", { outcome: "RESTORED", summary }, undefined, request)).status).toBe("success")
    expect((await command("close", { outcome: "RESTORED", summary }, (await row()).workflow_version - 1, request)).status).toBe("success")
    expect((await events()).filter(item => item.event === "close")).toHaveLength(1)
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("denied")
    expect((await row()).status).toBe("CLOSED")

    await prepare("MANAGED", "OUTCOME_REVIEW", reviewCase)
    expect((await command("record_outcome", { outcome: "NOT_REMOVED", summary }, undefined, key(), reviewCase)).status).toBe("success")
    expect((await row(reviewCase)).status).not.toBe("CLOSED")
    for (const role of ["anon", "authenticated", "service_role"]) {
      const privilege = await db.query<{ ok: boolean }>("select has_function_privilege($1,'admin_private.case_close_billing_ready_v1(public.cases,text)','EXECUTE') as ok", [role])
      expect(privilege.rows[0].ok).toBe(false)
    }
    const service = await db.query<{ ok: boolean }>("select has_function_privilege('service_role','public.admin_case_command_v1(text,uuid,uuid,integer,text,jsonb)','EXECUTE') as ok")
    expect(service.rows[0].ok).toBe(true)
  })
})
