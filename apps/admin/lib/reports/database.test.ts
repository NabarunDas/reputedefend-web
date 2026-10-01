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
  await db.query(
    `insert into public.enquiries(id,submission_key,fingerprint,source,payload,assigned,internal_status,ack_status,status,created_at)
     values($1,$2,$3,'phone',$4,$5,'SKIPPED','SKIPPED',$6,$7::timestamptz)`,
    [id, key(), `fp-${id}`, { name: "Pat", email: "pat@example.com" }, assigned, status, at],
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
    const converted = await addEnquiry("2026-03-29T12:00:00Z")
    await db.query("update public.enquiries set status='converted', case_id=$2, assigned=true where id=$1", [converted, caseId])
    const dash = await rpc("admin_dashboard_today_v1", [token, "custom", "2026-03-01", "2026-03-31", clock])
    expect(dash?.metrics?.clientsTotal?.count).toBe(2)
    expect(dash?.metrics?.clientsActiveService?.count).toBe(1)
    expect(dash?.metrics?.openEnquiries?.count).toBe(1)
    expect(dash?.metrics?.contactsEnquiryOnly?.count).toBe(2)
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
    const foreign = (await db.query<{ id: string }>("insert into public.admin_saved_filters(actor_id,module,name,filter) values($1,'REPORTS','Theirs','{}'::jsonb) returning id", [otherActor])).rows[0].id
    expect(await rpc("admin_saved_filter_command_v1", [token, key(), "delete", { id: foreign }, 1])).toMatchObject({ status: "denied" })
    await expect(db.query("insert into public.admin_saved_filters(actor_id,module,name,filter) values($1,'REPORTS','direct','[]'::jsonb)", [uid])).rejects.toThrow()
    await expect(db.query("update public.admin_saved_filters set actor_id=$1 where id=$2", [otherActor, created!.id])).rejects.toThrow()
  })

  it("audits exports, rejects over-limit and conflicting replays, and does not store CSV text", async () => {
    for (let i = 0; i < 12; i++) await addEnquiry(`2026-03-29T0${i % 10}:00:00Z`)
    const request = key()
    const first = await rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(first?.status).toBe("success")
    expect(first?.rowCount).toBeGreaterThan(0)
    const replay = await rpc("admin_report_export_v1", [token, request, "enquiry_to_case", "custom", "2026-03-01", "2026-03-31", clock])
    expect(replay).toEqual(first)
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
    const preview = await rpc("admin_customer_preview_v1", [token, customer])
    expect(preview?.status).toBe("success")
    expect(preview?.customer).toMatchObject({ email: "alex@example.com", emailVerified: true })
    expect(JSON.stringify(preview)).toContain("Customer can read this approved note.")
    expect(JSON.stringify(preview)).not.toMatch(/Internal staff note|stripe|sk_live|otp|severity|job_outbox/)
    expect(preview?.memberships || []).toEqual([])
    expect(await rpc("admin_customer_preview_v1", [token, "00000000-0000-4000-8000-000000000000"])).toMatchObject({ status: "denied" })
    expect(await rpc("admin_customer_preview_v1", ["nope", customer])).toBeNull()
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
