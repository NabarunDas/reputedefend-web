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
    readdirSync(dir).find(n => n.endsWith("_admin_evidence_workspace_v1.sql"))!,
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

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
async function versionMeta(id: string) {
  return rpc("admin_evidence_version_v1", [token, caseId, id])
}
async function finalize(id: string) {
  return rpc("admin_evidence_finalize_v1", [token, key(), caseId, id])
}
async function clean(filename = "invoice.pdf", type = "application/pdf", document: string | null = null) {
  const created = await begin(filename, type, 1024, document)
  await finalize(created.versionId)
  await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null])
  return created
}
async function review(id: string, operation: string, note = "Reviewed after a clean scan.", visible: boolean | null = null) {
  const meta = await versionMeta(id)
  return rpc("admin_evidence_review_v1", [token, key(), caseId, id, meta.recordVersion, operation, note, visible])
}

describe("evidence workspace SQL", () => {
  it("rejects unauthorised evidence queries", async () => {
    expect(await rpc("admin_evidence_case_v1", ["bad", caseId])).toBeNull()
    expect(await rpc("admin_evidence_queue_v1", ["bad"])).toBeNull()
    expect(await rpc("admin_evidence_request_v1", ["bad", key(), caseId, null, null, "create", "Title", "Please upload the file.", null, null])).toEqual({ status: "unauthorized" })
    expect(await rpc("admin_evidence_review_v1", ["bad", key(), caseId, crypto.randomUUID(), 1, "accept", "Not signed in for this review.", null])).toEqual({ status: "unauthorized" })
    expect(await rpc("admin_evidence_access_v1", ["bad", key(), caseId, crypto.randomUUID(), "view"])).toEqual({ status: "unauthorized" })
  })
  it("omits storage keys from the case query and does not leak cross-case metadata", async () => {
    const created = await clean()
    const detail = await rpc("admin_evidence_case_v1", [token, caseId])
    const encoded = JSON.stringify(detail)
    expect(detail.documents[0].versions[0].id).toBe(created.versionId)
    expect(encoded).not.toMatch(/storageKey|storageBucket|storage_key|storage_bucket/)
    expect(encoded).not.toContain(created.storageKey)
    expect(encoded).not.toMatch(/arn:aws|oidc|presigned/i)
    expect(await rpc("admin_evidence_case_v1", [token, crypto.randomUUID()])).toEqual({ missing: true })
    expect(JSON.stringify(await rpc("admin_evidence_review_v1", [token, key(), otherCase, created.versionId, 1, "accept", "Trying the other case.", null]))).not.toContain(created.storageKey)
    expect(await rpc("admin_evidence_review_v1", [token, key(), otherCase, created.versionId, 1, "accept", "Trying the other case.", null])).toEqual({ status: "conflict" })
  })
  it("bounds the global queue to 51 rows with cursor support", async () => {
    for (let index = 0; index < 52; index++) await clean(`file-${index}.pdf`)
    const first = await rpc("admin_evidence_queue_v1", [token, "all", null, null])
    expect(first).toHaveLength(51)
    expect(JSON.stringify(first)).not.toMatch(/storageKey|storage_key|"cases\//)
    const last = first[50]
    const next = await rpc("admin_evidence_queue_v1", [token, "all", last.uploadedAt, last.versionId])
    expect(next.length).toBeGreaterThan(0)
    expect(next[0].versionId).not.toBe(last.versionId)
  })
  it("creates, retries, fulfills and cancels evidence requests with audit", async () => {
    const request = key()
    const created = await rpc("admin_evidence_request_v1", [token, request, caseId, null, null, "create", "Bank statements", "Upload the latest statements.", null, null])
    expect(created).toMatchObject({ status: "success", requestStatus: "OPEN" })
    expect(await rpc("admin_evidence_request_v1", [token, request, caseId, null, null, "create", "Bank statements", "Upload the latest statements.", null, null])).toEqual(created)
    expect((await rpc("admin_evidence_request_v1", [token, request, caseId, null, null, "create", "Other title", "Upload the latest statements.", null, null])).status).toBe("conflict")
    const stale = await rpc("admin_evidence_request_v1", [token, key(), caseId, created.id, created.version + 1, "fulfill", null, null, null, "Completed after the customer sent files."])
    expect(stale.status).toBe("conflict")
    const fulfilled = await rpc("admin_evidence_request_v1", [token, key(), caseId, created.id, created.version, "fulfill", null, null, null, "Completed after the customer sent files."])
    expect(fulfilled).toMatchObject({ status: "success", requestStatus: "FULFILLED" })
    const other = await rpc("admin_evidence_request_v1", [token, key(), caseId, null, null, "create", "ID document", "Upload a photo of the ID.", null, null])
    expect((await rpc("admin_evidence_request_v1", [token, key(), otherCase, other.id, other.version, "cancel", null, null, null, "Trying to cancel from another case."])).status).toBe("conflict")
    const cancelled = await rpc("admin_evidence_request_v1", [token, key(), caseId, other.id, other.version, "cancel", null, null, null, "No longer required for this case."])
    expect(cancelled).toMatchObject({ requestStatus: "CANCELLED" })
    const audit = JSON.stringify(await rpc("admin_audit_list_v1", [token, null, "EVIDENCE_CHANGED", "success"]))
    expect(audit).toMatch(/create|fulfill|cancel/)
    expect(audit).not.toMatch(/https:\/\/|AWS_|oidc/)
  })
  it("rolls back a request create if audit insert fails", async () => {
    await db.exec("CREATE FUNCTION public.reject_request_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit offline'; END $$; CREATE TRIGGER reject_request_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_request_audit();")
    try {
      await expect(rpc("admin_evidence_request_v1", [token, key(), caseId, null, null, "create", "Bank statements", "Upload the latest statements.", null, null])).rejects.toThrow()
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.evidence_requests")).rows[0].n).toBe(0)
    } finally {
      await db.exec("DROP TRIGGER reject_request_audit ON public.admin_audit_events; DROP FUNCTION public.reject_request_audit();")
    }
  })
  it("cannot accept before a clean scan or valid content", async () => {
    const created = await begin()
    await finalize(created.versionId)
    expect((await review(created.versionId, "accept")).status).toBe("denied")
    await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "INVALID", "The PDF header is missing."])
    expect((await review(created.versionId, "accept")).status).toBe("denied")
    expect((await review(created.versionId, "reject")).status).toBe("denied")
  })
  it("accepts and rejects clean valid versions and supersedes the previous accepted version", async () => {
    const first = await clean()
    expect(await review(first.versionId, "accept")).toMatchObject({ status: "success", reviewStatus: "ACCEPTED", customerVisible: false })
    expect(await review(first.versionId, "set_visibility", "Marking for future customer access.", true)).toMatchObject({ customerVisible: true })
    const second = await clean("invoice-v2.pdf", "application/pdf", first.documentId)
    expect(await review(second.versionId, "accept")).toMatchObject({ status: "success", reviewStatus: "ACCEPTED", customerVisible: false })
    const firstRow = await db.query<{ review_status: string; customer_visible: boolean }>("select review_status, customer_visible from public.case_document_versions where id=$1", [first.versionId])
    expect(firstRow.rows[0]).toEqual({ review_status: "SUPERSEDED", customer_visible: false })
    expect((await review(first.versionId, "accept")).status).toBe("denied")
    expect((await review(first.versionId, "set_visibility", "Trying to restore visibility.", true)).status).toBe("denied")
    const events = await db.query<{ event: string }>("select event from public.case_document_events where version_id=$1 order by id", [first.versionId])
    expect(events.rows.map(row => row.event)).toContain("VERSION_SUPERSEDED")
    expect(await review(second.versionId, "reject", "The newer scan is the wrong document.")).toMatchObject({ reviewStatus: "REJECTED", customerVisible: false })
  })
  it("requires accepted clean valid files for visibility and keeps one visible version", async () => {
    const created = await clean()
    expect((await review(created.versionId, "set_visibility", "Trying to publish too early.", true)).status).toBe("denied")
    await review(created.versionId, "accept")
    expect(await review(created.versionId, "set_visibility", "Record future customer access.", true)).toMatchObject({ customerVisible: true })
    const other = await clean("other.pdf")
    await review(other.versionId, "accept")
    await review(other.versionId, "set_visibility", "Another document can also be visible.", true)
    const visible = await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions where customer_visible")
    expect(visible.rows[0].n).toBe(2)
    const sibling = await clean("invoice-v2.pdf", "application/pdf", created.documentId)
    await db.exec(`update public.case_document_versions set review_status='ACCEPTED' where id='${sibling.versionId}'`)
    await expect(db.query("update public.case_document_versions set customer_visible=true where id=$1", [sibling.versionId])).rejects.toThrow()
  })
  it("enforces optimistic concurrency and rolls review back with audit", async () => {
    const created = await clean()
    const meta = await versionMeta(created.versionId)
    expect((await rpc("admin_evidence_review_v1", [token, key(), caseId, created.versionId, meta.recordVersion + 1, "accept", "Stale review attempt.", null])).status).toBe("conflict")
    await db.exec("CREATE FUNCTION public.reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit offline'; END $$; CREATE TRIGGER reject_review_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_review_audit();")
    try {
      await expect(review(created.versionId, "accept")).rejects.toThrow()
      const row = await db.query<{ review_status: string }>("select review_status from public.case_document_versions where id=$1", [created.versionId])
      expect(row.rows[0].review_status).toBe("UNREVIEWED")
    } finally {
      await db.exec("DROP TRIGGER reject_review_audit ON public.admin_audit_events; DROP FUNCTION public.reject_review_audit();")
    }
  })
  it("records access events without persisting a URL and rejects DOCX view", async () => {
    const pdf = await clean()
    const docx = await clean("letter.docx", docxType)
    expect(await rpc("admin_evidence_access_v1", [token, key(), caseId, pdf.versionId, "view"])).toMatchObject({ status: "success", action: "view" })
    expect(await rpc("admin_evidence_access_v1", [token, key(), caseId, docx.versionId, "view"])).toEqual({ status: "denied" })
    expect(await rpc("admin_evidence_access_v1", [token, key(), caseId, docx.versionId, "download"])).toMatchObject({ action: "download" })
    const pending = await begin()
    await finalize(pending.versionId)
    expect((await rpc("admin_evidence_access_v1", [token, key(), caseId, pending.versionId, "view"])).status).toBe("denied")
    const payload = JSON.stringify(await rpc("admin_audit_list_v1", [token, null, "EVIDENCE_CHANGED", "success"]))
    expect(payload).toMatch(/view|download/)
    expect(payload).not.toMatch(/https:\/\/|X-Amz|presigned/i)
    const details = await db.query<{ details: unknown }>("select details from public.case_document_events where event in ('ACCESS_VIEWED','ACCESS_DOWNLOADED')")
    expect(JSON.stringify(details.rows)).not.toMatch(/https:\/\/|X-Amz/)
  })
  it("links new documents only to OPEN requests for the same case", async () => {
    const open = await rpc("admin_evidence_request_v1", [token, key(), caseId, null, null, "create", "Bank statements", "Upload the latest statements.", null, null])
    const linked = await rpc("admin_evidence_begin_v1", [token, key(), caseId, null, "invoice.pdf", "application/pdf", 1024, "Supporting invoice", "test-evidence", open.id])
    expect(linked.status).toBe("success")
    expect((await db.query<{ evidence_request_id: string }>("select evidence_request_id from public.case_documents where id=$1", [linked.documentId])).rows[0].evidence_request_id).toBe(open.id)
    const unlinked = await begin()
    expect((await db.query<{ evidence_request_id: string | null }>("select evidence_request_id from public.case_documents where id=$1", [unlinked.documentId])).rows[0].evidence_request_id).toBeNull()
    const other = await rpc("admin_evidence_request_v1", [token, key(), otherCase, null, null, "create", "Other case request", "Upload a file for the other case.", null, null])
    expect(await rpc("admin_evidence_begin_v1", [token, key(), caseId, null, "invoice.pdf", "application/pdf", 1024, "Supporting invoice", "test-evidence", other.id])).toEqual({ status: "conflict" })
    await expect(db.query("insert into public.case_documents(case_id, evidence_request_id, title, created_by) values($1,$2,'Invoice',$3)", [caseId, other.id, uid])).rejects.toThrow(/open request/i)
    const fulfilled = await rpc("admin_evidence_request_v1", [token, key(), caseId, null, null, "create", "Already sent", "This will be fulfilled before linking.", null, null])
    await rpc("admin_evidence_request_v1", [token, key(), caseId, fulfilled.id, fulfilled.version, "fulfill", null, null, null, "Completed after the customer sent files."])
    await expect(rpc("admin_evidence_begin_v1", [token, key(), caseId, null, "invoice.pdf", "application/pdf", 1024, "Supporting invoice", "test-evidence", fulfilled.id])).rejects.toThrow(/open request/i)
    await expect(db.query("insert into public.case_documents(case_id, evidence_request_id, title, created_by) values($1,$2,'Invoice',$3)", [caseId, fulfilled.id, uid])).rejects.toThrow(/open request/i)
    const cancelled = await rpc("admin_evidence_request_v1", [token, key(), caseId, null, null, "create", "No longer needed", "This will be cancelled before linking.", null, null])
    await rpc("admin_evidence_request_v1", [token, key(), caseId, cancelled.id, cancelled.version, "cancel", null, null, null, "No longer required for this case."])
    await expect(db.query("insert into public.case_documents(case_id, evidence_request_id, title, created_by) values($1,$2,'Invoice',$3)", [caseId, cancelled.id, uid])).rejects.toThrow(/open request/i)
    expect(await rpc("admin_evidence_request_v1", [token, key(), caseId, open.id, open.version, "fulfill", null, null, null, "Completed after the customer sent files."])).toMatchObject({ requestStatus: "FULFILLED" })
    const stillLinked = await db.query<{ n: number }>("select count(*)::int as n from public.case_documents where id=$1 and evidence_request_id=$2", [linked.documentId, open.id])
    expect(stillLinked.rows[0].n).toBe(1)
  })
})

