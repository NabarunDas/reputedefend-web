import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "b".repeat(64)
const digest = "a".repeat(64)
const otherDigest = "b".repeat(64)
const key = () => crypto.randomUUID()
async function rpc(name: string, args: unknown[] = []) {
  // Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await db.query<{ value: any }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}
const begin = (size = 1024) => rpc("admin_evidence_begin_v1", [token, key(), caseId, null, "invoice.pdf", "application/pdf", size, "Supporting invoice", "profilerelaunch-evidence-dev-01", null])

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
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
    "20261014170000_evidence_content_sha256_v1.sql",
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
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');`)
})

async function uploaded() {
  const created = await begin()
  expect((await rpc("admin_evidence_finalize_v1", [token, key(), caseId, created.versionId])).status).toBe("success")
  return created
}

describe("evidence content SHA-256 SQL", () => {
  it("grants execution only to service_role", async () => {
    for (const name of [
      "public.evidence_content_sha256_v1(uuid,text,bigint,boolean)",
      "public.evidence_content_sha256_page_v1(uuid,integer,boolean)",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const denied = await db.query<{ ok: boolean }>("select has_function_privilege($1,$2,'EXECUTE') as ok", [role, name])
        expect(denied.rows[0].ok).toBe(false)
      }
      const allowed = await db.query<{ ok: boolean }>("select has_function_privilege('service_role',$1,'EXECUTE') as ok", [name])
      expect(allowed.rows[0].ok).toBe(true)
    }
    const trigger = await db.query<{ ok: boolean }>(
      "select has_function_privilege('service_role','admin_private.protect_evidence_content_sha256_v1()','EXECUTE') as ok",
    )
    expect(trigger.rows[0].ok).toBe(false)
  })

  it("keeps the previous Admin VALID refresh working when no digest is stored", async () => {
    const created = await uploaded()
    const refreshed = await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null,
    ])
    expect(refreshed).toMatchObject({ status: "success", validationStatus: "VALID", customerVisible: false })
    const row = await db.query<{ validation_status: string; content_sha256: string | null; content_sha256_bytes: string | null; verified: string | null; customer_visible: boolean }>(
      `select validation_status, content_sha256, content_sha256_bytes::text, content_sha256_verified_at::text as verified, customer_visible
       from public.case_document_versions where id=$1`,
      [created.versionId],
    )
    expect(row.rows[0]).toEqual({
      validation_status: "VALID", content_sha256: null, content_sha256_bytes: null, verified: null, customer_visible: false,
    })
    const meta = await rpc("admin_evidence_version_v1", [token, caseId, created.versionId])
    const accepted = await rpc("admin_evidence_review_v1", [
      token, key(), caseId, created.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])
    expect(accepted.status).toBe("success")
    const shown = await rpc("admin_evidence_review_v1", [
      token, key(), caseId, created.versionId, accepted.recordVersion, "set_visibility", "Customer may see this accepted file.", true,
    ])
    expect(shown).toMatchObject({ status: "success", customerVisible: true })
    const again = await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null,
    ])
    expect(again).toMatchObject({ status: "success", validationStatus: "VALID", customerVisible: true })
    const kept = await db.query<{ validation_status: string; content_sha256: string | null; customer_visible: boolean }>(
      "select validation_status, content_sha256, customer_visible from public.case_document_versions where id=$1",
      [created.versionId],
    )
    expect(kept.rows[0]).toEqual({ validation_status: "VALID", content_sha256: null, customer_visible: true })
  })

  it("records one digest, repeats it, and refuses a different digest", async () => {
    const created = await uploaded()
    expect(await rpc("evidence_content_sha256_v1", [created.versionId, digest.toUpperCase(), 1024, true])).toEqual({ status: "invalid" })
    expect(await rpc("evidence_content_sha256_v1", [created.versionId, digest, 5, true])).toMatchObject({ status: "size_mismatch" })
    expect(await rpc("evidence_content_sha256_v1", [crypto.randomUUID(), digest, 1024, false])).toEqual({ status: "missing" })
    const preview = await rpc("evidence_content_sha256_v1", [created.versionId, digest, 1024, false])
    expect(preview).toMatchObject({ status: "unverified", versionId: created.versionId })
    expect(JSON.stringify(preview)).not.toContain(digest)
    const recorded = await rpc("evidence_content_sha256_v1", [created.versionId, digest, 1024, true])
    expect(recorded).toEqual({ status: "recorded", versionId: created.versionId })
    const before = await db.query<{ content_sha256: string; verified_at: string }>(
      "select content_sha256, content_sha256_verified_at::text as verified_at from public.case_document_versions where id=$1",
      [created.versionId],
    )
    const repeated = await rpc("evidence_content_sha256_v1", [created.versionId, digest, 1024, true])
    expect(repeated.status).toBe("already_trusted")
    const after = await db.query<{ content_sha256: string; verified_at: string }>(
      "select content_sha256, content_sha256_verified_at::text as verified_at from public.case_document_versions where id=$1",
      [created.versionId],
    )
    expect(after.rows[0]).toEqual(before.rows[0])
    const mismatch = await rpc("evidence_content_sha256_v1", [created.versionId, otherDigest, 1024, true])
    expect(mismatch).toEqual({ status: "mismatch", versionId: created.versionId })
    expect(after.rows[0].content_sha256).toBe(digest)
    await expect(db.query("update public.case_document_versions set content_sha256=$1 where id=$2", [otherDigest, created.versionId])).rejects.toThrow(/immutable/i)
    expect((await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null])).status).toBe("success")
  })

  it("rejects every partial digest tuple, including a null byte length", async () => {
    const created = await begin()
    const insert = (sha: string | null, bytes: number | null, verified: boolean) => db.query(
      `insert into public.case_document_versions(
        id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,
        storage_bucket,storage_key,upload_status,scan_status,validation_status,created_by,
        content_sha256,content_sha256_bytes,content_sha256_verified_at)
       values($1,$2,2,'other.pdf','application/pdf',1024,'profilerelaunch-evidence-dev-01',$3,'UPLOADED','NO_THREATS_FOUND','PENDING',$4,$5,$6,case when $7 then now() else null end)`,
      [crypto.randomUUID(), created.documentId, `cases/${caseId}/documents/${created.documentId}/versions/${crypto.randomUUID()}`, uid, sha, bytes, verified],
    )
    await expect(insert(digest, null, false)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(null, 1024, false)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(null, null, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(digest, 1024, false)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(digest, null, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(null, 1024, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(digest.toUpperCase(), 1024, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert("ab", 1024, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(digest, 5, true)).rejects.toThrow(/content_sha256|check/i)
    await expect(insert(digest, 1024, true)).resolves.toBeTruthy()

    const uploadedRow = await uploaded()
    await expect(db.query(
      "update public.case_document_versions set content_sha256=$1, content_sha256_verified_at=now() where id=$2",
      [digest, uploadedRow.versionId],
    )).rejects.toThrow(/content_sha256|check/i)
    const legacy = await db.query<{ content_sha256: string | null; content_sha256_bytes: string | null; verified: string | null }>(
      "select content_sha256, content_sha256_bytes::text, content_sha256_verified_at::text as verified from public.case_document_versions where id=$1",
      [uploadedRow.versionId],
    )
    expect(legacy.rows[0]).toEqual({ content_sha256: null, content_sha256_bytes: null, verified: null })
  })

  it("rejects a digest whose byte length disagrees with the declared size", async () => {
    const created = await begin()
    await expect(db.query(
      `insert into public.case_document_versions(
        id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,
        storage_bucket,storage_key,upload_status,scan_status,validation_status,created_by,
        content_sha256,content_sha256_bytes,content_sha256_verified_at)
       values($1,$2,2,'other.pdf','application/pdf',1024,'profilerelaunch-evidence-dev-01',$3,'UPLOADED','NO_THREATS_FOUND','VALID',$4,$5,5,now())`,
      [crypto.randomUUID(), created.documentId, `cases/${caseId}/documents/${created.documentId}/versions/${crypto.randomUUID()}`, uid, digest],
    )).rejects.toThrow(/content_sha256|check/i)
  })

  it("pages clean uploaded versions without the filename or the digest", async () => {
    const first = await uploaded()
    const second = await uploaded()
    await db.query("update public.case_document_versions set scan_status='NO_THREATS_FOUND' where id in ($1,$2)", [first.versionId, second.versionId])
    await rpc("evidence_content_sha256_v1", [first.versionId, digest, 1024, true])
    const page = await rpc("evidence_content_sha256_page_v1", [null, 50, false])
    expect(page.status).toBe("success")
    expect(page.versions).toHaveLength(2)
    const text = JSON.stringify(page)
    expect(text).not.toContain("invoice.pdf")
    expect(text).not.toContain(digest)
    expect(text).not.toContain("alex@example.com")
    const ordered = page.versions.map((row: { versionId: string }) => row.versionId)
    const resumed = await rpc("evidence_content_sha256_page_v1", [ordered[0], 50, false])
    expect(resumed.versions.map((row: { versionId: string }) => row.versionId)).toEqual(ordered.slice(1))
    const unverified = await rpc("evidence_content_sha256_page_v1", [null, 50, true])
    expect(unverified.versions.map((row: { versionId: string; hasDigest: boolean }) => [row.versionId, row.hasDigest])).toEqual([[second.versionId, false]])
    expect(page.versions.every((row: { scanStatus: string }) => row.scanStatus === "NO_THREATS_FOUND")).toBe(true)
    expect(page.uploadedCount).toBe(2)
    expect(page.excludedPendingUploadCount).toBe(0)
    expect(page.excludedFailedCount).toBe(0)
  })

  it("pages every uploaded version and omits pending and failed uploads", async () => {
    const clean = await uploaded()
    const threat = await uploaded()
    const pending = await begin()
    const failed = await uploaded()
    await db.query("update public.case_document_versions set scan_status='NO_THREATS_FOUND' where id=$1", [clean.versionId])
    await db.query("update public.case_document_versions set scan_status='THREATS_FOUND' where id=$1", [threat.versionId])
    await db.query("update public.case_document_versions set upload_status='FAILED' where id=$1", [failed.versionId])
    const page = await rpc("evidence_content_sha256_page_v1", [null, 50, false])
    expect(page.uploadedCount).toBe(2)
    expect(page.excludedPendingUploadCount).toBe(1)
    expect(page.excludedFailedCount).toBe(1)
    expect(page.versions.map((row: { versionId: string; scanStatus: string }) => [row.versionId, row.scanStatus]).sort()).toEqual([
      [clean.versionId, "NO_THREATS_FOUND"],
      [threat.versionId, "THREATS_FOUND"],
    ].sort())
    const text = JSON.stringify(page)
    expect(text).not.toContain("invoice.pdf")
    expect(text).not.toContain(digest)
    expect(text).not.toContain("alex@example.com")
    expect(text).not.toContain(pending.versionId)
    expect(text).not.toContain(failed.versionId)
    const applyPage = await rpc("evidence_content_sha256_page_v1", [null, 50, true])
    expect(applyPage.versions.map((row: { versionId: string }) => row.versionId)).toEqual([clean.versionId])
    expect(applyPage.uploadedCount).toBe(2)
  })
})
