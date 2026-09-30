import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const otherLocation = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value = secret()) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type RpcResult = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  reason?: string
  replay?: boolean
  observationId?: string
  communicationId?: string
  caseId?: string
  publicRef?: string
}

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
    readdirSync(dir).find(n => n.endsWith("_guard_onboarding_activation_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_guard_subscriptions_billing_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_guard_manual_checks_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_guard_alerts_escalation_v1.sql"))!,
  ]) await db.exec(read(name))
}, 120000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.quote_events disable trigger quote_events_immutable;
    alter table public.price_version_events disable trigger price_version_events_immutable;
    alter table public.price_versions disable trigger price_versions_protect;
    alter table public.price_versions disable trigger price_versions_overlap;
    alter table public.guard_coverage_events disable trigger guard_coverage_events_immutable;
    alter table public.guard_subscription_events disable trigger guard_subscription_events_immutable;
    alter table public.guard_recurring_consents disable trigger guard_recurring_consents_immutable;
    alter table public.guard_provider_price_maps disable trigger guard_provider_price_maps_immutable;
    alter table public.guard_subscriptions disable trigger guard_subscriptions_protect;
    alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    alter table public.guard_alert_events disable trigger guard_alert_events_immutable;
    alter table public.guard_alert_observations disable trigger guard_alert_observations_protect;
    alter table public.guard_alert_notifications disable trigger guard_alert_notifications_protect;
    alter table public.guard_alert_cases disable trigger guard_alert_cases_protect;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,admin_private.guard_command_receipts,admin_private.guard_subscription_receipts,admin_private.guard_check_receipts,admin_private.guard_check_generation_blockers,admin_private.guard_alert_receipts,admin_private.job_outbox,admin_private.jobs,admin_private.email_suppressions,public.provider_operations,public.payment_ledger,public.guard_alert_notifications,public.guard_alert_cases,public.guard_alert_events,public.guard_alert_observations,public.guard_service_actions,public.guard_alerts,public.guard_check_observations,public.guard_check_attempts,public.guard_check_obligation_events,public.guard_check_obligations,public.guard_check_schedule_versions,public.guard_reconciliation_issues,public.guard_reconciliation_targets,public.guard_reconciliation_runs,public.guard_reminder_records,public.guard_refunds,public.guard_disputes,public.guard_billing_adjustments,public.guard_price_change_offers,public.guard_subscription_invoices,public.guard_recurring_consents,public.guard_subscription_events,public.guard_subscriptions,public.guard_continuations,public.guard_provider_price_maps,public.guard_activation_exceptions,public.guard_coverage_events,public.guard_baselines,public.guard_rota_assignments,public.guard_permissions,public.guard_included_offers,public.guard_billing,public.guard_coverages,public.guard_onboarding_locations,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.success_fee_approvals,public.location_manager_access,public.location_manager_access_events,public.case_document_events,public.case_document_versions,public.case_documents,public.monitoring_request_events,public.monitoring_requests,public.price_version_events cascade;
    delete from public.communications where guard_alert_id is not null or lifecycle is not null;
    delete from public.cases where source='GUARD_ALERT';
    delete from public.price_versions where seed_key is null;
    update public.price_versions set status='APPROVED', retired_at=null, retired_by=null, effective_to=null, record_version=1 where seed_key is not null;
    alter table public.price_versions enable trigger price_versions_protect;
    alter table public.price_versions enable trigger price_versions_overlap;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.quote_events enable trigger quote_events_immutable;
    alter table public.price_version_events enable trigger price_version_events_immutable;
    alter table public.guard_coverage_events enable trigger guard_coverage_events_immutable;
    alter table public.guard_subscription_events enable trigger guard_subscription_events_immutable;
    alter table public.guard_recurring_consents enable trigger guard_recurring_consents_immutable;
    alter table public.guard_provider_price_maps enable trigger guard_provider_price_maps_immutable;
    alter table public.guard_subscriptions enable trigger guard_subscriptions_protect;
    alter table public.location_manager_access_events enable trigger location_manager_access_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    alter table public.guard_alert_events enable trigger guard_alert_events_immutable;
    alter table public.guard_alert_observations enable trigger guard_alert_observations_protect;
    alter table public.guard_alert_notifications enable trigger guard_alert_notifications_protect;
    alter table public.guard_alert_cases enable trigger guard_alert_cases_protect;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex','alex@example.com','+441234567890') on conflict (id) do update set email=excluded.email, phone=excluded.phone;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name,business_profile_url) values('${location}','${business}','UK','High Street','https://maps.google.com/?cid=1') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name,business_profile_url) values('${otherLocation}','${business}','UK','Side Street','https://maps.google.com/?cid=2') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'UNDECIDED') on conflict (id) do nothing;
    alter table public.cases disable trigger cases_workflow_version;
    update public.cases set service_track='UNDECIDED', status='RECEIVED', work_stage='INITIAL_REVIEW', workflow_version=1, outcome=null where id='${caseId}';
    alter table public.cases enable trigger cases_workflow_version;`)
})

async function verify() {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value", [customer, "alex@example.com", uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence", [customer, business, uid, "Companies House match discussed on a live call."])
}

async function priceId(code: string) {
  return (await db.query<{ id: string }>("select id from public.price_versions where service_code=$1 and seed_key is not null", [code])).rows[0].id
}

async function completeOtp(actionId: string, hash: string) {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
  return session
}

async function acceptGuardOrder() {
  const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode: "RELAUNCH_GUARD", customerId: customer, businessId: business, caseId: null, locationId: location,
    priceVersionId: await priceId("RELAUNCH_GUARD"),
    scope: "Monitor this exact location after access and permission are confirmed.",
    exclusions: "Payment collection, Google decisions, and automatic activation are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id, quoteVersionId: draft!.quoteVersionId }, (draft!.version || 1) + 1]))?.status).toBe("success")
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
  const session = await completeOtp(issued?.id as string, hash)
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted?.status).toBe("success")
  return String(accepted?.orderId)
}

async function mappingId(requestId: string, locationId = location) {
  return (await db.query<{ id: string }>("select id from public.guard_onboarding_locations where monitoring_request_id=$1 and location_id=$2 and status<>'REMOVED'", [requestId, locationId])).rows[0].id
}

async function coverageVersion(id: string) {
  return (await db.query<{ record_version: number }>("select record_version from public.guard_coverages where id=$1", [id])).rows[0].record_version
}

async function acceptPermission(coverageId: string) {
  const hash = secretHash()
  const issued = await rpc("admin_guard_command_v1", [token, key(), "issue_permission_action", { coverageId, expiresAt: actionExpiry(), secretHash: hash }, null])
  const session = await completeOtp(issued!.id!, hash)
  expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])).toMatchObject({ status: "success" })
}

async function prepareOperational(coverageId: string) {
  const row = (await db.query<{ id: string; record_version: number; status: string }>(
    "select m.id, m.record_version, m.status from public.guard_onboarding_locations m join public.guard_coverages g on g.onboarding_location_id=m.id where g.id=$1",
    [coverageId],
  )).rows[0]
  if (row && row.status !== "READY_FOR_ONBOARDING") {
    expect(await rpc("admin_guard_command_v1", [token, key(), "mark_mapping_ready", { mappingId: row.id }, row.record_version])).toMatchObject({ status: "success" })
  }
  await acceptPermission(coverageId)
  const coverageLocation = (await db.query<{ location_id: string }>("select location_id from public.guard_coverages where id=$1", [coverageId])).rows[0].location_id
  await db.query("insert into public.location_manager_access(business_id,location_id,status,access_level,verified_at,verified_by,evidence) values($1,$2,'VERIFIED','MANAGER',now(),$3,$4) on conflict (location_id) do update set status='VERIFIED', access_level='MANAGER', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence, revoked_at=null, revoked_by=null, revocation_reason=''", [business, coverageLocation, uid, "Manager access confirmed on a live screenshare."])
  expect((await rpc("admin_guard_command_v1", [token, key(), "record_baseline", {
    coverageId, profileUrl: "https://maps.google.com/?cid=1", displayedBusinessName: "Bakery",
    profileAvailability: "AVAILABLE", reviewCount: 10, rating: 4.5, latestReviewReference: "rev-1",
    notes: "Manual capture of the current profile and review counts.",
  }, await coverageVersion(coverageId)]))?.status).toBe("success")
  expect((await rpc("admin_guard_command_v1", [token, key(), "assign_rota", { coverageId }, await coverageVersion(coverageId)]))?.status).toBe("success")
}

async function createIncludedCoverage(targetLocation = location) {
  await verify()
  const recoveryCase = targetLocation === location ? caseId : crypto.randomUUID()
  if (targetLocation !== location) {
    await db.query("insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values($1,'PROFILE_RECOVERY',$2,$3,$4,'Profile suspended','2026-01-01',now(),now(),'UNDECIDED')", [recoveryCase, customer, business, targetLocation])
  }
  await db.exec(`alter table public.cases disable trigger cases_workflow_version;
    update public.cases set service_track='MANAGED', status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW' where id='${recoveryCase}';
    alter table public.cases enable trigger cases_workflow_version;`)
  const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode: "MANAGED_RELAUNCH", customerId: customer, businessId: business, caseId: recoveryCase, locationId: targetLocation,
    priceVersionId: await priceId("MANAGED_RELAUNCH"),
    scope: "Managed recovery for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id }, (draft!.version || 1) + 1]))?.status).toBe("success")
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
  const session = await completeOtp(issued!.id!, hash)
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  await db.exec(`alter table public.cases disable trigger cases_workflow_version;
    update public.cases set status='CLOSED', work_stage='FINISHED', outcome='RESTORED' where id='${recoveryCase}';
    alter table public.cases enable trigger cases_workflow_version;`)
  const doc = crypto.randomUUID(), version = crypto.randomUUID()
  await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Outcome evidence',$3)", [doc, recoveryCase, uid])
  await db.query("insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by) values($1,$2,1,'outcome.png','image/png',1200,'evidence-test', $3, 'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)", [
    version, doc, `cases/${recoveryCase}/documents/${doc}/versions/${version}`, uid,
  ])
  await db.query("insert into public.success_fee_approvals(service_order_id,case_id,quote_version_id,outcome,success_definition,outcome_evidence_version_id,evidence_note,approval_reason,amount_minor,currency,discount_amount_minor,tax_behaviour,tax_amount_minor,payment_method_ready,approved_by) select o.id,o.case_id,o.quote_version_id,'RESTORED','Restored the listed profile.', $1, 'Outcome evidence accepted after review.', 'Approved after the restored outcome evidence was checked.', o.amount_minor,o.currency,0,o.tax_behaviour,o.tax_amount_minor,false,$2 from public.service_orders o where o.id=$3", [version, uid, accepted!.orderId])
  const offer = await rpc("admin_guard_command_v1", [token, key(), "create_included_offer", { caseId: recoveryCase, serviceOrderId: accepted!.orderId }, null])
  expect(offer?.status).toBe("success")
  return offer!.id!
}

async function activateIncluded(targetLocation = location) {
  const coverageId = await createIncludedCoverage(targetLocation)
  await prepareOperational(coverageId)
  expect((await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId }, await coverageVersion(coverageId)]))?.status).toBe("success")
  return coverageId
}

async function activateDirectPaid() {
  await verify()
  const requestId = crypto.randomUUID()
  await db.query(
    "insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,source,intake_snapshot,terms_accepted_at) values($1,$2,$3,$4,$5,'REQUESTED',1,'START_MONITORING','{}',now())",
    [requestId, crypto.randomUUID(), customer, business, location],
  )
  const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
    mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
  }, null])
  await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${created!.id}'::uuid, 'CURRENT', now() + interval '30 days', 'PROVIDER')`)
  await prepareOperational(created!.id!)
  expect((await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)]))?.status).toBe("success")
  return created!.id!
}

async function approveSchedule(from = "2020-01-01") {
  const existing = (await db.query<{ n: number }>(
    "select count(*)::int as n from public.guard_check_schedule_versions where status='APPROVED' and effective_from<=$1::date and (effective_to is null or effective_to>=$1::date)",
    [from],
  )).rows[0].n
  if (existing > 0) return
  await db.query(
    "insert into public.guard_check_schedule_versions(timezone,morning_start,morning_end,evening_start,evening_end,checks_per_day,includes_weekends,includes_bank_holidays,effective_from,status,created_by,approved_at,approved_by) values('Europe/London','09:00','11:00','17:00','19:00',2,true,true,$1,'APPROVED',$2,now(),$2)",
    [from, uid],
  )
}

function healthyPayload(overrides: Record<string, unknown> = {}) {
  return {
    classification: "HEALTHY",
    profileAvailability: "AVAILABLE",
    locationIdentified: true,
    displayedBusinessName: "Bakery",
    reviewCount: 10,
    rating: 4.5,
    ratingAvailable: true,
    latestReviewReference: "rev-1",
    profileUrl: "https://maps.google.com/?cid=1",
    notes: "Manual morning observation.",
    ...overrides,
  }
}

async function openWindow(coverageId: string, serviceDate = "2026-09-30") {
  await approveSchedule()
  await rpc("guard_maintain_checks_v1", [`${serviceDate}T08:00:00Z`, serviceDate])
  return (await db.query<{ id: string; window_code: string; record_version: number }>(
    "select id, window_code, record_version from public.guard_check_obligations where coverage_id=$1 and service_date=$2 order by window_code",
    [coverageId, serviceDate],
  )).rows
}

async function completeWindow(obligationId: string, version: number, payload: Record<string, unknown>, at = new Date().toISOString()) {
  const claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId }, version, at])
  return rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId, ...payload }, claimed!.version, at])
}

async function process(observationId: string) {
  return rpc("guard_process_alert_candidate_v1", [observationId])
}

async function count(table: string, where = "") {
  return (await db.query<{ n: number }>(`select count(*)::int as n from ${table} ${where}`)).rows[0].n
}

describe("guard alerts SQL", () => {
  it("creates one unresolved episode, attaches repeats, and ignores HEALTHY", async () => {
    const coverageId = await activateIncluded()
    const [evening, morning] = await openWindow(coverageId)
    const healthy = await completeWindow(morning.id, morning.record_version, healthyPayload())
    expect(healthy?.status).toBe("success")
    expect(await process(String(healthy!.observationId))).toMatchObject({ status: "ignored" })
    expect(await count("public.guard_alerts")).toBe(0)

    const changed = await completeWindow(evening.id, evening.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }), "2026-09-30T16:15:00Z")
    const opened = await process(String(changed!.observationId))
    expect(opened).toMatchObject({ status: "success" })
    expect(await count("public.guard_alerts")).toBe(1)
    expect(await process(String(changed!.observationId))).toMatchObject({ status: "success", replay: true })

    await rpc("guard_maintain_checks_v1", ["2026-10-01T08:00:00Z", "2026-10-01"])
    const nextMorning = (await db.query<{ id: string; record_version: number }>("select id, record_version from public.guard_check_obligations where coverage_id=$1 and service_date='2026-10-01' and window_code='MORNING'", [coverageId])).rows[0]
    const extra = await completeWindow(nextMorning.id, nextMorning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", reviewCount: 8,
    }), "2026-10-01T08:15:00Z")
    const attached = await process(String(extra!.observationId))
    expect(attached?.id).toBe(opened?.id)
    expect(await count("public.guard_alerts")).toBe(1)
    expect((await db.query<{ issue_codes: string[] }>("select issue_codes from public.guard_alerts")).rows[0].issue_codes)
      .toEqual(expect.arrayContaining(["BUSINESS_NAME_CHANGED", "REVIEW_COUNT_DECREASED"]))

    const other = await activateIncluded(otherLocation)
    const otherWindows = await openWindow(other, "2026-10-02")
    const otherObs = await completeWindow(otherWindows[1].id, otherWindows[1].record_version, healthyPayload({
      classification: "PROFILE_UNAVAILABLE", profileAvailability: "UNAVAILABLE", locationIdentified: false, ratingAvailable: false, rating: null,
    }), "2026-10-02T08:15:00Z")
    expect(await process(String(otherObs!.observationId))).toMatchObject({ status: "success" })
    expect(await count("public.guard_alerts")).toBe(2)
  })

  it("keeps INCOMPLETE internal and requires later customer-issue evidence", async () => {
    const coverageId = await activateIncluded()
    const [, morning] = await openWindow(coverageId)
    const incomplete = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "INCOMPLETE", profileAvailability: "UNKNOWN", locationIdentified: false,
      displayedBusinessName: "", reviewCount: null, ratingAvailable: false, rating: null,
    }))
    const alert = await process(String(incomplete!.observationId))
    expect(alert).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "MEDIUM", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Trying to treat incomplete capture as a customer issue.",
    }, alert!.version])).toMatchObject({ status: "denied", reason: "incomplete_only" })
    const internal = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "LOW", disposition: "INTERNAL_ONLY", reason: "Incomplete capture stays internal.",
    }, alert!.version])
    expect(internal).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "prepare_notification", {
      alertId: alert!.id, notificationKind: "INITIAL", fact: "The capture was incomplete today.", effect: "We have not confirmed a customer-facing change.", nextStep: "We will review the next complete observation.",
    }, internal!.version])).toMatchObject({ status: "denied", reason: "not_confirmed_customer_issue" })
  })

  it("requires human review, confirms notifications, and never auto-emails", async () => {
    const coverageId = await activateIncluded()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    expect(await count("admin_private.job_outbox", "where topic='SEND_EMAIL'")).toBe(0)
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Name change is visible on the live profile.",
    }, alert!.version])).toMatchObject({ status: "invalid", reason: "severity_required" })
    const ackKey = key()
    const ack = await rpc("admin_guard_alert_command_v1", [token, ackKey, "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Name change is visible on the live profile.",
    }, alert!.version])
    expect(ack).toMatchObject({ status: "success", state: "ACKNOWLEDGED" })
    expect(await rpc("admin_guard_alert_command_v1", [token, ackKey, "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Name change is visible on the live profile.",
    }, alert!.version])).toMatchObject({ replay: true })

    const prepared = await rpc("admin_guard_alert_command_v1", [token, key(), "prepare_notification", {
      alertId: alert!.id, notificationKind: "INITIAL", fact: "The displayed business name has changed.", effect: "Customers may see a different listing name.", nextStep: "Please check the Google Business Profile for this location.",
    }, ack!.version])
    expect(prepared).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "prepare_notification", {
      alertId: alert!.id, notificationKind: "INITIAL", fact: "The displayed business name has changed.", effect: "Customers may see a different listing name.", nextStep: "Please check the Google Business Profile for this location.",
    }, prepared!.version])).toMatchObject({ status: "denied", reason: "initial_already_exists" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "queue_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, sendEnabled: true, notificationsEnabled: false,
    }, prepared!.version])).toMatchObject({ status: "denied", reason: "notifications_disabled" })

    const approved = await rpc("admin_guard_alert_command_v1", [token, key(), "approve_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, fromAddress: "alerts@profilerelaunch.com",
    }, prepared!.version])
    expect(approved?.status).toBe("success")
    await db.query("update public.customers set email='new@example.com' where id=$1", [customer])
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "queue_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, sendEnabled: true, notificationsEnabled: true,
    }, approved!.version])).toMatchObject({ status: "denied", reason: "recipient_changed" })
    await db.query("update public.customers set email='alex@example.com' where id=$1", [customer])
    await verify()
    await db.query("insert into admin_private.email_suppressions(address_normalized, reason) values('alex@example.com','BOUNCED')")
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "queue_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, sendEnabled: true, notificationsEnabled: true,
    }, approved!.version])).toMatchObject({ status: "denied", reason: "recipient_suppressed" })
    await db.exec("truncate admin_private.email_suppressions")
    const queued = await rpc("admin_guard_alert_command_v1", [token, key(), "queue_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, sendEnabled: true, notificationsEnabled: true,
    }, approved!.version])
    expect(queued?.status).toBe("success")
    expect(await count("admin_private.job_outbox", "where topic='SEND_EMAIL'")).toBe(1)
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "queue_notification", {
      alertId: alert!.id, communicationId: prepared!.communicationId, sendEnabled: true, notificationsEnabled: true,
    }, queued!.version])).toMatchObject({ status: "success" })
    expect(await count("admin_private.job_outbox", "where topic='SEND_EMAIL'")).toBe(1)
  })

  it("creates one CONTACT_RECOVERY action on bounce and ACCESS_RECOVERY on missing access", async () => {
    const coverageId = await activateIncluded()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "MEDIUM", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed name change after review.",
    }, alert!.version])
    const prepared = await rpc("admin_guard_alert_command_v1", [token, key(), "prepare_notification", {
      alertId: alert!.id, notificationKind: "INITIAL", fact: "The displayed business name has changed.", effect: "Customers may see a different listing name.", nextStep: "Please check the Google Business Profile for this location.",
    }, ack!.version])
    await db.query("update public.communications set lifecycle='QUEUED', content_locked=true, sender_address='alerts@profilerelaunch.com', delivery_status='PROVIDER_ACCEPTED' where id=$1", [prepared!.communicationId])
    await db.query("delete from public.customer_contact_verifications where customer_id=$1 and channel='phone'", [customer])
    await db.query("update public.communications set delivery_status='BOUNCED' where id=$1", [prepared!.communicationId])
    expect(await count("public.guard_service_actions", "where kind='CONTACT_RECOVERY'")).toBe(1)
    expect((await db.query<{ reason_code: string }>("select reason_code from public.guard_service_actions where kind='CONTACT_RECOVERY'")).rows[0].reason_code).toBe("NO_REACHABLE_VERIFIED_CONTACT")
    await db.query("update public.communications set delivery_status='FAILED' where id=$1", [prepared!.communicationId])
    expect(await count("public.guard_service_actions", "where kind='CONTACT_RECOVERY'")).toBe(1)

    await db.query("update public.location_manager_access set status='REVOKED', revoked_at=now(), revoked_by=$2, revocation_reason='Lost manager access after review' where location_id=$1", [location, uid])
    await rpc("guard_maintain_alerts_v1", [null])
    expect(await count("public.guard_service_actions", "where kind='ACCESS_RECOVERY'")).toBe(1)
    await rpc("guard_maintain_alerts_v1", [null])
    expect(await count("public.guard_service_actions", "where kind='ACCESS_RECOVERY'")).toBe(1)
  })

  it("pauses only for missing contact/access and resumes only when readiness is restored", async () => {
    const coverageId = await activateIncluded()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed customer-facing change.",
    }, alert!.version])
    const activated = (await db.query<{ activated_at: string; included_start_at: string; included_end_at: string }>("select activated_at::text, included_start_at::text, included_end_at::text from public.guard_coverages where id=$1", [coverageId])).rows[0]
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "pause_for_recovery", {
      alertId: alert!.id, serviceActionId: crypto.randomUUID(), reason: "Trying to pause while contact and access are healthy.",
    }, ack!.version])).toMatchObject({ status: "denied" })

    await db.query("delete from public.customer_contact_verifications where customer_id=$1", [customer])
    await rpc("guard_maintain_alerts_v1", [null])
    const action = (await db.query<{ id: string }>("select id from public.guard_service_actions where coverage_id=$1 and kind='CONTACT_RECOVERY'", [coverageId])).rows[0]
    const paused = await rpc("admin_guard_alert_command_v1", [token, key(), "pause_for_recovery", {
      alertId: alert!.id, serviceActionId: action.id, reason: "No currently verified contact remains.",
    }, ack!.version])
    expect(paused).toMatchObject({ status: "success", coverageState: "PAUSED" })
    const afterPause = (await db.query<{ activated_at: string; included_start_at: string; included_end_at: string; state: string }>("select activated_at::text, included_start_at::text, included_end_at::text, state from public.guard_coverages where id=$1", [coverageId])).rows[0]
    expect(afterPause.activated_at).toBe(activated.activated_at)
    expect(afterPause.included_start_at).toBe(activated.included_start_at)
    expect(afterPause.included_end_at).toBe(activated.included_end_at)
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "resume", {
      alertId: alert!.id, reason: "Trying to resume without restored contact.",
    }, paused!.version])).toMatchObject({ status: "denied", reason: "resume_not_ready" })

    await verify()
    const resumeKey = key()
    const ready = await rpc("admin_guard_alert_command_v1", [token, resumeKey, "resume", {
      alertId: alert!.id, reason: "Contact and access are restored and readiness holds.",
    }, paused!.version])
    expect(ready).toMatchObject({ status: "success", coverageState: "ACTIVE" })
    expect((await db.query<{ activated_at: string }>("select activated_at::text from public.guard_coverages where id=$1", [coverageId])).rows[0].activated_at).toBe(activated.activated_at)
    expect(await rpc("admin_guard_alert_command_v1", [token, resumeKey, "resume", {
      alertId: alert!.id, reason: "Contact and access are restored and readiness holds.",
    }, paused!.version])).toMatchObject({ replay: true })
  })

  it("creates one intervention case without financial artefacts and assesses discount without snapshots", async () => {
    const coverageId = await activateDirectPaid()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed paid-location name change.",
    }, alert!.version])
    const quotes = await count("public.quotes")
    const orders = await count("public.service_orders")
    const payments = await count("public.payment_obligations")
    const approvals = await count("public.success_fee_approvals")
    const ops = await count("public.provider_operations")
    const snapshots = await count("public.quote_discount_snapshots")
    const created = await rpc("admin_guard_alert_command_v1", [token, key(), "create_intervention_case", {
      alertId: alert!.id, caseType: "PROFILE_RECOVERY",
    }, ack!.version])
    expect(created).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "create_intervention_case", {
      alertId: alert!.id, caseType: "PROFILE_RECOVERY",
    }, created!.version])).toMatchObject({ replay: true, caseId: created!.caseId })
    expect(await count("public.quotes")).toBe(quotes)
    expect(await count("public.service_orders")).toBe(orders)
    expect(await count("public.payment_obligations")).toBe(payments)
    expect(await count("public.success_fee_approvals")).toBe(approvals)
    expect(await count("public.provider_operations")).toBe(ops)
    expect(await count("public.quote_discount_snapshots")).toBe(snapshots)
    const cs = (await db.query<{ source: string; service_track: string; work_stage: string; location_id: string }>("select source, service_track, work_stage, location_id from public.cases where id=$1", [created!.caseId])).rows[0]
    expect(cs).toMatchObject({ source: "GUARD_ALERT", service_track: "UNDECIDED", work_stage: "INITIAL_REVIEW", location_id: location })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "link_existing_case", {
      alertId: alert!.id, caseId, 
    }, created!.version])).toMatchObject({ status: "denied" })

    const detail = await rpc("admin_guard_alert_detail_v1", [token, alert!.id])
    const discount = detail!.discount as { managedRelaunch: { eligible: boolean }; guided: { eligible: boolean } }
    expect(discount.managedRelaunch.eligible).toBe(true)
    expect(discount.guided.eligible).toBe(false)
    expect(await count("public.quote_discount_snapshots")).toBe(snapshots)
  })

  it("rejects cross-scope inserts, terminal reopening, and invalid cursors", async () => {
    const coverageId = await activateIncluded()
    const other = await activateIncluded(otherLocation)
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const otherWindows = await openWindow(other, "2026-10-02")
    const otherObs = await completeWindow(otherWindows[1].id, otherWindows[1].record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "Side Bakery",
    }), "2026-10-02T08:15:00Z")
    const changedObsId = changed!.observationId as string
    const otherObsId = otherObs!.observationId as string
    expect(changedObsId).toBeTruthy()
    expect(otherObsId).toBeTruthy()
    const alert = await process(changedObsId)
    await process(otherObsId)
    await expect(db.query(
      "insert into public.guard_alert_observations(alert_id, observation_id, issue_codes, classification) select $1, $2, change_codes, classification from public.guard_check_observations where id=$2",
      [alert!.id, otherObsId],
    )).rejects.toThrow()
    await expect(db.query(
      "insert into public.guard_alerts(coverage_id,customer_id,business_id,location_id,first_observation_id,latest_observation_id,first_observed_at,latest_observed_at) select $1,$2,$3,$4,id,id,observed_at,observed_at from public.guard_check_observations where id=$5",
      [coverageId, customer, business, otherLocation, changedObsId],
    )).rejects.toThrow()
    const dismissed = await rpc("admin_guard_alert_command_v1", [token, key(), "dismiss", {
      alertId: alert!.id, reason: "False positive after a second look at the listing.",
    }, alert!.version])
    expect(dismissed).toMatchObject({ status: "success", state: "DISMISSED" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "escalate", {
      alertId: alert!.id, severity: "CRITICAL", reason: "Trying to escalate a dismissed alert.",
    }, dismissed!.version])).toMatchObject({ status: "denied", reason: "terminal" })
    const list = await rpc("admin_guard_alert_list_v1", [token, "NEW_REVIEW", 50, "00000000-0000-4000-8000-000000000099"])
    expect(list).toMatchObject({ status: "invalid", reason: "invalid_cursor" })

    const grants = (await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='guard_alerts'")).rows[0]
    expect(grants.rls).toBe(true)
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec("begin")
      await db.exec(`set local role ${role}`)
      await expect(db.query(
        "insert into public.guard_alerts(coverage_id,customer_id,business_id,location_id,first_observation_id,latest_observation_id,first_observed_at,latest_observed_at) select coverage_id, $1, $2, location_id, id, id, observed_at, observed_at from public.guard_check_observations limit 1",
        [customer, business],
      )).rejects.toThrow()
      await db.exec("rollback")
    }
  })

  it("does not auto-resolve after a later HEALTHY observation and leaves service actions open", async () => {
    const coverageId = await activateIncluded()
    const windows = await openWindow(coverageId)
    const changed = await completeWindow(windows[1].id, windows[1].record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "MEDIUM", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed the listing name change.",
    }, alert!.version])
    const healthy = await completeWindow(windows[0].id, windows[0].record_version, healthyPayload(), "2026-09-30T16:15:00Z")
    expect(await process(String(healthy!.observationId))).toMatchObject({ status: "ignored" })
    expect((await db.query<{ state: string }>("select state from public.guard_alerts where id=$1", [alert!.id])).rows[0].state).toBe("ACKNOWLEDGED")
    await db.query("delete from public.customer_contact_verifications")
    await rpc("guard_maintain_alerts_v1", [null])
    expect(await count("public.guard_service_actions", "where state in ('OPEN','ACKNOWLEDGED')")).toBeGreaterThan(0)
    const resolved = await rpc("admin_guard_alert_command_v1", [token, key(), "resolve", {
      alertId: alert!.id, reason: "The listing was restored after review.",
    }, ack!.version])
    expect(resolved).toMatchObject({ status: "success", state: "RESOLVED" })
    expect(await count("public.guard_service_actions", "where state in ('OPEN','ACKNOWLEDGED')")).toBeGreaterThan(0)
  })

  it("records phone recovery, blocks stale versions, and only escalates upward", async () => {
    const coverageId = await activateIncluded()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed listing name change.",
    }, 0])).toMatchObject({ status: "conflict" })
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "MEDIUM", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed listing name change.",
    }, alert!.version])
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "escalate", {
      alertId: alert!.id, severity: "LOW", reason: "Trying to lower severity through escalate.",
    }, ack!.version])).toMatchObject({ status: "denied", reason: "escalation_not_upward" })
    const escalated = await rpc("admin_guard_alert_command_v1", [token, key(), "escalate", {
      alertId: alert!.id, severity: "CRITICAL", reason: "Customer impact is now broader than first thought.",
    }, ack!.version])
    expect(escalated).toMatchObject({ status: "success", severity: "CRITICAL" })
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "escalate", {
      alertId: alert!.id, severity: "CRITICAL", reason: "Already at the highest severity.",
    }, escalated!.version])).toMatchObject({ status: "denied", reason: "escalation_not_upward" })

    const prepared = await rpc("admin_guard_alert_command_v1", [token, key(), "prepare_notification", {
      alertId: alert!.id, notificationKind: "INITIAL", fact: "The displayed business name has changed.", effect: "Customers may see a different listing name.", nextStep: "Please check the Google Business Profile for this location.",
    }, escalated!.version])
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'phone',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value", [customer, "+441234567890", uid, "Verified from a live call with the customer."])
    await db.query("update public.communications set lifecycle='QUEUED', content_locked=true, sender_address='alerts@profilerelaunch.com', delivery_status='PROVIDER_ACCEPTED' where id=$1", [prepared!.communicationId])
    await db.query("update public.communications set delivery_status='BOUNCED' where id=$1", [prepared!.communicationId])
    expect((await db.query<{ reason_code: string }>("select reason_code from public.guard_service_actions where kind='CONTACT_RECOVERY'")).rows[0].reason_code).toBe("EMAIL_FAILED_PHONE_AVAILABLE")
  })

  it("denies resume after expired Direct billing or Included period and paginates queues", async () => {
    const coverageId = await activateDirectPaid()
    const [, morning] = await openWindow(coverageId)
    const changed = await completeWindow(morning.id, morning.record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const alert = await process(String(changed!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: alert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed paid-location name change.",
    }, alert!.version])
    await db.query("delete from public.customer_contact_verifications where customer_id=$1", [customer])
    await rpc("guard_maintain_alerts_v1", [null])
    const action = (await db.query<{ id: string }>("select id from public.guard_service_actions where coverage_id=$1 and kind='CONTACT_RECOVERY'", [coverageId])).rows[0]
    const paused = await rpc("admin_guard_alert_command_v1", [token, key(), "pause_for_recovery", {
      alertId: alert!.id, serviceActionId: action.id, reason: "No currently verified contact remains.",
    }, ack!.version])
    expect(paused?.status).toBe("success")
    await verify()
    await db.exec("update public.guard_billing set paid_through_at=now() - interval '1 day' where coverage_id='" + coverageId + "'")
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "resume", {
      alertId: alert!.id, reason: "Trying to resume after paid-through expired.",
    }, paused!.version])).toMatchObject({ status: "denied", reason: "resume_not_ready" })

    const included = await activateIncluded(otherLocation)
    const windows = await openWindow(included, "2026-10-02")
    const otherObs = await completeWindow(windows[1].id, windows[1].record_version, healthyPayload({
      classification: "PROFILE_UNAVAILABLE", profileAvailability: "UNAVAILABLE", locationIdentified: false, ratingAvailable: false, rating: null,
    }), "2026-10-02T08:15:00Z")
    const otherAlert = await process(String(otherObs!.observationId))
    await db.exec(`alter table public.guard_coverages disable trigger guard_coverages_protect;
      update public.guard_coverages
        set activated_at=now() - interval '40 days',
            included_start_at=now() - interval '40 days',
            included_end_at=now() - interval '10 days'
        where id='${included}';
      alter table public.guard_coverages enable trigger guard_coverages_protect;`)
    await db.query("delete from public.customer_contact_verifications where customer_id=$1", [customer])
    await rpc("guard_maintain_alerts_v1", [null])
    const includedAction = (await db.query<{ id: string }>("select id from public.guard_service_actions where coverage_id=$1 and kind='CONTACT_RECOVERY'", [included])).rows[0]
    const includedAck = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: otherAlert!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Profile is currently unavailable.",
    }, otherAlert!.version])
    const includedPaused = await rpc("admin_guard_alert_command_v1", [token, key(), "pause_for_recovery", {
      alertId: otherAlert!.id, serviceActionId: includedAction.id, reason: "No currently verified contact remains.",
    }, includedAck!.version])
    await verify()
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "resume", {
      alertId: otherAlert!.id, reason: "Trying to resume after the included period ended.",
    }, includedPaused!.version])).toMatchObject({ status: "denied", reason: "resume_not_ready" })

    const first = await rpc("admin_guard_alert_list_v1", [token, "ACKNOWLEDGED", 1, null])
    expect(first).toMatchObject({ status: "success", hasMore: true })
    const second = await rpc("admin_guard_alert_list_v1", [token, "ACKNOWLEDGED", 1, first!.nextCursor])
    expect(second?.status).toBe("success")
    expect((second as { alerts?: unknown[] })?.alerts?.[0]).toBeTruthy()
  })

  it("opens a later episode after a terminal alert and never snapshots a discount", async () => {
    const coverageId = await activateDirectPaid()
    const windows = await openWindow(coverageId)
    const firstObs = await completeWindow(windows[1].id, windows[1].record_version, healthyPayload({
      classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery",
    }))
    const first = await process(String(firstObs!.observationId))
    const ack = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: first!.id, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Confirmed the first name change.",
    }, first!.version])
    expect(await rpc("admin_guard_alert_command_v1", [token, key(), "resolve", {
      alertId: first!.id, reason: "Listing name was restored after review.",
    }, ack!.version])).toMatchObject({ status: "success", state: "RESOLVED" })
    const later = await completeWindow(windows[0].id, windows[0].record_version, healthyPayload({
      classification: "CHANGE_DETECTED", reviewCount: 4,
    }), new Date(Date.now() + 60_000).toISOString())
    const second = await process(String(later!.observationId))
    expect(second?.id).not.toBe(first?.id)
    expect(await count("public.guard_alerts")).toBe(2)
    const confirmed = await rpc("admin_guard_alert_command_v1", [token, key(), "acknowledge", {
      alertId: second!.id, severity: "MEDIUM", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "A later independent change was confirmed.",
    }, second!.version])
    expect(confirmed?.status).toBe("success")
    const snapshots = await count("public.quote_discount_snapshots")
    const detail = await rpc("admin_guard_alert_detail_v1", [token, second!.id])
    expect((detail!.discount as { managedRelaunch: { eligible: boolean } }).managedRelaunch.eligible).toBe(true)
    expect(await count("public.quote_discount_snapshots")).toBe(snapshots)
  })
})
