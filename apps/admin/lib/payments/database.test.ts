import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "77777777-7777-4777-8777-777777777777"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const otherAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const reviewCase = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value = secret()) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type RpcResult = Record<string, unknown> & { status?: string; id?: string; version?: number; orderId?: string; obligationId?: string; quoteVersionId?: string }

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
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
  ]) await db.exec(read(name))
}, 60000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.quote_events disable trigger quote_events_immutable;
    alter table public.price_version_events disable trigger price_version_events_immutable;
    alter table public.price_versions disable trigger price_versions_protect;
    alter table public.price_versions disable trigger price_versions_overlap;
    alter table public.payment_ledger disable trigger payment_ledger_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,admin_private.payment_command_receipts,admin_private.stripe_event_receipts,admin_private.job_outbox,admin_private.jobs,public.payment_ledger,public.payment_receipts,public.payment_invoices,public.payment_attempts,public.provider_operations,public.saved_payment_methods,public.payment_obligations,public.success_fee_approvals,public.payment_consents,public.stripe_customer_maps,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.authorization_records,public.agreement_versions,public.location_manager_access,public.case_tasks,public.case_work_events,admin_private.case_command_receipts,public.price_version_events cascade;
    delete from public.price_versions where seed_key is null;
    update public.price_versions set status='APPROVED', retired_at=null, retired_by=null, effective_to=null, record_version=1 where seed_key is not null;
    alter table public.price_versions enable trigger price_versions_protect;
    alter table public.price_versions enable trigger price_versions_overlap;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.quote_events enable trigger quote_events_immutable;
    alter table public.price_version_events enable trigger price_version_events_immutable;
    alter table public.payment_ledger enable trigger payment_ledger_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into auth.users values('${otherAuth}','other@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com') on conflict (id) do update set email=excluded.email;
    insert into public.customers(id,full_name,email) values('${otherCustomer}','Other','other@example.com') on conflict (id) do update set email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${reviewCase}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;
    alter table public.cases disable trigger cases_workflow_version;
    update public.cases set service_track='UNDECIDED', status='RECEIVED', work_stage='INITIAL_REVIEW', workflow_version=1, outcome=null, assigned=false, next_action='', next_action_at=null where id in ('${caseId}','${reviewCase}');
    alter table public.cases enable trigger cases_workflow_version;`)
})

async function verify(id = customer, email = "alex@example.com") {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value", [id, email, uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified'", [id, business, uid, "Companies House match discussed on a live call."])
}

async function priceId(code: string) {
  return (await db.query<{ id: string }>("select id from public.price_versions where service_code=$1 and seed_key is not null", [code])).rows[0].id
}

async function createDraft(overrides: Record<string, unknown> = {}) {
  const serviceCode = String(overrides.serviceCode || "GUIDED_RELAUNCH")
  return rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode, customerId: customer, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions, Manager access, and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId(serviceCode), ...overrides, serviceCode,
  }, null])
}

async function acceptQuote(serviceCode = "GUIDED_RELAUNCH", extras: Record<string, unknown> = {}) {
  await verify()
  const draft = await createDraft({ serviceCode, ...extras })
  await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version])
  await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id }, (draft!.version as number) + 1])
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
  const pending = secretHash(), session = secretHash()
  await rpc("customer_action_exchange_v1", [issued!.id, hash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  return { accepted, session, quoteId: draft!.id as string }
}

async function caseVersion(id = caseId) {
  return (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [id])).rows[0].workflow_version
}

async function caseCmd(operation: string, data: Record<string, unknown>, id = caseId) {
  return rpc("admin_case_command_v1", [token, key(), id, await caseVersion(id), operation, {
    note: "Reviewed the caller’s request and confirmed the details.", ...data,
  }])
}

async function guidedToPaymentRequired() {
  await caseCmd("plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null })
  await caseCmd("transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd("transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd("transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
}

describe("stripe payments SQL", () => {
  it("creates one Guided upfront obligation from the immutable order and not from Checkout return", async () => {
    const { accepted } = await acceptQuote()
    expect(accepted).toMatchObject({ status: "success", paymentCreated: false, orderState: "ACCEPTED_AWAITING_PAYMENT" })
    const obligations = await db.query<{ amount_minor: number; state: string; kind: string }>("select amount_minor, state, kind from public.payment_obligations")
    expect(obligations.rows).toEqual([{ amount_minor: 9900, state: "DUE", kind: "UPFRONT" }])
    expect((await db.query<{ amount_minor: number }>("select amount_minor from public.service_orders")).rows[0].amount_minor).toBe(9900)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts")).rows[0].n).toBe(0)
    await expect(db.query("update public.payment_obligations set amount_minor=1")).rejects.toThrow(/immutable/i)
  })

  it("marks paid only from a signed provider event and stays monotonic", async () => {
    const { accepted } = await acceptQuote()
    const obligationId = accepted!.obligationId as string
    const start = await rpc("customer_payment_command_v1", ["x".repeat(64), key(), "start_checkout", {}])
    expect(start?.status).toBe("unavailable")
    const hash = secretHash()
    const issued = await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: accepted!.orderId, expiresAt: actionExpiry(), secretHash: hash,
    }, 1])
    expect(issued?.status).toBe("success")
    const pending = secretHash(), session = secretHash()
    await rpc("customer_action_exchange_v1", [issued!.id, hash, pending])
    await rpc("customer_action_begin_otp_v1", [pending])
    await rpc("customer_action_confirm_otp_sent_v1", [pending])
    await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
    const checkout = await rpc("customer_payment_command_v1", [session, key(), "start_checkout", { idempotencyKey: key() }])
    expect(checkout).toMatchObject({ status: "success", mode: "payment", amountMinor: 9900 })
    const retry = await rpc("customer_payment_command_v1", [session, key(), "start_checkout", { idempotencyKey: checkout!.idempotencyKey }])
    expect(retry?.providerOperationId).toBe(checkout?.providerOperationId)
    await rpc("payment_record_provider_refs_v1", [checkout!.providerOperationId, "cs_test_paid1", "checkout.session"])
    const paid = await rpc("payment_apply_provider_event_v1", ["evt_paid_1", "checkout.session.completed", "cs_test_paid1", { chargeId: "ch_test" }])
    expect(paid).toMatchObject({ status: "success" })
    expect((await db.query<{ state: string }>("select state from public.payment_obligations where id=$1", [obligationId])).rows[0].state).toBe("PAID")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts")).rows[0].n).toBe(1)
    expect(await rpc("payment_apply_provider_event_v1", ["evt_paid_1", "checkout.session.completed", "cs_test_paid1", {}])).toMatchObject({ duplicate: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts")).rows[0].n).toBe(1)
    expect(await rpc("payment_apply_provider_event_v1", ["evt_fail_later", "payment_intent.payment_failed", "cs_test_paid1", { failureCode: "card_declined" }])).toMatchObject({ status: "success" })
    expect((await db.query<{ state: string }>("select state from public.payment_obligations where id=$1", [obligationId])).rows[0].state).toBe("PAID")
    await expect(db.query("update public.payment_obligations set state='FAILED' where id=$1", [obligationId])).rejects.toThrow(/regress/i)
  })

  it("leaves unpaid after a failed webhook and denies guessed IDs", async () => {
    const { accepted } = await acceptQuote()
    const hash = secretHash()
    await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: accepted!.orderId, expiresAt: actionExpiry(), secretHash: hash,
    }, 1])
    expect((await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: otherCustomer, expiresAt: actionExpiry(), secretHash: secretHash(),
    }, 1]))?.status).toMatch(/conflict|denied|invalid/)
    expect(await rpc("customer_payment_command_v1", [secretHash(), key(), "start_checkout", {}])).toMatchObject({ status: "unavailable" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations where state='PAID'")).rows[0].n).toBe(0)
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.payment_obligations','SELECT') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.payment_receipts','SELECT') as ok", [role])).rows[0].ok).toBe(false)
    }
  })

  it("does not create a Managed success-fee obligation until approval of a qualifying outcome", async () => {
    const { accepted } = await acceptQuote("MANAGED_RELAUNCH")
    expect(accepted).toMatchObject({ orderState: "ACCEPTED_SUCCESS_FEE" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations")).rows[0].n).toBe(0)
    const hash = secretHash()
    const issued = await rpc("admin_payment_command_v1", [token, key(), "issue_managed_setup_action", {
      serviceOrderId: accepted!.orderId, expiresAt: actionExpiry(), secretHash: hash,
    }, 1])
    const pending = secretHash(), session = secretHash()
    await rpc("customer_action_exchange_v1", [issued!.id, hash, pending])
    await rpc("customer_action_begin_otp_v1", [pending])
    await rpc("customer_action_confirm_otp_sent_v1", [pending])
    await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
    expect(await rpc("customer_payment_command_v1", [session, key(), "start_checkout", {}])).toMatchObject({ status: "denied" })
    const consent = await rpc("customer_payment_command_v1", [session, key(), "confirm_consent", { accepted: true }])
    expect(consent).toMatchObject({ status: "success" })
    const setup = await rpc("customer_payment_command_v1", [session, key(), "start_checkout", { idempotencyKey: key() }])
    expect(setup).toMatchObject({ status: "success", mode: "setup", amountMinor: 0 })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations")).rows[0].n).toBe(0)
    await rpc("payment_ensure_customer_map_v1", [customer, "cus_testmanaged1"])
    await rpc("payment_apply_provider_event_v1", ["evt_setup_1", "setup_intent.succeeded", "seti_test", {
      stripeCustomerId: "cus_testmanaged1", paymentMethodId: "pm_testsaved1", brand: "visa", last4: "4242", expMonth: 12, expYear: 2030,
      serviceOrderId: accepted!.orderId,
    }])
    expect((await db.query<{ status: string }>("select status from public.saved_payment_methods")).rows[0].status).toBe("USABLE")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations")).rows[0].n).toBe(0)
    await db.query("update public.cases set outcome='PARTIALLY_RESTORED', work_stage='OUTCOME_REVIEW' where id=$1", [caseId])
    expect((await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", {
      serviceOrderId: accepted!.orderId, evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Outcome matches the accepted success definition.",
    }, 1]))?.status).toBe("denied")
    await db.query("update public.cases set outcome='NOT_RESTORED' where id=$1", [caseId])
    expect((await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", {
      serviceOrderId: accepted!.orderId, evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Outcome matches the accepted success definition.",
    }, 1]))?.status).toBe("denied")
    await db.query("update public.cases set outcome='RESTORED' where id=$1", [caseId])
    await db.query("update public.admin_sessions set created_at=now()-interval '6 minutes'")
    expect((await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", {
      serviceOrderId: accepted!.orderId, evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Outcome matches the accepted success definition.",
    }, 1]))?.status).toBe("reauth_required")
    await db.query("update public.admin_sessions set created_at=now()")
    const approved = await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", {
      serviceOrderId: accepted!.orderId, evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Outcome matches the accepted success definition.",
    }, 1])
    expect(approved).toMatchObject({ status: "success" })
    const replay = await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", {
      serviceOrderId: accepted!.orderId, evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Outcome matches the accepted success definition.",
    }, 1])
    expect(replay?.obligationId).toBe(approved?.obligationId)
    expect((await db.query<{ amount_minor: number; kind: string }>("select amount_minor, kind from public.payment_obligations")).rows[0]).toEqual({ amount_minor: 29900, kind: "SUCCESS_FEE" })
    const collect = await rpc("payment_collect_prepare_v1", [approved!.obligationId])
    expect(collect).toMatchObject({ status: "success", amountMinor: 29900 })
    const again = await rpc("payment_collect_prepare_v1", [approved!.obligationId])
    expect(again?.idempotencyKey).toBe(collect?.idempotencyKey)
    await rpc("payment_record_provider_refs_v1", [collect!.providerOperationId, "pi_test_off1", "payment_intent"])
    await rpc("payment_apply_provider_event_v1", ["evt_sca", "payment_intent.requires_action", "pi_test_off1", {}])
    expect((await db.query<{ state: string }>("select state from public.payment_obligations")).rows[0].state).toBe("AUTHENTICATION_REQUIRED")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts")).rows[0].n).toBe(0)
  })

  it("blocks Guided PREPARATION until provider-confirmed payment and Managed until consent plus setup", async () => {
    await acceptQuote()
    await guidedToPaymentRequired()
    expect(await caseCmd("transition", { target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })).toEqual({ status: "prerequisite" })
    await db.query("update public.payment_obligations set state='PAID'")
    expect((await caseCmd("transition", { target: "PREPARATION", nextAction: "Prepare the pack", due: null }))?.status).toBe("success")
    expect((await caseCmd("transition", { target: "READY_TO_SUBMIT", nextAction: "Submit when ready", due: null }))?.status).toBe("prerequisite")
  })

  it("creates no Guard subscription or monitoring activation", async () => {
    const { accepted } = await acceptQuote("RELAUNCH_GUARD", { caseId: null, locationId: location })
    expect(accepted).toMatchObject({ orderState: "ACCEPTED_RECURRING", monitoringActivated: false })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.monitoring_requests where status='ACTIVE'")).rows[0].n).toBe(0)
  })

  it("reissues expired payment actions and receives webhook events once", async () => {
    const { accepted } = await acceptQuote()
    const firstHash = secretHash()
    const first = await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: accepted!.orderId, expiresAt: actionExpiry(), secretHash: firstHash,
    }, 1])
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expires_at=now()-interval '1 minute' where id=$1", [first!.id])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    const second = await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: accepted!.orderId, expiresAt: actionExpiry(), secretHash: secretHash(),
    }, 1])
    expect(second?.status).toBe("success")
    expect(second?.id).not.toBe(first?.id)
    const received = await rpc("payment_receive_stripe_event_v1", ["evt_dup", "checkout.session.completed", "cs_x"])
    const again = await rpc("payment_receive_stripe_event_v1", ["evt_dup", "checkout.session.completed", "cs_x"])
    expect(received).toMatchObject({ status: "success", duplicate: false })
    expect(again).toMatchObject({ status: "success", duplicate: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox where topic='PROCESS_STRIPE_EVENT'")).rows[0].n).toBe(1)
  })
})
