import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const otherCustomer = "77777777-7777-4777-8777-777777777777"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const otherAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const otherBusiness = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const otherLocation = "99999999-9999-4999-8999-999999999999"
const caseId = "55555555-5555-4555-8555-555555555555"
const otherCase = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value: string) => createHash("sha256").update(value).digest("hex")
const expires = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString()
const packNote = "This exact evidence selection is the prepared pack for internal use."
const publishNote = "Publish this pack for the customer case-access view."

type RpcResult = {
  status?: string
  id?: string
  replay?: boolean
  kind?: string
  maskedEmail?: string
  email?: string
  actionId?: string
  actionStatus?: string
  expiresAt?: string
  caseReference?: string
  businessName?: string
  locationName?: string | null
  pack?: { packNumber?: number; publishedAt?: string; items?: Array<{ versionId: string; position: number; documentTitle?: string }> } | null
  packs?: Array<{ id: string; recordVersion: number }>
  agreement?: unknown
  authorization?: unknown
  versionId?: string
  documentId?: string
  storageKey?: string
  storageBucket?: string
  recordVersion?: number
  packStatus?: string
  published?: boolean
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url), read = (name: string) => readFileSync(new URL(name, dir), "utf8")
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
  ]) await db.exec(read(name))
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.authorization_events disable trigger authorization_events_immutable;
    alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
    alter table public.agreement_versions disable trigger agreement_versions_immutable;
    alter table public.case_document_events disable trigger case_document_events_immutable;
    alter table public.case_prepared_pack_events disable trigger case_prepared_pack_events_immutable;
    truncate public.customer_action_events,public.customer_actions,public.authorization_events,public.authorization_records,public.agreement_versions,public.location_manager_access_events,public.location_manager_access,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.authorization_command_receipts,admin_private.customer_action_command_receipts,admin_private.customer_pack_access_receipts,public.case_prepared_pack_events,public.case_prepared_pack_items,public.case_prepared_packs,admin_private.pack_command_receipts,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,admin_private.evidence_command_receipts,public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.business_memberships,public.customer_contact_verifications,public.customers,public.businesses,public.locations,auth.users cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.authorization_events enable trigger authorization_events_immutable;
    alter table public.location_manager_access_events enable trigger location_manager_access_events_immutable;
    alter table public.agreement_versions enable trigger agreement_versions_immutable;
    alter table public.case_document_events enable trigger case_document_events_immutable;
    alter table public.case_prepared_pack_events enable trigger case_prepared_pack_events_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into auth.users values('${otherAuth}','sam@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.customers(id,full_name,email) values('${otherCustomer}','Sam','sam@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.businesses(id,display_name) values('${otherBusiness}','Cafe');
    insert into public.locations(id,business_id,country,location_name) values('${location}','${business}','UK','High Street');
    insert into public.locations(id,business_id,country,location_name) values('${otherLocation}','${otherBusiness}','UK','Other Street');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at) values('${otherCase}','PROFILE_RECOVERY','${otherCustomer}','${otherBusiness}','${otherLocation}','Other case','2026-01-02',now(),now());`)
})

async function verify(id = customer, biz = business, email = "alex@example.com") {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value, verified_by=excluded.verified_by, evidence=excluded.evidence, verified_at=now()", [id, email, uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence", [id, biz, uid, "Companies House match discussed on a live call."])
}

const createAccess = (data: Record<string, unknown> = {}, request = key(), id = caseId) =>
  rpc("admin_authorization_command_v1", [token, request, id, "create_case_access_action", { expiresAt: expires(), secretHash: secretHash(secret()), ...data }])

async function requestOtp(pending: string) {
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok", email: "alex@example.com" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
}

async function otpSession(actionId: string | undefined, hash: string, session = secretHash(secret()), auth = customerAuth, email = "alex@example.com") {
  const pending = secretHash(secret())
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok", kind: "CASE_ACCESS" })
  await requestOtp(pending)
  expect(await rpc("customer_action_attempt_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, auth, email])).toMatchObject({ status: "ok", kind: "CASE_ACCESS" })
  return session
}

async function finishAccess(hash = secretHash(secret()), auth = customerAuth, email = "alex@example.com") {
  const created = await createAccess({ secretHash: hash })
  expect(created?.status).toBe("success")
  const session = await otpSession(created?.id, hash, secretHash(secret()), auth, email)
  return { created, session, hash }
}

const packCmd = (operation: string, data: Record<string, unknown> = {}, pack: string | null = null, version: number | null = null, request = key(), id = caseId) =>
  rpc("admin_prepared_pack_command_v1", [token, request, id, pack, version, operation, data])

async function accepted(filename = "invoice.pdf", type = "application/pdf", id = caseId) {
  const created = await rpc("admin_evidence_begin_v1", [token, key(), id, null, filename, type, 1024, "Supporting invoice", "test-evidence", null])
  await rpc("admin_evidence_finalize_v1", [token, key(), id, created?.versionId])
  await rpc("admin_evidence_refresh_scan_v1", [token, key(), id, created?.versionId, "NO_THREATS_FOUND", "VALID", null])
  const meta = await rpc("admin_evidence_version_v1", [token, id, created?.versionId])
  await rpc("admin_evidence_review_v1", [token, key(), id, created?.versionId, meta?.recordVersion, "accept", "Accepted after a clean scan.", null])
  return created
}

async function visible(filename = "invoice.pdf", type = "application/pdf", id = caseId) {
  const created = await accepted(filename, type, id)
  const meta = await rpc("admin_evidence_version_v1", [token, id, created?.versionId])
  await rpc("admin_evidence_review_v1", [token, key(), id, created?.versionId, meta?.recordVersion, "set_visibility", "Customer may see this accepted file.", true])
  return created
}

async function publishVisiblePack(filename = "invoice.pdf", type = "application/pdf") {
  const created = await visible(filename, type)
  const pack = await packCmd("create")
  await packCmd("add_item", { versionId: created?.versionId }, pack?.id ?? null, pack?.recordVersion ?? null)
  const approved = await packCmd("approve", { note: packNote, confirmed: true }, pack?.id ?? null, 2)
  const published = await packCmd("publish", { note: publishNote, confirmed: true }, approved?.id ?? null, approved?.recordVersion ?? null)
  expect(published).toMatchObject({ status: "success", published: true })
  return { created, packId: published?.id, recordVersion: published?.recordVersion }
}

describe("CASE_ACCESS SQL", () => {
  it("issues one OPEN case-access action only for a verified customer and case", async () => {
    expect((await createAccess())?.status).toBe("denied")
    await verify()
    const request = key()
    const expiresAt = expires()
    const created = await createAccess({ secretHash: secretHash(secret()), expiresAt }, request)
    expect(created).toMatchObject({ status: "success" })
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await createAccess({ secretHash: secretHash(secret()), expiresAt }, request)).toMatchObject({ status: "success", replay: true, id: created?.id })
    expect((await createAccess())?.status).toBe("conflict")
    const row = await db.query<{ kind: string; agreement_version_id: string | null; authorization_id: string | null }>("select kind, agreement_version_id, authorization_id from public.customer_actions where id=$1", [created?.id])
    expect(row.rows[0]).toEqual({ kind: "CASE_ACCESS", agreement_version_id: null, authorization_id: null })
    await expect(db.query(
      "insert into public.customer_actions(customer_id,business_id,location_id,case_id,kind,secret_hash,expected_email_snapshot,expires_at,created_by) values($1,$2,$3,$4,'CASE_ACCESS',$5,'alex@example.com',now()+interval '1 day',$6)",
      [customer, business, location, caseId, secretHash(secret()), uid],
    )).rejects.toThrow(/unique|one_open_case_access|duplicate/i)
  })

  it("rejects closed cases, admin email, guessed secrets and foreign actions", async () => {
    await verify()
    await db.query("update public.cases set status='CLOSED' where id=$1", [caseId])
    expect((await createAccess())?.status).toBe("denied")
    await db.query("update public.cases set status='RECEIVED' where id=$1", [caseId])
    await db.query("update public.customers set email='admin@profilerelaunch.com' where id=$1", [customer])
    expect((await createAccess())?.status).toBe("denied")
    await db.query("update public.customers set email='alex@example.com' where id=$1", [customer])
    const hash = secretHash(secret())
    const created = await createAccess({ secretHash: hash })
    expect(await rpc("customer_action_exchange_v1", [created?.id, secretHash("1".repeat(64)), secretHash(secret())])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_exchange_v1", [crypto.randomUUID(), hash, secretHash(secret())])).toEqual({ status: "unavailable" })
    await verify(otherCustomer, otherBusiness, "sam@example.com")
    const other = await createAccess({ secretHash: secretHash(secret()) }, key(), otherCase)
    expect(other?.status).toBe("success")
    expect(await rpc("customer_action_exchange_v1", [other?.id, hash, secretHash(secret())])).toEqual({ status: "unavailable" })
  })

  it("keeps CASE_ACCESS open after OTP and kills access on expiry or revoke", async () => {
    await verify()
    const { created, session, hash } = await finishAccess()
    const projection = await rpc("customer_action_session_v1", [session])
    expect(projection).toMatchObject({ kind: "CASE_ACCESS", status: "OPEN", maskedEmail: "a***@example.com", caseReference: expect.any(String), businessName: "Bakery", locationName: "High Street" })
    expect(JSON.stringify(projection)).not.toMatch(/22222222|33333333|55555555|storage|approval|internal/)
    const stillOpen = await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [created?.id])
    expect(stillOpen.rows[0].status).toBe("OPEN")
    expect((await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }]))?.status).toBe("unavailable")
    await db.query("update admin_private.customer_action_sessions set expires_at=now()-interval '1 minute' where token_hash=$1", [session])
    expect(await rpc("customer_action_session_v1", [session])).toBeNull()
    const reused = await otpSession(created?.id, hash)
    expect(await rpc("customer_action_session_v1", [reused])).toMatchObject({ kind: "CASE_ACCESS", status: "OPEN" })
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "revoke_action", { actionId: created?.id, reason: "Customer reported the link was lost.", confirmed: true }])).toMatchObject({ status: "success", actionStatus: "REVOKED" })
    expect(await rpc("customer_action_session_v1", [reused])).toBeNull()
    expect(await rpc("customer_case_pack_v1", [reused])).toBeNull()
  })
})

describe("customer published pack SQL", () => {
  it("returns only the current published pack without storage or internal notes", async () => {
    await verify()
    const { session } = await finishAccess()
    expect(await rpc("customer_case_pack_v1", [session])).toMatchObject({ kind: "CASE_ACCESS", pack: null, maskedEmail: "a***@example.com" })
    const first = await visible("one.pdf")
    const second = await visible("two.pdf")
    const pack = await packCmd("create")
    await packCmd("add_item", { versionId: first?.versionId }, pack?.id ?? null, pack?.recordVersion ?? null)
    const afterFirst = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    await packCmd("add_item", { versionId: second?.versionId }, pack?.id ?? null, afterFirst?.packs?.[0] ? 2 : 2)
    await packCmd("approve", { note: packNote, confirmed: true }, pack?.id ?? null, 3)
    expect((await rpc("customer_case_pack_v1", [session]))?.pack).toBeNull()
    await packCmd("publish", { note: publishNote, confirmed: true }, pack?.id ?? null, 4)
    const projected = await rpc("customer_case_pack_v1", [session])
    expect(projected?.pack?.items?.map(item => item.versionId)).toEqual([first?.versionId, second?.versionId])
    expect(projected?.pack?.items?.[0].documentTitle).toBe("Supporting invoice")
    const text = JSON.stringify(projected)
    expect(text).not.toMatch(/storageKey|storageBucket|storage_key|approvalNote|reviewed_by|test-evidence|arn:aws|22222222|33333333/)
    expect(await rpc("customer_case_pack_v1", [secretHash(secret())])).toBeNull()
  })

  it("fails closed for foreign versions, hidden files, and publication removal", async () => {
    await verify()
    const { session } = await finishAccess()
    const published = await publishVisiblePack()
    const foreign = await visible("other.pdf", "application/pdf", otherCase)
    expect(await rpc("customer_case_pack_version_v1", [session, foreign?.versionId])).toBeNull()
    expect(await rpc("customer_case_pack_access_v1", [session, key(), foreign?.versionId, "download"])).toEqual({ status: "unavailable" })
    const version = await rpc("customer_case_pack_version_v1", [session, published.created?.versionId])
    expect(version).toMatchObject({ versionId: published.created?.versionId, storageBucket: "test-evidence" })
    expect(version?.storageKey).toBeTruthy()
    const request = key()
    expect(await rpc("customer_case_pack_access_v1", [session, request, published.created?.versionId, "view"])).toMatchObject({ status: "success", action: "view" })
    expect(await rpc("customer_case_pack_access_v1", [session, request, published.created?.versionId, "view"])).toMatchObject({ status: "success", action: "view" })
    const event = await db.query<{ actor_id: string; details: { source?: string } }>("select actor_id, details from public.case_document_events where event='ACCESS_VIEWED' order by id desc limit 1")
    expect(event.rows[0].actor_id).toBe(customerAuth)
    expect(event.rows[0].details.source).toBe("CUSTOMER_CASE_ACCESS")
    expect(JSON.stringify(event.rows[0])).not.toMatch(/otp|secret|#t=|X-Amz|presigned/i)
    const listed = await rpc("admin_prepared_pack_case_v1", [token, caseId])
    await packCmd("unpublish", { reason: "Withdraw this pack from customer case access.", confirmed: true }, published.packId ?? null, listed?.packs?.find(pack => pack.id === published.packId)?.recordVersion ?? published.recordVersion ?? null)
    expect(await rpc("customer_case_pack_version_v1", [session, published.created?.versionId])).toBeNull()
    expect(await rpc("customer_case_pack_access_v1", [session, key(), published.created?.versionId, "download"])).toEqual({ status: "unavailable" })
    expect((await rpc("customer_case_pack_v1", [session]))?.pack).toBeNull()
  })

  it("denies DOCX view, allows DOCX download, and ignores caller-supplied case IDs", async () => {
    await verify()
    const { session } = await finishAccess()
    const docx = await publishVisiblePack("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(await rpc("customer_case_pack_access_v1", [session, key(), docx.created?.versionId, "view"])).toEqual({ status: "denied" })
    expect(await rpc("customer_case_pack_access_v1", [session, key(), docx.created?.versionId, "download"])).toMatchObject({ status: "success", action: "download" })
    const payload = JSON.stringify(await rpc("customer_case_pack_v1", [session]))
    expect(payload).not.toContain(otherCase)
    expect(payload).not.toContain(caseId)
  })
})
