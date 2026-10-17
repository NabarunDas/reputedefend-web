import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { sendEmailHandler } from "./handler"
import { createIdempotentMailProvider } from "./mail"
import { communicationAccessTokenHash, deriveCommunicationAccessToken } from "./link"
import { runJobWorker } from "../jobs/worker"
import { renderEvidenceRequest } from "../../../../lib/email/evidence-request"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const linkSecretValue = "communication-link-secret-for-tests-32b"
const uploadFor = (actionId: string) => `https://customer.profilerelaunch.com/action/${actionId}`

type RpcResult = { status?: string; id?: string; version?: number; lifecycle?: string; contentVersion?: number; communications?: Array<Record<string, unknown>> }

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

const signatures: Record<string, string[]> = {
  job_promote_outbox_v1: ["p_limit"],
  job_claim_batch_v1: ["p_limit", "p_worker", "p_lease_seconds", "p_deployment"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
  job_heartbeat_v1: ["p_worker", "p_environment", "p_phase", "p_error", "p_deployment", "p_expected_interval", "p_late_after"],
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const order = signatures[name] ?? Object.keys(args)
      const values = order.map(item => args[item] ?? null)
      return (await db.query<{ value: T }>(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(",")}) as value`, values)).rows[0].value
    },
  }
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
    readdirSync(dir).find(n => n.endsWith("_case_communications_workspace_v1.sql"))!,
  ]) await db.exec(read(name))
  await db.exec(readFileSync(new URL("../../../../docs/admin/20261016233000_admin_journey_evidence_draft_wording_v1.sql", import.meta.url), "utf8"))
  await db.exec(`
    alter table admin_private.communication_templates add column if not exists status text;
    alter table admin_private.communication_templates add column if not exists reason text not null default '';
    update admin_private.communication_templates set status = 'APPROVED' where status is null;
    alter table admin_private.communication_templates alter column status set not null;
  `)
  await db.exec(readFileSync(new URL("../../../../docs/admin/20261017170000_comms_brand_evidence_request_v3.sql", import.meta.url), "utf8"))
}, 60000)

afterAll(async () => { await db.close() })

async function seed() {
  await db.exec(`    alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.job_attempts,admin_private.jobs,admin_private.job_outbox,admin_private.job_worker_heartbeats,admin_private.job_command_receipts,admin_private.communication_delivery_events,admin_private.communication_webhook_events,admin_private.email_suppressions,admin_private.communication_command_receipts,public.communications,public.customer_action_events,public.customer_actions,public.evidence_requests,public.customer_contact_verifications,public.business_memberships cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com') on conflict (id) do update set email = excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED') on conflict (id) do update set status = 'RECEIVED';
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.');`)
}

function accessMaterial(actionId = crypto.randomUUID()) {
  const accessToken = deriveCommunicationAccessToken(actionId, linkSecretValue)
  return { actionId, token: accessToken, secretHash: communicationAccessTokenHash(accessToken) }
}

async function openEvidence(title: string) {
  const request = await db.query<{ id: string }>(
    "insert into public.evidence_requests(case_id, title, request_text, created_by) values($1,$2,'Please send the named documents.','" + uid + "') returning id",
    [caseId, title],
  )
  return { evidenceRequestId: request.rows[0].id, ...accessMaterial() }
}

function counts(value: string) {
  const count = (needle: string) => value.split(needle).length - 1
  return {
    lists: count("<ul"),
    items: count("<li"),
    buttons: count("Upload your documents securely"),
    signOffs: count("ProfileRelaunch Support Team"),
    security: count("For your security"),
    replies: count("simply reply to this email"),
  }
}

describe("branded evidence request migration", () => {
  it("matches the TypeScript evidence email and does not approve version 3", async () => {
    const upload = "https://customer.profilerelaunch.com/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const canonical = renderEvidenceRequest({ caseRef: "PR-1042", documents: ["Shop licence", "Proof of operating location"], uploadUrl: upload })
    const edited = renderEvidenceRequest({
      caseRef: "PR-1042",
      documents: ["Shop licence"],
      uploadUrl: upload,
      introduction: "Hello Alex,\n\nPlease send the shop licence so we can review the listing.",
      replyTo: "cases@profilerelaunch.com",
    })
    const canonicalSql = (await db.query<{ value: string }>(
      "select admin_private.evidence_request_plain_text_v1($1,$2,$3,$4,$5,$6) as value",
      ["PR-1042", ["Shop licence", "Proof of operating location"], upload, null, 1, false],
    )).rows[0].value
    const editedSql = (await db.query<{ value: string }>(
      "select admin_private.evidence_request_plain_text_v1($1,$2,$3,$4,$5,$6) as value",
      ["PR-1042", ["Shop licence"], upload, "Hello Alex,\n\nPlease send the shop licence so we can review the listing.", 2, true],
    )).rows[0].value
    expect(canonicalSql).toBe(canonical?.text)
    expect(editedSql).toBe(edited?.text)
    const html = (await db.query<{ value: string | null }>(
      "select admin_private.evidence_request_html_v1($1,$2,$3,$4,$5,$6) as value",
      ["PR-1042", ["<script>alert(1)</script>"], upload, null, 1, false],
    )).rows[0].value
    expect(html).toBeNull()
    const escaped = (await db.query<{ value: string }>("select admin_private.customer_email_escape_v1($1) as value", ["<script>alert(1)</script>"])).rows[0].value
    expect(escaped).toBe("&lt;script&gt;alert(1)&lt;/script&gt;")
    const templates = (await db.query<{ version: number; status: string; body_text_template: string }>(
      "select version, status, body_text_template from admin_private.communication_templates where template_key = 'EVIDENCE_REQUEST' order by version",
    )).rows
    expect(templates.map(row => row.version)).toEqual([1, 3])
    expect(templates[0].body_text_template.startsWith("To continue with {case_ref}")).toBe(true)
    expect(templates[1]).toMatchObject({ version: 3, status: "DRAFT" })
    expect(templates[1].body_text_template).not.toMatch(/\breply\b/i)
  })

  it("generates, edits, edits again and approves one list, one link, one sign-off and one footer", async () => {
    await seed()
    const setup = await openEvidence("Shop licence; Proof of operating location")
    const publicRef = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [caseId])).rows[0].public_ref
    const created = await rpc("admin_communication_command_v1", [token, key(), "draft", {
      templateKey: "EVIDENCE_REQUEST",
      caseId,
      evidenceRequestId: setup.evidenceRequestId,
      customerOrigin: "https://customer.profilerelaunch.com",
      actionId: setup.actionId,
      secretHash: setup.secretHash,
      linkKeyVersion: 1,
      replyTo: "attacker@example.com",
    }, null])
    expect(created?.status).toBe("success")
    const upload = uploadFor(setup.actionId)
    const expected = renderEvidenceRequest({
      caseRef: publicRef,
      documents: ["Shop licence", "Proof of operating location"],
      uploadUrl: upload,
    })
    const first = (await db.query<{
      subject: string
      body_text: string
      body_html: string
      reply_to_address: string | null
      template_version: number
      content_version: number
      customer_action_id: string
      evidence_request_id: string
    }>("select subject, body_text, body_html, reply_to_address, template_version, content_version, customer_action_id, evidence_request_id from public.communications where id = $1", [created!.id])).rows[0]
    expect(first.template_version).toBe(3)
    expect(first.content_version).toBe(1)
    expect(first.customer_action_id).toBe(setup.actionId)
    expect(first.evidence_request_id).toBe(setup.evidenceRequestId)
    expect(first.reply_to_address).toBeNull()
    expect(first.body_text).toBe(expected?.text)
    expect(first.body_text).not.toContain("#t=")
    expect(first.body_text).not.toContain("attacker@example.com")
    expect(first.body_html).not.toContain("#t=")
    expect(counts(first.body_html)).toMatchObject({ lists: 1, items: 2, buttons: 1, signOffs: 1, security: 1, replies: 0 })
    expect(first.body_html.match(new RegExp(upload, "g"))).toHaveLength(1)
    const read = await rpc("admin_case_communications_v1", [token, caseId])
    expect(read?.communications?.[0]).toMatchObject({ bodyHtml: first.body_html, bodyText: first.body_text, replyToAddress: null })
    expect(JSON.stringify(read)).not.toContain("#t=")
    expect(JSON.stringify(read)).not.toContain(setup.token)

    const firstIntro = "Hello Alex,\n\nPlease send the two documents named below so we can review the listing."
    const revised = await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), created!.id, created!.version, `Documents for ${publicRef}`, firstIntro, ""])
    expect(revised).toMatchObject({ status: "success", contentVersion: 2 })
    const secondExpected = renderEvidenceRequest({
      caseRef: publicRef,
      documents: ["Shop licence", "Proof of operating location"],
      uploadUrl: upload,
      introduction: firstIntro,
      subject: `Documents for ${publicRef}`,
    })
    const second = (await db.query<{ subject: string; body_text: string; body_html: string; reply_to_address: string | null; customer_action_id: string; content_version: number }>(
      "select subject, body_text, body_html, reply_to_address, customer_action_id, content_version from public.communications where id = $1",
      [revised!.id],
    )).rows[0]
    expect(second.body_text).toBe(secondExpected?.text)
    expect(second.subject).toBe(`Documents for ${publicRef}`)
    expect(second.customer_action_id).toBe(setup.actionId)
    expect(second.reply_to_address).toBeNull()
    expect(second.body_text).not.toContain("Thank you for contacting ProfileRelaunch.")
    expect(counts(second.body_html)).toMatchObject({ lists: 1, items: 2, buttons: 1, signOffs: 1, security: 1, replies: 0 })

    const secondIntro = "Hello Alex,\n\nA photo of the shop licence and the proof of the operating location will be enough."
    const again = await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), revised!.id, revised!.version, `Documents for ${publicRef}`, secondIntro, "cases@profilerelaunch.com"])
    expect(again).toMatchObject({ status: "success", contentVersion: 3 })
    const thirdExpected = renderEvidenceRequest({
      caseRef: publicRef,
      documents: ["Shop licence", "Proof of operating location"],
      uploadUrl: upload,
      introduction: secondIntro,
      subject: `Documents for ${publicRef}`,
      replyTo: "cases@profilerelaunch.com",
    })
    const third = (await db.query<{ subject: string; body_text: string; body_html: string; reply_to_address: string | null; content_locked: boolean }>(
      "select subject, body_text, body_html, reply_to_address, content_locked from public.communications where id = $1",
      [again!.id],
    )).rows[0]
    expect(third.body_text).toBe(thirdExpected?.text)
    expect(third.body_text).toContain(secondIntro.split("\n\n")[1])
    expect(third.body_text).not.toContain(firstIntro.split("\n\n")[1])
    expect(third.reply_to_address).toBe("cases@profilerelaunch.com")
    expect(third.body_html).not.toContain("cases@profilerelaunch.com")
    expect(counts(third.body_html)).toMatchObject({ lists: 1, items: 2, buttons: 1, signOffs: 1, security: 1, replies: 1 })
    expect(counts(third.body_text)).toMatchObject({ signOffs: 1, security: 1, replies: 1 })
    expect(await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), created!.id, created!.version, `Documents for ${publicRef}`, secondIntro, ""])).toMatchObject({ status: "conflict" })
    expect(await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), again!.id, (again?.version ?? 0) + 1, `Documents for ${publicRef}`, secondIntro, "cases@profilerelaunch.com"])).toMatchObject({ status: "conflict" })
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expires_at = now() - interval '1 minute' where id = $1", [setup.actionId])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    expect(await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), again!.id, again!.version, `Documents for ${publicRef}`, secondIntro, "cases@profilerelaunch.com"])).toMatchObject({ status: "denied" })
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expires_at = now() + interval '14 days' where id = $1", [setup.actionId])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")

    await db.query("update public.communications set body_html = '<p>Plain only</p>' where id = $1", [again!.id])
    expect(await rpc("admin_communication_command_v1", [token, key(), "review", {
      communicationId: again!.id, fromAddress: "ops@example.com",
    }, again!.version])).toMatchObject({ status: "denied" })
    await db.query("update public.communications set body_html = $2 where id = $1", [again!.id, third.body_html])
    const approved = await rpc("admin_communication_command_v1", [token, key(), "review", {
      communicationId: again!.id, fromAddress: "ops@example.com",
    }, again!.version])
    expect(approved).toMatchObject({ status: "success", lifecycle: "REVIEWED" })
    const locked = (await db.query<{ content_locked: boolean; body_text: string; lifecycle: string }>(
      "select content_locked, body_text, lifecycle from public.communications where id = $1",
      [again!.id],
    )).rows[0]
    expect(locked).toMatchObject({ content_locked: true, lifecycle: "REVIEWED", body_text: third.body_text })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    expect(await rpc("admin_communication_revise_evidence_draft_v1", [token, key(), again!.id, approved!.version, `Documents for ${publicRef}`, secondIntro, "cases@profilerelaunch.com"])).toMatchObject({ status: "denied" })
    await expect(db.query("update public.communications set body_text = 'A different body that is long enough to store.' where id = $1", [again!.id])).rejects.toThrow(/immutable/i)
  })

  it("snapshots a server reply mailbox, refuses a vague title, and sends only through the worker", async () => {
    await seed()
    const vague = await openEvidence("Other evidence")
    expect(await rpc("admin_communication_command_v1", [token, key(), "draft", {
      templateKey: "EVIDENCE_REQUEST",
      caseId,
      evidenceRequestId: vague.evidenceRequestId,
      customerOrigin: "https://customer.profilerelaunch.com",
      actionId: vague.actionId,
      secretHash: vague.secretHash,
      linkKeyVersion: 1,
    }, null])).toMatchObject({ status: "denied" })

    const setup = await openEvidence("Shop licence")
    const publicRef = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [caseId])).rows[0].public_ref
    const created = await rpc("admin_communication_command_v1", [token, key(), "draft", {
      templateKey: "EVIDENCE_REQUEST",
      caseId,
      evidenceRequestId: setup.evidenceRequestId,
      customerOrigin: "https://customer.profilerelaunch.com",
      actionId: setup.actionId,
      secretHash: setup.secretHash,
      linkKeyVersion: 1,
      serverReplyTo: "Cases@ProfileRelaunch.com",
      replyTo: "attacker@example.com",
    }, null])
    expect(created?.status).toBe("success")
    const upload = uploadFor(setup.actionId)
    const stored = (await db.query<{ body_text: string; body_html: string; reply_to_address: string | null }>(
      "select body_text, body_html, reply_to_address from public.communications where id = $1",
      [created!.id],
    )).rows[0]
    expect(stored.reply_to_address).toBe("cases@profilerelaunch.com")
    expect(stored.body_text).toBe(renderEvidenceRequest({
      caseRef: publicRef,
      documents: ["Shop licence"],
      uploadUrl: upload,
      replyTo: "cases@profilerelaunch.com",
    })?.text)
    expect(stored.body_html).not.toContain("attacker@example.com")
    expect(counts(stored.body_html).items).toBe(1)

    const reviewed = await rpc("admin_communication_command_v1", [token, key(), "review", {
      communicationId: created!.id, fromAddress: "ops@example.com",
    }, created!.version])
    expect(reviewed?.status).toBe("success")
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", { communicationId: created!.id }, reviewed!.version])).toEqual({ status: "denied" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", {
      communicationId: created!.id, sendEnabled: true,
    }, reviewed!.version])).toMatchObject({ status: "success" })
    const provider = createIdempotentMailProvider()
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32), COMMUNICATIONS_LINK_SECRET: linkSecretValue }
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, provider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, provider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    expect(provider.calls).toBe(1)
    expect(provider.payloads[0]?.replyTo).toBe("cases@profilerelaunch.com")
    expect(provider.payloads[0]?.text).toContain(`${upload}#t=`)
    expect(provider.payloads[0]?.html).toContain(`${upload}#t=`)
    expect(provider.payloads[0]?.html?.match(new RegExp(`${upload}#t=`, "g"))).toHaveLength(1)
    const after = (await db.query<{ body_text: string; body_html: string }>("select body_text, body_html from public.communications where id = $1", [created!.id])).rows[0]
    expect(after.body_text).not.toContain("#t=")
    expect(after.body_html).not.toContain("#t=")
    expect(JSON.stringify(after)).not.toContain(setup.token)
  })

  it("leaves a version 2 insert unchanged", async () => {
    await seed()
    const setup = await openEvidence("Shop licence")
    const kept = "Version two wording stays exactly as stored for this check."
    const action = await db.query<{ id: string }>(
      `insert into public.customer_actions(id, customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
       values($1,$2,$3,$4,$5,'CASE_ACCESS',$6,'alex@example.com', now() + interval '2 days', $7) returning id`,
      [setup.actionId, customer, business, location, caseId, setup.secretHash, uid],
    )
    await db.query(
      `insert into public.communications(
        case_id, customer_id, business_id, evidence_request_id, customer_action_id,
        channel, communication_type, direction, recipient, subject, body_text, body_html,
        status, lifecycle, delivery_status, template_key, template_version, author_id, link_key_version
      ) values ($1,$2,$3,$4,$5,'EMAIL','EVIDENCE_REQUEST','OUTBOUND','alex@example.com','Version two',$6,'<p>Version two</p>','PENDING','DRAFT','NONE','EVIDENCE_REQUEST',2,$7,1)`,
      [caseId, customer, business, setup.evidenceRequestId, action.rows[0].id, kept, uid],
    )
    const row = (await db.query<{ body_text: string; body_html: string; template_version: number }>(
      "select body_text, body_html, template_version from public.communications where template_version = 2",
    )).rows[0]
    expect(row).toEqual({ body_text: kept, body_html: "<p>Version two</p>", template_version: 2 })
  })
})
