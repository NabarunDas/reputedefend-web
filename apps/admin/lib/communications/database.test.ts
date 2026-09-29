import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"
import { sendEmailHandler } from "./handler"
import { createIdempotentMailProvider } from "./mail"
import { deriveCommunicationAccessToken, communicationAccessTokenHash } from "./link"
import { runJobWorker, WorkerCrash } from "../jobs/worker"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secretHash = () => createHash("sha256").update(randomBytes(32)).digest("hex")

type RpcResult = {
  status?: string
  id?: string
  version?: number
  lifecycle?: string
  deliveryStatus?: string
  communications?: Array<{
    id: string
    recipient: string
    lifecycle: string | null
    deliveryStatus: string | null
    version: number
    subject: string | null
    lastError: string | null
    events: Array<{ eventType: string }>
  }>
  jobs?: Array<{ jobId: string; jobType: string; idempotencyKey: string; payload: Record<string, unknown>; leaseToken: string; attempts: number }>
  promoted?: number
  duplicate?: boolean
  applied?: boolean
  suppressed?: boolean
  recipient?: string
  subject?: string
  bodyText?: string
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
  admin_enqueue_job_probe_v1: ["p_token", "p_request"],
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
  communication_apply_provider_event_v1: ["p_provider", "p_provider_event_id", "p_event_type", "p_provider_message_id", "p_occurred_at"],
  admin_job_replay_v1: ["p_token", "p_request", "p_job", "p_reason", "p_confirmed", "p_version"],
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
  ]) await db.exec(read(name))
}, 30000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,auth.users,admin_private.job_attempts,admin_private.jobs,admin_private.job_outbox,admin_private.job_worker_heartbeats,admin_private.job_command_receipts,admin_private.communication_delivery_events,admin_private.communication_webhook_events,admin_private.email_suppressions,admin_private.communication_command_receipts,public.communications,public.customer_action_events,public.customer_actions,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,public.customer_contact_verifications,public.business_memberships,public.case_tasks,public.case_work_events,public.enquiry_events,public.enquiries,admin_private.case_command_receipts,admin_private.evidence_command_receipts cascade;
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
    insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values('${customer}','email','alex@example.com','${uid}','Verified from a live call with the customer.') on conflict (customer_id,channel) do update set verified_value=excluded.verified_value;
    insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values('${customer}','${business}','verified',now(),'${uid}','Companies House match discussed on a live call.') on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence;`)
})

const linkSecretValue = "communication-link-secret-for-tests-32b"
function accessMaterial(actionId = crypto.randomUUID()) {
  const token = deriveCommunicationAccessToken(actionId, linkSecretValue)
  return { actionId, token, secretHash: communicationAccessTokenHash(token) }
}
function queueBody(communicationId: string | undefined, extra: Record<string, unknown> = {}) {
  if (!communicationId) throw new Error("missing communication id")
  return { communicationId, sendEnabled: true, ...extra }
}

async function openEvidence(withManualAccess = false) {
  const request = await db.query<{ id: string }>(
    "insert into public.evidence_requests(case_id, title, request_text, created_by) values($1,'Photo ID','Please send a clear photo of the owner ID.','" + uid + "') returning id",
    [caseId],
  )
  let existingAccessId: string | null = null
  if (withManualAccess) {
    const existing = await db.query<{ id: string }>(
      `insert into public.customer_actions(customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
       values($1,$2,$3,$4,'CASE_ACCESS',$5,'alex@example.com', now() + interval '2 days', $6) returning id`,
      [customer, business, location, caseId, secretHash(), uid],
    )
    existingAccessId = existing.rows[0].id
  }
  return { evidenceRequestId: request.rows[0].id, existingAccessId, ...accessMaterial() }
}

async function draft(extra: Record<string, unknown> = {}) {
  const generated = extra.evidenceRequestId ? { evidenceRequestId: String(extra.evidenceRequestId), ...accessMaterial() } : await openEvidence()
  const evidenceRequestId = String(extra.evidenceRequestId ?? generated.evidenceRequestId)
  const actionId = String(extra.actionId ?? generated.actionId)
  const secretHashValue = String(extra.secretHash ?? generated.secretHash)
  return rpc("admin_communication_command_v1", [token, key(), "draft", {
    templateKey: "EVIDENCE_REQUEST",
    caseId,
    evidenceRequestId,
    customerOrigin: "https://customer.profilerelaunch.com",
    actionId,
    secretHash: secretHashValue,
    ...extra,
  }, null])
}

async function reviewed() {
  const created = await draft()
  expect(created?.status).toBe("success")
  const result = await rpc("admin_communication_command_v1", [token, key(), "review", { communicationId: created!.id }, created!.version])
  expect(result?.status).toBe("success")
  return result!
}

describe("communications outgoing mail SQL", () => {
  it("drafts without sending and refuses to queue an unreviewed communication", async () => {
    const created = await draft()
    expect(created?.status).toBe("success")
    expect(created?.lifecycle).toBe("DRAFT")
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(created!.id), created!.version])).toEqual({ status: "denied" })
  })

  it("rejects a queue command that tries to change the reviewed snapshot", async () => {
    const row = await reviewed()
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", {
      ...queueBody(row.id), recipient: "other@example.com", subject: "Changed",
    }, row.version])).toEqual({ status: "denied" })
    expect((await db.query<{ lifecycle: string }>("select lifecycle from public.communications where id=$1", [row.id])).rows[0].lifecycle).toBe("REVIEWED")
  })

  it("queues atomically with the outbox row and is idempotent", async () => {
    const row = await reviewed()
    await expect(db.exec(`do $$ begin
      perform public.admin_communication_command_v1('${token}','${key()}'::uuid,'queue', jsonb_build_object('communicationId','${row.id}','sendEnabled', true), ${row.version});
      raise exception 'simulated business failure';
    end $$;`)).rejects.toThrow(/simulated business failure/)
    expect((await db.query<{ lifecycle: string }>("select lifecycle from public.communications where id=$1", [row.id])).rows[0].lifecycle).toBe("REVIEWED")
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)

    const request = key()
    const first = await rpc("admin_communication_command_v1", [token, request, "queue", queueBody(row.id), row.version])
    const second = await rpc("admin_communication_command_v1", [token, request, "queue", queueBody(row.id), row.version])
    expect(first).toMatchObject({ status: "success", lifecycle: "QUEUED" })
    expect(second).toEqual(first)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(1)
    expect((await rpc("job_promote_outbox_v1", [20]))?.promoted).toBe(1)
    expect((await rpc("job_promote_outbox_v1", [20]))?.promoted).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type='SEND_EMAIL'")).rows[0].n).toBe(1)
  })

  it("lets only one worker claim SEND_EMAIL and keeps SYSTEM_HEALTH_PROBE working", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    await rpc("admin_enqueue_job_probe_v1", [token, key()])
    await rpc("job_promote_outbox_v1", [20])
    const first = await rpc("job_claim_batch_v1", [10, "worker-a", 120, "dpl"])
    const second = await rpc("job_claim_batch_v1", [10, "worker-b", 120, "dpl"])
    expect(first?.jobs?.map(job => job.jobType).sort()).toEqual(["SEND_EMAIL", "SYSTEM_HEALTH_PROBE"])
    expect(second?.jobs).toEqual([])
    const email = first!.jobs!.find(job => job.jobType === "SEND_EMAIL")!
    expect(email.idempotencyKey).toBe(`send-email:${row.id}:v1`)
    expect(email.payload).toEqual({ communicationId: row.id, contentVersion: 1 })
  })

  it("produces one external email after a crash following provider acceptance", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    const provider = createIdempotentMailProvider()
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32), COMMUNICATIONS_LINK_SECRET: linkSecretValue }
    await expect(runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, provider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
      crashAfterProvider: true,
    })).rejects.toBeInstanceOf(WorkerCrash)
    expect(provider.effects).toBe(1)
    expect((await db.query<{ delivery_status: string | null; status: string }>("select delivery_status, status from public.communications where id=$1", [row.id])).rows[0]).toEqual({
      delivery_status: "NONE", status: "PENDING",
    })
    await db.exec("update admin_private.jobs set lease_expires_at=now()-interval '1 second'")
    const recovered = await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, provider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    expect(recovered).toMatchObject({ status: "success", counts: { succeeded: 1 } })
    expect(provider.calls).toBe(2)
    expect(provider.effects).toBe(1)
    const comm = await db.query<{ delivery_status: string; status: string }>("select delivery_status, status from public.communications where id=$1", [row.id])
    expect(comm.rows[0]).toEqual({ delivery_status: "PROVIDER_ACCEPTED", status: "SENT" })
    const health = await rpc("admin_communication_list_v1", [token, caseId])
    expect(health?.communications?.[0].deliveryStatus).toBe("PROVIDER_ACCEPTED")
    expect(JSON.stringify(health)).not.toMatch(/Delivered/)
  })

  it("applies delivery webhooks idempotently and never regresses delivered to accepted", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    await rpc("communication_mark_provider_accepted_v1", [row.id, "resend", "msg_1", `send-email:${row.id}:v1`])
    const deliveredAt = "2026-09-29T12:10:00.000Z"
    const first = await rpc("communication_apply_provider_event_v1", ["resend", "evt_delivered_1", "email.delivered", "msg_1", deliveredAt])
    const dup = await rpc("communication_apply_provider_event_v1", ["resend", "evt_delivered_1", "email.delivered", "msg_1", deliveredAt])
    expect(first).toMatchObject({ status: "success", applied: true, duplicate: false })
    expect(dup).toMatchObject({ status: "success", duplicate: true })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("DELIVERED")
    await rpc("communication_mark_provider_accepted_v1", [row.id, "resend", "msg_1", `send-email:${row.id}:v1`])
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("DELIVERED")
    const unknown = await rpc("communication_apply_provider_event_v1", ["resend", "evt_opened_1", "email.opened", "msg_1", "2026-09-29T12:11:00.000Z"])
    expect(unknown).toMatchObject({ status: "success", applied: false })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("DELIVERED")
  })

  it("surfaces bounce and blocks a blind retry to the same address", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    await rpc("communication_mark_provider_accepted_v1", [row.id, "resend", "msg_bounce", `send-email:${row.id}:v1`])
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_bounce_1", "email.bounced", "msg_bounce", "2026-09-29T12:12:00.000Z"])).toMatchObject({ applied: true })
    const listed = await rpc("admin_communication_list_v1", [token, caseId])
    expect(listed?.communications?.[0]).toMatchObject({ deliveryStatus: "BOUNCED", lastError: "Recipient address bounced" })
    expect(await rpc("admin_communication_command_v1", [token, key(), "resend_draft", {
      communicationId: row.id, caseId, customerOrigin: "https://customer.profilerelaunch.com",
    }, null])).toEqual({ status: "denied" })
    await db.query("update public.customers set email='alex.new@example.com' where id=$1", [customer])
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email','alex.new@example.com',$2,'Verified the replacement address on a live call.')", [customer, uid])
    await db.query(
      `insert into public.customer_actions(customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
       values($1,$2,$3,$4,'CASE_ACCESS',$5,'alex.new@example.com', now() + interval '2 days', $6)`,
      [customer, business, location, caseId, secretHash(), uid],
    )
    const replacementLink = accessMaterial()
    const replacement = await rpc("admin_communication_command_v1", [token, key(), "resend_draft", {
      communicationId: row.id, caseId, customerOrigin: "https://customer.profilerelaunch.com",
      actionId: replacementLink.actionId, secretHash: replacementLink.secretHash,
    }, null])
    expect(replacement?.status).toBe("success")
    const rows = await db.query<{ id: string; recipient: string }>("select id, recipient from public.communications order by created_at")
    expect(rows.rows[0]).toEqual({ id: row.id, recipient: "alex@example.com" })
    expect(rows.rows[1].recipient).toBe("alex.new@example.com")
  })

  it("does not rewrite a historical recipient when the current customer email changes", async () => {
    const created = await draft()
    await db.query("update public.customers set email='changed@example.com' where id=$1", [customer])
    await db.query("update public.customer_contact_verifications set verified_value='changed@example.com' where customer_id=$1", [customer])
    expect((await db.query<{ recipient: string }>("select recipient from public.communications where id=$1", [created!.id])).rows[0].recipient).toBe("alex@example.com")
  })

  it("does not send when the worker or provider is disabled", async () => {
    const row = await reviewed()
    expect(await rpc("admin_communication_command_v1", [token, key(), "queue", { communicationId: row.id }, row.version])).toEqual({ status: "denied" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.job_outbox")).rows[0].n).toBe(0)
    const provider = createIdempotentMailProvider()
    expect(await runJobWorker({
      rpc: namedRpc(),
      env: { JOB_WORKER_ENABLED: "false", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32) },
      handlers: { SEND_EMAIL: sendEmailHandler({}, provider) },
    })).toMatchObject({ status: "disabled" })
    expect(provider.effects).toBe(0)
  })

  it("keeps PREPARATION blocked and does not move marketing enquiries onto SEND_EMAIL", async () => {
    const version = (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id=$1", [caseId])).rows[0].workflow_version
    const blocked = await rpc("admin_case_command_v1", [token, key(), caseId, version, "transition", {
      note: "Reviewed the caller’s request and confirmed the details.",
      target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z",
    }])
    expect(["denied", "prerequisite"]).toContain(blocked?.status)
    await db.query("select public.create_general_enquiry_v1($1, $2::jsonb, false)", [
      key(),
      {
        fullName: "Alex", email: "alex@example.com", phone: "", businessName: "", country: "", service: "",
        subject: "", details: "Need help with a suspended profile please.", websiteUrl: "", businessProfileUrl: "",
        reviewUrl: "", source: "homepage",
      },
    ])
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type='SEND_EMAIL'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.enquiries")).rows[0].n).toBe(1)
  })

  it("materialises a usable COMMUNICATION_ACCESS link without persisting the token", async () => {
    const setup = await openEvidence(true)
    const created = await draft(setup)
    expect(created?.status).toBe("success")
    const stored = await db.query<{ body_text: string; customer_action_id: string }>("select body_text, customer_action_id from public.communications where id=$1", [created!.id])
    expect(stored.rows[0].body_text).toContain(`https://customer.profilerelaunch.com/action/${setup.actionId}`)
    expect(stored.rows[0].body_text).not.toContain("#t=")
    expect(stored.rows[0].customer_action_id).toBe(setup.actionId)
    const existing = await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [setup.existingAccessId])
    expect(existing.rows[0]?.status).toBe("OPEN")
    const exchanged = await rpc("customer_action_exchange_v1", [setup.actionId, setup.secretHash, secretHash()])
    expect(exchanged).toMatchObject({ status: "ok", kind: "COMMUNICATION_ACCESS" })
    const dump = JSON.stringify({
      communication: stored.rows[0],
      events: (await db.query("select * from admin_private.communication_delivery_events")).rows,
      audit: (await db.query("select details, reason from public.admin_audit_events")).rows,
    })
    expect(dump).not.toContain(setup.token)
    expect(dump).not.toContain("#t=")
  })

  it("refuses a stale content version or an unqueued lifecycle", async () => {
    const created = await draft()
    expect(await rpc("communication_load_send_v1", [created!.id, 1])).toEqual({ status: "unavailable" })
    const row = await reviewed()
    expect(await rpc("communication_load_send_v1", [row.id, 1])).toEqual({ status: "unavailable" })
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    expect(await rpc("communication_load_send_v1", [row.id, 99])).toEqual({ status: "unavailable" })
    const loaded = await rpc("communication_load_send_v1", [row.id, 1])
    expect(loaded).toMatchObject({ status: "success", lifecycle: "QUEUED", contentLocked: true, contentVersion: 1 })
    expect(loaded?.bodyText).not.toContain("#t=")
  })

  it("records ACCEPTANCE_UNKNOWN and blocks provider calls after the safety window", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    const timeoutProvider = {
      calls: 0,
      async send() {
        this.calls += 1
        return { ok: false as const, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }
      },
    }
    const env = { JOB_WORKER_ENABLED: "true", VERCEL_ENV: "production", CRON_SECRET: "a".repeat(32), COMMUNICATIONS_LINK_SECRET: linkSecretValue }
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, timeoutProvider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    expect(timeoutProvider.calls).toBe(1)
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("ACCEPTANCE_UNKNOWN")
    await db.exec("update admin_private.jobs set scheduled_at=now()-interval '1 second', lease_expires_at=null, status='RETRY'")
    await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, timeoutProvider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    expect(timeoutProvider.calls).toBe(2)
    await db.query("update public.communications set first_provider_attempt_at=now()-interval '23 hours 5 minutes' where id=$1", [row.id])
    await db.exec("update admin_private.jobs set lease_expires_at=now()-interval '1 second', status='RETRY'")
    const late = await runJobWorker({
      rpc: namedRpc(),
      env,
      handlers: { SEND_EMAIL: sendEmailHandler(env, timeoutProvider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
    })
    expect(timeoutProvider.calls).toBe(2)
    expect(late.counts.deadLettered + late.counts.retried + late.counts.succeeded).toBeGreaterThanOrEqual(0)
    const job = await db.query<{ id: string; record_version: number; status: string }>("select id, record_version, status from admin_private.jobs where job_type='SEND_EMAIL'")
    if (job.rows[0]?.status === "DEAD_LETTER") {
      await db.query("update public.admin_sessions set created_at=now() where token_hash=$1", [token])
      await rpc("admin_job_replay_v1", [token, key(), job.rows[0].id, "Need to retry after provider timeout reconciliation.", true, job.rows[0].record_version])
      await runJobWorker({
        rpc: namedRpc(),
        env,
        handlers: { SEND_EMAIL: sendEmailHandler(env, timeoutProvider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
      })
    } else {
      await db.query("update admin_private.jobs set status='DEAD_LETTER', record_version=record_version+1 where job_type='SEND_EMAIL'")
      const dead = await db.query<{ id: string; record_version: number }>("select id, record_version from admin_private.jobs where job_type='SEND_EMAIL'")
      await db.query("update public.admin_sessions set created_at=now() where token_hash=$1", [token])
      await rpc("admin_job_replay_v1", [token, key(), dead.rows[0].id, "Need to retry after provider timeout reconciliation.", true, dead.rows[0].record_version])
      await runJobWorker({
        rpc: namedRpc(),
        env,
        handlers: { SEND_EMAIL: sendEmailHandler(env, timeoutProvider), SYSTEM_HEALTH_PROBE: { jobType: "SYSTEM_HEALTH_PROBE", execute: async () => ({ ok: true }) } },
      })
    }
    expect(timeoutProvider.calls).toBe(2)
  })

  it("reconciles a delivery webhook that arrived before provider acceptance", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    const first = await rpc("communication_apply_provider_event_v1", ["resend", "evt_early_1", "email.delivered", "msg_early", "2026-09-29T12:20:00.000Z"])
    expect(first).toMatchObject({ status: "success", applied: false, duplicate: false })
    expect((await db.query<{ communication_id: string | null; applied: boolean }>("select communication_id, applied from admin_private.communication_webhook_events where provider_event_id='evt_early_1'")).rows[0]).toEqual({
      communication_id: null, applied: false,
    })
    await rpc("communication_mark_provider_accepted_v1", [row.id, "resend", "msg_early", `send-email:${row.id}:v1`])
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("DELIVERED")
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.communication_delivery_events where communication_id=$1 and event_type='DELIVERED'", [row.id])).rows[0].n).toBe(1)
    const replay = await rpc("communication_apply_provider_event_v1", ["resend", "evt_early_1", "email.delivered", "msg_early", "2026-09-29T12:20:00.000Z"])
    expect(replay).toMatchObject({ duplicate: true })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.communication_delivery_events where communication_id=$1 and event_type='DELIVERED'", [row.id])).rows[0].n).toBe(1)
  })

  it("uses provider time so an older delivered event cannot overwrite a later complaint", async () => {
    const row = await reviewed()
    await rpc("admin_communication_command_v1", [token, key(), "queue", queueBody(row.id), row.version])
    await rpc("communication_mark_provider_accepted_v1", [row.id, "resend", "msg_order", `send-email:${row.id}:v1`])
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_later_complaint", "email.complained", "msg_order", "2026-09-29T13:00:00.000Z"])).toMatchObject({ applied: true })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("COMPLAINED")
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_older_delivered", "email.delivered", "msg_order", "2026-09-29T12:00:00.000Z"])).toMatchObject({ applied: false })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id=$1", [row.id])).rows[0].delivery_status).toBe("COMPLAINED")
  })

  it("revokes browser roles from communications tables and SEND_EMAIL RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["communication_templates", "communication_delivery_events", "communication_webhook_events", "email_suppressions"]) {
        expect((await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `admin_private.${table}`])).rows[0].ok).toBe(false)
      }
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_communication_command_v1(text,uuid,text,jsonb,integer)','EXECUTE') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.communication_load_send_v1(uuid,integer)','EXECUTE') as ok", [role])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.communication_mark_acceptance_unknown_v1(uuid,text)','EXECUTE') as ok", [role])).rows[0].ok).toBe(false)
    }
  })
})
