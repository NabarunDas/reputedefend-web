import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const otherCase = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
// Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(name: string, args: unknown[] = []) { return (await db.query<{ value: any }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value }
const begin = (filename = "invoice.pdf", type = "application/pdf", size = 1024, document: string | null = null, request = key(), id = caseId, bucket = "test-evidence") =>
  rpc("admin_evidence_begin_v1", [token, request, id, document, filename, type, size, "Supporting invoice", bucket, null])
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url), read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;", "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';"))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    readdirSync(dir).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_foundation_v1.sql"))!,
  ]) await db.exec(read(name))
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    truncate public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,admin_private.evidence_command_receipts,public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.customers,public.businesses,public.locations,auth.users cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${otherCase}','PROFILE_RECOVERY','${customer}','${business}','${location}','Second case','2026-01-02');`)
})

describe("evidence foundation SQL", () => {
  it("rejects anonymous sessions and direct table access", async () => {
    expect(await rpc("admin_evidence_begin_v1", ["bad", key(), caseId, null, "invoice.pdf", "application/pdf", 1024, "Invoice", "test-evidence", null])).toEqual({ status: "unauthorized" })
    expect(await rpc("admin_evidence_version_v1", ["bad", caseId, crypto.randomUUID()])).toBeNull()
    for (const table of ["evidence_requests", "case_documents", "case_document_versions", "case_document_events"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const r = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `public.${table}`])
        expect(r.rows[0].ok).toBe(false)
      }
    }
  })
  it("rejects unknown cases, guessed versions and cross-case IDs", async () => {
    expect((await begin("invoice.pdf", "application/pdf", 1024, null, key(), crypto.randomUUID())).status).toBe("conflict")
    const created = await begin()
    expect(await rpc("admin_evidence_version_v1", [token, otherCase, created.versionId])).toEqual({ missing: true })
    expect(await rpc("admin_evidence_version_v1", [token, caseId, crypto.randomUUID()])).toEqual({ missing: true })
    expect(JSON.stringify(await rpc("admin_evidence_version_v1", [token, otherCase, created.versionId]))).not.toContain(created.storageKey)
  })
  it("stores opaque keys, defaults customer_visible to false and never overwrites a version", async () => {
    const first = await begin()
    expect(first.status).toBe("success")
    expect(first.storageKey).toBe(`cases/${caseId}/documents/${first.documentId}/versions/${first.versionId}`)
    expect(first.storageKey).not.toContain("invoice.pdf")
    const row = await db.query<{ customer_visible: boolean; original_filename: string }>("select customer_visible, original_filename from public.case_document_versions where id=$1", [first.versionId])
    expect(row.rows[0]).toEqual({ customer_visible: false, original_filename: "invoice.pdf" })
    const second = await begin("invoice.pdf", "application/pdf", 2048, first.documentId)
    expect(second.versionNumber).toBe(2)
    expect(second.storageKey).not.toBe(first.storageKey)
    expect(second.versionId).not.toBe(first.versionId)
    const versions = await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions where document_id=$1", [first.documentId])
    expect(versions.rows[0].n).toBe(2)
  })
  it("rejects disallowed types and sizes in the privileged RPC", async () => {
    expect((await begin("notes.doc", "application/msword")).status).toBe("invalid")
    expect((await begin("notes.pdf", "application/zip")).status).toBe("invalid")
    expect((await begin("notes.pdf", "image/jpeg")).status).toBe("invalid")
    expect((await begin("notes.pdf", "application/pdf", 0)).status).toBe("invalid")
    expect((await begin("notes.pdf", "application/pdf", 10485761)).status).toBe("invalid")
  })
  it("deduplicates matching retries and conflicts on changed payloads", async () => {
    const request = key()
    const first = await begin("invoice.pdf", "application/pdf", 1024, null, request)
    const replay = await begin("invoice.pdf", "application/pdf", 1024, null, request)
    expect(replay).toEqual(first)
    expect((await begin("other.pdf", "application/pdf", 1024, null, request)).status).toBe("conflict")
    const count = await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions")
    expect(count.rows[0].n).toBe(1)
  })
  it("finalizes uploaded versions and keeps validation pending until a clean scan", async () => {
    const created = await begin()
    const request = key()
    const finalized = await rpc("admin_evidence_finalize_v1", [token, request, caseId, created.versionId])
    expect(finalized).toMatchObject({ status: "success", uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING" })
    expect(await rpc("admin_evidence_finalize_v1", [token, request, caseId, created.versionId])).toEqual(finalized)
    expect((await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null])).status).toBe("success")
    expect((await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "THREATS_FOUND", "VALID", null])).status).toBe("invalid")
    const blocked = await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "THREATS_FOUND", "PENDING", null])
    expect(blocked).toMatchObject({ status: "success", scanStatus: "THREATS_FOUND", validationStatus: "PENDING" })
  })
  it("rolls back evidence rows if audit insert fails", async () => {
    await db.exec("CREATE FUNCTION public.reject_evidence_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit offline'; END $$; CREATE TRIGGER reject_evidence_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_evidence_audit();")
    try {
      await expect(begin()).rejects.toThrow()
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_documents")).rows[0].n).toBe(0)
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions")).rows[0].n).toBe(0)
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_document_events")).rows[0].n).toBe(0)
    } finally {
      await db.exec("DROP TRIGGER reject_evidence_audit ON public.admin_audit_events; DROP FUNCTION public.reject_evidence_audit();")
    }
  })
  it("records evidence activity without file bytes, tokens or URLs", async () => {
    const created = await begin()
    await rpc("admin_evidence_finalize_v1", [token, key(), caseId, created.versionId])
    const events = await rpc("admin_audit_list_v1", [token, null, "EVIDENCE_CHANGED", "success"])
    expect(events.length).toBeGreaterThan(0)
    expect(JSON.stringify(events)).not.toMatch(/invoice\.pdf|https:\/\/|AWS_|oidc|a{64}/)
    await expect(db.query("update public.case_document_events set event='UPLOAD_FAILED'")).rejects.toThrow(/append-only/i)
  })
})
