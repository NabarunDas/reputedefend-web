/**
 * Disposable publication lifecycle. Nothing here connects to a live database,
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
const token = "a".repeat(64)
const approval = "This exact evidence selection is the prepared pack for internal use."
const publication = "Publish this exact approved selection for customer access."
const withdrawal = "Withdraw this pack from customer case access now."

type Json = {
  status?: string
  id?: string
  reason?: string
  recordVersion?: number
  versionId?: string
  documentId?: string
  published?: boolean
  publicationBlock?: string | null
  packs?: Array<{ publicationBlock?: string | null; items?: Array<{ versionId?: string; customerVisible?: boolean; shareable?: boolean }> }>
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

async function visible(versionId: string) {
  return (await rows<{ customer_visible: boolean }>("select customer_visible from public.case_document_versions where id = $1", [versionId]))[0].customer_visible
}

async function shared(caseId: string) {
  return (await rows<{ version_id: string }>("select version_id from admin_private.customer_published_pack_documents_v1($1) order by version_id", [caseId])).map(row => row.version_id)
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

async function accepted(caseId: string, filename: string, documentId: string | null = null) {
  const created = await rpc<Json>("admin_evidence_begin_v1", [
    token, randomUUID(), caseId, documentId, filename, "application/pdf", 1024, "Prepared statement", "test-evidence", null,
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

async function showToCustomer(caseId: string, versionId: string) {
  const meta = await rpc<Json>("admin_evidence_version_v1", [token, caseId, versionId])
  const shown = await rpc<Json>("admin_evidence_review_v1", [
    token, randomUUID(), caseId, versionId, meta.recordVersion, "set_visibility",
    "Customer may see this accepted file.", true,
  ])
  if (shown.status !== "success") throw new Error(`visibility ${JSON.stringify(shown)}`)
}

async function approvePack(caseId: string, versionIds: string[]) {
  const created = await packCmd(caseId, "create")
  if (created.status !== "success" || !created.id || created.recordVersion == null) throw new Error(JSON.stringify(created))
  let version = created.recordVersion
  for (const versionId of versionIds) {
    const added = await packCmd(caseId, "add_item", { versionId }, created.id, version)
    if (added.status !== "success" || added.recordVersion == null) throw new Error(JSON.stringify(added))
    version = added.recordVersion
    expect(await visible(versionId)).toBe(false)
  }
  const approved = await packCmd(caseId, "approve", { note: approval, confirmed: true }, created.id, version)
  if (approved.status !== "success" || approved.recordVersion == null) throw new Error(JSON.stringify(approved))
  for (const versionId of versionIds) expect(await visible(versionId)).toBe(false)
  return { packId: created.id, recordVersion: approved.recordVersion }
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

describe("confirmed pack publication", () => {
  it("keeps the source migration from naming or repairing a live pack", async () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261028160000_guided_pack_publish_visibility_v1.sql", import.meta.url), "utf8")
    expect(sql).not.toContain("PR-26-GHNLB9")
    expect(sql).toContain("grant_pack_customer_visibility_v1")
    expect(sql).toContain("pack_publishable_v1")
    expect(sql).not.toContain("UPDATE public.case_prepared_packs SET published_at = now() WHERE id = '")
    expect(await rows<{ ok: boolean }>("select has_function_privilege('anon', 'admin_private.grant_pack_customer_visibility_v1(uuid,uuid)', 'execute') as ok")).toEqual([{ ok: false }])
    expect(await rows<{ ok: boolean }>("select has_function_privilege('authenticated', 'admin_private.pack_publication_block_v1(uuid)', 'execute') as ok")).toEqual([{ ok: false }])
  })

  it("publishes only the confirmed files and rolls visibility back with the pack", async () => {
    const caseId = await insertCase("PR-26-PACKAA")
    const otherCase = await insertCase("PR-26-PACKAB")
    const older = await accepted(caseId, "prepared-statement.pdf")
    const current = await accepted(caseId, "prepared-statement-v2.pdf", older.documentId)
    const removed = await accepted(caseId, "removed-draft.pdf")
    const outsider = await accepted(caseId, "left-out.pdf")
    const foreign = await accepted(otherCase, "other-case.pdf")
    await showToCustomer(caseId, outsider.versionId)

    const created = await packCmd(caseId, "create")
    expect(created.status).toBe("success")
    const wrongCase = await packCmd(caseId, "add_item", { versionId: foreign.versionId }, created.id, created.recordVersion)
    expect(wrongCase.status).toBe("denied")
    expect(await visible(foreign.versionId)).toBe(false)
    const superseded = await packCmd(caseId, "add_item", { versionId: older.versionId }, created.id, created.recordVersion)
    expect(superseded.status).toBe("denied")
    expect(await visible(older.versionId)).toBe(false)

    let version = created.recordVersion!
    for (const versionId of [current.versionId, removed.versionId]) {
      const added = await packCmd(caseId, "add_item", { versionId }, created.id, version)
      expect(added.status).toBe("success")
      version = added.recordVersion!
      expect(await visible(versionId)).toBe(false)
    }
    const removedItem = await packCmd(caseId, "remove_item", { versionId: removed.versionId }, created.id, version)
    expect(removedItem.status).toBe("success")
    const approved = await packCmd(caseId, "approve", { note: approval, confirmed: true }, created.id, removedItem.recordVersion)
    expect(approved.status).toBe("success")
    expect(await visible(older.versionId)).toBe(false)
    expect(await visible(current.versionId)).toBe(false)
    expect(await visible(removed.versionId)).toBe(false)
    expect(await visible(outsider.versionId)).toBe(true)
    expect(await shared(caseId)).toEqual([])
    expect(await rows<{ ok: boolean }>("select admin_private.pack_publishable_v1($1) as ok", [created.id])).toEqual([{ ok: false }])

    const loaded = await rpc<Json>("admin_prepared_pack_case_v1", [token, caseId])
    expect(loaded.packs?.[0].publicationBlock).toBeNull()
    expect(loaded.packs?.[0].items).toEqual([
      expect.objectContaining({ versionId: current.versionId, customerVisible: false, shareable: true }),
    ])

    const mailBefore = await rows<{ n: number }>("select count(*)::int as n from public.communications")
    const request = randomUUID()
    const published = await packCmd(caseId, "publish", { note: publication, confirmed: true }, created.id, approved.recordVersion, request)
    expect(published).toMatchObject({ status: "success", published: true, packEmail: "skipped" })
    expect(await packCmd(caseId, "publish", { note: publication, confirmed: true }, created.id, approved.recordVersion, request)).toEqual(published)
    expect(await visible(current.versionId)).toBe(true)
    expect(await visible(older.versionId)).toBe(false)
    expect(await visible(removed.versionId)).toBe(false)
    expect(await visible(outsider.versionId)).toBe(true)
    expect(await shared(caseId)).toEqual([current.versionId])
    expect(await shared(otherCase)).toEqual([])
    expect(await rows<{ ok: boolean }>("select admin_private.pack_publishable_v1($1) as ok", [created.id])).toEqual([{ ok: true }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events where pack_id = $1 and event = 'PACK_PUBLISHED'", [created.id])).toEqual([{ n: 1 }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.communications")).toEqual(mailBefore)
    const details = await rows<{ details: { customerVisible?: boolean; originalFilename?: string } }>(
      "select details from public.case_document_events where version_id = $1 and event = 'VISIBILITY_CHANGED' order by id",
      [current.versionId],
    )
    expect(details.map(row => row.details)).toEqual([{ customerVisible: true }])
    expect(JSON.stringify(details)).not.toMatch(/prepared-statement|left-out|removed-draft|storage_key|@example/)

    const withdrawn = await packCmd(caseId, "unpublish", { reason: withdrawal, confirmed: true }, created.id, published.recordVersion)
    expect(withdrawn).toMatchObject({ status: "success", published: false })
    expect(await visible(current.versionId)).toBe(true)
    expect(await shared(caseId)).toEqual([])
  })

  it("revokes customer access when visibility is removed", async () => {
    const caseId = await insertCase("PR-26-PACKAC")
    const file = await accepted(caseId, "revocation.pdf")
    const pack = await approvePack(caseId, [file.versionId])
    const published = await packCmd(caseId, "publish", { note: publication, confirmed: true }, pack.packId, pack.recordVersion)
    expect(published.status).toBe("success")
    expect(await shared(caseId)).toEqual([file.versionId])
    await db.query("update public.case_document_versions set customer_visible = false where id = $1", [file.versionId])
    expect(await shared(caseId)).toEqual([])
    expect(await rows<{ open: boolean }>(
      "select (published_at is not null and unpublished_at is null) as open from public.case_prepared_packs where id = $1",
      [pack.packId],
    )).toEqual([{ open: false }])
  })

  it("rolls the visibility grant back when publication fails", async () => {
    const caseId = await insertCase("PR-26-PACKAD")
    const file = await accepted(caseId, "rollback.pdf")
    const pack = await approvePack(caseId, [file.versionId])
    await db.exec(`
      create function admin_private.test_block_pack_publish_v1() returns trigger language plpgsql as $fn$
      begin
        if new.published_at is not null and old.published_at is null then
          raise exception 'forced_publish_failure';
        end if;
        return new;
      end $fn$;
      create trigger test_block_pack_publish before update on public.case_prepared_packs
      for each row execute function admin_private.test_block_pack_publish_v1();
    `)
    await expect(packCmd(caseId, "publish", { note: publication, confirmed: true }, pack.packId, pack.recordVersion)).rejects.toThrow(/forced_publish_failure/)
    expect(await visible(file.versionId)).toBe(false)
    expect(await shared(caseId)).toEqual([])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.guided_pack_announcements where pack_id = $1", [pack.packId])).toEqual([{ n: 0 }])
    await db.exec("drop trigger test_block_pack_publish on public.case_prepared_packs")
    const published = await packCmd(caseId, "publish", { note: publication, confirmed: true }, pack.packId, pack.recordVersion)
    expect(published.status).toBe("success")
    expect(await visible(file.versionId)).toBe(true)
    expect(await shared(caseId)).toEqual([file.versionId])
  })

  it("refuses an unsafe pack without making any file visible", async () => {
    const staleCase = await insertCase("PR-26-PACKAE")
    const staleFile = await accepted(staleCase, "stale.pdf")
    const stalePack = await approvePack(staleCase, [staleFile.versionId])
    await db.query("update public.case_document_versions set scan_status = 'THREATS_FOUND', validation_status = 'PENDING' where id = $1", [staleFile.versionId])
    const staleVersion = (await rows<{ record_version: number }>("select record_version from public.case_prepared_packs where id = $1", [stalePack.packId]))[0].record_version
    const stalePublish = await packCmd(staleCase, "publish", { note: publication, confirmed: true }, stalePack.packId, staleVersion)
    expect(stalePublish).toMatchObject({ status: "denied", reason: "status" })
    expect(await visible(staleFile.versionId)).toBe(false)
    expect(await shared(staleCase)).toEqual([])

    const duplicateCase = await insertCase("PR-26-PACKAF")
    const first = await accepted(duplicateCase, "first.pdf")
    const second = await accepted(duplicateCase, "second.pdf", first.documentId)
    const duplicate = await approvePack(duplicateCase, [second.versionId])
    await db.exec("alter table public.case_prepared_pack_items disable trigger case_prepared_pack_items_eligibility")
    await db.query(
      `insert into public.case_prepared_pack_items(
        pack_id, document_id, version_id, position, document_title, original_filename, content_type, size_bytes, added_by
      )
      select $1, document_id, id, 2, 'Prepared statement', original_filename, declared_content_type, declared_size_bytes, $2
      from public.case_document_versions where id = $3`,
      [duplicate.packId, admin, first.versionId],
    )
    await db.exec("alter table public.case_prepared_pack_items enable trigger case_prepared_pack_items_eligibility")
    const duplicatePublish = await packCmd(duplicateCase, "publish", { note: publication, confirmed: true }, duplicate.packId, duplicate.recordVersion)
    expect(duplicatePublish).toMatchObject({ status: "denied", reason: "document" })
    expect(await visible(first.versionId)).toBe(false)
    expect(await visible(second.versionId)).toBe(false)
    expect(await shared(duplicateCase)).toEqual([])

    const guided = await insertCase("PR-26-PACKAG", "GUIDED")
    const statement = await accepted(guided, "guided-statement.pdf")
    const instructions = await accepted(guided, "guided-instructions.pdf")
    const guidedDraft = await packCmd(guided, "create")
    expect(guidedDraft.status).toBe("success")
    const guidedStatement = await packCmd(guided, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, guidedDraft.id, guidedDraft.recordVersion)
    expect(guidedStatement.status).toBe("success")
    const guidedInstructions = await packCmd(guided, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, guidedDraft.id, guidedStatement.recordVersion)
    expect(guidedInstructions.status).toBe("success")
    const guidedApproved = await packCmd(guided, "approve", { note: approval, confirmed: true }, guidedDraft.id, guidedInstructions.recordVersion)
    expect(guidedApproved.status).toBe("success")
    expect(await visible(statement.versionId)).toBe(false)
    expect(await visible(instructions.versionId)).toBe(false)
    const guidedPublish = await packCmd(guided, "publish", { note: publication, confirmed: true }, guidedDraft.id, guidedApproved.recordVersion)
    expect(guidedPublish).toMatchObject({ status: "denied", reason: "order" })
    expect(await visible(statement.versionId)).toBe(false)
    expect(await visible(instructions.versionId)).toBe(false)
    expect(await shared(guided)).toEqual([])
    const guidedView = await rpc<Json>("admin_prepared_pack_case_v1", [token, guided])
    expect(guidedView.packs?.[0].publicationBlock).toBe("order")
  })
})
