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
const note = "Reviewed the caller’s request and confirmed the details."
const packNote = "This exact evidence selection is the prepared pack for internal use."
type RpcResult = {
  status?: string
  id?: string
  packNumber?: number
  packStatus?: string
  recordVersion?: number
  versionId?: string
  documentId?: string
  version?: number
  stage?: string
  missing?: boolean
  packs?: Array<{ id: string; status: string; recordVersion: number; items: Array<{ versionId: string; position: number }> }>
}
async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

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
    readdirSync(dir).find(n => n.endsWith("_admin_prepared_packs_v1.sql"))!,
  ]) await db.exec(read(name))
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    alter table public.case_prepared_pack_events disable trigger case_prepared_pack_events_immutable;
    truncate public.case_prepared_pack_events,public.case_prepared_pack_items,public.case_prepared_packs,admin_private.pack_command_receipts,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,admin_private.evidence_command_receipts,public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.customers,public.businesses,public.locations,auth.users cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    alter table public.case_prepared_pack_events enable trigger case_prepared_pack_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${otherCase}','PROFILE_RECOVERY','${customer}','${business}','${location}','Second case','2026-01-02');`)
})

const begin = async (filename = "invoice.pdf", type = "application/pdf", document: string | null = null, id = caseId) => {
  const created = await rpc("admin_evidence_begin_v1", [token, key(), id, document, filename, type, 1024, "Supporting invoice", "test-evidence", null])
  if (!created?.versionId || !created.documentId) throw new Error("expected a begun evidence version")
  return created
}
async function accepted(filename = "invoice.pdf", type = "application/pdf", document: string | null = null, id = caseId) {
  const created = await begin(filename, type, document, id)
  await rpc("admin_evidence_finalize_v1", [token, key(), id, created.versionId])
  await rpc("admin_evidence_refresh_scan_v1", [token, key(), id, created.versionId, "NO_THREATS_FOUND", "VALID", null])
  const meta = await rpc("admin_evidence_version_v1", [token, id, created.versionId])
  await rpc("admin_evidence_review_v1", [token, key(), id, created.versionId, meta?.recordVersion, "accept", "Accepted after a clean scan.", null])
  return created
}
const packCmd = async (operation: string, data: Record<string, unknown> = {}, pack: string | null | undefined = null, version: number | null | undefined = null, request = key(), id = caseId) => {
  const result = await rpc("admin_prepared_pack_command_v1", [token, request, id, pack ?? null, version ?? null, operation, data])
  if (result === null) throw new Error("expected a pack command result")
  return result
}
const caseCmd = async (operation: string, data: Record<string, unknown>, version: number, request = key()) => {
  const result = await rpc("admin_case_command_v1", [token, request, caseId, version, operation, { note, ...data }])
  if (result === null) throw new Error("expected a case command result")
  return result
}

describe("prepared pack SQL", () => {
  it("sorts evidence migrations as foundation then workspace then prepared packs", () => {
    const dir = new URL("../../../../supabase/migrations/", import.meta.url)
    const names = readdirSync(dir).filter(name => /admin_evidence_foundation_v1|admin_evidence_workspace_v1|admin_prepared_packs_v1/.test(name)).sort()
    expect(names).toEqual([
      "20260918143424_admin_evidence_foundation_v1.sql",
      "20260918153627_admin_evidence_workspace_v1.sql",
      "20260918155409_admin_prepared_packs_v1.sql",
    ])
  })

  it("rejects unauthenticated access, unknown cases and direct table grants", async () => {
    expect(await rpc("admin_prepared_pack_command_v1", ["bad", key(), caseId, null, null, "create", {}])).toEqual({ status: "unauthorized" })
    expect(await rpc("admin_prepared_pack_case_v1", ["bad", caseId])).toBeNull()
    expect(await packCmd("create", {}, null, null, key(), crypto.randomUUID())).toEqual({ status: "conflict" })
    for (const table of ["case_prepared_packs", "case_prepared_pack_items", "case_prepared_pack_events"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const r = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `public.${table}`])
        expect(r.rows[0].ok).toBe(false)
      }
    }
  })

  it("creates a draft pack idempotently and conflicts on a stale record version", async () => {
    const request = key()
    const created = await packCmd("create", {}, null, null, request)
    expect(created).toMatchObject({ status: "success", packNumber: 1, packStatus: "DRAFT", recordVersion: 1 })
    expect(await packCmd("create", {}, null, null, request)).toEqual(created)
    expect((await packCmd("create", { extra: true }, null, null, request)).status).toBe("conflict")
    expect((await packCmd("create")).status).toBe("conflict")
    expect((await packCmd("add_item", { versionId: crypto.randomUUID() }, created.id, (created.recordVersion ?? 0) + 1)).status).toBe("conflict")
  })

  it("allows only one DRAFT pack per case", async () => {
    const request = key()
    const created = await packCmd("create", {}, null, null, request)
    expect(created).toMatchObject({ status: "success", packStatus: "DRAFT", packNumber: 1 })
    expect(await packCmd("create", {}, null, null, request)).toEqual(created)
    expect((await packCmd("create")).status).toBe("conflict")
    await expect(db.query(
      "insert into public.case_prepared_packs(case_id, pack_number, status, created_by) values($1, 2, 'DRAFT', $2)",
      [caseId, uid],
    )).rejects.toThrow(/unique|one_draft|duplicate/i)
    await db.query(
      "insert into public.case_prepared_packs(case_id, pack_number, status, created_by, approved_by, approved_at, approval_note) values($1, 10, 'STALE', $2, $2, now(), $3), ($1, 11, 'SUPERSEDED', $2, $2, now(), $3)",
      [caseId, uid, packNote],
    )
    expect((await packCmd("create")).status).toBe("conflict")
    const ready = await accepted()
    await packCmd("add_item", { versionId: ready.versionId }, created.id, created.recordVersion ?? 1)
    expect(await packCmd("approve", { note: packNote, confirmed: true }, created.id, 2)).toMatchObject({ status: "success", packStatus: "APPROVED" })
    const next = await packCmd("create")
    expect(next).toMatchObject({ status: "success", packStatus: "DRAFT", packNumber: 12 })
    const replacement = await accepted("later.pdf")
    await packCmd("add_item", { versionId: replacement.versionId }, next.id, next.recordVersion ?? 1)
    expect(await packCmd("approve", { note: packNote, confirmed: true }, next.id, 2)).toMatchObject({ packStatus: "APPROVED" })
    const listed = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(listed?.packs?.find(pack => pack.id === created.id)?.status).toBe("SUPERSEDED")
    expect(listed?.packs?.filter(pack => pack.status === "APPROVED")).toHaveLength(1)
    expect(listed?.packs?.filter(pack => pack.status === "DRAFT")).toHaveLength(0)
    const afterHistory = await packCmd("create")
    expect(afterHistory).toMatchObject({ status: "success", packStatus: "DRAFT" })
  })

  it("adds only clean valid ACCEPTED versions from the same case and derives snapshots in the database", async () => {
    const ready = await accepted()
    const unreviewed = await begin("pending.pdf")
    await rpc("admin_evidence_finalize_v1", [token, key(), caseId, unreviewed.versionId])
    await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, unreviewed.versionId, "NO_THREATS_FOUND", "VALID", null])
    const scanning = await begin("scan.pdf")
    await rpc("admin_evidence_finalize_v1", [token, key(), caseId, scanning.versionId])
    const threats = await begin("threat.pdf")
    await rpc("admin_evidence_finalize_v1", [token, key(), caseId, threats.versionId])
    await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, threats.versionId, "THREATS_FOUND", "PENDING", null])
    const invalid = await begin("invalid.pdf")
    await rpc("admin_evidence_finalize_v1", [token, key(), caseId, invalid.versionId])
    await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, invalid.versionId, "NO_THREATS_FOUND", "INVALID", "The PDF header is missing."])
    const other = await accepted("other.pdf", "application/pdf", null, otherCase)
    const pack = await packCmd("create")
    expect(await packCmd("add_item", { versionId: ready.versionId }, pack.id, pack.recordVersion)).toMatchObject({ status: "success" })
    const snapshot = await db.query<{ document_title: string; original_filename: string }>("select document_title, original_filename from public.case_prepared_pack_items where pack_id=$1", [pack.id])
    expect(snapshot.rows[0]).toEqual({ document_title: "Supporting invoice", original_filename: "invoice.pdf" })
    const next = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    const draftVersion = next?.packs?.[0]?.recordVersion
    expect((await packCmd("add_item", { versionId: unreviewed.versionId }, pack.id, draftVersion)).status).toBe("denied")
    const denied = [
      await packCmd("add_item", { versionId: scanning.versionId }, pack.id, draftVersion),
      await packCmd("add_item", { versionId: threats.versionId }, pack.id, draftVersion),
      await packCmd("add_item", { versionId: invalid.versionId }, pack.id, draftVersion),
      await packCmd("add_item", { versionId: other.versionId }, pack.id, draftVersion),
    ]
    expect(denied.every(row => row.status === "denied")).toBe(true)
    await expect(db.query(
      "insert into public.case_prepared_pack_items(pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by) values($1,$2,$3,2,'forged','forged.pdf','application/pdf',12,$4)",
      [pack.id, unreviewed.documentId, unreviewed.versionId, uid],
    )).rejects.toThrow(/not eligible/i)
    const current = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect((await packCmd("add_item", { versionId: ready.versionId }, pack.id, current?.packs?.[0]?.recordVersion)).status).toBe("conflict")
  })

  it("ignores browser-supplied snapshot metadata and overwrites it from the version row", async () => {
    const ready = await accepted()
    const pack = await packCmd("create")
    expect(await packCmd("add_item", {
      versionId: ready.versionId, documentTitle: "Forged", originalFilename: "evil.exe", contentType: "application/zip", sizeBytes: 9,
    }, pack.id, pack.recordVersion)).toMatchObject({ status: "invalid" })
    expect(await packCmd("add_item", { versionId: ready.versionId }, pack.id, pack.recordVersion)).toMatchObject({ status: "success" })
    await expect(db.query(
      "insert into public.case_prepared_pack_items(pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by) values($1,$2,$3,2,'Forged title','evil.exe','application/zip',9,$4)",
      [pack.id, ready.documentId, ready.versionId, uid],
    )).rejects.toThrow()
    const row = await db.query<{ document_title: string; original_filename: string; content_type: string; size_bytes: number }>(
      "select document_title, original_filename, content_type, size_bytes from public.case_prepared_pack_items where pack_id=$1",
      [pack.id],
    )
    expect(row.rows[0]).toEqual({ document_title: "Supporting invoice", original_filename: "invoice.pdf", content_type: "application/pdf", size_bytes: 1024 })
  })

  it("reorders and removes draft items and rejects duplicate positions", async () => {
    const first = await accepted("one.pdf")
    const second = await accepted("two.pdf")
    const pack = await packCmd("create")
    await packCmd("add_item", { versionId: first.versionId }, pack.id, 1)
    const afterAdd = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    await packCmd("add_item", { versionId: second.versionId }, pack.id, afterAdd?.packs?.[0]?.recordVersion)
    let detail = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(detail?.packs?.[0]?.items.map(item => item.versionId)).toEqual([first.versionId, second.versionId])
    await packCmd("move_item", { versionId: second.versionId, direction: "up" }, pack.id, detail?.packs?.[0]?.recordVersion)
    detail = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(detail?.packs?.[0]?.items.map(item => item.versionId)).toEqual([second.versionId, first.versionId])
    await packCmd("remove_item", { versionId: second.versionId }, pack.id, detail?.packs?.[0]?.recordVersion)
    detail = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(detail?.packs?.[0]?.items).toHaveLength(1)
    expect(detail?.packs?.[0]?.items[0].position).toBe(1)
    const extra = await accepted("three.pdf")
    await expect(db.query(
      "insert into public.case_prepared_pack_items(pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by) values($1,$2,$3,1,'Supporting invoice','three.pdf','application/pdf',1024,$4)",
      [pack.id, extra.documentId, extra.versionId, uid],
    )).rejects.toThrow()
  })

  it("approves a non-empty pack, supersedes the previous approved pack and does not change the case workflow", async () => {
    const ready = await accepted()
    const first = await packCmd("create")
    expect((await packCmd("approve", { note: packNote, confirmed: true }, first.id, first.recordVersion)).status).toBe("denied")
    await packCmd("add_item", { versionId: ready.versionId }, first.id, first.recordVersion)
    expect((await packCmd("approve", { note: "short", confirmed: true }, first.id, 2)).status).toBe("invalid")
    expect((await packCmd("approve", { note: packNote, confirmed: false }, first.id, 2)).status).toBe("invalid")
    expect(await packCmd("approve", { note: packNote, confirmed: true }, first.id, 2)).toMatchObject({ status: "success", packStatus: "APPROVED" })
    expect((await packCmd("add_item", { versionId: ready.versionId }, first.id, 3)).status).toBe("denied")
    expect((await packCmd("approve", { note: packNote, confirmed: true }, first.id, 3)).status).toBe("denied")
    const replacement = await accepted("replacement.pdf")
    const nextDraft = await packCmd("create")
    await packCmd("add_item", { versionId: replacement.versionId }, nextDraft.id, nextDraft.recordVersion)
    expect(await packCmd("approve", { note: packNote, confirmed: true }, nextDraft.id, 2)).toMatchObject({ packStatus: "APPROVED" })
    const packs = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    expect(packs?.packs?.find(pack => pack.id === first.id)?.status).toBe("SUPERSEDED")
    expect(packs?.packs?.filter(pack => pack.status === "APPROVED")).toHaveLength(1)
    const stage = await db.query<{ work_stage: string; status: string; service_track: string }>("select work_stage, status, service_track from public.cases where id=$1", [caseId])
    expect(stage.rows[0]).toEqual({ work_stage: "INITIAL_REVIEW", status: "RECEIVED", service_track: "UNDECIDED" })
    const detail = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null }, detail?.version ?? 1)
    let current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(await caseCmd("transition", { target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)).toEqual({ status: "prerequisite" })
    expect(await caseCmd("transition", { target: "READY_TO_SUBMIT", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)).toEqual({ status: "denied" })
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(current?.stage).toBe("PAYMENT_REQUIRED")
    await db.query("update public.cases set work_stage='PREPARATION' where id=$1", [caseId])
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(await caseCmd("transition", { target: "READY_TO_SUBMIT", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)).toEqual({ status: "prerequisite" })
  })

  it("marks only affected APPROVED packs STALE when included evidence changes", async () => {
    const included = await accepted("keep.pdf")
    const unrelated = await accepted("other.pdf")
    const pack = await packCmd("create")
    await packCmd("add_item", { versionId: included.versionId }, pack.id, pack.recordVersion)
    await packCmd("approve", { note: packNote, confirmed: true }, pack.id, 2)
    const meta = await rpc("admin_evidence_version_v1", [token, caseId, unrelated.versionId])
    await rpc("admin_evidence_review_v1", [token, key(), caseId, unrelated.versionId, meta?.recordVersion, "reject", "Wrong document for this case.", null])
    expect((await rpc("admin_prepared_pack_case_v1", [token, caseId]))?.packs?.[0]?.status).toBe("APPROVED")
    const includedMeta = await rpc("admin_evidence_version_v1", [token, caseId, included.versionId])
    await rpc("admin_evidence_review_v1", [token, key(), caseId, included.versionId, includedMeta?.recordVersion, "reject", "This version should no longer be in a pack.", null])
    expect((await rpc("admin_prepared_pack_case_v1", [token, caseId]))?.packs?.[0]?.status).toBe("STALE")
    const events = await db.query<{ event: string }>("select event from public.case_prepared_pack_events where pack_id=$1 order by id", [pack.id])
    expect(events.rows.map(row => row.event)).toContain("PACK_STALE")
    expect((await packCmd("approve", { note: packNote, confirmed: true }, pack.id, 4)).status).toBe("denied")
    expect((await packCmd("add_item", { versionId: unrelated.versionId }, pack.id, 4)).status).toBe("denied")

    const first = await accepted("v1.pdf")
    const secondPack = await packCmd("create")
    await packCmd("add_item", { versionId: first.versionId }, secondPack.id, secondPack.recordVersion)
    expect(await packCmd("approve", { note: packNote, confirmed: true }, secondPack.id, 2)).toMatchObject({ packStatus: "APPROVED" })
    const newer = await accepted("v2.pdf", "application/pdf", first.documentId)
    const newerMeta = await rpc("admin_evidence_version_v1", [token, caseId, newer.versionId])
    await rpc("admin_evidence_review_v1", [token, key(), caseId, newer.versionId, newerMeta?.recordVersion, "accept", "Newer accepted version for the same document.", null])
    expect((await rpc("admin_prepared_pack_case_v1", [token, caseId]))?.packs?.find(row => row.id === secondPack.id)?.status).toBe("STALE")

    const scanDoc = await accepted("scan.pdf")
    const scanPack = await packCmd("create")
    await packCmd("add_item", { versionId: scanDoc.versionId }, scanPack.id, scanPack.recordVersion)
    expect(await packCmd("approve", { note: packNote, confirmed: true }, scanPack.id, 2)).toMatchObject({ packStatus: "APPROVED" })
    await db.exec(`update public.case_document_versions set validation_status='ERROR', validation_error='later invalid' where id='${scanDoc.versionId}'`)
    expect((await rpc("admin_prepared_pack_case_v1", [token, caseId]))?.packs?.find(row => row.id === scanPack.id)?.status).toBe("STALE")
  })

  it("returns UI-safe pack data and eligible versions without storage coordinates", async () => {
    const ready = await accepted()
    const pack = await packCmd("create")
    await packCmd("add_item", { versionId: ready.versionId }, pack.id, pack.recordVersion)
    const payload = JSON.stringify(await rpc("admin_prepared_pack_case_v1", [token, caseId]))
    expect(payload).toContain("Supporting invoice")
    expect(payload).not.toMatch(/storageKey|storageBucket|storage_key|storage_bucket|arn:aws|oidc|presigned|X-Amz|test-evidence/)
    const events = JSON.stringify((await db.query("select details,event from public.case_prepared_pack_events")).rows)
    expect(events).not.toMatch(/storage|presigned|arn:aws|oidc|test-evidence|https:\/\//)
    expect(await rpc("admin_prepared_pack_case_v1", [token, crypto.randomUUID()])).toEqual({ missing: true })
  })

  it("rolls pack rows back if audit insert fails and keeps pack events append-only", async () => {
    await db.exec("CREATE FUNCTION public.reject_pack_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit offline'; END $$; CREATE TRIGGER reject_pack_audit BEFORE INSERT ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_pack_audit();")
    try {
      await expect(packCmd("create")).rejects.toThrow()
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_prepared_packs")).rows[0].n).toBe(0)
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events")).rows[0].n).toBe(0)
    } finally {
      await db.exec("DROP TRIGGER reject_pack_audit ON public.admin_audit_events; DROP FUNCTION public.reject_pack_audit();")
    }
    await packCmd("create")
    await expect(db.query("update public.case_prepared_pack_events set event='PACK_STALE'")).rejects.toThrow(/append-only/i)
  })
})
