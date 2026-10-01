import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const otherActor = "99999999-9999-4999-8999-999999999999"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const otherBusiness = "77777777-7777-4777-8777-777777777777"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const clock = "2026-03-29T12:00:00Z"

type RpcResult = Record<string, unknown> & {
  status?: string
  reason?: string
  summary?: { count?: number; numerator?: number; denominator?: number; percentage?: number | null; amounts?: Array<{ currency: string; amountMinor: number }> }
  page?: { rows?: Array<{ id: string }>; hasMore?: boolean; nextCursor?: string }
  results?: Array<{ id: string; category: string; label: string }>
  needsAttention?: Record<string, { count?: number }>
  metrics?: Record<string, { count?: number; denominator?: number; percentage?: number | null; amounts?: Array<{ currency: string; amountMinor: number }> }>
  customer?: Record<string, unknown>
  memberships?: Array<Record<string, unknown>>
  cases?: Array<Record<string, unknown>>
  filters?: Array<{ id: string; name: string; version: number }>
  rows?: Array<Record<string, unknown>>
  rowCount?: number
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

async function allDetail(reportKey: string, preset = "custom", start = "2026-03-01", end = "2026-03-31", limit = 10) {
  const ids: string[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page++) {
    const data = await rpc("admin_report_detail_v1", [token, reportKey, preset, start, end, cursor, limit, clock])
    const rows = data?.page?.rows || []
    ids.push(...rows.map(row => row.id))
    if (!data?.page?.hasMore) return { data, ids }
    cursor = data.page?.nextCursor || null
  }
  return { data: null, ids }
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
    readdirSync(dir).find(n => n.endsWith("_admin_dashboard_search_reports_v1.sql"))!,
  ]) await db.exec(read(name))
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,public.admin_saved_filters,admin_private.report_export_receipts,admin_private.report_command_receipts,auth.users,public.enquiry_events,public.enquiries,public.case_tasks,public.case_work_events,public.customer_contact_verifications,public.business_memberships,admin_private.jobs,admin_private.job_outbox cascade;
    delete from public.cases where id <> '${caseId}';
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${otherActor}','other@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex Baker','alex@example.com','+441234567890') on conflict (id) do update set full_name=excluded.full_name, email=excluded.email;
    insert into public.customers(id,full_name,email) values('${otherCustomer}','Alex Baker','other@example.com') on conflict (id) do update set full_name=excluded.full_name, email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.businesses(id,display_name) values('${otherBusiness}','Other Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street') on conflict (id) do update set location_name=excluded.location_name;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'GUIDED') on conflict (id) do nothing;
    alter table public.cases disable trigger cases_workflow_version;
    update public.cases set service_track='GUIDED', status='UNDER_REVIEW', work_stage='FURTHER_REVIEW', workflow_version=1, outcome=null, closed_at=null where id='${caseId}';
    alter table public.cases enable trigger cases_workflow_version;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;`)
})

async function addEnquiry(at: string, status = "new", assigned = false, extras: Record<string, unknown> = {}) {
  const id = key()
  const payload = {
    name: "Pat",
    email: extras.email ?? "pat@example.com",
    phone: extras.phone ?? "",
    service: extras.service ?? "profile-recovery",
    subject: extras.subject ?? "",
  }
  await db.query(
    `insert into public.enquiries(id,submission_key,fingerprint,source,payload,assigned,internal_status,ack_status,status,created_at,monitoring_request_id)
     values($1,$2,$3,$4,$5,$6,'SKIPPED','SKIPPED',$7,$8::timestamptz,$9)`,
    [id, key(), `fp-${id}`, extras.source || "homepage", payload, assigned, status, at, extras.monitoringId || null],
  )
  if (extras.caseId) {
    await db.query("update public.enquiries set status='converted', case_id=$2, assigned=true where id=$1", [id, extras.caseId])
  }
  return id
}

describe("Step 19 dashboard, search, reports and preview", () => {
  it("uses Europe/London [start,end) boundaries across BST, GMT, DST and year edges", async () => {
    await addEnquiry("2026-03-28T23:59:59.999Z")
    await addEnquiry("2026-03-29T00:00:00Z")
    await addEnquiry("2026-10-24T22:59:59.999Z")
    await addEnquiry("2026-10-25T00:00:00Z")
    await addEnquiry("2025-12-31T23:59:59.999Z")
    await addEnquiry("2026-01-01T00:00:00Z")
    const spring = await rpc("admin_report_summary_v1", [token, "enquiry_to_case", "custom", "2026-03-29", "2026-03-29", "2026-03-29T12:00:00Z"])
    expect(spring?.summary?.count).toBe(1)
    const autumn = await rpc("admin_report_summary_v1", [token, "enquiry_to_case", "custom", "2026-10-25", "2026-10-25", "2026-10-25T12:00:00Z"])
    expect(autumn?.summary?.count).toBe(1)
    const year = await rpc("admin_report_summary_v1", [token, "enquiry_to_case", "custom", "2026-01-01", "2026-01-01", "2026-01-01T12:00:00Z"])
    expect(year?.summary?.count).toBe(1)
    const before = await rpc("admin_report_detail_v1", [token, "enquiry_to_case", "custom", "2026-03-29", "2026-03-29", null, 50, "2026-03-29T12:00:00Z"])
    expect(before?.page?.rows).toHaveLength(1)
  })

  it("reconciles dashboard overdue work across more than one page", async () => {
    for (let i = 0; i < 61; i++) {
      await db.query(
        "insert into public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) values($1,$2,'ADMIN','FOLLOW_UP',$3,'Internal follow-up; not a Google deadline','Europe/London','MANUAL_QUEUE')",
        [caseId, `Call backlog item ${i}`, "2026-03-01T09:00:00Z"],
      )
    }
    const dash = await rpc("admin_dashboard_today_v1", [token, "today", null, null, clock])
    expect(dash?.needsAttention?.overdueWork?.count).toBe(61)
    const { ids, data } = await allDetail("overdue_work", "today", null as never, null as never, 10)
    expect(data?.summary?.count).toBe(61)
    expect(ids).toHaveLength(61)
    expect(new Set(ids).size).toBe(61)
  })

  it("keeps client, enquiry and case predicates distinct and does not double-count", async () => {
    await addEnquiry("2026-03-29T10:00:00Z", "new")
    await addEnquiry("2026-03-29T11:00:00Z", "closed")
    await addEnquiry("2026-03-29T11:30:00Z", "spam")
    const converted = await addEnquiry("2026-03-29T12:00:00Z", "new", false, { email: "converted-distinct@example.com" })
    await db.query("update public.enquiries set status='converted', case_id=$2, assigned=true where id=$1", [converted, caseId])
    const dash = await rpc("admin_dashboard_today_v1", [token, "custom", "2026-03-01", "2026-03-31", clock])
    expect(dash?.metrics?.clientsTotal?.count).toBe(2)
    expect(dash?.metrics?.clientsActiveService?.count).toBe(1)
    expect(dash?.metrics?.openEnquiries?.count).toBe(1)
    expect(dash?.metrics?.contactsEnquiryOnly?.count).toBe(1)
    expect(dash?.metrics?.openCases?.count).toBe(1)
    const conversion = await rpc("admin_report_summary_v1", [token, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(conversion?.summary).toMatchObject({ eligible: 3, converted: 1 })
    expect((conversion?.summary as { excludedSpam?: number }).excludedSpam).toBe(1)
  })

  it("returns Not applicable for zero-denominator coverage and rejects invalid periods", async () => {
    const coverage = await rpc("admin_report_summary_v1", [token, "check_coverage_completed", "custom", "2026-03-01", "2026-03-31", clock])
    expect(coverage?.summary).toMatchObject({ numerator: 0, denominator: 0, percentage: null })
    expect(await rpc("admin_dashboard_today_v1", [token, "custom", "2026-02-01", "2026-01-01", clock])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_report_detail_v1", [token, "open_cases", "today", null, null, "not-a-cursor", 50, clock])).toMatchObject({
      status: "invalid", reason: "invalid_cursor",
    })
  })

  it("searches only allowlisted fields and rejects wildcards, unverified email and long input", async () => {
    const ref = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id=$1", [caseId])).rows[0].public_ref
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [customer, "alex@example.com", uid, "Verified from a live call with the customer."])
    const exact = await rpc("admin_global_search_v1", [token, `  ${ref.toLowerCase()}  `, null, 20])
    expect(exact?.results?.some(row => row.category === "case")).toBe(true)
    const name = await rpc("admin_global_search_v1", [token, "ALEX BAKER", null, 20])
    expect(name?.results?.filter(row => row.category === "client").length).toBe(2)
    const email = await rpc("admin_global_search_v1", [token, "alex@example.com", null, 20])
    expect(email?.results?.some(row => row.category === "email" && row.id === customer)).toBe(true)
    expect(email?.results?.some(row => row.id === otherCustomer && row.category === "email")).toBe(false)
    const wildcard = await rpc("admin_global_search_v1", [token, "%", null, 20])
    expect(wildcard?.results || []).toEqual([])
    expect(await rpc("admin_global_search_v1", [token, "a".repeat(101), null, 20])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_global_search_v1", [token, "al", "nope", 20])).toMatchObject({ status: "invalid", reason: "invalid_cursor" })
    expect(await rpc("admin_global_search_v1", ["nope", "alex", null, 20])).toBeNull()
  })

  it("scopes saved filters to the session actor and rejects malformed payloads", async () => {
    const created = await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Today view", filter: { preset: "today" } }, null])
    expect(created).toMatchObject({ status: "success", version: 1 })
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "UNKNOWN", name: "Bad", filter: {} }, null])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Bad key", filter: { sql: "select 1" } }, null])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Array", filter: ["x"] }, null])).toMatchObject({ status: "invalid" })
    const replay = key()
    const first = await rpc("admin_saved_filter_command_v1", [token, replay, "rename", { id: created!.id, name: "Renamed" }, 1])
    const second = await rpc("admin_saved_filter_command_v1", [token, replay, "rename", { id: created!.id, name: "Renamed" }, 1])
    expect(first).toEqual(second)
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "rename", { id: created!.id, name: "Stale" }, 1])).toMatchObject({ status: "conflict" })
    await expect(db.query("insert into public.admin_saved_filters(actor_id,module,name,filter) values($1,'REPORTS','Theirs','{}'::jsonb)", [otherActor])).rejects.toThrow(/valid Admin identity/)
    await expect(db.query("insert into public.admin_saved_filters(actor_id,module,name,filter,record_version) values($1,'REPORTS','direct','{\"preset\":\"today\"}'::jsonb,50)", [uid])).rejects.toThrow(/version 1/)
    await expect(db.query("insert into public.admin_saved_filters(actor_id,module,name,filter) values($1,'REPORTS','direct','[]'::jsonb)", [uid])).rejects.toThrow()
    await expect(db.query("update public.admin_saved_filters set actor_id=$1 where id=$2", [otherActor, created!.id])).rejects.toThrow()
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "delete", { id: "not-a-uuid" }, 1])).toMatchObject({ status: "invalid", reason: "invalid_id" })
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "CASES", name: "Case view", filter: { reportKey: "open_cases" } }, null])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Guard in reports", filter: { queue: "TODAY" } }, null])).toMatchObject({ status: "invalid" })
  })

  it("audits exports, rejects over-limit and conflicting replays, and does not store CSV text", async () => {
    for (let i = 0; i < 12; i++) await addEnquiry(`2026-03-29T0${i % 10}:00:00Z`)
    const request = key()
    const first = await rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(first?.status).toBe("success")
    expect(first?.rowCount).toBeGreaterThan(0)
    expect(first?.rows).toBeTruthy()
    const stored = await db.query<{ result: Record<string, unknown>; filters: Record<string, unknown> }>("select result, filters from admin_private.report_export_receipts where request_id=$1", [request])
    expect(JSON.stringify(stored.rows[0].result)).not.toMatch(/pat@example.com|Alex Baker|rows/)
    expect(stored.rows[0].filters.reportKey).toBe("enquiry_to_case")
    const replay = await rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(replay?.status).toBe("success")
    expect(replay?.rowCount).toBe(first?.rowCount)
    expect(replay?.rows).toEqual(first?.rows)
    expect(await rpc("admin_report_export_v1", [token, request, "open_cases", "today", null, null, clock])).toMatchObject({ status: "conflict" })
    await db.exec("create or replace function admin_private.report_export_limit_v1() returns integer language sql immutable set search_path='' as $$ select 5; $$;")
    const denied = await rpc("admin_report_export_v1", [token, key(), "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(denied).toMatchObject({ status: "denied", reason: "export_limit" })
    await db.exec("create or replace function admin_private.report_export_limit_v1() returns integer language sql immutable set search_path='' as $$ select 5000; $$;")
    const audit = await db.query<{ action: string; details: Record<string, unknown> }>("select action, details from public.admin_audit_events where action='REPORT_CHANGED'")
    expect(audit.rows.some(row => row.details.reportKey === "enquiry_to_case")).toBe(true)
    expect(JSON.stringify(audit.rows)).not.toMatch(/HYPERLINK|otp|sk_live/)
    await expect(db.query("update admin_private.report_export_receipts set actor_id=$1", [otherActor])).rejects.toThrow()
  })

  it("keeps customer-visible preview on the safe projection", async () => {
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [customer, "alex@example.com", uid, "Verified from a live call with the customer."])
    await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'pending',null,null,'Awaiting authority check')", [customer, otherBusiness])
    await db.query("insert into public.case_work_events(case_id,actor_id,event,note,visibility) values($1,$2,'note','Internal staff note that must stay hidden','INTERNAL')", [caseId, uid])
    await db.query("insert into public.case_work_events(case_id,actor_id,event,note,visibility) values($1,$2,'note','Customer can read this approved note.','CUSTOMER')", [caseId, uid])
    const hidden = await rpc("admin_customer_preview_v1", [token, customer])
    expect(hidden?.status).toBe("success")
    expect(hidden?.cases || []).toEqual([])
    expect(JSON.stringify(hidden)).not.toContain("Customer can read this approved note.")
    await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,'Verified owner from a live call.')", [customer, business, uid])
    const preview = await rpc("admin_customer_preview_v1", [token, customer])
    expect(preview?.status).toBe("success")
    expect(preview?.customer).toMatchObject({ email: "alex@example.com", emailVerified: true })
    expect(JSON.stringify(preview)).toContain("Customer can read this approved note.")
    expect(JSON.stringify(preview)).not.toMatch(/Internal staff note|stripe|sk_live|otp|severity|job_outbox/)
    expect(preview?.memberships?.some(item => item.businessId === business)).toBe(true)
    expect(preview?.memberships?.some(item => item.businessId === otherBusiness)).toBe(false)
    expect(preview?.cases?.some(item => item.id === caseId)).toBe(true)
    expect(await rpc("admin_customer_preview_v1", [token, "00000000-0000-4000-8000-000000000000"])).toMatchObject({ status: "denied" })
    expect(await rpc("admin_customer_preview_v1", ["nope", customer])).toBeNull()
  })

  it("counts distinct enquiry contacts and excludes converted or spam identities", async () => {
    await addEnquiry("2026-03-29T10:00:00Z", "new", false, { email: "Same@Example.com" })
    await addEnquiry("2026-03-29T10:05:00Z", "open", false, { email: "same@example.com" })
    await addEnquiry("2026-03-29T10:10:00Z", "closed", false, { email: " SAME@example.com " })
    await addEnquiry("2026-03-29T10:15:00Z", "new", false, { email: "", phone: "+44 1234 567 890" })
    await addEnquiry("2026-03-29T10:16:00Z", "open", false, { email: "", phone: "+441234567890" })
    const converted = await addEnquiry("2026-03-29T10:20:00Z", "new", false, { email: "converted@example.com" })
    await db.query("update public.enquiries set status='converted', case_id=$2, assigned=true where id=$1", [converted, caseId])
    await addEnquiry("2026-03-29T10:25:00Z", "spam", false, { email: "spam@example.com" })
    const dash = await rpc("admin_dashboard_today_v1", [token, "today", null, null, clock])
    expect(dash?.metrics?.contactsEnquiryOnly?.count).toBe(2)
    const { ids } = await allDetail("contacts_enquiry_only", "today", null as never, null as never, 10)
    expect(ids).toHaveLength(2)
  })

  it("uses a case-service enquiry cohort and reports excluded categories", async () => {
    await addEnquiry("2026-03-29T10:00:00Z", "new", false, { service: "profile-recovery" })
    await addEnquiry("2026-03-29T10:01:00Z", "new", false, { service: "review-protection" })
    await addEnquiry("2026-03-29T10:02:00Z", "new", false, { service: "general" })
    await addEnquiry("2026-03-29T10:03:00Z", "new", false, { service: "", subject: "partnership", source: "contact" })
    await addEnquiry("2026-03-29T10:04:00Z", "spam", false, { service: "profile-recovery" })
    const summary = await rpc("admin_report_summary_v1", [token, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(summary?.summary).toMatchObject({ eligible: 2 })
    expect((summary?.summary as { excluded?: Record<string, number> }).excluded).toMatchObject({
      general: 1, nonCaseContact: 1, spam: 1,
    })
  })

  it("binds report and search cursors to their exact context", async () => {
    for (let i = 0; i < 3; i++) await addEnquiry(`2026-03-29T10:0${i}:00Z`, "new", false, { email: `page${i}@example.com` })
    const first = await rpc("admin_report_detail_v1", [token, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", null, 1, clock])
    const cursor = first?.page?.nextCursor
    expect(cursor).toBeTruthy()
    expect(await rpc("admin_report_detail_v1", [token, "open_cases", "custom", "2026-03-01", "2026-03-31", cursor, 1, clock])).toMatchObject({
      status: "invalid", reason: "invalid_cursor",
    })
    expect(await rpc("admin_report_detail_v1", [token, "enquiry_to_case", "custom", "2026-02-01", "2026-02-28", cursor, 1, clock])).toMatchObject({
      status: "invalid", reason: "invalid_cursor",
    })
    expect(await rpc("admin_report_detail_v1", [token, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", `${clock}|${key()}|deadbeef`, 1, clock])).toMatchObject({
      status: "invalid", reason: "invalid_cursor",
    })
    const next = await rpc("admin_report_detail_v1", [token, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", cursor, 1, clock])
    expect(next?.status).toBe("success")
    expect(next?.page?.rows?.[0]?.id).not.toBe(first?.page?.rows?.[0]?.id)
    const search = await rpc("admin_global_search_v1", [token, "alex baker", null, 1])
    const searchCursor = (search as { nextCursor?: string })?.nextCursor
    expect(await rpc("admin_global_search_v1", [token, "bakery", searchCursor, 1])).toMatchObject({ status: "invalid", reason: "invalid_cursor" })
    expect(await rpc("admin_global_search_v1", [token, "alex baker", `2|${key()}|${"x".repeat(32)}`, 1])).toMatchObject({
      status: "invalid", reason: "invalid_cursor",
    })
    const searchNext = await rpc("admin_global_search_v1", [token, "alex baker", searchCursor, 1])
    expect(searchNext?.status).toBe("success")
  })

  it("returns current vs period metadata and a dedicated net collections report", async () => {
    const current = await rpc("admin_report_summary_v1", [token, "open_cases", "custom", "2026-01-01", "2026-01-02", clock])
    expect((current as { temporalMode?: string }).temporalMode).toBe("CURRENT")
    const period = await rpc("admin_report_summary_v1", [token, "collected_net", "custom", "2026-03-01", "2026-03-31", clock])
    expect((period as { temporalMode?: string }).temporalMode).toBe("PERIOD")
    expect(period?.summary?.amounts || []).toEqual([])
    const dash = await rpc("admin_dashboard_today_v1", [token, "custom", "2026-03-01", "2026-03-31", clock])
    expect((dash as { temporalNote?: string }).temporalNote).toMatch(/current snapshots/)
    expect((dash?.metrics as { collectedNet?: { amounts?: unknown[] } })?.collectedNet?.amounts || []).toEqual([])
  })

  it("reconciles net collections across more than one page and searches Guard invoice refs", async () => {
    await db.exec("set session_replication_role = replica")
    const receiptIds: string[] = []
    for (let i = 0; i < 12; i++) {
      const id = key()
      receiptIds.push(id)
      await db.query(
        "insert into public.payment_receipts(id,obligation_id,service_order_id,customer_id,payment_attempt_id,amount_minor,currency,tax_behaviour,tax_amount_minor,paid_at) values($1,$2,$2,$3,$2,1000,'GBP','NOT_APPLICABLE',0,$4)",
        [id, key(), customer, `2026-03-29T10:${String(i).padStart(2, "0")}:00Z`],
      )
    }
    const guardInvoice = key()
    await db.query(
      "insert into public.guard_subscription_invoices(id,subscription_id,stripe_invoice_id,amount_paid_minor,currency,kind,status,created_at) values($1,$2,'in_guardnet1',4900,'GBP','RENEWAL','PAID','2026-03-29T11:00:00Z')",
      [guardInvoice, key()],
    )
    const refund = key()
    await db.query(
      "insert into public.guard_refunds(id,adjustment_id,subscription_id,invoice_id,amount_minor,currency,status,succeeded_at) values($1,$2,$2,$3,1500,'GBP','SUCCEEDED','2026-03-29T12:00:00Z')",
      [refund, key(), guardInvoice],
    )
    await db.exec("set session_replication_role = origin")
    const dash = await rpc("admin_dashboard_today_v1", [token, "custom", "2026-03-01", "2026-03-31", clock])
    expect(dash?.metrics?.collectedNet?.amounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "GBP", amountMinor: 15400 }),
    ]))
    const { ids, data } = await allDetail("collected_net", "custom", "2026-03-01", "2026-03-31", 5)
    expect(data?.summary?.amounts).toEqual(dash?.metrics?.collectedNet?.amounts)
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(14)
    const kinds = (await rpc("admin_report_detail_v1", [token, "collected_net", "custom", "2026-03-01", "2026-03-31", null, 50, clock]))
      ?.page?.rows?.map(row => (row as { label?: string }).label)
    expect(kinds).toEqual(expect.arrayContaining(["collection", "guard_collection", "refund"]))
    const search = await rpc("admin_global_search_v1", [token, "in_guardnet1", null, 20])
    expect(search?.results?.some(row => row.category === "guard_invoice" && row.id === guardInvoice)).toBe(true)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_refunds where id=$1", [refund])
    await db.query("delete from public.guard_subscription_invoices where id=$1", [guardInvoice])
    await db.query("delete from public.payment_receipts where id = any($1::uuid[])", [receiptIds])
    await db.exec("set session_replication_role = origin")
  })

  it("includes earned success-fee obligations and authoritative overdue invoices only", async () => {
    await db.exec("set session_replication_role = replica")
    const upfront = key()
    const success = key()
    const dueOb = key()
    const unknownOb = key()
    const issuedDue = key()
    const issuedUnknown = key()
    await db.query(
      "insert into public.payment_obligations(id,service_order_id,quote_id,quote_version_id,customer_id,kind,state,amount_minor,currency,tax_behaviour,tax_amount_minor) values($1,$2,$2,$2,$3,'UPFRONT','FAILED',1000,'GBP','NOT_APPLICABLE',0)",
      [upfront, key(), customer],
    )
    await db.query(
      "insert into public.payment_obligations(id,service_order_id,quote_id,quote_version_id,customer_id,kind,state,amount_minor,currency,tax_behaviour,tax_amount_minor,success_fee_approval_id) values($1,$2,$2,$2,$3,'SUCCESS_FEE','AUTHENTICATION_REQUIRED',29900,'GBP','NOT_APPLICABLE',0,$4)",
      [success, key(), customer, key()],
    )
    await db.query(
      "insert into public.payment_obligations(id,service_order_id,quote_id,quote_version_id,customer_id,kind,state,amount_minor,currency,tax_behaviour,tax_amount_minor) values($1,$2,$2,$2,$3,'UPFRONT','DUE',1500,'GBP','NOT_APPLICABLE',0)",
      [dueOb, key(), customer],
    )
    await db.query(
      "insert into public.payment_obligations(id,service_order_id,quote_id,quote_version_id,customer_id,kind,state,amount_minor,currency,tax_behaviour,tax_amount_minor) values($1,$2,$2,$2,$3,'UPFRONT','DUE',1600,'GBP','NOT_APPLICABLE',0)",
      [unknownOb, key(), customer],
    )
    await db.query(
      "insert into public.payment_invoices(id,obligation_id,service_order_id,customer_id,provider_operation_id,amount_minor,currency,tax_behaviour,tax_amount_minor,status,due_at) values($1,$2,$2,$3,$4,1500,'GBP','NOT_APPLICABLE',0,'ISSUED','2026-03-01T00:00:00Z')",
      [issuedDue, dueOb, customer, key()],
    )
    await db.query(
      "insert into public.payment_invoices(id,obligation_id,service_order_id,customer_id,provider_operation_id,amount_minor,currency,tax_behaviour,tax_amount_minor,status,due_at) values($1,$2,$2,$3,$4,1600,'GBP','NOT_APPLICABLE',0,'ISSUED',null)",
      [issuedUnknown, unknownOb, customer, key()],
    )
    await db.exec("set session_replication_role = origin")
    const outstanding = await rpc("admin_report_summary_v1", [token, "outstanding_money", "today", null, null, clock])
    expect(outstanding?.summary?.count).toBe(4)
    const exceptions = await rpc("admin_report_summary_v1", [token, "payment_exceptions", "today", null, null, clock])
    expect(exceptions?.summary?.count).toBe(2)
    const overdue = await rpc("admin_report_summary_v1", [token, "overdue_invoices", "today", null, null, clock])
    expect(overdue?.summary?.count).toBe(1)
    expect((overdue?.summary as { unknownDueDateCount?: number }).unknownDueDateCount).toBe(1)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.payment_invoices where id in ($1,$2)", [issuedDue, issuedUnknown])
    await db.query("delete from public.payment_obligations where id in ($1,$2,$3,$4)", [upfront, success, dueOb, unknownOb])
    await db.exec("set session_replication_role = origin")
  })

  it("uses current Guard reconciliation and paid entitlement, not historical leftovers", async () => {
    await db.exec("set session_replication_role = replica")
    const coverage = key()
    const sub = key()
    const oldRun = key()
    const newRun = key()
    const oldTarget = key()
    const newTarget = key()
    await db.query(
      "insert into public.guard_coverages(id,customer_id,business_id,location_id,service_order_id,coverage_basis,coverage_origin,state,activated_at) values($1,$2,$3,$4,$5,'DIRECT_GUARD','DIRECT_GUARD','ACTIVE','2026-03-01')",
      [coverage, customer, business, location, key()],
    )
    await db.query(
      "insert into public.guard_billing(coverage_id,billing_state,entitlement_source,paid_through_at) values($1,'CURRENT','PROVIDER','2026-04-01T00:00:00Z')",
      [coverage],
    )
    const price = (await db.query<{ id: string }>("select id from public.price_versions where service_code='RELAUNCH_GUARD' limit 1")).rows[0].id
    await db.query(
      "insert into public.guard_subscriptions(id,coverage_id,location_id,customer_id,business_id,service_order_id,price_version_id,lifecycle_state,amount_minor,currency,tax_behaviour) values($1,$2,$3,$4,$5,$6,$7,'ACTIVE',4900,'GBP','NOT_APPLICABLE')",
      [sub, coverage, location, customer, business, key(), price],
    )
    await db.query("insert into public.guard_reconciliation_runs(id,service_date,status,mismatch_count) values($1,'2026-03-01','COMPLETED',1)", [oldRun])
    await db.query("insert into public.guard_reconciliation_runs(id,service_date,status,mismatch_count) values($1,'2026-03-28','COMPLETED',0)", [newRun])
    await db.query("insert into public.guard_reconciliation_targets(id,run_id,subscription_id,status,mismatch_count) values($1,$2,$3,'FAILED',1)", [oldTarget, oldRun, sub])
    await db.query("insert into public.guard_reconciliation_targets(id,run_id,subscription_id,status,mismatch_count) values($1,$2,$3,'SUCCEEDED',0)", [newTarget, newRun, sub])
    await db.query("insert into public.guard_reconciliation_issues(run_id,subscription_id,coverage_id,code) values($1,$2,$3,'AMOUNT')", [oldRun, sub, coverage])
    await db.exec("set session_replication_role = origin")
    expect((await rpc("admin_report_summary_v1", [token, "guard_billing_exceptions", "today", null, null, clock]))?.summary?.count).toBe(0)
    expect((await rpc("admin_report_summary_v1", [token, "guard_locations_paid_active", "today", null, null, clock]))?.summary?.count).toBe(1)
    await db.exec("set session_replication_role = replica")
    await db.query("update public.guard_reconciliation_targets set mismatch_count=2, status='FAILED' where id=$1", [newTarget])
    await db.query("update public.guard_billing set billing_state='PAST_DUE' where coverage_id=$1", [coverage])
    await db.exec("set session_replication_role = origin")
    expect((await rpc("admin_report_summary_v1", [token, "guard_billing_exceptions", "today", null, null, clock]))?.summary?.count).toBeGreaterThanOrEqual(2)
    expect((await rpc("admin_report_summary_v1", [token, "guard_locations_paid_active", "today", null, null, clock]))?.summary?.count).toBe(0)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_reconciliation_issues")
    await db.query("delete from public.guard_reconciliation_targets")
    await db.query("delete from public.guard_reconciliation_runs")
    await db.query("delete from public.guard_subscriptions where id=$1", [sub])
    await db.query("delete from public.guard_billing where coverage_id=$1", [coverage])
    await db.query("delete from public.guard_coverages where id=$1", [coverage])
    await db.exec("set session_replication_role = origin")
  })

  it("classifies Guard coverage failures and keeps late completions as history", async () => {
    await db.exec("set session_replication_role = replica")
    const missed = key()
    const incomplete = key()
    const cov = key()
    await db.query(
      "insert into public.guard_check_obligations(id,coverage_id,customer_id,business_id,location_id,service_date,window_code,schedule_version_id,rota_assignment_id,coverage_basis,timezone,local_start,local_end,window_start_utc,window_end_utc,state,completed_at,missed_at,late,seconds_late) values($1,$2,$3,$4,$5,'2026-03-29','MORNING',$6,$6,'DIRECT_GUARD','Europe/London','08:00','10:00','2026-03-29T08:00:00Z','2026-03-29T10:00:00Z','COMPLETED','2026-03-29T10:06:00Z','2026-03-29T10:05:00Z',true,360)",
      [missed, cov, customer, business, location, key()],
    )
    await db.query(
      "insert into public.guard_check_obligations(id,coverage_id,customer_id,business_id,location_id,service_date,window_code,schedule_version_id,rota_assignment_id,coverage_basis,timezone,local_start,local_end,window_start_utc,window_end_utc,state,retry_count) values($1,$2,$3,$4,$5,'2026-03-29','EVENING',$6,$6,'DIRECT_GUARD','Europe/London','16:00','18:00','2026-03-29T16:00:00Z','2026-03-29T18:00:00Z','PENDING',2)",
      [incomplete, key(), customer, business, location, key()],
    )
    await db.exec("set session_replication_role = origin")
    const detail = await rpc("admin_report_detail_v1", [token, "guard_coverage_failures", "custom", "2026-03-29", "2026-03-29", null, 50, clock])
    const labels = (detail?.page?.rows || []).map(row => (row as { label?: string }).label)
    expect(labels).toEqual(expect.arrayContaining(["MISSED", "RETRY_REQUIRED"]))
    expect(labels).not.toContain("COMPLETED")
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_check_obligations where id in ($1,$2)", [missed, incomplete])
    await db.exec("set session_replication_role = origin")
  })

  it("treats schedule effective_to as end-exclusive like Step 17", async () => {
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_check_schedule_versions")
    await db.query(
      "insert into public.guard_check_schedule_versions(id,status,effective_from,effective_to,morning_start,morning_end,evening_start,evening_end,created_by,approved_at,approved_by) values($1,'APPROVED','2026-03-01','2026-03-29','08:00','10:00','16:00','18:00',$2,now(),$2)",
      [key(), uid],
    )
    await db.exec("set session_replication_role = origin")
    const dash = await rpc("admin_dashboard_today_v1", [token, "today", null, null, clock])
    expect(dash?.monitoringScheduleConfigured).toBe(false)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_check_schedule_versions")
    await db.query(
      "insert into public.guard_check_schedule_versions(id,status,effective_from,effective_to,morning_start,morning_end,evening_start,evening_end,created_by,approved_at,approved_by) values($1,'APPROVED','2026-03-01','2026-03-30','08:00','10:00','16:00','18:00',$2,now(),$2)",
      [key(), uid],
    )
    await db.exec("set session_replication_role = origin")
    expect((await rpc("admin_dashboard_today_v1", [token, "today", null, null, clock]))?.monitoringScheduleConfigured).toBe(true)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.guard_check_schedule_versions")
    await db.exec("set session_replication_role = origin")
  })

  it("implements outcomes, first-response breakdown and service-mix counts", async () => {
    await db.exec("alter table public.cases disable trigger cases_workflow_version")
    await db.query("update public.cases set status='CLOSED', outcome='RESTORED', closed_at='2026-03-29T11:00:00Z', service_track='GUIDED' where id=$1", [caseId])
    await db.exec("alter table public.cases enable trigger cases_workflow_version")
    const withdrawn = key()
    await db.exec("set session_replication_role = replica")
    await db.query(
      "insert into public.cases(id,public_ref,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track,status,outcome,closed_at) values($1,'RV-26-AAAAAA','REVIEW_PROTECTION',$2,$3,$4,'Review issue','2026-03-20',now(),now(),'MANAGED','CANCELLED','WITHDRAWN','2026-03-29T12:00:00Z')",
      [withdrawn, customer, business, location],
    )
    await db.query(
      "insert into public.service_orders(id,public_ref,quote_id,quote_version_id,quote_acceptance_id,customer_id,business_id,service_code,amount_minor,currency,payment_model,tax_behaviour,tax_amount_minor,state,accepted_at) values($1,'SO-26-AAAAAA',$2,$2,$2,$3,$4,'GUIDED_RELAUNCH',9900,'GBP','UPFRONT','NOT_APPLICABLE',0,'ACCEPTED_AWAITING_PAYMENT','2026-03-29T09:00:00Z')",
      [key(), key(), customer, business],
    )
    await db.exec("set session_replication_role = origin")
    await addEnquiry("2026-03-29T09:00:00Z")
    await db.query("insert into public.enquiry_events(enquiry_id,event,note) select id, 'triaged', 'Triaged' from public.enquiries limit 1")
    const outcomes = await rpc("admin_report_summary_v1", [token, "outcomes", "custom", "2026-03-01", "2026-03-31", clock])
    expect(outcomes?.summary).toMatchObject({ success: 1, withdrawn: 1, denominator: 1 })
    expect((outcomes?.summary as { successRate?: number }).successRate).toBe(100)
    const first = await rpc("admin_report_summary_v1", [token, "first_response", "custom", "2026-03-01", "2026-03-31", clock])
    expect((first?.summary as { enquiry?: { measured?: number }; case?: { measured?: number } }).enquiry?.measured).toBeGreaterThan(0)
    expect((first?.summary as { note?: string }).note).toMatch(/two operational response populations/i)
    const mix = await rpc("admin_report_summary_v1", [token, "service_mix", "custom", "2026-03-01", "2026-03-31", clock])
    expect((mix?.summary as { groups?: Array<{ group: string; count: number }> }).groups?.some(row => row.group === "Guided" && row.count === 1)).toBe(true)
    await db.exec("set session_replication_role = replica")
    await db.query("delete from public.service_orders")
    await db.query("delete from public.cases where id=$1", [withdrawn])
    await db.exec("set session_replication_role = origin")
  })

  it("replays the same export request concurrently with one audit event and no stored rows", async () => {
    await addEnquiry("2026-03-29T10:00:00Z")
    const request = key()
    const [a, b] = await Promise.all([
      rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock]),
      rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock]),
    ])
    expect(a?.status).toBe("success")
    expect(b?.status).toBe("success")
    const audits = await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events where action='REPORT_CHANGED' and request_id=$1", [request])
    expect(audits.rows[0].n).toBe(1)
    const receipt = await db.query<{ result: Record<string, unknown> }>("select result from admin_private.report_export_receipts where request_id=$1", [request])
    expect(JSON.stringify(receipt.rows[0].result)).not.toMatch(/@example.com|"rows"/)
  })

  it("creates saved filters concurrently without a unique-violation 500", async () => {
    const [a, b] = await Promise.all([
      rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Same name", filter: { preset: "today" } }, null]),
      rpc("admin_saved_filter_command_v1", [token, key(), "create", { module: "REPORTS", name: "Same name", filter: { preset: "today" } }, null]),
    ])
    const statuses = [a?.status, b?.status].sort()
    expect(statuses).toEqual(["conflict", "success"])
    expect([a, b].some(row => row?.reason === "duplicate_name" || row?.status === "success")).toBe(true)
  })

  it("denies direct CRUD and privilege escalation on new tables and RPCs", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.admin_saved_filters','INSERT') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,'public.admin_saved_filters','SELECT') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_dashboard_today_v1(text,text,date,date,timestamptz)','EXECUTE') as ok", [role])).rows[0].ok).toBe(role === "service_role")
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','admin_private.report_rows_v1(text,timestamptz,timestamptz,timestamptz)','EXECUTE') as ok")).rows[0].ok).toBe(false)
  })

  it("does not change Step 7-18 gates, cron, or applied migrations", async () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261001092213_admin_dashboard_search_reports_v1.sql", import.meta.url), "utf8")
    const cron = readFileSync(new URL("../../../../apps/admin/vercel.json", import.meta.url), "utf8")
    expect(cron).toContain("0 4 * * *")
    expect(sql).not.toMatch(/GUARD_ALERTS_ENABLED|GUARD_CHECKS_ENABLED|GUARD_ACTIVATION_ENABLED|GUARD_SUBSCRIPTIONS_ENABLED|COMMUNICATIONS_SEND_ENABLED|JOB_PROVIDER_MODE/)
    expect(sql).toMatch(/SOURCE IMPLEMENTED \/ MIGRATION NOT APPLIED/)
    expect(await rpc("admin_session_v1", [token])).toMatchObject({ userId: uid })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.price_versions where seed_key is not null")).rows[0].n).toBeGreaterThan(0)
  })
})
