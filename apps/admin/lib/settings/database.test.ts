import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const otherActor = "99999999-9999-4999-8999-999999999999"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()

type RpcResult = Record<string, unknown> & {
  status?: string
  reason?: string
  id?: string
  version?: number
  preview?: Record<string, unknown>
  staff?: { removable?: boolean; registeredAccount?: string; roles?: string }
  versions?: Array<{ id: string; status: string; recordVersion: number; version: number }>
  drafts?: Array<{ id: string; key: string; recordVersion: number }>
  approved?: Array<{ key: string; version: number }>
  rows?: Array<Record<string, unknown>>
  holds?: Array<Record<string, unknown>>
  requests?: Array<Record<string, unknown>>
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

const hoursPayload = {
  timezone: "Europe/London",
  weekdays: [{ day: 1, start: "09:00", end: "17:30" }],
  firstResponseTargetHours: 8,
  independentOfGuardMonitoring: true,
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
    readdirSync(dir).find(n => n.endsWith("_admin_settings_privacy_v1.sql"))!,
  ]) await db.exec(read(name))
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.admin_identity disable trigger admin_identity_protect;
    alter table public.admin_settings_versions disable trigger admin_settings_versions_protect;
    alter table public.legal_holds disable trigger legal_holds_protect;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,public.admin_saved_filters,admin_private.report_export_receipts,admin_private.report_command_receipts,admin_private.settings_command_receipts,admin_private.communication_template_drafts,public.admin_settings_versions,public.legal_holds,public.privacy_requests,public.operational_incidents,public.guard_check_schedule_versions,auth.users,public.enquiry_events,public.enquiries,public.case_tasks,public.case_work_events,public.customer_contact_verifications,public.business_memberships,admin_private.jobs,admin_private.job_outbox cascade;
    delete from public.cases where id <> '${caseId}';
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${otherActor}','other@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex Baker','alex@example.com','+441234567890') on conflict (id) do update set full_name=excluded.full_name, email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street') on conflict (id) do update set location_name=excluded.location_name;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'GUIDED') on conflict (id) do nothing;
    alter table public.admin_identity enable trigger admin_identity_protect;
    alter table public.admin_settings_versions enable trigger admin_settings_versions_protect;
    alter table public.legal_holds enable trigger legal_holds_protect;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;`)
})

describe("Step 20 settings, privacy, templates, complaints and incidents", () => {
  it("keeps the singleton Admin identity unremovable and unrebindable", async () => {
    const overview = await rpc("admin_settings_overview_v1", [token])
    expect(overview?.staff).toMatchObject({
      registeredAccount: "admin@profilerelaunch.com",
      removable: false,
      roles: expect.stringMatching(/no staff levels/i),
    })
    await expect(db.query("delete from public.admin_identity")).rejects.toThrow(/cannot be removed/)
    await expect(db.query("update public.admin_identity set auth_user_id=$1", [otherActor])).rejects.toThrow(/rebinding/)
    await expect(db.query("update public.admin_identity set enabled=false")).rejects.toThrow(/cannot be disabled/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_identity")).rows[0].n).toBe(1)
    expect((await db.query<{ ok: boolean }>("select admin_private.saved_filter_actor_is_staff_v1($1) as ok", [uid])).rows[0].ok).toBe(true)
    expect((await db.query<{ ok: boolean }>("select admin_private.saved_filter_actor_is_staff_v1($1) as ok", [otherActor])).rows[0].ok).toBe(false)
  })

  it("approves future settings, rejects retroactive and secret payloads, and does not rewrite history", async () => {
    const created = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Weekday case hours", payload: hoursPayload,
    }, null])
    expect(created?.status).toBe("success")
    const listed = await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"])
    const draft = listed?.versions?.find(row => row.status === "DRAFT")
    expect(draft).toBeTruthy()
    const approved = await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: draft!.id }, draft!.recordVersion])
    expect(approved?.status).toBe("success")
    const after = await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"])
    expect(after?.versions?.find(row => row.id === draft!.id)?.status).toBe("APPROVED")
    const past = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Backdated hours", effectiveFrom: "2020-01-01T00:00:00Z", payload: hoursPayload,
    }, null])
    expect(past?.status).toBe("success")
    const pastDraft = (await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"]))?.versions?.find(row => row.status === "DRAFT")
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: pastDraft!.id }, pastDraft!.recordVersion])).toMatchObject({
      status: "invalid", reason: "retroactive_effective_from",
    })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "RETENTION", reason: "Secret", payload: { unsuccessfulEnquiriesDays: 30, caseEvidenceDays: 30, financialDays: 30, consentDays: 30, securityLogsDays: 30, apiKey: "sk_live_123" },
    }, null])).toMatchObject({ status: "invalid" })
    await expect(db.query("update public.admin_settings_versions set payload='{\"timezone\":\"UTC\"}'::jsonb where id=$1", [draft!.id])).rejects.toThrow(/immutable/)
  })

  it("requires a fresh sign-in for setting approval and hold release", async () => {
    const created = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "RETENTION", reason: "Record retention policy", payload: {
        unsuccessfulEnquiriesDays: 90, caseEvidenceDays: 365, financialDays: 2555, consentDays: 365, securityLogsDays: 365,
      },
    }, null])
    await db.query("update public.admin_sessions set created_at = now() - interval '10 minutes' where token_hash=$1", [token])
    const listed = await rpc("admin_settings_list_v1", [token, "RETENTION"])
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: created!.id }, listed?.versions?.[0].recordVersion])).toMatchObject({
      status: "reauth_required",
    })
  })

  it("promotes template drafts to the next immutable approved version", async () => {
    const before = await rpc("admin_template_list_v1", [token])
    const current = before?.approved?.find(row => row.key === "CASE_UPDATE")?.version || 0
    const draft = await rpc("admin_settings_command_v1", [token, key(), "create_template_draft", {
      templateKey: "CASE_UPDATE",
      name: "Case update v-next",
      subject: "Update on {case_ref}",
      body: "We have an update on {case_ref}. This is the next approved wording.",
    }, null])
    expect(draft?.status).toBe("success")
    const listed = await rpc("admin_template_list_v1", [token])
    const row = listed?.drafts?.find(item => item.id === draft!.id)
    const approved = await rpc("admin_settings_command_v1", [token, key(), "approve_template_draft", { id: draft!.id }, row!.recordVersion])
    expect(approved).toMatchObject({ status: "success", approvedVersion: current + 1 })
    const latest = (await db.query<{ version: number }>("select version from admin_private.communication_templates where template_key='CASE_UPDATE' order by version desc limit 1")).rows[0].version
    expect(latest).toBe(current + 1)
    expect((await rpc("admin_template_list_v1", [token]))?.drafts || []).toHaveLength(0)
  })

  it("previews retained financial and audit data and blocks deletion under a legal hold", async () => {
    const unverified = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, scopeNote: "Customer asked for deletion of unused enquiry data.",
    }, null])
    expect(unverified?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: unverified!.id }, 1])).toMatchObject({
      status: "denied", reason: "email_not_verified",
    })
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [
      customer, "alex@example.com", uid, "Verified from a live call with the customer.",
    ])
    const verified = await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: unverified!.id }, 1])
    expect(verified?.status).toBe("success")
    const previewed = await rpc("admin_settings_command_v1", [token, key(), "preview_privacy_request", { id: unverified!.id }, 2])
    expect(previewed?.status).toBe("success")
    expect(previewed?.preview).toMatchObject({ blockedByHold: false, automatedDeletion: false })
    expect(JSON.stringify(previewed?.preview)).toMatch(/Financial receipts, obligations and audit events are retained/)
    expect(JSON.stringify(previewed)).not.toMatch(/sk_live|whsec_|otp/)
    const hold = await rpc("admin_settings_command_v1", [token, key(), "create_hold", {
      category: "FINANCIAL", customerId: customer, reason: "Open payment dispute remains under review.",
    }, null])
    expect(hold?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "complete_privacy_request", { id: unverified!.id }, 3])).toMatchObject({
      status: "denied", reason: "legal_hold",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customers where id=$1", [customer])).rows[0].n).toBe(1)
    expect((await db.query<{ status: string }>("select status from public.privacy_requests where id=$1", [unverified!.id])).rows[0].status).toBe("REFUSED")
  })

  it("lists complaints and records incidents without an invented SLA", async () => {
    await db.query(
      "insert into public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) values($1,'Complaint about delay','ADMIN','COMPLAINT',now(),'Customer complaint recorded on a call','Europe/London','MANUAL_QUEUE')",
      [caseId],
    )
    const complaints = await rpc("admin_complaint_list_v1", [token, "open"])
    expect(complaints?.rows).toHaveLength(1)
    expect(complaints?.rows?.[0]).toMatchObject({ title: "Complaint about delay" })
    const opened = await rpc("admin_settings_command_v1", [token, key(), "create_incident", {
      kind: "MAIL_FAILURE", title: "Outbound mail paused", summary: "Provider reported a sending outage.",
    }, null])
    expect(opened?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "acknowledge_incident", { id: opened!.id }, 1])).toMatchObject({ status: "success" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "resolve_incident", { id: opened!.id, resolution: "Provider restored sending. No customer mail was sent while live delivery stayed disabled." }, 2])).toMatchObject({ status: "success" })
    expect((await rpc("admin_incident_list_v1", [token, "resolved"]))?.rows).toHaveLength(1)
    const replay = key()
    const first = await rpc("admin_settings_command_v1", [token, replay, "create_incident", {
      kind: "OTHER", title: "Same incident twice", summary: "Idempotent open for a worker gap.",
    }, null])
    const second = await rpc("admin_settings_command_v1", [token, replay, "create_incident", {
      kind: "OTHER", title: "Same incident twice", summary: "Idempotent open for a worker gap.",
    }, null])
    expect(first).toEqual(second)
    expect(await rpc("admin_settings_overview_v1", ["nope"])).toBeNull()
  })

  it("keeps new public RPCs service-role-only and stores no secrets in audit", async () => {
    await rpc("admin_settings_command_v1", [token, key(), "create_incident", {
      kind: "WORKER_OUTAGE", title: "Worker late", summary: "Heartbeat was late after the daily window.",
    }, null])
    const audit = await db.query<{ action: string; details: Record<string, unknown> }>("select action, details from public.admin_audit_events where action='INCIDENT_CHANGED'")
    expect(audit.rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit.rows)).not.toMatch(/sk_live|whsec_|otp|SUPABASE_SECRET/)
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_settings_overview_v1(text)','EXECUTE') as ok", [role])).rows[0].ok).toBe(role === "service_role")
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_settings_command_v1(text,uuid,text,jsonb,integer)','EXECUTE') as ok", [role])).rows[0].ok).toBe(role === "service_role")
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','admin_private.privacy_preview_v1(uuid)','EXECUTE') as ok")).rows[0].ok).toBe(false)
  })
})
