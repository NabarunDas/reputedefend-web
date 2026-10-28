/**
 * Disposable draft-role command. Nothing here connects to a live database,
 * changes a real pack, sends mail, or collects a payment.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const token = "b".repeat(64)
const approval = "This exact evidence selection is the prepared pack for internal use."
const publication = "Publish this exact approved selection for customer access."

type Json = {
  status?: string
  id?: string
  reason?: string
  recordVersion?: number
  versionId?: string
  documentId?: string
  itemId?: string
  packStatus?: string
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await rows<{ value: T }>(sql, args))[0].value
}

async function packCmd(caseId: string, operation: string, data: Record<string, unknown> = {}, pack: string | null = null, version: number | null = null, request = randomUUID()) {
  return rpc<Json>("admin_prepared_pack_command_v1", [token, request, caseId, pack, version, operation, data])
}

async function insertCase(reference: string, track = "MANAGED") {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,'Profile suspended', now(), now(), $6)`,
    [id, reference, customer, business, location, track],
  )
  return id
}

async function accepted(caseId: string, filename: string) {
  const created = await rpc<Json>("admin_evidence_begin_v1", [
    token, randomUUID(), caseId, null, filename, "application/pdf", 1024, "Prepared statement", "test-evidence", null,
  ])
  if (!created.versionId || !created.documentId) throw new Error(`begin ${JSON.stringify(created)}`)
  await rpc("admin_evidence_finalize_v1", [token, randomUUID(), caseId, created.versionId])
  await rpc("admin_evidence_refresh_scan_v1", [token, randomUUID(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null])
  const meta = await rpc<Json>("admin_evidence_version_v1", [token, caseId, created.versionId])
  const reviewed = await rpc<Json>("admin_evidence_review_v1", [
    token, randomUUID(), caseId, created.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
  ])
  if (reviewed.status !== "success") throw new Error(`accept ${JSON.stringify(reviewed)}`)
  return { versionId: created.versionId, documentId: created.documentId }
}

async function draftWith(caseId: string, files: Array<{ versionId: string; role?: string }>) {
  const created = await packCmd(caseId, "create")
  if (created.status !== "success" || !created.id || created.recordVersion == null) throw new Error(JSON.stringify(created))
  let version = created.recordVersion
  for (const file of files) {
    const added = await packCmd(caseId, "add_item", { versionId: file.versionId, ...(file.role ? { role: file.role } : {}) }, created.id, version)
    if (added.status !== "success" || added.recordVersion == null) throw new Error(JSON.stringify(added))
    version = added.recordVersion
  }
  return { packId: created.id, recordVersion: version }
}

async function roleOf(packId: string, versionId: string) {
  const found = await rows<{ role: string | null }>(
    `select r.role from public.case_prepared_pack_items i
     left join public.guided_pack_item_roles r on r.item_id = i.id
     where i.pack_id = $1 and i.version_id = $2`,
    [packId, versionId],
  )
  return found[0]?.role ?? null
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${token}', '${admin}', now());
    insert into public.customers(id, full_name, email) values ('${customer}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("draft pack role changes", () => {
  it("keeps the source migration from naming a live case and from public execution", async () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261028200000_admin_pack_draft_role_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("PR-26-GHNLB9")
    expect(sql).toContain("set_item_role")
    const signature = "public.admin_prepared_pack_command_v1(text,uuid,uuid,uuid,integer,text,jsonb)"
    expect(await rows<{ ok: boolean }>(`select has_function_privilege('anon', '${signature}', 'execute') as ok`)).toEqual([{ ok: false }])
    expect(await rows<{ ok: boolean }>(`select has_function_privilege('authenticated', '${signature}', 'execute') as ok`)).toEqual([{ ok: false }])
    expect(await rows<{ ok: boolean }>(`select has_function_privilege('service_role', '${signature}', 'execute') as ok`)).toEqual([{ ok: true }])
  })

  it("changes a draft role once, replays the same request, and ignores a repeated role", async () => {
    const caseId = await insertCase("PR-26-RLAAAA")
    const file = await accepted(caseId, "statement-one.pdf")
    const draft = await draftWith(caseId, [{ versionId: file.versionId, role: "DELIVERABLE" }])
    const request = randomUUID()
    const changed = await packCmd(caseId, "set_item_role", { versionId: file.versionId, role: "EVIDENCE" }, draft.packId, draft.recordVersion, request)
    expect(changed).toMatchObject({ status: "success", packStatus: "DRAFT", recordVersion: draft.recordVersion + 1 })
    expect(await roleOf(draft.packId, file.versionId)).toBe("EVIDENCE")
    expect(await packCmd(caseId, "set_item_role", { versionId: file.versionId, role: "EVIDENCE" }, draft.packId, draft.recordVersion, request)).toEqual(changed)
    const repeated = await packCmd(caseId, "set_item_role", { versionId: file.versionId, role: "EVIDENCE" }, draft.packId, changed.recordVersion)
    expect(repeated).toMatchObject({ status: "success", recordVersion: changed.recordVersion })
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events where pack_id = $1 and event = 'ITEM_ROLE_CHANGED'", [draft.packId])).toEqual([{ n: 1 }])
    const audit = await rows<{ reason: string; details: string }>(
      "select reason, details::text as details from public.admin_audit_events where target_id = $1 and reason = 'Prepared pack item role changed'",
      [caseId],
    )
    expect(audit).toHaveLength(1)
    expect(audit[0].details).toContain("EVIDENCE")
    expect(audit[0].details).toContain("DELIVERABLE")
    expect(audit[0].details).not.toContain("statement-one.pdf")
    expect(audit[0].details).not.toContain("@")
    const stale = await packCmd(caseId, "set_item_role", { versionId: file.versionId, role: "INSTRUCTIONS" }, draft.packId, draft.recordVersion)
    expect(stale.status).toBe("conflict")
    expect(await roleOf(draft.packId, file.versionId)).toBe("EVIDENCE")
    const other = await insertCase("PR-26-RLAAAB")
    expect((await packCmd(other, "set_item_role", { versionId: file.versionId, role: "INSTRUCTIONS" }, draft.packId, changed.recordVersion)).status).toBe("conflict")
    expect((await packCmd(caseId, "set_item_role", { versionId: file.versionId, role: "deliverable" }, draft.packId, changed.recordVersion)).status).toBe("invalid")
    expect((await packCmd(caseId, "set_item_role", { versionId: randomUUID(), role: "INSTRUCTIONS" }, draft.packId, changed.recordVersion)).status).toBe("conflict")
    expect(await roleOf(draft.packId, file.versionId)).toBe("EVIDENCE")
    expect(await rows<{ status: string }>("select status from public.case_prepared_packs where id = $1", [draft.packId])).toEqual([{ status: "DRAFT" }])
  })

  it("refuses a role change on an approved pack and leaves the role in place", async () => {
    const caseId = await insertCase("PR-26-RLAAAC", "GUIDED")
    const statement = await accepted(caseId, "completed-statement.pdf")
    const instructions = await accepted(caseId, "customer-instructions.pdf")
    const draft = await draftWith(caseId, [
      { versionId: statement.versionId, role: "DELIVERABLE" },
      { versionId: instructions.versionId, role: "INSTRUCTIONS" },
    ])
    const approved = await packCmd(caseId, "approve", { note: approval, confirmed: true }, draft.packId, draft.recordVersion)
    expect(approved).toMatchObject({ status: "success", packStatus: "APPROVED" })
    const denied = await packCmd(caseId, "set_item_role", { versionId: statement.versionId, role: "EVIDENCE" }, draft.packId, approved.recordVersion)
    expect(denied.status).toBe("denied")
    expect(await roleOf(draft.packId, statement.versionId)).toBe("DELIVERABLE")
    expect(await rows<{ status: string }>("select status from public.case_prepared_packs where id = $1", [draft.packId])).toEqual([{ status: "APPROVED" }])
  })

  it("explains invalid Guided counts and approves one statement, one instructions file and supporting evidence", async () => {
    const caseId = await insertCase("PR-26-RLAAAD", "GUIDED")
    const files = []
    for (const name of ["one.pdf", "two.pdf", "three.pdf", "four.pdf", "five.pdf"]) files.push(await accepted(caseId, name))
    const five = await draftWith(caseId, files.map(file => ({ versionId: file.versionId, role: "DELIVERABLE" })))
    const mailBefore = await rows<{ n: number }>("select count(*)::int as n from public.communications")
    const denied = await packCmd(caseId, "approve", { note: approval, confirmed: true }, five.packId, five.recordVersion)
    expect(denied).toEqual({ status: "denied", reason: "deliverable" })
    expect(await rows<{ status: string; published_at: string | null }>("select status, published_at from public.case_prepared_packs where id = $1", [five.packId])).toEqual([{ status: "DRAFT", published_at: null }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events where pack_id = $1 and event = 'PACK_APPROVED'", [five.packId])).toEqual([{ n: 0 }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.communications")).toEqual(mailBefore)
    expect(await rows<{ version_id: string }>("select version_id from admin_private.customer_published_pack_documents_v1($1)", [caseId])).toEqual([])

    const gap = await insertCase("PR-26-RLAAAE", "GUIDED")
    const statement = await accepted(gap, "only-statement.pdf")
    const evidence = [await accepted(gap, "evidence-a.pdf"), await accepted(gap, "evidence-b.pdf"), await accepted(gap, "evidence-c.pdf")]
    const missing = await draftWith(gap, [
      { versionId: statement.versionId, role: "DELIVERABLE" },
      ...evidence.map(file => ({ versionId: file.versionId, role: "EVIDENCE" })),
    ])
    expect(await packCmd(gap, "approve", { note: approval, confirmed: true }, missing.packId, missing.recordVersion)).toEqual({ status: "denied", reason: "instructions" })
    expect(await rows<{ status: string }>("select status from public.case_prepared_packs where id = $1", [missing.packId])).toEqual([{ status: "DRAFT" }])

    const readyCase = await insertCase("PR-26-RLAAAF", "GUIDED")
    const readyFiles = {
      statement: await accepted(readyCase, "ready-statement.pdf"),
      instructions: await accepted(readyCase, "ready-instructions.pdf"),
      evidence: [await accepted(readyCase, "ready-a.pdf"), await accepted(readyCase, "ready-b.pdf"), await accepted(readyCase, "ready-c.pdf")],
    }
    const ready = await draftWith(readyCase, [
      { versionId: readyFiles.statement.versionId, role: "DELIVERABLE" },
      { versionId: readyFiles.instructions.versionId, role: "INSTRUCTIONS" },
      ...readyFiles.evidence.map(file => ({ versionId: file.versionId, role: "EVIDENCE" })),
    ])
    const approved = await packCmd(readyCase, "approve", { note: approval, confirmed: true }, ready.packId, ready.recordVersion)
    expect(approved).toMatchObject({ status: "success", packStatus: "APPROVED" })
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events where pack_id = $1 and event = 'PACK_APPROVED'", [ready.packId])).toEqual([{ n: 1 }])
    expect(await rows<{ version_id: string }>("select version_id from admin_private.customer_published_pack_documents_v1($1)", [readyCase])).toEqual([])
  })

  it("keeps a published pack available after a later draft changes roles", async () => {
    const caseId = await insertCase("PR-26-RLAAAG", "MANAGED")
    const publishedFile = await accepted(caseId, "published-statement.pdf")
    const draft = await draftWith(caseId, [{ versionId: publishedFile.versionId }])
    const approved = await packCmd(caseId, "approve", { note: approval, confirmed: true }, draft.packId, draft.recordVersion)
    const published = await packCmd(caseId, "publish", { note: publication, confirmed: true }, draft.packId, approved.recordVersion)
    expect(published).toMatchObject({ status: "success", published: true })
    const sharedBefore = await rows<{ version_id: string }>("select version_id from admin_private.customer_published_pack_documents_v1($1)", [caseId])
    expect(sharedBefore.map(row => row.version_id)).toEqual([publishedFile.versionId])
    const replacementFile = await accepted(caseId, "replacement-note.pdf")
    const replacement = await draftWith(caseId, [{ versionId: replacementFile.versionId, role: "DELIVERABLE" }])
    const changed = await packCmd(caseId, "set_item_role", { versionId: replacementFile.versionId, role: "INSTRUCTIONS" }, replacement.packId, replacement.recordVersion)
    expect(changed.status).toBe("success")
    expect(await roleOf(replacement.packId, replacementFile.versionId)).toBe("INSTRUCTIONS")
    expect(await rows<{ version_id: string }>("select version_id from admin_private.customer_published_pack_documents_v1($1)", [caseId])).toEqual(sharedBefore)
    expect(await rows<{ open: boolean; status: string }>(
      "select (published_at is not null and unpublished_at is null) as open, status from public.case_prepared_packs where id = $1",
      [draft.packId],
    )).toEqual([{ open: true, status: "APPROVED" }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_packs where case_id = $1", [caseId])).toEqual([{ n: 2 }])
    expect(await rows<{ customer_visible: boolean }>("select customer_visible from public.case_document_versions where id = $1", [publishedFile.versionId])).toEqual([{ customer_visible: true }])
  })
})
