import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { sendEmailHandler } from "../communications/handler"
import { createIdempotentMailProvider } from "../communications/mail"
import { runJobWorker } from "../jobs/worker"
import { importInboundEmailHandler, createIdempotentInboundProvider } from "./import"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()

type RpcResult = {
  status?: string
  id?: string
  version?: number
  conversationId?: string
  messageId?: string
  duplicate?: boolean
  alreadyImported?: boolean
  importStatus?: string
  senderMatch?: string
  loopClass?: string
  state?: string
  lifecycle?: string
  communicationVersion?: number
  providerEmailId?: string
  conversations?: Array<{ id: string; state: string; senderMatch: string }>
  jobs?: Array<{ jobId: string; jobType: string; idempotencyKey: string; payload: Record<string, unknown>; leaseToken: string }>
  promoted?: number
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

const signatures: Record<string, string[]> = {
  job_promote_outbox_v1: ["p_limit"],
  job_claim_batch_v1: ["p_limit", "p_worker", "p_lease_seconds", "p_deployment"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
  job_heartbeat_v1: ["p_worker", "p_environment", "p_phase", "p_error", "p_deployment", "p_expected_interval", "p_late_after"],
  inbound_email_load_import_v1: ["p_provider", "p_provider_email_id"],
  inbound_email_import_v1: ["p_payload"],
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
  ]) await db.exec(read(name))
}, 45000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.job_attempts,admin_private.jobs,admin_private.job_outbox,admin_private.job_worker_heartbeats,admin_private.job_command_receipts,admin_private.communication_delivery_events,admin_private.communication_webhook_events,admin_private.email_suppressions,admin_private.communication_command_receipts,admin_private.inbound_email_receipts,admin_private.conversation_command_receipts,admin_private.customer_evidence_upload_receipts,admin_private.customer_action_sessions,admin_private.customer_action_challenges,public.conversation_attachments,public.conversation_messages,public.conversations,public.communications,public.customer_action_events,public.customer_actions,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,public.customer_contact_verifications,public.business_memberships,public.case_tasks,public.case_work_events,public.enquiry_events,public.enquiries,admin_private.case_command_receipts,admin_private.evidence_command_receipts cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com') on conflict (id) do update set email=excluded.email;
    insert into public.businesses(id,display_name) values('${business}','Bakery') on conflict (id) do nothing;
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK') on conflict (id) do nothing;
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED') on conflict (id) do nothing;
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.') on conflict (customer_id,channel) do update set verified_value=excluded.verified_value;`)
})

async function receive(emailId: string, extra: Record<string, unknown> = {}) {
  return rpc("inbound_email_receive_event_v1", [
    "resend", extra.eventId ?? `evt_${emailId}`, "email.received", emailId,
    extra.rfcMessageId ?? null, extra.sender ?? "alex@example.com", extra.subject ?? "Help",
  ])
}

async function importEmail(emailId: string, extra: Record<string, unknown> = {}) {
  const received = await receive(emailId, extra)
  expect(received?.status).toBe("success")
  return rpc("inbound_email_import_v1", [{
    providerEmailId: emailId,
    providerEventId: extra.eventId ?? `evt_${emailId}`,
    rfcMessageId: extra.rfcMessageId ?? `<${emailId}@mail.example.com>`,
    senderAddress: extra.sender ?? "alex@example.com",
    subject: extra.subject ?? "Help",
    bodyText: extra.bodyText ?? "Please help with the listing.",
    inReplyTo: extra.inReplyTo ?? null,
    referencesHeader: extra.referencesHeader ?? null,
    autoSubmitted: extra.autoSubmitted ?? null,
    toAddresses: extra.toAddresses ?? ["reply@reply.profilerelaunch.com"],
    ccAddresses: extra.ccAddresses ?? [],
    inboundDomain: extra.inboundDomain ?? "reply.profilerelaunch.com",
    ownedAddresses: extra.ownedAddresses ?? ["ops@reputedefend.com"],
    attachments: extra.attachments ?? [],
  }])
}

describe("incoming mail conversations SQL", () => {
  it("deduplicates email.received into one receipt and one import job", async () => {
    const first = await receive("email_dup_1")
    const second = await receive("email_dup_1")
    expect(first).toMatchObject({ status: "success", duplicate: false })
    expect(second).toMatchObject({ status: "success", duplicate: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.inbound_email_receipts")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox where topic='IMPORT_INBOUND_EMAIL'")).rows[0].n).toBe(1)
  })

  it("retries the worker without creating a second conversation or message", async () => {
    const imported = await importEmail("email_retry_1")
    expect(imported?.status).toBe("success")
    const again = await importEmail("email_retry_1")
    expect(again).toMatchObject({ status: "success", duplicate: true, conversationId: imported?.conversationId, messageId: imported?.messageId })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversations")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversation_messages")).rows[0].n).toBe(1)
  })

  it("threads by In-Reply-To, References, and opaque Reply-To alias", async () => {
    const first = await importEmail("email_thread_1", { rfcMessageId: "<root@example.com>" })
    const reply = await importEmail("email_thread_2", { rfcMessageId: "<child@example.com>", inReplyTo: "<root@example.com>" })
    expect(reply?.conversationId).toBe(first?.conversationId)
    const refs = await importEmail("email_thread_3", { rfcMessageId: "<grand@example.com>", referencesHeader: "<root@example.com> <child@example.com>" })
    expect(refs?.conversationId).toBe(first?.conversationId)
    const alias = (await db.query<{ reply_alias: string }>("select reply_alias from public.conversations where id=$1", [first!.conversationId])).rows[0].reply_alias
    const viaAlias = await importEmail("email_thread_4", {
      rfcMessageId: "<alias@example.com>",
      sender: "other@example.net",
      toAddresses: [`${alias}@reply.profilerelaunch.com`],
    })
    expect(viaAlias?.conversationId).toBe(first?.conversationId)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversations")).rows[0].n).toBe(1)
  })

  it("does not treat a matching sender address as identity, permission, or an automatic case link", async () => {
    const first = await importEmail("email_sender_1")
    const second = await importEmail("email_sender_2", { rfcMessageId: "<other-root@example.com>" })
    expect(first?.state).toBe("UNMATCHED")
    expect(second?.state).toBe("UNMATCHED")
    expect(first?.conversationId).not.toBe(second?.conversationId)
    expect(first?.senderMatch).toBe("MATCHES_VERIFIED_CONTACT")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversations where case_id is not null")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions")).rows[0].n).toBe(0)
    expect((await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email).toBe("alex@example.com")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_contact_verifications")).rows[0].n).toBe(1)
  })

  it("keeps an unmatched message intact and links it through an audited idempotent command", async () => {
    const imported = await importEmail("email_unmatched_1")
    const listed = await rpc("admin_conversation_list_v1", [token, "UNMATCHED"])
    expect(listed?.conversations?.some(row => row.id === imported?.conversationId)).toBe(true)
    const conversation = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    const request = key()
    const linked = await rpc("admin_conversation_command_v1", [token, request, "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])
    expect(linked?.status).toBe("success")
    expect(linked?.state).toBe("OPEN")
    expect(await rpc("admin_conversation_command_v1", [token, request, "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])).toEqual(linked)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversation_messages where conversation_id=$1", [imported!.conversationId])).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.admin_audit_events where action='CONVERSATION_CHANGED'")).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions")).rows[0].n).toBe(0)
  })

  it("does not let a spoofed From change verification or permissions", async () => {
    await importEmail("email_spoof_1", { sender: "alex@example.com" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions")).rows[0].n).toBe(0)
    expect((await db.query<{ verified_value: string }>("select verified_value from public.customer_contact_verifications")).rows[0].verified_value).toBe("alex@example.com")
    expect(["denied", "prerequisite"]).toContain((await rpc("admin_case_command_v1", [token, key(), caseId, 1, "transition", { note: "Reviewed the caller’s request and confirmed the details.", target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }]))?.status)
  })

  it("classifies automated mail as a loop and never queues SEND_EMAIL", async () => {
    const imported = await importEmail("email_loop_1", {
      sender: "ops@reputedefend.com",
      autoSubmitted: "auto-replied",
      ownedAddresses: ["ops@reputedefend.com"],
    })
    expect(imported).toMatchObject({ status: "success", importStatus: "LOOP", loopClass: "OWNED_SENDER" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox where topic='SEND_EMAIL'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.communications where lifecycle is not null")).rows[0].n).toBe(0)
  })

  it("keeps attachments unavailable until a clean allowed scan and records provenance without creating evidence", async () => {
    const imported = await importEmail("email_attach_1", {
      attachments: [{
        providerAttachmentId: "att_12345678",
        filename: "id-scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
      }, {
        providerAttachmentId: "att_unsafe_1",
        filename: "payload.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 200,
      }],
    })
    const rows = await db.query<{ id: string; scan_status: string; validation_status: string; original_filename: string }>(
      "select id, scan_status, validation_status, original_filename from public.conversation_attachments order by original_filename",
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.find(row => row.original_filename === "id-scan.pdf")).toMatchObject({ scan_status: "PENDING", validation_status: "ALLOWED" })
    expect(rows.rows.find(row => row.original_filename === "payload.exe")).toMatchObject({ validation_status: "BLOCKED" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_documents")).rows[0].n).toBe(0)
    const pdf = rows.rows.find(row => row.original_filename === "id-scan.pdf")!
    await rpc("inbound_attachment_mark_scan_v1", [pdf.id, "NO_THREATS_FOUND", "private-bucket", "conversations/a/b"])
    const conversation = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    await rpc("admin_conversation_command_v1", [token, key(), "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])
    const linked = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    const promoted = await rpc("admin_conversation_command_v1", [token, key(), "promote_attachment", { conversationId: imported!.conversationId, attachmentId: pdf.id }, linked.record_version])
    expect(promoted?.status).toBe("success")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_documents")).rows[0].n).toBe(0)
    expect((await db.query<{ promotion_state: string }>("select promotion_state from public.conversation_attachments where id=$1", [pdf.id])).rows[0].promotion_state).toBe("RECORDED")
  })

  it("records phone notes as append-only and creates an existing case task for contact recovery", async () => {
    const imported = await importEmail("email_note_1")
    const conversation = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    await rpc("admin_conversation_command_v1", [token, key(), "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])
    const note = await rpc("admin_conversation_command_v1", [token, key(), "phone_note", { conversationId: imported!.conversationId, note: "Customer asked for a call back this afternoon.", direction: "INBOUND" }, null])
    expect(note?.status).toBe("success")
    await expect(db.query("update public.conversation_messages set body_text='changed' where id=$1", [note!.id])).rejects.toThrow(/append-only/)
    const version = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0].record_version
    const recovery = await rpc("admin_conversation_command_v1", [token, key(), "contact_recovery", { conversationId: imported!.conversationId, kind: "CALL" }, version])
    expect(recovery?.status).toBe("success")
    const task = await db.query<{ kind: string; title: string; deadline_source: string }>("select kind, title, deadline_source from public.case_tasks where case_id=$1 order by created_at desc limit 1", [caseId])
    expect(task.rows[0].kind).toBe("CALL")
    expect(task.rows[0].deadline_source).toMatch(/contact recovery/)
    expect((await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email).toBe("alex@example.com")
  })

  it("drafts a conversation reply through Step 11 and freezes the threading snapshot", async () => {
    const imported = await importEmail("email_reply_1", { rfcMessageId: "<thread-root@example.com>" })
    const conversation = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    expect((await rpc("admin_conversation_command_v1", [token, key(), "draft_reply", {
      conversationId: imported!.conversationId, bodyText: "Thanks, we will review this today.", inboundDomain: "reply.profilerelaunch.com",
    }, conversation.record_version]))?.status).toBe("denied")
    await rpc("admin_conversation_command_v1", [token, key(), "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])
    const linked = (await db.query<{ record_version: number; reply_alias: string }>("select record_version, reply_alias from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    const drafted = await rpc("admin_conversation_command_v1", [token, key(), "draft_reply", {
      conversationId: imported!.conversationId, bodyText: "Thanks, we will review this today.", inboundDomain: "reply.profilerelaunch.com",
    }, linked.record_version])
    expect(drafted?.status).toBe("success")
    const comm = (await db.query<{
      id: string; template_key: string; reply_to_address: string; in_reply_to: string; references_header: string; record_version: number
    }>("select id, template_key, reply_to_address, in_reply_to, references_header, record_version from public.communications where id=$1", [drafted!.id])).rows[0]
    expect(comm.template_key).toBe("CONVERSATION_REPLY")
    expect(comm.reply_to_address).toBe(`${linked.reply_alias}@reply.profilerelaunch.com`)
    expect(comm.in_reply_to).toBe("thread-root@example.com")
    expect(comm.references_header).toMatch(/thread-root@example.com/)
    const reviewed = await rpc("admin_communication_command_v1", [token, key(), "review", { communicationId: comm.id, fromAddress: "ops@example.com" }, comm.record_version])
    expect(reviewed?.status).toBe("success")
    await expect(db.query("update public.communications set reply_to_address='other@example.com' where id=$1", [comm.id])).rejects.toThrow(/immutable/)
    await expect(db.query("update public.communications set in_reply_to='other' where id=$1", [comm.id])).rejects.toThrow(/immutable/)
    await expect(db.query("update public.communications set references_header='other' where id=$1", [comm.id])).rejects.toThrow(/immutable/)
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", { communicationId: comm.id, sendEnabled: false }, reviewed!.version])).toMatchObject({ status: "denied" })
  })

  it("records an outbound RFC Message-ID from email.sent without treating it as delivered", async () => {
    const imported = await importEmail("email_rfc_1", { rfcMessageId: "<rfc-root@example.com>" })
    const conversation = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    await rpc("admin_conversation_command_v1", [token, key(), "link_case", { conversationId: imported!.conversationId, caseId }, conversation.record_version])
    const linked = (await db.query<{ record_version: number }>("select record_version from public.conversations where id=$1", [imported!.conversationId])).rows[0]
    const drafted = await rpc("admin_conversation_command_v1", [token, key(), "draft_reply", {
      conversationId: imported!.conversationId, bodyText: "Thanks, we will review this today.", inboundDomain: "reply.profilerelaunch.com",
    }, linked.record_version])
    const comm = (await db.query<{ id: string; record_version: number }>("select id, record_version from public.communications where id=$1", [drafted!.id])).rows[0]
    await rpc("admin_communication_command_v1", [token, key(), "review", { communicationId: comm.id, fromAddress: "ops@example.com" }, comm.record_version])
    await db.query("update public.communications set provider='resend', provider_message_id='msg_rfc' where id=$1", [comm.id])
    const applied = await rpc("communication_apply_provider_event_v1", ["resend", "evt_sent_rfc", "email.sent", "msg_rfc", "2026-09-29T12:00:00Z", null, "<rfc-out@resend.dev>"])
    expect(applied).toMatchObject({ status: "success", applied: false })
    expect((await db.query<{ rfc_message_id: string; delivery_status: string }>("select rfc_message_id, delivery_status from public.communications where id=$1", [comm.id])).rows[0]).toEqual({
      rfc_message_id: "rfc-out@resend.dev",
      delivery_status: "NONE",
    })
  })

  it("keeps marketing enquiries off SEND_EMAIL and PREPARATION blocked", async () => {
    const version = (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [caseId])).rows[0].workflow_version
    const blocked = await rpc("admin_case_command_v1", [token, key(), caseId, version, "transition", { note: "Reviewed the caller’s request and confirmed the details.", target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }])
    expect(["denied", "prerequisite"]).toContain(blocked?.status)
    expect(["denied", "prerequisite"]).toContain((await rpc("admin_case_command_v1", [token, key(), caseId, version, "transition", { note: "Reviewed the caller’s request and confirmed the details.", target: "READY_TO_SUBMIT", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }]))?.status)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type='SEND_EMAIL'")).rows[0].n).toBe(0)
  })

  it("revokes browser roles from conversation tables and inbound RPCs", async () => {
    const tables = ["conversations", "conversation_messages", "conversation_attachments"]
    for (const table of tables) {
      for (const role of ["anon", "authenticated"]) {
        const result = await db.query<{ n: boolean }>(`select has_table_privilege('${role}','public.${table}','select') as n`)
        expect(result.rows[0].n, table).toBe(false)
      }
    }
    for (const fn of [
      "inbound_email_receive_event_v1(text,text,text,text,text,text,text)",
      "inbound_email_import_v1(jsonb)",
      "admin_conversation_command_v1(text,uuid,text,jsonb,integer)",
    ]) {
      expect((await db.query<{ n: boolean }>(`select has_function_privilege('anon','public.${fn}','execute') as n`)).rows[0].n).toBe(false)
      expect((await db.query<{ n: boolean }>(`select has_function_privilege('authenticated','public.${fn}','execute') as n`)).rows[0].n).toBe(false)
    }
  })

  it("imports through the durable worker with the same idempotency key", async () => {
    const received = await receive("email_worker_1")
    expect(received?.duplicate).toBe(false)
    const provider = createIdempotentInboundProvider({
      email_worker_1: {
        id: "email_worker_1",
        from: "alex@example.com",
        to: ["help@reply.profilerelaunch.com"],
        subject: "Worker import",
        text: "Imported by the durable worker.",
        message_id: "<worker@example.com>",
        headers: [{ name: "Auto-Submitted", value: "no" }],
      },
    })
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) }
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { IMPORT_INBOUND_EMAIL: importInboundEmailHandler(env, provider), SEND_EMAIL: sendEmailHandler(env, createIdempotentMailProvider()) },
    })
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { IMPORT_INBOUND_EMAIL: importInboundEmailHandler(env, provider) },
    })
    expect(provider.calls).toBe(1)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.conversation_messages")).rows[0].n).toBe(1)
  })
})
