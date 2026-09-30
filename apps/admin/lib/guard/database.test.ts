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
  quoteVersionId?: string
  orderId?: string
  exceptionId?: string
  activatedAt?: string
  includedStartAt?: string
  includedEndAt?: string
  firstPlannedWindow?: string
  firstPlannedOn?: string
  readyToActivate?: boolean
  mappingReady?: boolean
  blockerCodes?: string[]
  billingReady?: boolean
  baselineStatus?: string
  baselineId?: string
  replay?: boolean
  reason?: string
  requests?: Array<{ numberOfLocations: number; identifiedCount: number; stillRequired: number; mappings: Array<{ source: string; locationId: string }> }>
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
    alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.quote_command_receipts,admin_private.catalogue_command_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.customer_action_command_receipts,admin_private.guard_command_receipts,admin_private.guard_subscription_receipts,admin_private.stripe_event_receipts,public.provider_operations,public.payment_ledger,public.guard_reconciliation_issues,public.guard_reconciliation_runs,public.guard_reminder_records,public.guard_refunds,public.guard_disputes,public.guard_billing_adjustments,public.guard_price_change_offers,public.guard_subscription_invoices,public.guard_recurring_consents,public.guard_subscription_events,public.guard_subscriptions,public.guard_continuations,public.guard_provider_price_maps,public.guard_activation_exceptions,public.guard_coverage_events,public.guard_baselines,public.guard_rota_assignments,public.guard_permissions,public.guard_included_offers,public.guard_billing,public.guard_coverages,public.guard_onboarding_locations,public.quote_events,public.quote_acceptances,public.service_orders,public.customer_action_events,public.customer_actions,public.quote_versions,public.quotes,public.quote_discount_snapshots,public.customer_contact_verifications,public.business_memberships,public.success_fee_approvals,public.location_manager_access,public.location_manager_access_events,public.case_document_events,public.case_document_versions,public.case_documents,public.monitoring_request_events,public.monitoring_requests,public.price_version_events cascade;
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

async function intake(count = 10) {
  const id = crypto.randomUUID()
  await db.query(
    "insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,source,intake_snapshot,terms_accepted_at) values($1,$2,$3,$4,$5,'REQUESTED',$6,'START_MONITORING','{}',now())",
    [id, crypto.randomUUID(), customer, business, location, count],
  )
  return id
}

async function acceptGuardOrder() {
  const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode: "RELAUNCH_GUARD", customerId: customer, businessId: business, caseId: null, locationId: location,
    priceVersionId: await priceId("RELAUNCH_GUARD"),
    scope: "Monitor this exact location after access and permission are confirmed.",
    exclusions: "Payment collection, Google decisions, and automatic activation are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect(draft?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", { quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE" }, draft!.version]))?.status).toBe("success")
  expect((await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: draft!.id, quoteVersionId: draft!.quoteVersionId }, (draft!.version || 1) + 1]))?.status).toBe("success")
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", { quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash }, null])
  const session = await completeOtp(issued?.id as string, hash)
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted?.status).toBe("success")
  return String(accepted?.orderId)
}

async function completeOtp(actionId: string, hash: string) {
  const pending = secretHash(), session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
  return session
}

async function mappingId(requestId: string, locationId = location) {
  return (await db.query<{ id: string }>("select id from public.guard_onboarding_locations where monitoring_request_id=$1 and location_id=$2 and status<>'REMOVED'", [requestId, locationId])).rows[0].id
}

async function acceptPermission(coverageId: string) {
  const hash = secretHash()
  const issued = await rpc("admin_guard_command_v1", [token, key(), "issue_permission_action", { coverageId, expiresAt: actionExpiry(), secretHash: hash }, null])
  expect(issued?.status).toBe("success")
  const session = await completeOtp(issued!.id!, hash)
  expect(await rpc("customer_action_session_v1", [session])).toMatchObject({ kind: "GUARD_PERMISSION" })
  expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])).toMatchObject({ status: "invalid" })
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])
  expect(accepted?.status).toBe("success")
}

async function verifyAccess(targetLocation = location) {
  await db.query("insert into public.location_manager_access(business_id,location_id,status,access_level,verified_at,verified_by,evidence) values($1,$2,'VERIFIED','MANAGER',now(),$3,$4) on conflict (location_id) do update set status='VERIFIED', access_level='MANAGER', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence, revoked_at=null, revoked_by=null, revocation_reason=''", [business, targetLocation, uid, "Manager access confirmed on a live screenshare."])
}

async function coverageVersion(id: string) {
  return (await db.query<{ record_version: number }>("select record_version from public.guard_coverages where id=$1", [id])).rows[0].record_version
}

async function markCoverageMappingReady(coverageId: string) {
  const row = (await db.query<{ id: string; record_version: number; status: string }>(
    "select m.id, m.record_version, m.status from public.guard_onboarding_locations m join public.guard_coverages g on g.onboarding_location_id=m.id where g.id=$1",
    [coverageId],
  )).rows[0]
  if (!row || row.status === "READY_FOR_ONBOARDING") return
  expect(await rpc("admin_guard_command_v1", [token, key(), "mark_mapping_ready", { mappingId: row.id }, row.record_version])).toMatchObject({ status: "success" })
}

async function prepareOperational(coverageId: string) {
  await markCoverageMappingReady(coverageId)
  await acceptPermission(coverageId)
  const coverageLocation = (await db.query<{ location_id: string }>("select location_id from public.guard_coverages where id=$1", [coverageId])).rows[0].location_id
  await verifyAccess(coverageLocation)
  const baseline = await rpc("admin_guard_command_v1", [token, key(), "record_baseline", {
    coverageId, profileUrl: "https://maps.google.com/?cid=1", displayedBusinessName: "Bakery",
    profileAvailability: "AVAILABLE", notes: "Manual capture of the current profile and review counts.",
  }, await coverageVersion(coverageId)])
  expect(baseline?.status).toBe("success")
  const rota = await rpc("admin_guard_command_v1", [token, key(), "assign_rota", { coverageId }, await coverageVersion(coverageId)])
  expect(rota?.status).toBe("success")
  return coverageVersion(coverageId)
}

describe("guard onboarding SQL", () => {
  it("backfills one intake mapping and never manufactures the requested count", async () => {
    await verify()
    const requestId = await intake(10)
    const mappings = await db.query<{ n: number }>("select count(*)::int as n from public.guard_onboarding_locations where monitoring_request_id=$1", [requestId])
    expect(mappings.rows[0].n).toBe(1)
    const list = await rpc("admin_guard_list_v1", [token])
    expect(list?.requests?.[0]).toMatchObject({ numberOfLocations: 10, identifiedCount: 1, stillRequired: 9 })
    expect(list?.requests?.[0].mappings).toHaveLength(1)
    expect(list?.requests?.[0].mappings[0].source).toBe("INTAKE_PRIMARY")
    const identified = await rpc("admin_guard_command_v1", [token, key(), "identify_location", { monitoringRequestId: requestId, locationId: otherLocation }, null])
    expect(identified?.status).toBe("success")
    const again = await rpc("admin_guard_list_v1", [token])
    expect(again?.requests?.[0]).toMatchObject({ identifiedCount: 2, stillRequired: 8 })
  })

  it("creates pending direct coverage and keeps paid activation fail-closed", async () => {
    await verify()
    const requestId = await intake(1)
    const orderId = await acceptGuardOrder()
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: orderId,
    }, null])
    expect(created?.status).toBe("success")
    const billing = await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [created!.id])
    expect(billing.rows[0].billing_state).toBe("PENDING")
    expect(await rpc("admin_guard_command_v1", [token, key(), "mark_paid", { coverageId: created!.id }, created!.version])).toMatchObject({ status: "invalid" })
    const nextVersion = await prepareOperational(created!.id!)
    const denied = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, nextVersion])
    expect(denied?.status).toBe("denied")
    expect(denied?.reason).not.toBe("paid_not_ready")
    const ready = await rpc("guard_coverage_readiness_v1", [created!.id])
    expect(ready?.readyToActivate).toBe(false)
    expect(ready?.billingReady).toBe(false)
    expect(ready?.blockerCodes).toContain("BILLING_NOT_CURRENT")
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [created!.id])).rows[0].state).not.toBe("ACTIVE")
  })

  it("activates included coverage without a paid subscription and starts 30 days at activation", async () => {
    await verify()
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set service_track='MANAGED', status='UNDER_REVIEW', work_stage='OUTCOME_REVIEW' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      serviceCode: "MANAGED_RELAUNCH", customerId: customer, businessId: business, caseId, locationId: location,
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
    expect(accepted?.status).toBe("success")
    expect((await rpc("admin_guard_command_v1", [token, key(), "create_included_offer", { caseId, serviceOrderId: accepted!.orderId }, null]))?.status).toBe("denied")
    await db.exec(`alter table public.cases disable trigger cases_workflow_version;
      update public.cases set status='CLOSED', work_stage='FINISHED', outcome='RESTORED' where id='${caseId}';
      alter table public.cases enable trigger cases_workflow_version;`)
    const doc = crypto.randomUUID(), version = crypto.randomUUID()
    await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Outcome evidence',$3)", [doc, caseId, uid])
    await db.query("insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by) values($1,$2,1,'outcome.png','image/png',1200,'evidence-test', $3, 'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)", [
      version, doc, `cases/${caseId}/documents/${doc}/versions/${version}`, uid,
    ])
    await db.query("insert into public.success_fee_approvals(service_order_id,case_id,quote_version_id,outcome,success_definition,outcome_evidence_version_id,evidence_note,approval_reason,amount_minor,currency,discount_amount_minor,tax_behaviour,tax_amount_minor,payment_method_ready,approved_by) select o.id,o.case_id,o.quote_version_id,'RESTORED','Restored the listed profile.', $1, 'Outcome evidence accepted after review.', 'Approved after the restored outcome evidence was checked.', o.amount_minor,o.currency,0,o.tax_behaviour,o.tax_amount_minor,false,$2 from public.service_orders o where o.id=$3", [version, uid, accepted!.orderId])
    const offer = await rpc("admin_guard_command_v1", [token, key(), "create_included_offer", { caseId, serviceOrderId: accepted!.orderId }, null])
    expect(offer?.status).toBe("success")
    const billing = await db.query<{ billing_state: string }>("select billing_state from public.guard_billing where coverage_id=$1", [offer!.id])
    expect(billing.rows[0].billing_state).toBe("NOT_REQUIRED")
    const nextVersion = await prepareOperational(offer!.id!)
    const activated = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: offer!.id }, nextVersion])
    expect(activated?.status).toBe("success")
    expect(activated?.includedStartAt).toBeTruthy()
    expect(activated?.includedEndAt).toBeTruthy()
    const row = await db.query<{ state: string; included_start_at: string; included_end_at: string; activated_at: string }>("select state, included_start_at::text, included_end_at::text, activated_at::text from public.guard_coverages where id=$1", [offer!.id])
    expect(row.rows[0].state).toBe("ACTIVE")
    expect(row.rows[0].included_start_at).toBe(row.rows[0].activated_at)
    expect(new Date(row.rows[0].included_end_at).getTime() - new Date(row.rows[0].included_start_at).getTime()).toBe(30 * 24 * 3600 * 1000)
    expect(activated?.firstPlannedWindow).toBe("MORNING")
    expect(JSON.stringify(activated)).not.toMatch(/12:00|09:00|17:00/)
    expect(await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: offer!.id }, activated!.version])).toMatchObject({ status: "success", replay: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_coverages where location_id=$1", [location])).rows[0].n).toBe(1)
  })

  it("opens an urgent exception when billing is current but access is missing", async () => {
    await verify()
    const requestId = await intake(1)
    const orderId = await acceptGuardOrder()
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: orderId,
    }, null])
    await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${created!.id}'::uuid, 'CURRENT', now() + interval '30 days', 'PROVIDER')`)
    await prepareOperational(created!.id!)
    await db.query("update public.location_manager_access set status='REVOKED', revoked_at=now(), revoked_by=$1, revocation_reason='Access was removed after a live check.' where location_id=$2", [uid, location])
    const denied = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)])
    expect(denied).toMatchObject({ status: "denied", reason: "paid_not_ready" })
    expect(denied?.exceptionId).toBeTruthy()
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [created!.id])).rows[0].state).not.toBe("ACTIVE")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_activation_exceptions where coverage_id=$1 and status='OPEN'", [created!.id])).rows[0].n).toBe(1)
  })

  it("keeps activated_at through pause, resume, ending and ended", async () => {
    const coverageId = await activateIncluded()
    const activatedAt = (await db.query<{ activated_at: string }>("select activated_at::text as activated_at from public.guard_coverages where id=$1", [coverageId])).rows[0].activated_at
    await expect(db.query("update public.guard_coverages set activated_at=now() where id=$1", [coverageId])).rejects.toThrow(/immutable/i)
    await db.query("update public.guard_coverages set state='PAUSED', paused_at=now() where id=$1", [coverageId])
    expect((await db.query<{ activated_at: string; state: string }>("select activated_at::text as activated_at, state from public.guard_coverages where id=$1", [coverageId])).rows[0]).toMatchObject({ activated_at: activatedAt, state: "PAUSED" })
    await db.query("update public.guard_coverages set state='ACTIVE' where id=$1", [coverageId])
    expect((await db.query<{ activated_at: string }>("select activated_at::text as activated_at from public.guard_coverages where id=$1", [coverageId])).rows[0].activated_at).toBe(activatedAt)
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [coverageId])
    await db.query("update public.guard_coverages set state='ENDED', ended_at=now() where id=$1", [coverageId])
    expect((await db.query<{ activated_at: string; state: string }>("select activated_at::text as activated_at, state from public.guard_coverages where id=$1", [coverageId])).rows[0]).toMatchObject({ activated_at: activatedAt, state: "ENDED" })
    await expect(db.query("update public.guard_coverages set state='ACTIVE' where id=$1", [coverageId])).rejects.toThrow(/Ended coverage|state transition/i)
  })

  it("denies invalid coverage state jumps and pre-activation activation facts", async () => {
    await verify()
    const requestId = await intake(1)
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    await expect(db.query("update public.guard_coverages set activated_at=now() where id=$1", [created!.id])).rejects.toThrow(/activation_facts|Activation timestamp|CHECK/i)
    await expect(db.query("update public.guard_coverages set state='ENDED' where id=$1", [created!.id])).rejects.toThrow(/state transition/i)
    await expect(db.query("update public.guard_coverages set state='ACTIVE', activated_at=now() where id=$1", [created!.id])).rejects.toThrow(/state transition|controlled activation/i)
    await expect(db.query("insert into public.guard_coverages(customer_id,business_id,location_id,coverage_basis,coverage_origin,state,activated_at) values($1,$2,$3,'DIRECT_GUARD','DIRECT_GUARD','REQUESTED',now())", [customer, business, location])).rejects.toThrow()
  })

  it("treats IDENTIFIED direct mappings as not activation-ready and READY_FOR_ONBOARDING as ready", async () => {
    await verify()
    const requestId = await intake(1)
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ mappingReady: false })
    const map = (await db.query<{ id: string; record_version: number }>("select id, record_version from public.guard_onboarding_locations where monitoring_request_id=$1", [requestId])).rows[0]
    expect(await rpc("admin_guard_command_v1", [token, key(), "mark_mapping_ready", { mappingId: map.id }, map.record_version])).toMatchObject({ status: "success" })
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ mappingReady: true })
    await db.query("update public.guard_onboarding_locations set status='REMOVED' where id=$1", [map.id])
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ mappingReady: false })
  })

  it("caps identified mappings at the requested count and allows replacement after removal", async () => {
    await verify()
    const requestId = await intake(10)
    const extra: string[] = []
    for (let i = 0; i < 10; i += 1) {
      const id = crypto.randomUUID()
      extra.push(id)
      await db.query("insert into public.locations(id,business_id,country,location_name,business_profile_url) values($1,$2,'UK',$3,$4)", [
        id, business, `Shop ${i + 2}`, `https://maps.google.com/?cid=${i + 10}`,
      ])
    }
    for (let i = 0; i < 9; i += 1) {
      expect(await rpc("admin_guard_command_v1", [token, key(), "identify_location", { monitoringRequestId: requestId, locationId: extra[i] }, null])).toMatchObject({ status: "success" })
    }
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_onboarding_locations where monitoring_request_id=$1 and status<>'REMOVED'", [requestId])).rows[0].n).toBe(10)
    expect(await rpc("admin_guard_command_v1", [token, key(), "identify_location", { monitoringRequestId: requestId, locationId: extra[9] }, null])).toMatchObject({ status: "denied", reason: "requested_count" })
    const added = (await db.query<{ id: string; record_version: number }>("select id, record_version from public.guard_onboarding_locations where monitoring_request_id=$1 and source='ADMIN_ADDED' order by ordinal limit 1", [requestId])).rows[0]
    expect(await rpc("admin_guard_command_v1", [token, key(), "remove_location", { mappingId: added.id }, added.record_version])).toMatchObject({ status: "success" })
    expect(await rpc("admin_guard_command_v1", [token, key(), "identify_location", { monitoringRequestId: requestId, locationId: extra[9] }, null])).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.locations where business_id=$1", [business])).rows[0].n).toBeGreaterThanOrEqual(12)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_onboarding_locations where monitoring_request_id=$1 and status<>'REMOVED'", [requestId])).rows[0].n).toBe(10)
  })

  it("verifies only AVAILABLE baselines and keeps incomplete history", async () => {
    await verify()
    const requestId = await intake(1)
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    const unavailable = await rpc("admin_guard_command_v1", [token, key(), "record_baseline", {
      coverageId: created!.id, profileUrl: "https://maps.google.com/?cid=1", displayedBusinessName: "Bakery",
      profileAvailability: "UNAVAILABLE", notes: "Profile could not be opened during the capture.",
    }, await coverageVersion(created!.id!)])
    expect(unavailable?.status).toBe("success")
    expect((await db.query<{ status: string }>("select status from public.guard_baselines where id=$1", [unavailable!.baselineId as string])).rows[0].status).toBe("INCOMPLETE")
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ baselineReady: false })
    const unknown = await rpc("admin_guard_command_v1", [token, key(), "record_baseline", {
      coverageId: created!.id, profileUrl: "https://maps.google.com/?cid=1", displayedBusinessName: "Bakery",
      profileAvailability: "UNKNOWN", notes: "Review state could not be confirmed.",
    }, await coverageVersion(created!.id!)])
    expect((await db.query<{ status: string }>("select status from public.guard_baselines where id=$1", [unknown!.baselineId as string])).rows[0].status).toBe("INCOMPLETE")
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ baselineReady: false })
    const verified = await rpc("admin_guard_command_v1", [token, key(), "record_baseline", {
      coverageId: created!.id, profileUrl: "https://maps.google.com/?cid=1", displayedBusinessName: "Bakery",
      profileAvailability: "AVAILABLE", notes: "Manual capture of the current profile and review counts.",
    }, await coverageVersion(created!.id!)])
    expect((await db.query<{ status: string }>("select status from public.guard_baselines where id=$1", [verified!.baselineId as string])).rows[0].status).toBe("VERIFIED")
    expect(await rpc("guard_coverage_readiness_v1", [created!.id])).toMatchObject({ baselineReady: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_baselines where coverage_id=$1 and status='INCOMPLETE'", [created!.id])).rows[0].n).toBe(2)
    await expect(db.query("insert into public.guard_baselines(coverage_id,location_id,version_number,status,profile_url,profile_availability,displayed_business_name,capture_method,captured_by) values($1,$2,99,'VERIFIED','https://maps.google.com/?cid=9','AVAILABLE','Other','MANUAL_ADMIN',$3)", [created!.id, otherLocation, uid])).rejects.toThrow(/location must match/i)
  })

  it("does not describe included blockers as paid-not-ready", async () => {
    const coverageId = await createIncludedCoverage()
    await prepareOperational(coverageId)
    await db.query("update public.location_manager_access set status='REVOKED', revoked_at=now(), revoked_by=$1, revocation_reason='Access was removed after a live check.' where location_id=$2", [uid, location])
    const denied = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId }, await coverageVersion(coverageId)])
    expect(denied).toMatchObject({ status: "denied", reason: "not_ready" })
    expect(denied?.reason).not.toBe("paid_not_ready")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_activation_exceptions where coverage_id=$1 and reason_code='PAID_NOT_READY'", [coverageId])).rows[0].n).toBe(0)
  })

  it("reuses one unresolved exception through acknowledge and resolves it on activation", async () => {
    await verify()
    const requestId = await intake(1)
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${created!.id}'::uuid, 'CURRENT', now() + interval '30 days', 'PROVIDER')`)
    await prepareOperational(created!.id!)
    await db.query("update public.location_manager_access set status='REVOKED', revoked_at=now(), revoked_by=$1, revocation_reason='Access was removed after a live check.' where location_id=$2", [uid, location])
    const first = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)])
    expect(first).toMatchObject({ status: "denied", reason: "paid_not_ready" })
    expect(await rpc("admin_guard_command_v1", [token, key(), "acknowledge_exception", { exceptionId: first!.exceptionId }, null])).toMatchObject({ status: "success" })
    const retry = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)])
    expect(retry?.exceptionId).toBe(first?.exceptionId)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_activation_exceptions where coverage_id=$1 and status in ('OPEN','ACKNOWLEDGED')", [created!.id])).rows[0].n).toBe(1)
    await verifyAccess()
    const activated = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)])
    expect(activated?.status).toBe("success")
    expect(activated?.firstPlannedWindow).toBe("MORNING")
    expect(activated?.firstPlannedOn).toBeTruthy()
    expect((await db.query<{ status: string }>("select status from public.guard_activation_exceptions where id=$1", [first!.exceptionId])).rows[0].status).toBe("RESOLVED")
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [created!.id])
    await db.query("update public.guard_coverages set state='ENDED', ended_at=now() where id=$1", [created!.id])
    const later = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    expect(later?.status).toBe("success")
    expect(later?.id).not.toBe(created!.id)
  })

  it("requires authoritative ACTIVE DIRECT coverage for a paid Guard discount", async () => {
    const coverageId = await activateDirectPaid()
    const activatedAt = (await db.query<{ activated_at: string }>("select activated_at::text as activated_at from public.guard_coverages where id=$1", [coverageId])).rows[0].activated_at
    const after = new Date(new Date(activatedAt).getTime() + 60_000).toISOString()
    const before = new Date(new Date(activatedAt).getTime() - 60_000).toISOString()
    const qualified = await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId, locationId: location, issueObservedAt: after,
    }, null])
    expect(qualified).toMatchObject({ status: "success", result: "QUALIFIED" })
    expect((await db.query<{ future_coverage_id: string }>("select future_coverage_id::text from public.quote_discount_snapshots where id=$1", [qualified!.id])).rows[0].future_coverage_id).toBe(coverageId)
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      locationId: location, issueObservedAt: after,
    }, null])).toMatchObject({ status: "denied" })
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId, locationId: otherLocation, issueObservedAt: after,
    }, null])).toMatchObject({ status: "denied" })
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId, locationId: location, issueObservedAt: before,
    }, null])).toMatchObject({ status: "denied" })
    await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${coverageId}'::uuid, 'PENDING', null, 'NONE')`)
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId, locationId: location, issueObservedAt: after,
    }, null])).toMatchObject({ status: "denied" })
    await db.exec(`select admin_private.guard_set_billing_entitlement_v1('${coverageId}'::uuid, 'CURRENT', now() + interval '30 days', 'PROVIDER')`)
    await db.query("update public.guard_coverages set state='PAUSED', paused_at=now() where id=$1", [coverageId])
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId, locationId: location, issueObservedAt: after,
    }, null])).toMatchObject({ status: "denied" })
    const includedId = await activateIncluded(otherLocation)
    expect(await rpc("admin_quote_command_v1", [token, key(), "record_qualification", {
      serviceCode: "MANAGED_RELAUNCH", priceVersionId: await priceId("MANAGED_RELAUNCH"), qualificationResult: "QUALIFIED",
      coverageId: includedId, locationId: otherLocation, issueObservedAt: after,
    }, null])).toMatchObject({ status: "denied" })
    await db.exec("alter table public.quote_discount_snapshots disable trigger quote_discount_snapshots_guard_coverage")
    const historical = crypto.randomUUID()
    await db.query("insert into public.quote_discount_snapshots(id,location_id,coverage_basis,coverage_status,coverage_type,paid_vs_included,issue_predates_paid_coverage,service_code,price_version_id,policy_id,discount_bps,qualification_result,reason_code,standard_amount_minor,discount_amount_minor,discounted_subtotal_minor,recorded_by,source) values($1,$2,'PAID','ACTIVE','PAID_GUARD','PAID',false,'MANAGED_RELAUNCH',$3,'PAID_GUARD_MANAGED_20',2000,'QUALIFIED','QUALIFIED',29900,5980,23920,$4,'ADMIN_RECORDED')", [
      historical, location, await priceId("MANAGED_RELAUNCH"), uid,
    ])
    await db.exec("alter table public.quote_discount_snapshots enable trigger quote_discount_snapshots_guard_coverage")
    expect((await db.query<{ future_coverage_id: string | null }>("select future_coverage_id::text from public.quote_discount_snapshots where id=$1", [historical])).rows[0].future_coverage_id).toBeNull()
  })

  it("keeps Guard tables RPC-only and denies generic role CRUD", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of ["guard_coverages", "guard_billing", "guard_onboarding_locations", "guard_activation_exceptions"]) {
        expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `public.${table}`])).rows[0].ok).toBe(false)
        expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'INSERT') as ok", [role, `public.${table}`])).rows[0].ok).toBe(false)
        expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'UPDATE') as ok", [role, `public.${table}`])).rows[0].ok).toBe(false)
        expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'DELETE') as ok", [role, `public.${table}`])).rows[0].ok).toBe(false)
      }
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','public.admin_guard_command_v1(text,uuid,text,jsonb,integer)','EXECUTE') as ok")).rows[0].ok).toBe(true)
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','public.admin_guard_list_v1(text)','EXECUTE') as ok")).rows[0].ok).toBe(true)
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','admin_private.guard_set_billing_entitlement_v1(uuid,text,timestamptz,text)','EXECUTE') as ok")).rows[0].ok).toBe(false)
  })

  it("replays a permission-link idempotency key without changing the stored secret", async () => {
    await verify()
    const requestId = await intake(1)
    const created = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    const request = key()
    const firstHash = secretHash()
    const expiresAt = actionExpiry()
    const first = await rpc("admin_guard_command_v1", [token, request, "issue_permission_action", { coverageId: created!.id, expiresAt, secretHash: firstHash }, null])
    expect(first?.status).toBe("success")
    const stored = (await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions where id=$1", [first!.id])).rows[0].secret_hash
    const replay = await rpc("admin_guard_command_v1", [token, request, "issue_permission_action", { coverageId: created!.id, expiresAt, secretHash: secretHash() }, null])
    expect(replay).toMatchObject({ status: "success", id: first!.id, replay: true })
    expect((await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions where id=$1", [first!.id])).rows[0].secret_hash).toBe(stored)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions where guard_coverage_id=$1 and kind='GUARD_PERMISSION' and status='OPEN'", [created!.id])).rows[0].n).toBe(1)
  })

  it("returns a controlled conflict for competing Direct and Included coverage", async () => {
    const includedId = await createIncludedCoverage()
    await verify()
    const requestId = await intake(1)
    const competing = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    expect(competing).toMatchObject({ status: "conflict", reason: "coverage_exists" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_coverages where location_id=$1 and state<>'ENDED'", [location])).rows[0].n).toBe(1)
    await prepareOperational(includedId)
    expect((await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: includedId }, await coverageVersion(includedId)]))?.status).toBe("success")
    await db.query("update public.guard_coverages set state='ENDING', ending_at=now() where id=$1", [includedId])
    await db.query("update public.guard_coverages set state='ENDED', ended_at=now() where id=$1", [includedId])
    const later = await rpc("admin_guard_command_v1", [token, key(), "create_direct_coverage", {
      mappingId: await mappingId(requestId), serviceOrderId: await acceptGuardOrder(),
    }, null])
    expect(later?.status).toBe("success")
  })

  it("rejects mismatched coverage identity even for privileged SQL", async () => {
    await verify()
    const requestId = await intake(1)
    const orderId = await acceptGuardOrder()
    await expect(db.query("insert into public.guard_coverages(customer_id,business_id,location_id,monitoring_request_id,service_order_id,coverage_basis,coverage_origin,state) values($1,$2,$3,$4,$5,'DIRECT_GUARD','DIRECT_GUARD','REQUESTED')", [
      customer, business, otherLocation, requestId, orderId,
    ])).rejects.toThrow(/match the service-order|identity/i)
  })
})

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
  expect(accepted?.status).toBe("success")
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
  if (targetLocation !== location) {
    await db.query("insert into public.location_manager_access(business_id,location_id,status,access_level,verified_at,verified_by,evidence) values($1,$2,'VERIFIED','MANAGER',now(),$3,$4) on conflict (location_id) do update set status='VERIFIED', access_level='MANAGER', verified_at=now(), revoked_at=null, revocation_reason=''", [business, targetLocation, uid, "Manager access confirmed on a live screenshare."])
  }
  await prepareOperational(coverageId)
  const activated = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId }, await coverageVersion(coverageId)])
  expect(activated?.status).toBe("success")
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
  const activated = await rpc("admin_guard_command_v1", [token, key(), "activate", { coverageId: created!.id }, await coverageVersion(created!.id!)])
  expect(activated?.status).toBe("success")
  expect(activated?.firstPlannedWindow).toBe("MORNING")
  return created!.id!
}
