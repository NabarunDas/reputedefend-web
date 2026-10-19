import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const reviewCase = "99999999-9999-4999-8999-999999999999"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const note = "Reviewed the caller’s request and confirmed the details."
const summary = "The listing was restored and the customer can see it."

type CommandResult = { status: string; id?: string }
type CaseRow = {
  status: string
  work_stage: string
  outcome: string | null
  closure_summary: string
  closed_at: string | null
  workflow_version: number
}

async function rpc(name: string, args: unknown[] = []): Promise<CommandResult> {
  return (await db.query<{ value: CommandResult }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
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
    "20261019183000_admin_journey_10b_record_outcome_v1.sql",
  ]) await db.exec(read(name))
}, 90000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    delete from public.case_submission_results;
    delete from public.case_submissions;
    delete from public.case_tasks;
    delete from public.case_work_events;
    delete from admin_private.case_command_receipts;
    delete from public.admin_audit_events;
    delete from public.cases;
    delete from public.locations;
    delete from public.businesses;
    delete from public.customers;
    delete from public.admin_sessions;
    delete from public.admin_identity;
    delete from auth.users;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${reviewCase}','REVIEW_PROTECTION','${customer}','${business}','${location}','Review dispute','2026-01-01');`)
})

const row = (id = caseId) => db.query<CaseRow>("select status, work_stage, outcome, closure_summary, closed_at, workflow_version from public.cases where id=$1", [id]).then(result => result.rows[0])
const command = async (operation: string, data: Record<string, unknown>, version?: number, request = key(), id = caseId) => rpc("admin_case_command_v1", [token, request, id, version ?? (await row(id)).workflow_version, operation, { note, ...data }])
const review = (id = caseId) => db.exec(`update public.cases set work_stage='OUTCOME_REVIEW' where id='${id}'`)
const events = (id = caseId) => db.query<{ actor_id: string; event: string; details: { closesCase?: boolean; outcome?: string } }>("select actor_id, event, details from public.case_work_events where case_id=$1 order by id", [id]).then(result => result.rows)
const audits = (id = caseId) => db.query<{ actor_id: string; action: string; outcome: string; details: { operation?: string } }>("select actor_id, action, outcome, details from public.admin_audit_events where target_id=$1 order by id", [id]).then(result => result.rows)
const payments = async () => (await db.query<{ obligations: number; invoices: number; approvals: number }>("select (select count(*)::int from public.payment_obligations) as obligations, (select count(*)::int from public.payment_invoices) as invoices, (select count(*)::int from public.success_fee_approvals) as approvals")).rows[0]

describe("record_outcome SQL", () => {
  it("records a valid outcome while the case stays open", async () => {
    await review()
    const before = await row()
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("success")
    const after = await row()
    expect(after.outcome).toBe("RESTORED")
    expect(after.closure_summary).toBe(summary)
    expect(after.status).toBe(before.status)
    expect(after.work_stage).toBe("OUTCOME_REVIEW")
    expect(after.closed_at).toBeNull()
    expect(after.workflow_version).toBe(before.workflow_version + 1)
    expect(await payments()).toEqual({ obligations: 0, invoices: 0, approvals: 0 })
    const work = await events()
    expect(work).toHaveLength(1)
    expect(work[0].actor_id).toBe(uid)
    expect(work[0].event).toBe("record_outcome")
    expect(work[0].details.closesCase).toBe(false)
    const audit = await audits()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actor_id: uid, action: "CASE_CHANGED", outcome: "success" })
    expect(audit[0].details.operation).toBe("record_outcome")
  })

  it("rejects an invalid outcome, the wrong stage, and a missing session", async () => {
    expect((await command("record_outcome", { outcome: "REMOVED", summary })).status).toBe("invalid")
    expect((await command("record_outcome", { outcome: "RESTORED", summary: "too short" })).status).toBe("invalid")
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("denied")
    expect((await row()).outcome).toBeNull()
    expect(await events()).toHaveLength(0)
    await review(reviewCase)
    expect((await command("record_outcome", { outcome: "RESTORED", summary }, undefined, key(), reviewCase)).status).toBe("invalid")
    expect((await command("record_outcome", { outcome: "REMOVED", summary }, undefined, key(), reviewCase)).status).toBe("success")
    expect((await row(reviewCase)).status).not.toBe("CLOSED")
    expect(await rpc("admin_case_command_v1", ["bad", key(), caseId, 1, "record_outcome", { note, outcome: "WITHDRAWN", summary }])).toEqual({ status: "unauthorized" })
    for (const role of ["anon", "authenticated"]) {
      const privilege = await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.admin_case_command_v1(text,uuid,uuid,integer,text,jsonb)','EXECUTE') as ok", [role])
      expect(privilege.rows[0].ok).toBe(false)
    }
    const service = await db.query<{ ok: boolean }>("select has_function_privilege('service_role','public.admin_case_command_v1(text,uuid,uuid,integer,text,jsonb)','EXECUTE') as ok")
    expect(service.rows[0].ok).toBe(true)
  })

  it("replays one request and refuses a second record or a stale version", async () => {
    await review()
    const version = (await row()).workflow_version
    const request = key()
    expect((await command("record_outcome", { outcome: "RESTORED", summary }, version, request)).status).toBe("success")
    expect((await command("record_outcome", { outcome: "RESTORED", summary }, version, request)).status).toBe("success")
    expect(await events()).toHaveLength(1)
    expect((await command("record_outcome", { outcome: "NOT_RESTORED", summary })).status).toBe("denied")
    expect((await command("record_outcome", { outcome: "RESTORED", summary: "A different supporting summary that is long enough." })).status).toBe("denied")
    const stored = await row()
    expect(stored.outcome).toBe("RESTORED")
    expect(stored.closure_summary).toBe(summary)
    expect(stored.status).not.toBe("CLOSED")
    expect((await command("record_outcome", { outcome: "RESTORED", summary }, version)).status).toBe("conflict")
    expect((await command("note", { visibility: "INTERNAL" }, 1)).status).toBe("conflict")
  })

  it("closes only when the recorded outcome and summary are repeated", async () => {
    await review()
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("success")
    expect((await command("close", { outcome: "NOT_RESTORED", summary })).status).toBe("denied")
    expect((await command("close", { outcome: "RESTORED", summary: "A different supporting summary that is long enough." })).status).toBe("denied")
    const held = await row()
    expect(held.status).not.toBe("CLOSED")
    expect(held.work_stage).toBe("OUTCOME_REVIEW")
    expect(held.outcome).toBe("RESTORED")
    expect(held.closure_summary).toBe(summary)
    expect(held.closed_at).toBeNull()
    expect((await command("close", { outcome: "RESTORED", summary })).status).toBe("success")
    const closed = await row()
    expect(closed.status).toBe("CLOSED")
    expect(closed.work_stage).toBe("FINISHED")
    expect(closed.outcome).toBe("RESTORED")
    expect(closed.closure_summary).toBe(summary)
    expect(closed.closed_at).not.toBeNull()
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("denied")
  })

  it("still closes a case that has no recorded outcome, and keeps note and reopen working", async () => {
    await review()
    expect((await command("note", { visibility: "INTERNAL" })).status).toBe("success")
    expect((await command("close", { outcome: "PARTIALLY_RESTORED", summary })).status).toBe("success")
    const closed = await row()
    expect(closed.status).toBe("CLOSED")
    expect(closed.outcome).toBe("PARTIALLY_RESTORED")
    expect(closed.closure_summary).toBe(summary)
    const task = { title: "Call the customer", owner: "ADMIN", kind: "FOLLOW_UP", due: "2026-12-01T12:00:00Z", source: "Agreed on the phone", timezone: "Europe/London" }
    expect((await command("reopen", task)).status).toBe("success")
    const reopened = await row()
    expect(reopened.status).toBe("UNDER_REVIEW")
    expect(reopened.work_stage).toBe("FURTHER_REVIEW")
    expect(reopened.outcome).toBeNull()
    expect(reopened.closure_summary).toBe("")
    expect(reopened.closed_at).toBeNull()
    expect((await command("record_outcome", { outcome: "RESTORED", summary })).status).toBe("denied")
    expect((await command("record_outcome", { outcome: "WITHDRAWN", summary })).status).toBe("success")
    const recorded = await row()
    expect(recorded.outcome).toBe("WITHDRAWN")
    expect(recorded.status).toBe("UNDER_REVIEW")
    expect(recorded.work_stage).toBe("FURTHER_REVIEW")
    expect(recorded.closed_at).toBeNull()
    expect((await command("close", { outcome: "WITHDRAWN", summary })).status).toBe("open_work")
    expect((await row()).status).toBe("UNDER_REVIEW")
  })
})
