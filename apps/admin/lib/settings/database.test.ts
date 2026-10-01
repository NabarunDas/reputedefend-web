import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const otherActor = "99999999-9999-4999-8999-999999999999"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const tomorrow = () => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + 2)
  return value.toISOString()
}

type RpcResult = Record<string, unknown> & {
  status?: string
  reason?: string
  id?: string
  version?: number
  preview?: Record<string, unknown>
  staff?: { removable?: boolean; registeredAccount?: string; roles?: string }
  versions?: Array<{ id: string; status: string; recordVersion: number; version: number; payload?: Record<string, unknown> }>
  drafts?: Array<{ id: string; key: string; recordVersion: number }>
  approved?: Array<{ key: string; version: number; approvalSource?: string }>
  rows?: Array<Record<string, unknown>>
  holds?: Array<Record<string, unknown>>
  requests?: Array<Record<string, unknown>>
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

const hoursPayload = {
  timezone: "Europe/London",
  weekendPolicy: "EXCLUDED",
  bankHolidayPolicy: "INCLUDED",
  windows: [1, 2, 3, 4, 5].map(day => ({ day, start: "09:00", end: "17:00" })),
}

const futureIso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const recentIso = () => new Date(Date.now() - 10_000).toISOString()

let tracked = 1
const currentVersion = () => tracked

function stepper(id: string) {
  tracked = 1
  return async (operation: string, payload: Record<string, unknown>) => {
    const result = await rpc("admin_settings_command_v1", [token, key(), operation, { id, ...payload }, tracked])
    if (typeof result?.version === "number") tracked = result.version
    return result
  }
}

async function verifyCustomerEmail() {
  await db.query(
    "insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)",
    [customer, "alex@example.com", uid, "Verified from a live call with the customer."],
  )
}

async function approveSetting(settingKey: string, payload: unknown, effectiveFrom: string, reason: string) {
  const created = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
    key: settingKey, reason, effectiveFrom, payload,
  }, null])
  const approved = await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: created!.id }, 1])
  expect(approved?.status).toBe("success")
  return { id: created!.id as string }
}

async function approveRetention(category: string, days: number, effectiveFrom = recentIso()) {
  const created = await rpc("admin_settings_command_v1", [token, key(), "create_retention_draft", {
    category, retentionMode: "RETAIN_FOR_PERIOD", durationDays: days,
    reason: `Approved retention for ${category}`, effectiveFrom,
  }, null])
  const approved = await rpc("admin_settings_command_v1", [token, key(), "approve_retention", { id: created!.id }, 1])
  expect(approved?.status).toBe("success")
  return { id: created!.id as string }
}

async function insertEnquiry(id: string, email: string, createdAt?: string) {
  await db.query(
    `insert into public.enquiries(id,submission_key,fingerprint,source,payload,internal_status,ack_status,status${createdAt ? ",created_at" : ""})
     values($1,$2,'fp','contact',$3,'SKIPPED','SKIPPED','new'${createdAt ? ",$4" : ""})`,
    [
      id, key(),
      {
        fullName: "Alex", email, phone: "", businessName: "", country: "", service: "",
        subject: "Help", details: "Details", websiteUrl: "", businessProfileUrl: "", reviewUrl: "", source: "contact",
      },
      ...(createdAt ? [createdAt] : []),
    ],
  )
}

async function insertStoredEvidence() {
  const documentId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Stored evidence',$3)", [documentId, caseId, uid])
  await db.query(
    `insert into public.case_document_versions(
       id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,created_by
     ) values($1,$2,1,'evidence.pdf','application/pdf',1024,'evidence-bucket',$3,$4)`,
    [versionId, documentId, `cases/${caseId}/documents/${documentId}/versions/${versionId}`, uid],
  )
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
    readdirSync(dir).find(n => n.endsWith("_admin_settings_privacy_operations_v1.sql"))!,
  ]) await db.exec(read(name))
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`delete from public.case_document_versions;
    delete from public.case_documents;
    alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.admin_identity disable trigger admin_identity_protect;
    alter table public.admin_setting_versions disable trigger admin_setting_versions_protect;
    alter table public.retention_policy_versions disable trigger retention_policy_versions_protect;
    alter table public.legal_holds disable trigger legal_holds_protect;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,public.admin_saved_filters,admin_private.report_export_receipts,admin_private.report_command_receipts,admin_private.settings_command_receipts,admin_private.privacy_export_receipts,public.admin_setting_versions,public.retention_policy_versions,public.legal_holds,public.privacy_request_dispositions,public.privacy_requests,public.complaints,public.operational_incidents,public.service_response_obligations,public.guard_check_schedule_versions,auth.users,public.enquiry_events,public.enquiries,public.case_tasks,public.case_work_events,public.customer_contact_verifications,public.business_memberships,admin_private.jobs,admin_private.job_outbox cascade;
    delete from public.case_documents;
    delete from public.cases where id <> '${caseId}';
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${otherActor}','other@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex Baker','alex@example.com','+441234567890') on conflict (id) do update set full_name=excluded.full_name, email=excluded.email;
    insert into public.customers(id,full_name,email,phone) values('${otherCustomer}','Other Person','other@example.com','+441111111111') on conflict (id) do update set full_name=excluded.full_name;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street') on conflict (id) do update set location_name=excluded.location_name;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'GUIDED') on conflict (id) do nothing;
    alter table public.admin_identity enable trigger admin_identity_protect;
    alter table public.admin_setting_versions enable trigger admin_setting_versions_protect;
    alter table public.retention_policy_versions enable trigger retention_policy_versions_protect;
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
    expect(await rpc("admin_settings_command_v1", [token, key(), "invite_staff", { email: "ops@example.com" }, null])).toMatchObject({ status: "invalid" })
  })

  it("seeds no approved service, target, schedule or retention rows", async () => {
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_setting_versions where status='APPROVED'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.retention_policy_versions where status='APPROVED'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_schedule_versions where status='APPROVED'")).rows[0].n).toBe(0)
    const overview = await rpc("admin_settings_overview_v1", [token])
    expect(overview?.serviceHours).toBeNull()
    expect(overview?.responseTargets).toBeNull()
    expect(overview?.noApprovedSeeds).toBe(true)
  })

  it("approves future settings, rejects retroactive, secret and unknown keys, and does not rewrite history", async () => {
    const created = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Weekday case hours", effectiveFrom: tomorrow(), payload: hoursPayload,
    }, null])
    expect(created?.status).toBe("success")
    const listed = await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"])
    const draft = listed?.versions?.find(row => row.status === "DRAFT")
    expect(draft).toBeTruthy()
    const stale = await rpc("admin_settings_command_v1", [token, key(), "update_setting_draft", { id: draft!.id, reason: "Stale edit" }, 99])
    expect(stale).toMatchObject({ status: "conflict" })
    const approved = await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: draft!.id }, draft!.recordVersion])
    expect(approved?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "update_setting_draft", { id: draft!.id, reason: "Edit approved" }, 2])).toMatchObject({ status: "invalid" })
    await expect(db.query("update public.admin_setting_versions set payload = payload || '{\"x\":1}'::jsonb where id=$1", [draft!.id])).rejects.toThrow(/immutable/)
    await expect(db.query("update public.admin_setting_versions set status='DRAFT', record_version=record_version+1 where id=$1", [draft!.id])).rejects.toThrow(/cannot return to draft/)
    const past = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Backdated hours", effectiveFrom: "2020-01-01T00:00:00Z", payload: hoursPayload,
    }, null])
    expect(past?.status).toBe("success")
    const pastDraft = (await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"]))?.versions?.find(row => row.status === "DRAFT")
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: pastDraft!.id }, pastDraft!.recordVersion])).toMatchObject({
      status: "invalid", reason: "retroactive_effective_from",
    })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "STAFF_ROLES", reason: "Roles", payload: { roles: ["Owner"] },
    }, null])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Secret", payload: { ...hoursPayload, apiKey: "sk_live_123" },
    }, null])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Arbitrary keys", payload: { ...hoursPayload, extra: true },
    }, null])).toMatchObject({ status: "invalid" })
  })

  it("requires approved service hours before response targets and snapshots immutable obligations", async () => {
    const recent = new Date(Date.now() - 15_000).toISOString()
    const targets = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "RESPONSE_TARGETS", reason: "Need hours first", effectiveFrom: recent,
      payload: { ENQUIRY_FIRST_RESPONSE: { hours: 8 }, CASE_FIRST_RESPONSE: { hours: 8 } },
    }, null])
    const targetDraft = (await rpc("admin_settings_list_v1", [token, "RESPONSE_TARGETS"]))?.versions?.[0]
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: targets!.id }, targetDraft!.recordVersion])).toMatchObject({
      status: "denied", reason: "service_hours_required",
    })
    const hours = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SERVICE_HOURS", reason: "Hours for targets", effectiveFrom: recent, payload: hoursPayload,
    }, null])
    const hourDraft = (await rpc("admin_settings_list_v1", [token, "SERVICE_HOURS"]))?.versions?.[0]
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: hours!.id }, hourDraft!.recordVersion]))?.status).toBe("success")
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: targets!.id }, targetDraft!.recordVersion]))?.status).toBe("success")
    const enquiryId = key()
    await db.query(
      "insert into public.enquiries(id,submission_key,fingerprint,source,payload,internal_status,ack_status,status) values($1,$2,'fp','contact',$3,'SKIPPED','SKIPPED','new')",
      [enquiryId, key(), { fullName: "Alex", email: "alex@example.com", phone: "", businessName: "", country: "", service: "", subject: "Help", details: "Details", websiteUrl: "", businessProfileUrl: "", reviewUrl: "", source: "contact" }],
    )
    const before = await db.query<{ due_at: string; target_hours: number }>("select due_at::text, target_hours from public.service_response_obligations where enquiry_id=$1", [enquiryId])
    expect(before.rows).toHaveLength(1)
    const later = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "RESPONSE_TARGETS", reason: "Later target", effectiveFrom: tomorrow(),
      payload: { ENQUIRY_FIRST_RESPONSE: { hours: 2 }, CASE_FIRST_RESPONSE: { hours: 2 } },
    }, null])
    const laterDraft = (await rpc("admin_settings_list_v1", [token, "RESPONSE_TARGETS"]))?.versions?.find(row => row.status === "DRAFT")
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: later!.id }, laterDraft!.recordVersion]))?.status).toBe("success")
    const after = await db.query<{ due_at: string; target_hours: number }>("select due_at::text, target_hours from public.service_response_obligations where enquiry_id=$1", [enquiryId])
    expect(after.rows[0]).toEqual(before.rows[0])
  })

  it("computes staffed due dates across hours, weekends and DST", async () => {
    const payload = JSON.stringify(hoursPayload)
    const inside = await db.query<{ due: string }>("select admin_private.staffed_due_at_v1(timestamptz '2026-01-07 10:00:00+00', 1, $1::jsonb)::text as due", [payload])
    expect(inside.rows[0].due).toContain("2026-01-07")
    const beforeOpen = await db.query<{ due: string }>("select admin_private.staffed_due_at_v1(timestamptz '2026-01-07 07:00:00+00', 1, $1::jsonb)::text as due", [payload])
    expect(beforeOpen.rows[0].due).toContain("2026-01-07")
    const friday = await db.query<{ due: string }>("select admin_private.staffed_due_at_v1(timestamptz '2026-01-09 16:30:00+00', 2, $1::jsonb)::text as due", [payload])
    expect(friday.rows[0].due).toContain("2026-01-12")
    const spring = await db.query<{ due: string }>("select admin_private.staffed_due_at_v1(timestamptz '2026-03-29 00:30:00+00', 1, $1::jsonb)::text as due", [payload])
    expect(spring.rows[0].due).toBeTruthy()
    const autumn = await db.query<{ due: string }>("select admin_private.staffed_due_at_v1(timestamptz '2026-10-25 00:30:00+00', 1, $1::jsonb)::text as due", [payload])
    expect(autumn.rows[0].due).toBeTruthy()
  })

  it("requires a fresh sign-in for sensitive approvals", async () => {
    const created = await rpc("admin_settings_command_v1", [token, key(), "create_retention_draft", {
      category: "UNSUCCESSFUL_ENQUIRIES", retentionMode: "RETAIN_FOR_PERIOD", durationDays: 30, reason: "Record retention policy", effectiveFrom: tomorrow(),
    }, null])
    await db.query("update public.admin_sessions set created_at = now() - interval '10 minutes' where token_hash=$1", [token])
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_retention", { id: created!.id }, 1])).toMatchObject({
      status: "reauth_required",
    })
  })

  it("migrates existing templates and never selects draft or retired versions", async () => {
    const before = await rpc("admin_template_list_v1", [token])
    expect(before?.approved?.find(row => row.key === "CASE_UPDATE")).toMatchObject({ version: 1, approvalSource: "MIGRATED_EXISTING" })
    const draft = await rpc("admin_settings_command_v1", [token, key(), "create_template_draft", {
      templateKey: "CASE_UPDATE",
      name: "Case update v-next",
      subject: "Update on {case_ref}",
      body: "{fact} {effect} {next_step}",
    }, null])
    expect(draft?.status).toBe("success")
    const selected = await db.query<{ version: number; status: string }>(
      "select version, status from admin_private.communication_templates where template_key='CASE_UPDATE' and status='APPROVED' order by version desc limit 1",
    )
    expect(selected.rows[0]).toMatchObject({ version: 1, status: "APPROVED" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_template_draft", {
      templateKey: "CASE_UPDATE", name: "Bad", subject: "Hello", body: "This has an {unknown_token} and is otherwise long enough.",
    }, null])).toMatchObject({ status: "invalid" })
    const listed = await rpc("admin_template_list_v1", [token])
    const row = listed?.drafts?.find(item => item.id === draft!.id)
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_template_draft", { id: draft!.id }, row!.recordVersion]))?.status).toBe("success")
    const after = await db.query<{ version: number }>(
      "select version from admin_private.communication_templates where template_key='CASE_UPDATE' and status='APPROVED' order by version desc limit 1",
    )
    expect(after.rows[0].version).toBe(2)
    await expect(db.query("update admin_private.communication_templates set subject_template='x' where template_key='CASE_UPDATE' and version=2")).rejects.toThrow(/immutable/)
  })

  it("creates Guard schedule drafts without inventing production clocks or jobs", async () => {
    const draft = await rpc("admin_settings_command_v1", [token, key(), "create_schedule_draft", {
      morningStart: "08:00", morningEnd: "10:00", eveningStart: "16:00", eveningEnd: "18:00", effectiveFrom: "2026-12-01",
    }, null])
    expect(draft?.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type='MAINTAIN_GUARD_CHECKS'")).rows[0].n).toBe(0)
    await db.query("update public.guard_check_schedule_versions set effective_from='2020-01-01', record_version=record_version+1 where id=$1", [draft!.id])
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_schedule", { id: draft!.id }, 2])).toMatchObject({
      status: "invalid", reason: "retroactive_effective_from",
    })
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
    expect((await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: unverified!.id }, 1]))?.status).toBe("success")
    const previewed = await rpc("admin_settings_command_v1", [token, key(), "preview_privacy_request", { id: unverified!.id }, 2])
    expect(previewed?.status).toBe("success")
    expect(previewed?.preview).toMatchObject({ automatedDeletion: false })
    expect(JSON.stringify(previewed?.preview)).toMatch(/Financial receipts, obligations and audit events are retained/)
    expect(JSON.stringify(previewed?.preview)).toMatch(/BLOCKED_EXTERNAL_DELETION|storage delete/)
    expect(JSON.stringify(previewed)).not.toMatch(/sk_live|whsec_|otp/)
    expect(await rpc("admin_settings_command_v1", [token, key(), "complete_privacy_request", { id: unverified!.id, resolution: "Tried to finish with blockers." }, 3])).toMatchObject({
      status: "denied",
    })
    const hold = await rpc("admin_settings_command_v1", [token, key(), "create_hold", {
      scopeKind: "CUSTOMER", customerId: customer, reason: "Open payment dispute remains under review.",
    }, null])
    expect(hold?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "execute_deletion", { id: unverified!.id, enquiryId: caseId }, 3])).toMatchObject({
      status: expect.stringMatching(/denied|invalid/),
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customers where id=$1", [customer])).rows[0].n).toBe(1)
    const unrelated = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: otherCustomer, notes: "Other customer access request.",
    }, null])
    expect(unrelated?.status).toBe("success")
    expect(await rpc("admin_privacy_export_v1", [token, key(), unrelated!.id, 1])).toMatchObject({
      status: "denied", reason: "identity_unverified",
    })
  })

  it("denies cross-customer complaint links and keeps complaints after case closure", async () => {
    const created = await rpc("admin_settings_command_v1", [token, key(), "create_complaint", {
      customerId: customer, caseId, source: "EMAIL", category: "SERVICE", summary: "Complaint about delay",
    }, null])
    expect(created?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_complaint", {
      customerId: otherCustomer, caseId, source: "EMAIL", category: "SERVICE", summary: "Wrong customer link",
    }, null])).toMatchObject({ status: "denied", reason: "cross_customer" })
    await db.query("update public.cases set status='CLOSED', closed_at=now() where id=$1", [caseId])
    const listed = await rpc("admin_complaint_list_v1", [token, "open"])
    expect(listed?.rows?.[0]).toMatchObject({ title: "Complaint about delay" })
    expect((await rpc("admin_settings_command_v1", [token, key(), "resolve_complaint", { id: created!.id, resolution: "Explained the delay. No refund was issued." }, 1]))?.status).toBe("success")
    await expect(db.query("update public.complaints set status='OPEN' where id=$1", [created!.id])).rejects.toThrow(/immutable/)
  })

  it("records incidents without provider, mail, Guard or payment side effects", async () => {
    const opened = await rpc("admin_settings_command_v1", [token, key(), "create_incident", {
      kind: "EMAIL", title: "Outbound mail paused", summary: "Provider reported a sending outage.",
    }, null])
    expect(opened?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "acknowledge_incident", { id: opened!.id }, 1])).toMatchObject({ status: "success" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "resolve_incident", { id: opened!.id, resolution: "Provider restored sending. No customer mail was sent while live delivery stayed disabled." }, 2])).toMatchObject({ status: "success" })
    await expect(db.query("update public.operational_incidents set status='OPEN' where id=$1", [opened!.id])).rejects.toThrow(/immutable/)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.communications")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_check_obligations")).rows[0].n).toBe(0)
    const replay = key()
    const first = await rpc("admin_settings_command_v1", [token, replay, "create_incident", {
      kind: "OTHER", title: "Same incident twice", summary: "Idempotent open for a worker gap.",
    }, null])
    const second = await rpc("admin_settings_command_v1", [token, replay, "create_incident", {
      kind: "OTHER", title: "Different title should not rewrite", summary: "Conflicting replay.",
    }, null])
    expect(second).toMatchObject({ status: "conflict", reason: "idempotency_conflict" })
    expect(first?.status).toBe("success")
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
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_privacy_export_v1(text,uuid,uuid,integer)','EXECUTE') as ok", [role])).rows[0].ok).toBe(role === "service_role")
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','admin_private.privacy_preview_v1(uuid)','EXECUTE') as ok")).rows[0].ok).toBe(false)
  })

  it("rejects another auth user, forged actor payloads, stale sessions and self-revoke", async () => {
    const strangerToken = "b".repeat(64)
    const extraAdminToken = "c".repeat(64)
    const extraAdminSession = key()
    await db.query("insert into public.admin_sessions(token_hash,auth_user_id) values($1,$2)", [strangerToken, otherActor])
    await db.query("insert into public.admin_sessions(id,token_hash,auth_user_id) values($1,$2,$3)", [extraAdminSession, extraAdminToken, uid])
    expect(await rpc("admin_settings_overview_v1", [strangerToken])).toBeNull()
    expect(await rpc("admin_settings_command_v1", [strangerToken, key(), "create_incident", {
      kind: "OTHER", title: "Forged staff", summary: "Another auth user must not gain Admin.", actor: uid, role: "Owner",
    }, null])).toMatchObject({ status: "unauthorized" })
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_incident", {
      kind: "OTHER", title: "Ignored role claim", summary: "Payload actor and role claims are ignored.", actor: otherActor, role: "Owner",
    }, null])).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_identity")).rows[0].n).toBe(1)
    const current = await db.query<{ id: string }>("select id from public.admin_sessions where token_hash=$1", [token])
    expect(await rpc("admin_revoke_session_v1", [token, current.rows[0].id, key()])).toBe("denied")
    expect(await rpc("admin_revoke_session_v1", [token, extraAdminSession, key()])).toBe("success")
    await db.query("update public.admin_sessions set created_at = now() - interval '10 minutes' where token_hash=$1", [token])
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: key() }, 1])).toMatchObject({
      status: "reauth_required",
    })
  })

  it("rejects overlapping approved settings and preserves the earlier version", async () => {
    const first = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SUPPORTED_MARKETS", reason: "Initial market list", effectiveFrom: new Date(Date.now() - 10_000).toISOString(),
      payload: { countries: ["GB"], currencies: ["GBP"] },
    }, null])
    const firstDraft = (await rpc("admin_settings_list_v1", [token, "SUPPORTED_MARKETS"]))?.versions?.[0]
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: first!.id }, firstDraft!.recordVersion]))?.status).toBe("success")
    const second = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SUPPORTED_MARKETS", reason: "Overlapping market list", effectiveFrom: new Date(Date.now() - 5_000).toISOString(),
      payload: { countries: ["GB", "IE"], currencies: ["GBP"] },
    }, null])
    await expect(db.query(
      "update public.admin_setting_versions set status='APPROVED', record_version=record_version+1 where id=$1",
      [second!.id],
    )).rejects.toThrow(/overlapping/)
    expect((await db.query<{ status: string }>("select status from public.admin_setting_versions where id=$1", [first!.id])).rows[0].status).toBe("APPROVED")
  })

  it("exports only allowlisted rows and stores no payload on the receipt", async () => {
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [
      customer, "alex@example.com", uid, "Verified from a live call with the customer.",
    ])
    const access = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: customer, notes: "Subject access request for the current customer record.",
    }, null])
    expect((await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: access!.id }, 1]))?.status).toBe("success")
    const exported = await rpc("admin_privacy_export_v1", [token, key(), access!.id, 2])
    expect(exported?.status).toBe("success")
    expect(JSON.stringify(exported)).not.toMatch(/sk_live|whsec_|otp|token_hash|SUPABASE_SECRET/)
    expect(exported?.rows).toMatchObject({ customer: { email: "alex@example.com" } })
    const receipt = await db.query<{ result: Record<string, unknown> }>("select result from admin_private.privacy_export_receipts")
    expect(JSON.stringify(receipt.rows)).not.toMatch(/alex@example.com|sk_live|otp/)
    expect(receipt.rows[0].result.rows).toBeUndefined()
  })

  it("does not let an unrelated hold or a released hold block deletion", async () => {
    const hold = await rpc("admin_settings_command_v1", [token, key(), "create_hold", {
      scopeKind: "CATEGORY", category: "FINANCIAL_RECORDS", reason: "Keep payment history for a dispute.",
    }, null])
    expect(hold?.status).toBe("success")
    expect((await db.query<{ blocked: boolean }>(
      "select admin_private.hold_blocks_v1($1,null,null,'UNSUCCESSFUL_ENQUIRIES') as blocked",
      [customer],
    )).rows[0].blocked).toBe(false)
    expect((await db.query<{ blocked: boolean }>(
      "select admin_private.hold_blocks_v1($1,null,null,'FINANCIAL_RECORDS') as blocked",
      [customer],
    )).rows[0].blocked).toBe(true)
    expect((await rpc("admin_settings_command_v1", [token, key(), "release_hold", { id: hold!.id, reason: "Dispute closed. Release the hold." }, 1]))?.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.legal_holds where id=$1", [hold!.id])).rows[0].n).toBe(1)
    expect((await db.query<{ blocked: boolean }>(
      "select admin_private.hold_blocks_v1($1,null,null,'FINANCIAL_RECORDS') as blocked",
      [customer],
    )).rows[0].blocked).toBe(false)
    await expect(db.query("update public.legal_holds set status='ACTIVE' where id=$1", [hold!.id])).rejects.toThrow(/immutable/)
  })

  it("assigns rota only to the current Admin and does not invent a backup", async () => {
    expect(await rpc("admin_settings_command_v1", [token, key(), "assign_rota", {
      coverageId: caseId, assignee: otherActor,
    }, 1])).toMatchObject({ status: "denied", reason: "single_admin_only" })
    const overview = await rpc("admin_settings_overview_v1", [token])
    expect(String(overview?.rotaAssignments && (overview.rotaAssignments as { note?: string }).note || "")).toMatch(/single Admin identity/)
  })

  it("never completes a privacy request while required disposition work is pending or blocked", async () => {
    await verifyCustomerEmail()
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: customer, notes: "Subject access request covering the current record.",
    }, null])
    const step = stepper(request!.id as string)
    expect(await step("complete_privacy_request", { resolution: "Completing straight from RECEIVED." })).toMatchObject({
      status: "denied", reason: "not_ready",
    })
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect(await step("complete_privacy_request", { resolution: "Completing straight from VERIFIED." })).toMatchObject({
      status: "denied", reason: "not_ready",
    })
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "preview_required" })
    expect(await step("complete_privacy_request", { resolution: "Completing straight from REVIEWING." })).toMatchObject({
      status: "denied", reason: "not_ready",
    })
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "MANUAL_REVIEW", status: "PENDING", reason: "Consent history still needs a manual check.",
    }))?.status).toBe("success")
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "pending_disposition" })
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "MANUAL_REVIEW", status: "READY", reason: "Consent history reviewed and retained.",
    }))?.status).toBe("success")
    expect((await step("mark_privacy_ready", {}))?.status).toBe("success")
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "RETAIN", status: "BLOCKED", reason: "Further consent checks are outstanding.",
    }))?.status).toBe("success")
    expect(await step("complete_privacy_request", { resolution: "Finished with an outstanding blocker." })).toMatchObject({
      status: "denied", reason: "blocked_disposition",
    })
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "RETAIN", status: "READY", reason: "Consent history reviewed and retained.",
    }))?.status).toBe("success")
    expect(await step("complete_privacy_request", { resolution: "done" })).toMatchObject({
      status: "invalid", reason: "meaningful_resolution_required",
    })
    expect(await step("complete_privacy_request", {
      resolution: "Reviewed every category, exported the record and retained financial history.",
    })).toMatchObject({ status: "denied", reason: "export_required" })
    expect((await rpc("admin_privacy_export_v1", [token, key(), request!.id, currentVersion()]))?.status).toBe("success")
    expect((await step("complete_privacy_request", {
      resolution: "Reviewed every category, exported the record and retained financial history.",
    }))?.status).toBe("success")
    const row = await db.query<{ status: string }>("select status from public.privacy_requests where id=$1", [request!.id])
    expect(row.rows[0].status).toBe("COMPLETED")
  })

  it("keeps CASE_EVIDENCE blocked by external storage deletion even when an Admin edits the disposition", async () => {
    await insertStoredEvidence()
    await verifyCustomerEmail()
    await approveRetention("UNSUCCESSFUL_ENQUIRIES", 1)
    await approveRetention("CASE_EVIDENCE", 30)
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Customer asked for deletion including stored evidence.",
    }, null])
    const step = stepper(request!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    const disposition = await db.query<{ status: string; blocked_reason: string }>(
      "select status, blocked_reason from public.privacy_request_dispositions where privacy_request_id=$1 and category='CASE_EVIDENCE'",
      [request!.id],
    )
    expect(disposition.rows[0].status).toBe("BLOCKED")
    expect(disposition.rows[0].blocked_reason).toMatch(/BLOCKED_EXTERNAL_DELETION/)
    expect(await step("review_disposition", {
      category: "CASE_EVIDENCE", proposedAction: "DELETE", status: "READY", reason: "Admin claims the objects are gone.",
    })).toMatchObject({ status: "denied", reason: "external_deletion" })
    await expect(db.query(
      "update public.privacy_request_dispositions set status='READY', record_version=record_version+1 where privacy_request_id=$1 and category='CASE_EVIDENCE'",
      [request!.id],
    )).rejects.toThrow(/BLOCKED_EXTERNAL_DELETION/)
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "external_deletion" })
    expect((await db.query<{ reason: string }>(
      "select admin_private.deletion_blocked_v1(r.*) as reason from public.privacy_requests r where r.id=$1",
      [request!.id],
    )).rows[0].reason).toBe("external_deletion")
    const after = await db.query<{ status: string; completed_at: string | null }>(
      "select status, completed_at from public.privacy_requests where id=$1", [request!.id],
    )
    expect(after.rows[0]).toMatchObject({ status: "REVIEWING", completed_at: null })
    expect((await db.query<{ still: number }>(
      "select admin_private.external_deletion_outstanding_v1($1) as still", [customer],
    )).rows[0].still).toBe(1)
    expect((await db.query<{ ok: boolean }>(
      "select has_function_privilege('service_role','admin_private.external_deletion_outstanding_v1(uuid)','EXECUTE') as ok",
    )).rows[0].ok).toBe(false)
  })

  it("refuses physical deletion without a current preview, a reviewed disposition and the exact version", async () => {
    await verifyCustomerEmail()
    const retention = await approveRetention("UNSUCCESSFUL_ENQUIRIES", 1)
    const enquiryId = key()
    await insertEnquiry(enquiryId, "alex@example.com", "2026-01-02T09:00:00Z")
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Customer asked for deletion of an unsuccessful enquiry.",
    }, null])
    const step = stepper(request!.id as string)
    expect(await step("execute_deletion", { enquiryId })).toMatchObject({ status: "denied", reason: "not_ready" })
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect(await step("execute_deletion", { enquiryId })).toMatchObject({ status: "denied", reason: "not_ready" })
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect(await step("execute_deletion", { enquiryId })).toMatchObject({ status: "denied", reason: "preview_required" })
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect(await step("execute_deletion", { enquiryId })).toMatchObject({ status: "denied", reason: "review_required" })
    expect((await step("review_disposition", {
      category: "UNSUCCESSFUL_ENQUIRIES", proposedAction: "DELETE", status: "READY", reason: "Retention elapsed and no hold applies.",
    }))?.status).toBe("success")
    const current = currentVersion()
    expect(await rpc("admin_settings_command_v1", [token, key(), "execute_deletion", { id: request!.id, enquiryId }, null])).toMatchObject({
      status: "conflict", reason: "version_required",
    })
    expect(await rpc("admin_settings_command_v1", [token, key(), "execute_deletion", { id: request!.id, enquiryId }, current - 1])).toMatchObject({
      status: "conflict",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.enquiries where id=$1", [enquiryId])).rows[0].n).toBe(1)
    expect((await db.query<{ policy: string }>(
      "select retention_policy_id::text as policy from public.privacy_request_dispositions where privacy_request_id=$1 and category='UNSUCCESSFUL_ENQUIRIES'",
      [request!.id],
    )).rows[0].policy).toBe(retention.id)
    const replay = key()
    const executed = await rpc("admin_settings_command_v1", [token, replay, "execute_deletion", { id: request!.id, enquiryId }, current])
    expect(executed).toMatchObject({ status: "success" })
    expect(await rpc("admin_settings_command_v1", [token, replay, "execute_deletion", { id: request!.id, enquiryId }, current])).toEqual(executed)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.enquiries where id=$1", [enquiryId])).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customers where id=$1", [customer])).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts where customer_id=$1", [customer])).rows[0].n).toBe(0)
  })

  it("keeps a legal hold blocker that an Admin cannot edit away", async () => {
    await verifyCustomerEmail()
    await approveRetention("UNSUCCESSFUL_ENQUIRIES", 1)
    expect((await rpc("admin_settings_command_v1", [token, key(), "create_hold", {
      scopeKind: "CUSTOMER", customerId: customer, reason: "Open payment dispute remains under review.",
    }, null]))?.status).toBe("success")
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Deletion request raised while a hold is active.",
    }, null])
    const step = stepper(request!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect(await step("review_disposition", {
      category: "UNSUCCESSFUL_ENQUIRIES", proposedAction: "DELETE", status: "READY", reason: "Admin claims the hold does not matter.",
    })).toMatchObject({ status: "denied", reason: "legal_hold" })
    await expect(db.query(
      "update public.privacy_request_dispositions set legal_hold_blocker=false, record_version=record_version+1 where privacy_request_id=$1 and category='UNSUCCESSFUL_ENQUIRIES'",
      [request!.id],
    )).rejects.toThrow(/legal hold blocker cannot be cleared/i)
    await expect(db.query(
      "update public.privacy_request_dispositions set status='READY', record_version=record_version+1 where privacy_request_id=$1 and category='UNSUCCESSFUL_ENQUIRIES'",
      [request!.id],
    )).rejects.toThrow(/legal hold/i)
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "legal_hold" })
  })

  it("runs deletion_blocked_v1 to completion when no external evidence remains", async () => {
    await verifyCustomerEmail()
    await approveRetention("UNSUCCESSFUL_ENQUIRIES", 1)
    await approveRetention("CASE_EVIDENCE", 30)
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Deletion request with nothing left in storage.",
    }, null])
    const step = stepper(request!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect((await db.query<{ still: number }>(
      "select admin_private.external_deletion_outstanding_v1($1) as still", [customer],
    )).rows[0].still).toBe(0)
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.privacy_request_dispositions where privacy_request_id=$1", [request!.id],
    )).rows[0].n).toBe(5)
    const blocked = async () => (await db.query<{ reason: string | null }>(
      "select admin_private.deletion_blocked_v1(r.*) as reason from public.privacy_requests r where r.id=$1",
      [request!.id],
    )).rows[0].reason
    expect(await blocked()).toBe("blocked_disposition")
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "MANUAL_REVIEW", status: "READY", reason: "Consent history reviewed and retained.",
    }))?.status).toBe("success")
    expect(await blocked()).toBeNull()
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "review_required" })
    for (const category of ["UNSUCCESSFUL_ENQUIRIES", "CASE_EVIDENCE"]) {
      expect((await step("review_disposition", {
        category, proposedAction: "DELETE", status: "READY", reason: "Retention elapsed and no hold applies.",
      }))?.status).toBe("success")
    }
    expect(await blocked()).toBeNull()
    expect((await step("mark_privacy_ready", {}))?.status).toBe("success")
  })

  it("does not make an access request wait for a deletion retention policy", async () => {
    await verifyCustomerEmail()
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.retention_policy_versions")).rows[0].n).toBe(0)
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: customer, notes: "Subject access request with no retention policy approved.",
    }, null])
    const step = stepper(request!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    const dispositions = await db.query<{ category: string; proposed_action: string; status: string; blocked_reason: string; retention_policy_id: string | null }>(
      "select category, proposed_action, status, blocked_reason, retention_policy_id from public.privacy_request_dispositions where privacy_request_id=$1 order by category",
      [request!.id],
    )
    for (const category of ["UNSUCCESSFUL_ENQUIRIES", "CASE_EVIDENCE"]) {
      const row = dispositions.rows.find(item => item.category === category)!
      expect({ category, ...row }).toMatchObject({ proposed_action: "EXPORT", status: "READY", blocked_reason: "" })
      expect(row.retention_policy_id).toBeNull()
    }
    expect(dispositions.rows.find(item => item.category === "CONSENT_RECORDS")).toMatchObject({
      proposed_action: "RETAIN", status: "READY",
    })
    expect(dispositions.rows.every(row => row.status === "READY")).toBe(true)
    const exported = await rpc("admin_privacy_export_v1", [token, key(), request!.id, currentVersion()])
    expect(exported?.status).toBe("success")
    expect(JSON.stringify(exported)).not.toMatch(/sk_live|whsec_|otp|token_hash|SUPABASE_SECRET/)
    expect((await step("mark_privacy_ready", {}))?.status).toBe("success")
    expect((await step("complete_privacy_request", {
      resolution: "Exported the allowlisted record to the subject and retained financial history.",
    }))?.status).toBe("success")
    expect((await db.query<{ status: string }>("select status from public.privacy_requests where id=$1", [request!.id])).rows[0].status).toBe("COMPLETED")
  })

  it("exports stored case evidence that cannot yet be physically deleted", async () => {
    await insertStoredEvidence()
    await verifyCustomerEmail()
    expect((await db.query<{ still: number }>(
      "select admin_private.external_deletion_outstanding_v1($1) as still", [customer],
    )).rows[0].still).toBe(1)
    const exportRequest = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "EXPORT", customerId: customer, notes: "Export every stored record including case evidence.",
    }, null])
    const step = stepper(exportRequest!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    const evidence = await db.query<{ proposed_action: string; status: string; blocked_reason: string }>(
      "select proposed_action, status, blocked_reason from public.privacy_request_dispositions where privacy_request_id=$1 and category='CASE_EVIDENCE'",
      [exportRequest!.id],
    )
    expect(evidence.rows[0]).toMatchObject({ proposed_action: "EXPORT", status: "READY", blocked_reason: "" })
    expect((await step("mark_privacy_ready", {}))?.status).toBe("success")
    expect(await step("complete_privacy_request", {
      resolution: "Claiming completion before the export actually ran.",
    })).toMatchObject({ status: "denied", reason: "export_required" })
    expect((await rpc("admin_privacy_export_v1", [token, key(), exportRequest!.id, currentVersion()]))?.status).toBe("success")
    expect((await step("complete_privacy_request", {
      resolution: "Exported the stored evidence to the subject. Physical erasure is a separate step.",
    }))?.status).toBe("success")
    const deletion = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Erase the same stored evidence from storage.",
    }, null])
    const erase = stepper(deletion!.id as string)
    expect((await erase("verify_privacy_request", {}))?.status).toBe("success")
    expect((await erase("start_privacy_review", {}))?.status).toBe("success")
    expect((await erase("preview_privacy_request", {}))?.status).toBe("success")
    expect((await db.query<{ status: string; blocked_reason: string }>(
      "select status, blocked_reason from public.privacy_request_dispositions where privacy_request_id=$1 and category='CASE_EVIDENCE'",
      [deletion!.id],
    )).rows[0]).toMatchObject({ status: "BLOCKED" })
    expect(await erase("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "external_deletion" })
  })

  it("still refuses a deletion with no approved retention policy", async () => {
    await verifyCustomerEmail()
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Deletion raised before any retention policy was approved.",
    }, null])
    const step = stepper(request!.id as string)
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect((await db.query<{ status: string; blocked_reason: string }>(
      "select status, blocked_reason from public.privacy_request_dispositions where privacy_request_id=$1 and category='UNSUCCESSFUL_ENQUIRIES'",
      [request!.id],
    )).rows[0]).toMatchObject({ status: "BLOCKED", blocked_reason: "No approved retention policy" })
    expect(await step("mark_privacy_ready", {})).toMatchObject({ status: "denied", reason: "retention_required" })
    expect(await step("complete_privacy_request", {
      resolution: "Attempting completion without an approved retention policy.",
    })).toMatchObject({ status: "denied", reason: "not_ready" })
    expect((await db.query<{ status: string }>("select status from public.privacy_requests where id=$1", [request!.id])).rows[0].status).toBe("REVIEWING")
  })

  it("never lets a future version retired before its effective date become current later", async () => {
    const future = futureIso(2)
    const version = await approveSetting("SUPPORTED_MARKETS", { countries: ["GB"], currencies: ["GBP"] }, future, "Scheduled market list")
    expect((await rpc("admin_settings_command_v1", [token, key(), "retire_setting", { id: version.id }, 2]))?.status).toBe("success")
    const row = await db.query<{ status: string; same: boolean }>(
      "select status, effective_to = effective_from as same from public.admin_setting_versions where id=$1", [version.id],
    )
    expect(row.rows[0]).toMatchObject({ status: "RETIRED", same: true })
    for (const at of [futureIso(1), futureIso(3), futureIso(400)]) {
      expect((await db.query<{ id: string | null }>(
        "select (admin_private.current_setting_v1('SUPPORTED_MARKETS',$1::timestamptz)).id as id", [at],
      )).rows[0].id).toBeNull()
    }
    const draft = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "SUPPORTED_MARKETS", reason: "Another scheduled market list", effectiveFrom: futureIso(5),
      payload: { countries: ["IE"], currencies: ["EUR"] },
    }, null])
    await expect(db.query(
      "update public.admin_setting_versions set status='RETIRED', record_version=record_version+1 where id=$1", [draft!.id],
    )).rejects.toThrow(/close their effective interval/)
    const retention = await approveRetention("SECURITY_LOGS", 90, futureIso(2))
    expect((await rpc("admin_settings_command_v1", [token, key(), "retire_retention", { id: retention.id }, 2]))?.status).toBe("success")
    expect((await db.query<{ id: string | null }>(
      "select (admin_private.current_retention_v1('SECURITY_LOGS',$1::timestamptz)).id as id", [futureIso(3)],
    )).rows[0].id).toBeNull()
  })

  it("keeps the earlier policy applicable until a scheduled replacement takes over", async () => {
    const first = await approveSetting("SERVICE_HOURS", hoursPayload, recentIso(), "Hours in force today")
    const second = await approveSetting(
      "SERVICE_HOURS", { ...hoursPayload, weekendPolicy: "INCLUDED", windows: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, start: "09:00", end: "17:00" })) },
      futureIso(3), "Hours from next week",
    )
    const applicable = async (at: string) => (await db.query<{ id: string | null }>(
      "select (admin_private.current_setting_v1('SERVICE_HOURS',$1::timestamptz)).id as id", [at],
    )).rows[0].id
    expect(await applicable(new Date().toISOString())).toBe(first.id)
    expect(await applicable(futureIso(1))).toBe(first.id)
    expect(await applicable(futureIso(4))).toBe(second.id)
    expect(await applicable(futureIso(-5))).toBeNull()
    const closed = await db.query<{ status: string; effective_to: string }>(
      "select status, effective_to::text from public.admin_setting_versions where id=$1", [first.id],
    )
    expect(closed.rows[0].status).toBe("RETIRED")
    expect(closed.rows[0].effective_to).toBeTruthy()
    const targets = await rpc("admin_settings_command_v1", [token, key(), "create_setting_draft", {
      key: "RESPONSE_TARGETS", reason: "Targets while the superseded hours still apply", effectiveFrom: futureIso(1),
      payload: { ENQUIRY_FIRST_RESPONSE: { hours: 8 }, CASE_FIRST_RESPONSE: { hours: 8 } },
    }, null])
    expect((await rpc("admin_settings_command_v1", [token, key(), "approve_setting", { id: targets!.id }, 1]))?.status).toBe("success")
  })

  it("rejects overlapping approved retention versions from the command and from direct SQL", async () => {
    const scheduled = await approveRetention("CONSENT_RECORDS", 365, futureIso(2))
    const earlier = await rpc("admin_settings_command_v1", [token, key(), "create_retention_draft", {
      category: "CONSENT_RECORDS", retentionMode: "RETAIN_FOR_PERIOD", durationDays: 30,
      reason: "Overlapping consent retention", effectiveFrom: recentIso(),
    }, null])
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_retention", { id: earlier!.id }, 1])).toMatchObject({
      status: "invalid", reason: "overlapping_approved_retention",
    })
    await expect(db.query(
      "update public.retention_policy_versions set status='APPROVED', approved_at=now(), approved_by=$2, record_version=record_version+1 where id=$1",
      [earlier!.id, uid],
    )).rejects.toThrow(/overlapping approved retention/)
    expect((await db.query<{ status: string }>("select status from public.retention_policy_versions where id=$1", [scheduled.id])).rows[0].status).toBe("APPROVED")
    const later = await approveRetention("CONSENT_RECORDS", 400, futureIso(4))
    expect((await db.query<{ id: string | null }>(
      "select (admin_private.current_retention_v1('CONSENT_RECORDS',$1::timestamptz)).id as id", [futureIso(3)],
    )).rows[0].id).toBe(scheduled.id)
    expect((await db.query<{ id: string | null }>(
      "select (admin_private.current_retention_v1('CONSENT_RECORDS',$1::timestamptz)).id as id", [futureIso(5)],
    )).rows[0].id).toBe(later.id)
  })

  it("keeps every historical fact on a response obligation immutable", async () => {
    const recent = recentIso()
    await approveSetting("SERVICE_HOURS", hoursPayload, recent, "Hours for obligations")
    await approveSetting("RESPONSE_TARGETS", { ENQUIRY_FIRST_RESPONSE: { hours: 8 }, CASE_FIRST_RESPONSE: { hours: 8 } }, recent, "Targets for obligations")
    const enquiryId = key()
    await insertEnquiry(enquiryId, "alex@example.com")
    const obligation = await db.query<{ id: string }>("select id from public.service_response_obligations where enquiry_id=$1", [enquiryId])
    expect(obligation.rows).toHaveLength(1)
    const id = obligation.rows[0].id
    for (const change of [
      "target_type='CASE_FIRST_RESPONSE'",
      `case_id='${caseId}'`,
      "enquiry_id=null",
      "policy_version_id=hours_version_id",
      "hours_version_id=policy_version_id",
      "opened_at=now()",
      "due_at=now() + interval '40 days'",
      "timezone='Europe/Dublin'",
      "target_hours=target_hours + 1",
      "created_at=now()",
    ]) {
      await expect(db.query(`update public.service_response_obligations set ${change} where id=$1`, [id]))
        .rejects.toThrow(/Response obligation facts are immutable/)
    }
    await expect(db.query("delete from public.service_response_obligations where id=$1", [id]))
      .rejects.toThrow(/not deleted/)
    await expect(db.query("update public.service_response_obligations set status='FULFILLED' where id=$1", [id]))
      .rejects.toThrow(/fulfilment time is required/)
    expect((await db.query("update public.service_response_obligations set status='FULFILLED', fulfilled_at=now() where id=$1", [id])).affectedRows).toBe(1)
    await expect(db.query("update public.service_response_obligations set status='OPEN', fulfilled_at=null where id=$1", [id]))
      .rejects.toThrow(/Invalid response obligation transition/)
    await expect(db.query("update public.service_response_obligations set fulfilled_at=now() + interval '1 day' where id=$1", [id]))
      .rejects.toThrow(/fulfilment is immutable/)
  })

  it("rejects missing required placeholders, after-hours wrap, weekends and converted enquiry deletion", async () => {
    expect(await rpc("admin_settings_command_v1", [token, key(), "create_template_draft", {
      templateKey: "CASE_UPDATE", name: "Missing next step", subject: "Update on {case_ref}", body: "{fact} {effect} without the required next action placeholder.",
    }, null])).toMatchObject({ status: "invalid" })
    const afterClose = await db.query<{ due: string }>(
      "select admin_private.staffed_due_at_v1(timestamptz '2026-01-07 18:00:00+00', 1, $1::jsonb)::text as due",
      [JSON.stringify(hoursPayload)],
    )
    expect(afterClose.rows[0].due).toContain("2026-01-08")
    const weekendOff = await db.query<{ due: string }>(
      "select admin_private.staffed_due_at_v1(timestamptz '2026-01-10 10:00:00+00', 1, $1::jsonb)::text as due",
      [JSON.stringify(hoursPayload)],
    )
    expect(weekendOff.rows[0].due).toContain("2026-01-12")
    const weekendOn = await db.query<{ due: string }>(
      "select admin_private.staffed_due_at_v1(timestamptz '2026-01-10 10:00:00+00', 1, $1::jsonb)::text as due",
      [JSON.stringify({ ...hoursPayload, weekendPolicy: "INCLUDED", windows: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, start: "09:00", end: "17:00" })) })],
    )
    expect(weekendOn.rows[0].due).toContain("2026-01-10")
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [
      customer, "alex@example.com", uid, "Verified from a live call with the customer.",
    ])
    const convertedId = key()
    await db.query(
      "insert into public.enquiries(id,submission_key,fingerprint,source,payload,internal_status,ack_status,status,case_id) values($1,$2,'fp','contact',$3,'SKIPPED','SKIPPED','converted',$4)",
      [convertedId, key(), { fullName: "Alex", email: "alex@example.com", phone: "", businessName: "", country: "", service: "", subject: "Help", details: "Details", websiteUrl: "", businessProfileUrl: "", reviewUrl: "", source: "contact" }, caseId],
    )
    const deletion = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Attempt to delete a converted enquiry.",
    }, null])
    expect((await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: deletion!.id }, 1]))?.status).toBe("success")
    expect((await rpc("admin_settings_command_v1", [token, key(), "start_privacy_review", { id: deletion!.id }, 2]))?.status).toBe("success")
    expect((await rpc("admin_settings_command_v1", [token, key(), "preview_privacy_request", { id: deletion!.id }, 3]))?.status).toBe("success")
    const reviewed = await rpc("admin_settings_command_v1", [token, key(), "review_disposition", {
      id: deletion!.id, category: "UNSUCCESSFUL_ENQUIRIES", proposedAction: "DELETE", status: "READY", reason: "Reviewed unsuccessful enquiries only.",
    }, 4])
    expect(reviewed?.status).toBe("success")
    const audit = await db.query<{ action: string }>("select action from public.admin_audit_events where action='PRIVACY_CHANGED' and details->>'operation'='review_disposition'")
    expect(audit.rows.length).toBeGreaterThan(0)
    expect(await rpc("admin_settings_command_v1", [token, key(), "execute_deletion", { id: deletion!.id, enquiryId: convertedId }, Number(reviewed!.version)])).toMatchObject({
      status: "denied", reason: "not_unsuccessful",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.enquiries where id=$1", [convertedId])).rows[0].n).toBe(1)
    expect((await rpc("admin_settings_command_v1", [token, key(), "reject_privacy_request", { id: deletion!.id, reason: "Converted enquiry cannot be auto-deleted." }, Number(reviewed!.version)]))?.status).toBe("success")
    expect(await rpc("admin_settings_command_v1", [token, key(), "complete_privacy_request", { id: deletion!.id, resolution: "Rewriting a rejected request." }, Number(reviewed!.version) + 1])).toMatchObject({
      status: "denied", reason: "not_ready",
    })
    await expect(db.query("update public.privacy_requests set status='RECEIVED', record_version=record_version+1 where id=$1", [deletion!.id])).rejects.toThrow(/transition|terminal|immutable/i)
  })

  it("lets ACCESS and EXPORT complete without retention or storage delete, while deletion stays fail-closed", async () => {
    await verifyCustomerEmail()
    await insertStoredEvidence()
    const access = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: customer, notes: "Subject access request without any retention policy.",
    }, null])
    const accessStep = stepper(access!.id as string)
    expect((await accessStep("verify_privacy_request", {}))?.status).toBe("success")
    expect((await accessStep("start_privacy_review", {}))?.status).toBe("success")
    expect((await accessStep("preview_privacy_request", {}))?.status).toBe("success")
    const accessRows = await db.query<{ category: string; status: string; proposed_action: string }>(
      "select category, status, proposed_action from public.privacy_request_dispositions where privacy_request_id=$1 order by category",
      [access!.id],
    )
    expect(accessRows.rows.every(row => row.status === "READY")).toBe(true)
    expect(accessRows.rows.find(row => row.category === "CASE_EVIDENCE")).toMatchObject({ status: "READY", proposed_action: "EXPORT" })
    expect(accessRows.rows.find(row => row.category === "CONSENT_RECORDS")).toMatchObject({ status: "READY", proposed_action: "RETAIN" })
    expect((await accessStep("mark_privacy_ready", {}))?.status).toBe("success")
    expect((await rpc("admin_privacy_export_v1", [token, key(), access!.id, currentVersion()]))?.status).toBe("success")
    expect((await accessStep("complete_privacy_request", {
      resolution: "Reviewed export downloaded. No retention policy was required.",
    }))?.status).toBe("success")

    const exported = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "EXPORT", customerId: customer, notes: "Export request while case evidence remains in storage.",
    }, null])
    const exportStep = stepper(exported!.id as string)
    expect((await exportStep("verify_privacy_request", {}))?.status).toBe("success")
    expect((await exportStep("start_privacy_review", {}))?.status).toBe("success")
    expect((await exportStep("preview_privacy_request", {}))?.status).toBe("success")
    expect((await exportStep("mark_privacy_ready", {}))?.status).toBe("success")
    expect((await rpc("admin_privacy_export_v1", [token, key(), exported!.id, currentVersion()]))?.status).toBe("success")
    expect((await exportStep("complete_privacy_request", {
      resolution: "Export completed. Storage objects were not deleted.",
    }))?.status).toBe("success")

    await db.query("delete from public.case_document_versions")
    await db.query("delete from public.case_documents")
    const deletion = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Deletion without approved retention or remaining evidence.",
    }, null])
    expect((await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: deletion!.id }, 1]))?.status).toBe("success")
    expect((await rpc("admin_settings_command_v1", [token, key(), "preview_privacy_request", { id: deletion!.id }, 2]))?.status).toBe("success")
    const none = await db.query<{ reason: string | null; evidence: number }>(
      "select admin_private.deletion_blocked_v1(r.*) as reason, admin_private.external_deletion_outstanding_v1(r.customer_id) as evidence from public.privacy_requests r where r.id=$1",
      [deletion!.id],
    )
    expect(none.rows[0].evidence).toBe(0)
    expect(none.rows[0].reason).toMatch(/retention_required|blocked_disposition/)
    expect(none.rows[0].reason).not.toBe("external_deletion")
    expect(await rpc("admin_settings_command_v1", [token, key(), "complete_privacy_request", {
      id: deletion!.id, resolution: "Tried to complete deletion without an approved retention policy.",
    }, 3])).toMatchObject({ status: "denied" })

    await insertStoredEvidence()
    const blocked = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "DELETION", customerId: customer, notes: "Deletion still blocked by remaining stored evidence.",
    }, null])
    expect((await rpc("admin_settings_command_v1", [token, key(), "verify_privacy_request", { id: blocked!.id }, 1]))?.status).toBe("success")
    expect((await rpc("admin_settings_command_v1", [token, key(), "preview_privacy_request", { id: blocked!.id }, 2]))?.status).toBe("success")
    const evidence = await db.query<{ reason: string; evidence: number }>(
      "select admin_private.deletion_blocked_v1(r.*) as reason, admin_private.external_deletion_outstanding_v1(r.customer_id) as evidence from public.privacy_requests r where r.id=$1",
      [blocked!.id],
    )
    expect(evidence.rows[0].evidence).toBeGreaterThan(0)
    expect(evidence.rows[0].reason).toBe("external_deletion")
    expect(await rpc("admin_settings_command_v1", [token, key(), "complete_privacy_request", {
      id: blocked!.id, resolution: "Tried to complete deletion while evidence remains.",
    }, 3])).toMatchObject({ status: "denied" })
  })
})
