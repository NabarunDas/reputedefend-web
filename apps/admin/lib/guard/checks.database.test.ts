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
  generated?: number
  late?: boolean
  secondsLate?: number
  handlingSeconds?: number
  observationId?: string
  attemptId?: string
  quoteVersionId?: string
  orderId?: string
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
  ]) await db.exec(read(name))
}, 90000)

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
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,admin_private.guard_command_receipts,admin_private.guard_subscription_receipts,admin_private.guard_check_receipts,admin_private.job_outbox,admin_private.jobs,admin_private.stripe_event_receipts,public.provider_operations,public.payment_ledger,public.guard_check_observations,public.guard_check_attempts,public.guard_check_obligation_events,public.guard_check_obligations,public.guard_check_schedule_versions,public.guard_reconciliation_issues,public.guard_reconciliation_targets,public.guard_reconciliation_runs,public.guard_reminder_records,public.guard_refunds,public.guard_disputes,public.guard_billing_adjustments,public.guard_price_change_offers,public.guard_subscription_invoices,public.guard_recurring_consents,public.guard_subscription_events,public.guard_subscriptions,public.guard_continuations,public.guard_provider_price_maps,public.guard_activation_exceptions,public.guard_coverage_events,public.guard_baselines,public.guard_rota_assignments,public.guard_permissions,public.guard_included_offers,public.guard_billing,public.guard_coverages,public.guard_onboarding_locations,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.success_fee_approvals,public.location_manager_access,public.location_manager_access_events,public.case_document_events,public.case_document_versions,public.case_documents,public.monitoring_request_events,public.monitoring_requests,public.price_version_events cascade;
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

async function intake(count = 1) {
  const id = crypto.randomUUID()
  await db.query(
    "insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,source,intake_snapshot,terms_accepted_at) values($1,$2,$3,$4,$5,'REQUESTED',$6,'START_MONITORING','{}',now())",
    [id, crypto.randomUUID(), customer, business, location, count],
  )
  return id
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
  const requestId = await intake(1)
  const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
    mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
  }, null])
  await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${created!.id}'::uuid, 'CURRENT', now() + interval '30 days', 'PROVIDER')`)
  await prepareOperational(created!.id!)
  expect((await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)]))?.status).toBe("success")
  return created!.id!
}

async function approveSchedule(from = "2020-01-01") {
  await db.query(
    "insert into public.guard_check_schedule_versions(timezone,morning_start,morning_end,evening_start,evening_end,checks_per_day,includes_weekends,includes_bank_holidays,effective_from,status,created_by,approved_at,approved_by) values('Europe/London','09:00','11:00','17:00','19:00',2,true,true,$1,'APPROVED',$2,now(),$2)",
    [from, uid],
  )
}

async function maintain(now: string, serviceDate?: string) {
  return rpc("guard_maintain_checks_v1", [now, serviceDate ?? null])
}

async function obligations(coverageId: string, serviceDate: string) {
  return (await db.query<{
    id: string; window_code: string; state: string; record_version: number; missed_at: string | null
    late: boolean; seconds_late: number; handling_seconds: number | null; window_start_utc: string; window_end_utc: string
  }>("select id, window_code, state, record_version, missed_at::text, late, seconds_late, handling_seconds, window_start_utc::text, window_end_utc::text from public.guard_check_obligations where coverage_id=$1 and service_date=$2 order by window_code", [coverageId, serviceDate])).rows
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

describe("guard manual checks SQL", () => {
  it("generates exactly morning and evening for active included and direct coverage", async () => {
    const included = await activateIncluded(otherLocation)
    const direct = await activateDirectPaid()
    await approveSchedule()
    const now = "2026-09-30T08:00:00Z"
    expect(await maintain(now, "2026-09-30")).toMatchObject({ status: "success", generated: 4 })
    expect((await obligations(included, "2026-09-30")).map(row => row.window_code)).toEqual(["EVENING", "MORNING"])
    expect((await obligations(direct, "2026-09-30")).map(row => row.window_code)).toEqual(["EVENING", "MORNING"])
  })

  it("keeps exactly two obligations across duplicate and concurrent generators", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    const now = "2026-09-30T08:00:00Z"
    const [first, second] = await Promise.all([maintain(now, "2026-09-30"), maintain(now, "2026-09-30")])
    expect(first?.status).toBe("success")
    expect(second?.status).toBe("success")
    expect(await maintain(now, "2026-09-30")).toMatchObject({ status: "success", generated: 0 })
    expect(await obligations(coverageId, "2026-09-30")).toHaveLength(2)
    await expect(db.query("insert into public.guard_check_obligations(coverage_id,customer_id,business_id,location_id,service_date,window_code,schedule_version_id,rota_assignment_id,coverage_basis,timezone,local_start,local_end,window_start_utc,window_end_utc) select coverage_id,customer_id,business_id,location_id,service_date,'MORNING',schedule_version_id,rota_assignment_id,coverage_basis,timezone,local_start,local_end,window_start_utc,window_end_utc from public.guard_check_obligations where coverage_id=$1 and window_code='MORNING'", [coverageId])).rejects.toThrow()
  })

  it("uses Europe/London service dates and keeps two windows across DST", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    expect(await maintain("2026-03-29T00:30:00Z")).toMatchObject({ status: "success" })
    const spring = await obligations(coverageId, "2026-03-29")
    expect(spring).toHaveLength(2)
    expect(new Date(spring[1].window_start_utc).toISOString()).toBe("2026-03-29T08:00:00.000Z")
    expect(await maintain("2026-10-25T00:30:00Z")).toMatchObject({ status: "success" })
    const autumn = await obligations(coverageId, "2026-10-25")
    expect(autumn).toHaveLength(2)
    expect(new Date(autumn[1].window_start_utc).toISOString()).toBe("2026-10-25T09:00:00.000Z")
    expect(await maintain("2026-06-15T23:30:00Z")).toMatchObject({ status: "success" })
    expect(await obligations(coverageId, "2026-06-16")).toHaveLength(2)
    expect(await obligations(coverageId, "2026-06-15")).toHaveLength(0)
  })

  it("generates weekend and bank-holiday labelled dates and excludes inactive coverage", async () => {
    const active = await activateIncluded()
    await approveSchedule()
    for (const date of ["2026-09-26", "2026-09-27", "2026-12-25"]) {
      expect(await maintain(`${date}T08:00:00Z`, date)).toMatchObject({ status: "success" })
      expect(await obligations(active, date)).toHaveLength(2)
    }
    const beforeInactive = (await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations where coverage_id=$1", [active])).rows[0].n
    await db.query("update public.guard_coverages set state='PAUSED', paused_at=now() where id=$1", [active])
    expect(await maintain("2026-09-28T08:00:00Z", "2026-09-28")).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations where coverage_id=$1", [active])).rows[0].n).toBe(beforeInactive)
    await db.query("update public.guard_coverages set state='ACTIVE' where id=$1", [active])
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [active])
    expect(await maintain("2026-09-24T08:00:00Z", "2026-09-24")).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations where coverage_id=$1", [active])).rows[0].n).toBe(beforeInactive)
    await db.query("update public.guard_coverages set state='ENDED', ended_at=now() where id=$1", [active])
    expect(await maintain("2026-09-23T08:00:00Z", "2026-09-23")).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations where coverage_id=$1", [active])).rows[0].n).toBe(beforeInactive)
  })

  it("requires an approved schedule and an active rota", async () => {
    const coverageId = await activateIncluded()
    expect(await maintain("2026-09-30T08:00:00Z", "2026-09-30")).toMatchObject({ status: "denied", reason: "schedule_not_configured" })
    await approveSchedule()
    await db.query("update public.guard_rota_assignments set status='SUPERSEDED' where coverage_id=$1", [coverageId])
    expect(await maintain("2026-09-30T08:00:00Z", "2026-09-30")).toMatchObject({ status: "success", generated: 0 })
    expect(await obligations(coverageId, "2026-09-30")).toHaveLength(0)
  })

  it("claims once, expires abandoned claims, and retries on the same obligation", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    const morning = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "MORNING")!
    const claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:05:00Z"])
    expect(claimed).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:05:00Z"])).toMatchObject({ status: "conflict" })
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, claimed!.version, "2026-09-30T08:06:00Z"])).toMatchObject({ status: "success" })
    await maintain("2026-09-30T11:10:00Z", "2026-09-30")
    const expired = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "MORNING")!
    expect(expired.state).toBe("PENDING")
    expect((await db.query<{ n: number; outcome: string }>("select count(*)::int as n, max(outcome) as outcome from public.guard_check_attempts where obligation_id=$1", [morning.id])).rows[0]).toMatchObject({ n: 1, outcome: "ABANDONED" })
    const reclaimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, expired.record_version, "2026-09-30T11:15:00Z"])
    expect(reclaimed).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "fail", { obligationId: morning.id, reason: "Temporary profile page error during capture." }, reclaimed!.version, "2026-09-30T11:20:00Z"])).toMatchObject({ status: "success" })
    const afterFail = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "MORNING")!
    expect(afterFail.state).toBe("PENDING")
    expect(afterFail.id).toBe(morning.id)
    const retry = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, afterFail.record_version, "2026-09-30T11:21:00Z"])
    expect(retry).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_attempts where obligation_id=$1", [morning.id])).rows[0].n).toBe(3)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_observations where obligation_id=$1", [morning.id])).rows[0].n).toBe(0)
  })

  it("completes unique healthy observations and keeps late or missed history", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    const [evening, morning] = await obligations(coverageId, "2026-09-30")
    const claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:10:00Z"])
    const request = key()
    const completed = await rpc("admin_guard_check_command_v1", [token, request, "complete", { obligationId: morning.id, ...healthyPayload() }, claimed!.version, "2026-09-30T08:20:00Z"])
    expect(completed).toMatchObject({ status: "success", late: false, secondsLate: 0 })
    expect(await rpc("admin_guard_check_command_v1", [token, request, "complete", { obligationId: morning.id, ...healthyPayload() }, claimed!.version, "2026-09-30T08:20:00Z"])).toMatchObject({ status: "success", replay: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_observations where obligation_id=$1", [morning.id])).rows[0].n).toBe(1)
    expect((await obligations(coverageId, "2026-09-30")).find(row => row.id === morning.id)).toMatchObject({ late: false, missed_at: null })
    expect(completed?.handlingSeconds).toBe(600)

    expect(await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: evening.id }, evening.record_version, "2026-09-30T17:30:00Z"])).toMatchObject({ status: "success" })
    await maintain("2026-09-30T18:01:00Z", "2026-09-30")
    const eveningAfterMiss = (await obligations(coverageId, "2026-09-30")).find(row => row.id === evening.id)!
    const late = await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: evening.id, ...healthyPayload() }, eveningAfterMiss.record_version, "2026-09-30T18:10:00Z"])
    expect(late).toMatchObject({ status: "success", late: true })
    const afterLate = (await obligations(coverageId, "2026-09-30")).find(row => row.id === evening.id)!
    expect(afterLate.missed_at).toBeTruthy()
    expect(afterLate.late).toBe(true)
    expect(afterLate.seconds_late).toBeGreaterThan(0)
    await expect(db.query("update public.guard_check_obligations set late=false, seconds_late=0, missed_at=null where id=$1", [evening.id])).rejects.toThrow()
    const replayed = await rpc("admin_guard_check_list_v1", [token, "2026-09-30T18:15:00Z"])
    expect(JSON.stringify(replayed)).toMatch(/"late":true/)
  })

  it("rejects incomplete or unavailable healthy observations and records bounded change codes", async () => {
    const coverageId = await activateIncluded()
    const other = await activateIncluded(otherLocation)
    await approveSchedule()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    const morning = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "MORNING")!
    let claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:10:00Z"])
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: morning.id, ...healthyPayload({ displayedBusinessName: "", reviewCount: null }) }, claimed!.version, "2026-09-30T08:12:00Z"])).toMatchObject({ status: "denied", reason: "incomplete_not_healthy" })
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: morning.id, ...healthyPayload({ classification: "HEALTHY", profileAvailability: "UNAVAILABLE" }) }, claimed!.version, "2026-09-30T08:12:00Z"])).toMatchObject({ status: "denied", reason: "incomplete_not_healthy" })
    const otherBaseline = (await db.query<{ id: string }>("select id from public.guard_baselines where coverage_id=$1 and status='VERIFIED'", [other])).rows[0].id
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: morning.id, ...healthyPayload({ baselineId: otherBaseline }) }, claimed!.version, "2026-09-30T08:12:00Z"])).toMatchObject({ status: "denied", reason: "baseline_location_mismatch" })
    await db.query("update public.guard_baselines set status='SUPERSEDED' where coverage_id=$1", [coverageId])
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: morning.id, ...healthyPayload() }, claimed!.version, "2026-09-30T08:12:00Z"])).toMatchObject({ status: "denied", reason: "incomplete_not_healthy" })
    await db.query("update public.guard_baselines set status='VERIFIED' where coverage_id=$1", [coverageId])

    const name = await rpc("admin_guard_check_command_v1", [token, key(), "complete", {
      obligationId: morning.id, ...healthyPayload({ classification: "CHANGE_DETECTED", displayedBusinessName: "New Bakery" }),
    }, claimed!.version, "2026-09-30T08:15:00Z"])
    expect(name).toMatchObject({ status: "success" })
    expect((await db.query<{ change_codes: string[] }>("select change_codes from public.guard_check_observations where obligation_id=$1", [morning.id])).rows[0].change_codes).toContain("BUSINESS_NAME_CHANGED")

    const evening = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "EVENING")!
    claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: evening.id }, evening.record_version, "2026-09-30T16:10:00Z"])
    const increased = await rpc("admin_guard_check_command_v1", [token, key(), "complete", {
      obligationId: evening.id, ...healthyPayload({ classification: "CHANGE_DETECTED", reviewCount: 12 }),
    }, claimed!.version, "2026-09-30T16:15:00Z"])
    expect(increased).toMatchObject({ status: "success" })
    expect((await db.query<{ change_codes: string[] }>("select change_codes from public.guard_check_observations where obligation_id=$1", [evening.id])).rows[0].change_codes).toContain("REVIEW_COUNT_INCREASED")
  })

  it("records review decrease, rating and latest-review changes without inventing alerts", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    const morning = (await obligations(coverageId, "2026-09-30")).find(row => row.window_code === "MORNING")!
    const claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:10:00Z"])
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", {
      obligationId: morning.id, ...healthyPayload({
        classification: "CHANGE_DETECTED", reviewCount: 8, rating: 4.1, latestReviewReference: "rev-2",
      }),
    }, claimed!.version, "2026-09-30T08:15:00Z"])).toMatchObject({ status: "success" })
    const codes = (await db.query<{ change_codes: string[] }>("select change_codes from public.guard_check_observations where obligation_id=$1", [morning.id])).rows[0].change_codes
    expect(codes).toEqual(expect.arrayContaining(["REVIEW_COUNT_DECREASED", "RATING_CHANGED", "LATEST_REVIEW_CHANGED"]))
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type='SEND_EMAIL'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('guard_alerts','monitoring_alerts')")).rows[0].n).toBe(0)
  })

  it("cancels pending work when coverage is paused and preserves completed history", async () => {
    const coverageId = await activateIncluded()
    await approveSchedule()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    const [evening, morning] = await obligations(coverageId, "2026-09-30")
    const claimed = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: morning.id }, morning.record_version, "2026-09-30T08:10:00Z"])
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: morning.id, ...healthyPayload() }, claimed!.version, "2026-09-30T08:20:00Z"])).toMatchObject({ status: "success" })
    const eveningClaim = await rpc("admin_guard_check_command_v1", [token, key(), "claim", { obligationId: evening.id }, evening.record_version, "2026-09-30T16:05:00Z"])
    await db.query("update public.guard_coverages set state='PAUSED', paused_at=now() where id=$1", [coverageId])
    expect(await rpc("admin_guard_check_command_v1", [token, key(), "complete", { obligationId: evening.id, ...healthyPayload() }, eveningClaim!.version, "2026-09-30T16:10:00Z"])).toMatchObject({ status: "denied", reason: "coverage_not_active" })
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [coverageId])
    await db.query("update public.guard_coverages set state='ENDED', ended_at=now() where id=$1", [coverageId])
    await maintain("2026-10-01T08:00:00Z", "2026-10-01")
    expect(await obligations(coverageId, "2026-10-01")).toHaveLength(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_observations where coverage_id=$1", [coverageId])).rows[0].n).toBe(1)
    const pending = await activateDirectPaid()
    await maintain("2026-09-30T08:00:00Z", "2026-09-30")
    expect(await obligations(pending, "2026-09-30")).toHaveLength(2)
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [pending])
    expect(await maintain("2026-09-30T08:05:00Z", "2026-09-30")).toMatchObject({ status: "success" })
    expect((await obligations(pending, "2026-09-30")).every(row => row.state === "CANCELLED")).toBe(true)
  })

  it("does not add Google or Step 18 alert implementation", async () => {
    const source = [
      readFileSync(new URL("./checks-command.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./maintain-checks.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../app/guard/checks/forms.tsx", import.meta.url), "utf8"),
      readFileSync(new URL("../../../../supabase/migrations/20260930203750_guard_manual_checks_v1.sql", import.meta.url), "utf8"),
    ].join("\n")
    expect(source).not.toMatch(/googleapis|places\.google|businessprofile|puppeteer|playwright/i)
    expect(source).not.toMatch(/CREATE TABLE public\.(guard_alerts|monitoring_alerts)/)
  })
})
