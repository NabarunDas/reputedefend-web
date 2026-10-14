/**
 * A failed refresh must clear customer visibility in the same update that
 * invalidates the version, and an approved published pack that includes it
 * must become stale and unpublished.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const challenge = "c".repeat(64)
const token = "b".repeat(64)
const digest = "a".repeat(64)
const packNote = "This exact evidence selection is the prepared pack for internal use."
const publishNote = "Publish this pack for the customer case-access view."
const key = () => crypto.randomUUID()

// Heterogeneous database JSON results are intentionally inspected in this SQL integration harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function rpc(name: string, args: unknown[] = []): Promise<Json> {
  const result = await db.query<{ value: Json }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)
  return result.rows[0].value
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01');`)
  expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
  expect(await rpc("admin_attempt_otp_v1", [challenge])).toBe(uid)
  expect(await rpc("admin_finish_otp_v1", [challenge, token, uid])).toBe(true)
}, 120000)
afterAll(async () => { await db.close() })

async function visibleVersion(filename: string) {
  const created = await rpc("admin_evidence_begin_v1", [
    token, key(), caseId, null, filename, "application/pdf", 1024, "Supporting invoice", "profilerelaunch-evidence-dev-01", null,
  ])
  expect(created.status).toBe("success")
  expect((await rpc("admin_evidence_finalize_v1", [token, key(), caseId, created.versionId])).status).toBe("success")
  expect((await rpc("evidence_content_sha256_v1", [created.versionId, digest, 1024, true])).status).toBe("recorded")
  expect((await rpc("admin_evidence_refresh_scan_v1", [
    token, key(), caseId, created.versionId, "NO_THREATS_FOUND", "VALID", null,
  ])).status).toBe("success")
  const meta = await rpc("admin_evidence_version_v1", [token, caseId, created.versionId])
  const accepted = await rpc("admin_evidence_review_v1", [
    token, key(), caseId, created.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
  ])
  expect(accepted.status).toBe("success")
  const shown = await rpc("admin_evidence_review_v1", [
    token, key(), caseId, created.versionId, accepted.recordVersion, "set_visibility", "Customer may see this accepted file.", true,
  ])
  expect(shown).toMatchObject({ status: "success", customerVisible: true })
  const pack = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, null, null, "create", {}])
  expect(pack.status).toBe("success")
  const added = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack.id, pack.recordVersion, "add_item", { versionId: created.versionId }])
  expect(added.status).toBe("success")
  const approved = await rpc("admin_prepared_pack_command_v1", [
    token, key(), caseId, pack.id, added.recordVersion, "approve", { note: packNote, confirmed: true },
  ])
  expect(approved).toMatchObject({ status: "success", packStatus: "APPROVED" })
  const published = await rpc("admin_prepared_pack_command_v1", [
    token, key(), caseId, pack.id, approved.recordVersion, "publish", { note: publishNote, confirmed: true },
  ])
  expect(published).toMatchObject({ status: "success", published: true })
  return { versionId: created.versionId as string, packId: published.id as string }
}

async function packRow(packId: string) {
  return (await db.query<{ status: string; unpublished_at: string | null }>(
    "select status, unpublished_at::text from public.case_prepared_packs where id=$1",
    [packId],
  )).rows[0]
}

async function versionRow(versionId: string) {
  return (await db.query<{ scan_status: string; validation_status: string; customer_visible: boolean }>(
    "select scan_status, validation_status, customer_visible from public.case_document_versions where id=$1",
    [versionId],
  )).rows[0]
}

describe("evidence refresh withdraws customer visibility", () => {
  it("clears visibility and unpublishes the pack when the digest no longer matches", async () => {
    const { versionId, packId } = await visibleVersion("invoice.pdf")
    const request = key()
    const refreshed = await rpc("admin_evidence_refresh_scan_v1", [
      token, request, caseId, versionId, "NO_THREATS_FOUND", "INVALID", "The stored file does not match its recorded digest.",
    ])
    expect(refreshed).toMatchObject({ status: "success", validationStatus: "INVALID", customerVisible: false })
    expect(await versionRow(versionId)).toEqual({ scan_status: "NO_THREATS_FOUND", validation_status: "INVALID", customer_visible: false })
    expect(await packRow(packId)).toMatchObject({ status: "STALE", unpublished_at: expect.any(String) })
    const replay = await rpc("admin_evidence_refresh_scan_v1", [
      token, request, caseId, versionId, "NO_THREATS_FOUND", "INVALID", "The stored file does not match its recorded digest.",
    ])
    expect(replay).toMatchObject({ status: "success", customerVisible: false })
    const again = await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, versionId, "NO_THREATS_FOUND", "INVALID", "The stored file does not match its recorded digest.",
    ])
    expect(again).toMatchObject({ status: "success", customerVisible: false })
    expect((await packRow(packId)).status).toBe("STALE")
  })

  it("clears visibility when a later scan is not clean", async () => {
    const { versionId, packId } = await visibleVersion("statement.pdf")
    const refreshed = await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, versionId, "FAILED", "PENDING", null,
    ])
    expect(refreshed).toMatchObject({ status: "success", scanStatus: "FAILED", validationStatus: "PENDING", customerVisible: false })
    expect(await versionRow(versionId)).toEqual({ scan_status: "FAILED", validation_status: "PENDING", customer_visible: false })
    expect(await packRow(packId)).toMatchObject({ status: "STALE", unpublished_at: expect.any(String) })
  })

  it("keeps an accepted file visible when a repeated clean refresh stays valid", async () => {
    const { versionId, packId } = await visibleVersion("licence.pdf")
    const refreshed = await rpc("admin_evidence_refresh_scan_v1", [
      token, key(), caseId, versionId, "NO_THREATS_FOUND", "VALID", null,
    ])
    expect(refreshed).toMatchObject({ status: "success", validationStatus: "VALID", customerVisible: true })
    expect((await versionRow(versionId)).customer_visible).toBe(true)
    const pack = await packRow(packId)
    expect(pack.status).toBe("APPROVED")
    expect(pack.unpublished_at).toBeNull()
    const disclosed = JSON.stringify(await db.query(
      "select details from public.admin_audit_events where action='EVIDENCE_CHANGED'",
    )) + JSON.stringify(await db.query("select details from public.case_document_events"))
    expect(disclosed).toContain("customerVisible")
    expect(disclosed).not.toContain("invoice.pdf")
    expect(disclosed).not.toContain("statement.pdf")
    expect(disclosed).not.toContain("licence.pdf")
    expect(disclosed).not.toContain("alex@example.com")
    expect(disclosed).not.toContain(digest)
  })
})
