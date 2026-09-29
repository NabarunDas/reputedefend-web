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

type RpcResult = {
  status?: string
  id?: string
  version?: number
  versionId?: string
  documentId?: string
  storageKey?: string
  storageBucket?: string
  contentType?: string
  maxBytes?: number
  uploadStatus?: string
  scanStatus?: string
  validationStatus?: string
  reviewStatus?: string
  customerVisible?: boolean
  submissionSource?: string
  evidenceRequestId?: string
  requestStatus?: string
  kind?: string
  evidenceRequests?: Array<{
    requestId: string
    title: string
    requestText: string
    dueAt: string | null
    createdAt: string
    submissionStatus: string
    filename: string | null
    submittedAt: string | null
  }>
  pack?: unknown
  versionNumber?: number
  documents?: Array<{ title: string; versions: Array<{ submissionSource?: string; originalFilename?: string; uploadStatus?: string }> }>
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
    readdirSync(dir).find(n => n.endsWith("_customer_evidence_upload_v1.sql"))!,
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
    truncate public.customer_action_events,public.customer_actions,public.authorization_events,public.authorization_records,public.agreement_versions,public.location_manager_access_events,public.location_manager_access,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.authorization_command_receipts,admin_private.customer_action_command_receipts,admin_private.customer_pack_access_receipts,admin_private.customer_evidence_upload_receipts,public.case_prepared_pack_events,public.case_prepared_pack_items,public.case_prepared_packs,admin_private.pack_command_receipts,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,admin_private.evidence_command_receipts,public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.business_memberships,public.customer_contact_verifications,public.customers,public.businesses,public.locations,auth.users cascade;
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

async function otpSession(actionId: string | undefined, hash: string, session = secretHash(secret()), auth = customerAuth, email = "alex@example.com") {
  const pending = secretHash(secret())
  expect(await rpc("customer_action_exchange_v1", [actionId, hash, pending])).toMatchObject({ status: "ok", kind: "CASE_ACCESS" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok", email })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_attempt_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, auth, email])).toMatchObject({ status: "ok", kind: "CASE_ACCESS" })
  return session
}

async function finishAccess(id = caseId, auth = customerAuth, email = "alex@example.com") {
  const hash = secretHash(secret())
  const created = await createAccess({ secretHash: hash }, key(), id)
  expect(created?.status).toBe("success")
  const session = await otpSession(created?.id, hash, secretHash(secret()), auth, email)
  return { created, session, hash }
}

const createRequest = (title = "Utility bill", text = "Please upload a recent utility bill.", id = caseId) =>
  rpc("admin_evidence_request_v1", [token, key(), id, null, null, "create", title, text, null, null])

const begin = (session: string, requestId: string, filename = "bill.pdf", type = "application/pdf", size = 1024, request = key(), bucket = "test-evidence") =>
  rpc("customer_evidence_begin_v1", [session, request, requestId, filename, type, size, bucket])

describe("customer evidence upload SQL", () => {
  it("shows only this case's OPEN evidence requests and hides another case's request", async () => {
    await verify()
    await verify(otherCustomer, otherBusiness, "sam@example.com")
    const open = await createRequest()
    await createRequest("Other request", "Upload a cafe invoice.", otherCase)
    const cancelled = await createRequest("Old request", "No longer needed.")
    await rpc("admin_evidence_request_v1", [token, key(), caseId, cancelled?.id, cancelled?.version, "cancel", null, null, null, "No longer required for this case."])
    const { session } = await finishAccess()
    const pack = await rpc("customer_case_pack_v1", [session])
    expect(pack?.evidenceRequests).toHaveLength(1)
    expect(pack?.evidenceRequests?.[0]).toMatchObject({
      requestId: open?.id, title: "Utility bill", requestText: "Please upload a recent utility bill.",
      submissionStatus: "NOT_SUBMITTED", filename: null, submittedAt: null,
    })
    expect(JSON.stringify(pack)).not.toMatch(/Cafe invoice|No longer needed|created_by|reviewed_by|storage|admin note|55555555|aaaaaaaa/i)
    expect(pack?.pack).toBeNull()
  })

  it("blocks begin when the request is cancelled or fulfilled, or the case is closed", async () => {
    await verify()
    const { session } = await finishAccess()
    const cancelled = await createRequest("Cancel me", "This will be cancelled.")
    await rpc("admin_evidence_request_v1", [token, key(), caseId, cancelled?.id, cancelled?.version, "cancel", null, null, null, "No longer required for this case."])
    expect(await begin(session, cancelled?.id ?? key())).toEqual({ status: "unavailable" })
    const fulfilled = await createRequest("Fulfil me", "This will be fulfilled.")
    await rpc("admin_evidence_request_v1", [token, key(), caseId, fulfilled?.id, fulfilled?.version, "fulfill", null, null, null, "Completed after the customer sent files."])
    expect(await begin(session, fulfilled?.id ?? key())).toEqual({ status: "unavailable" })
    const open = await createRequest()
    await db.query("update public.cases set status='CLOSED' where id=$1", [caseId])
    expect(await begin(session, open?.id ?? key())).toEqual({ status: "unavailable" })
  })

  it("blocks begin and finalize after the CASE_ACCESS action is revoked", async () => {
    await verify()
    const { created, session } = await finishAccess()
    const request = await createRequest()
    const started = await begin(session, request?.id ?? key())
    expect(started?.status).toBe("success")
    await rpc("admin_authorization_command_v1", [token, key(), caseId, "revoke_action", { actionId: created?.id, reason: "Customer reported the link was lost.", confirmed: true }])
    expect(await begin(session, request?.id ?? key())).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_finalize_v1", [session, key(), started?.versionId])).toEqual({ status: "unavailable" })
  })

  it("blocks begin and finalize after the customer session expires", async () => {
    await verify()
    const { session } = await finishAccess()
    const request = await createRequest()
    const pending = await begin(session, request?.id ?? key())
    expect(pending?.status).toBe("success")
    await db.query("update admin_private.customer_action_sessions set expires_at=now()-interval '1 minute' where token_hash=$1", [session])
    expect(await begin(session, request?.id ?? key())).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_finalize_v1", [session, key(), pending?.versionId])).toEqual({ status: "unavailable" })
  })

  it("blocks begin and finalize after verified email trust is lost", async () => {
    await verify()
    const { session } = await finishAccess()
    const request = await createRequest()
    const pending = await begin(session, request?.id ?? key())
    expect(pending?.status).toBe("success")
    await db.query("update public.customers set email='alex+changed@example.com' where id=$1", [customer])
    expect(await begin(session, request?.id ?? key())).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_finalize_v1", [session, key(), pending?.versionId])).toEqual({ status: "unavailable" })
  })

  it("blocks begin and finalize after verified business membership is lost", async () => {
    await verify()
    const { session } = await finishAccess()
    const request = await createRequest()
    const pending = await begin(session, request?.id ?? key())
    expect(pending?.status).toBe("success")
    await db.query("update public.business_memberships set status='revoked', verified_at=null, verified_by=null where customer_id=$1 and business_id=$2", [customer, business])
    expect(await begin(session, request?.id ?? key())).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_finalize_v1", [session, key(), pending?.versionId])).toEqual({ status: "unavailable" })
  })

  it("creates one customer document from the request title with server-side key and provenance", async () => {
    await verify()
    const { session } = await finishAccess()
    const request = await createRequest()
    const idem = key()
    const begun = await begin(session, request?.id ?? key(), "bill.pdf", "application/pdf", 2048, idem)
    expect(begun).toMatchObject({ status: "success", versionNumber: 1, contentType: "application/pdf", maxBytes: 10485760, storageBucket: "test-evidence" })
    expect(begun?.storageKey).toBe(`cases/${caseId}/documents/${begun?.documentId}/versions/${begun?.versionId}`)
    expect(begun?.storageKey).not.toMatch(/bill\.pdf/i)
    expect(await begin(session, request?.id ?? key(), "bill.pdf", "application/pdf", 2048, idem)).toEqual(begun)
    expect(await begin(session, request?.id ?? key(), "other.pdf", "application/pdf", 2048, idem)).toEqual({ status: "conflict" })
    const restarted = await begin(session, request?.id ?? key(), "other.pdf", "application/pdf", 2048)
    expect(restarted).toMatchObject({ status: "success", documentId: begun?.documentId, versionNumber: 2 })
    expect(restarted?.versionId).not.toBe(begun?.versionId)
    expect(restarted?.storageKey).not.toBe(begun?.storageKey)
    const abandoned = await db.query<{ upload_status: string; original_filename: string; storage_key: string }>("select upload_status, original_filename, storage_key from public.case_document_versions where id=$1", [begun?.versionId])
    expect(abandoned.rows[0]).toEqual({ upload_status: "FAILED", original_filename: "bill.pdf", storage_key: begun?.storageKey })
    const failedEvent = await db.query<{ details: { source?: string; reason?: string } }>("select details from public.case_document_events where version_id=$1 and event='UPLOAD_FAILED'", [begun?.versionId])
    expect(failedEvent.rows[0].details).toMatchObject({ source: "CUSTOMER_CASE_ACCESS", reason: "RESTARTED_BEFORE_FINALIZE" })
    const projection = await rpc("customer_case_pack_v1", [session])
    expect(projection?.evidenceRequests?.[0]).toMatchObject({ submissionStatus: "UPLOAD_PENDING", filename: "other.pdf" })
    expect(JSON.stringify(projection)).not.toMatch(/storageKey|storageBucket|test-evidence/)
  })

  it("keeps the original provenance row after the different-file restart assertion", async () => {
    await verify()
    const { created, session } = await finishAccess()
    const request = await createRequest()
    const begun = await begin(session, request?.id ?? key(), "bill.pdf", "application/pdf", 2048)
    const row = await db.query<{
      title: string; created_by: string; original_filename: string; upload_status: string; scan_status: string
      validation_status: string; review_status: string; customer_visible: boolean; submission_source: string
      customer_action_id: string; version_number: number
    }>(`select d.title, v.created_by, v.original_filename, v.upload_status, v.scan_status, v.validation_status,
      v.review_status, v.customer_visible, v.submission_source, v.customer_action_id, v.version_number
      from public.case_document_versions v join public.case_documents d on d.id=v.document_id where v.id=$1`, [begun?.versionId])
    expect(row.rows[0]).toEqual({
      title: "Utility bill",
      created_by: customerAuth,
      original_filename: "bill.pdf",
      upload_status: "PENDING_UPLOAD",
      scan_status: "PENDING",
      validation_status: "PENDING",
      review_status: "UNREVIEWED",
      customer_visible: false,
      submission_source: "CUSTOMER",
      customer_action_id: created?.id,
      version_number: 1,
    })
    const event = await db.query<{ actor_id: string; details: { source?: string } }>("select actor_id, details from public.case_document_events where version_id=$1 and event='UPLOAD_BEGUN'", [begun?.versionId])
    expect(event.rows[0].actor_id).toBe(customerAuth)
    expect(event.rows[0].details.source).toBe("CUSTOMER_CASE_ACCESS")
    expect(JSON.stringify(event.rows[0].details)).not.toMatch(/secret|otp|cookie|presigned|X-Amz/i)
    const projection = await rpc("customer_case_pack_v1", [session])
    expect(projection?.evidenceRequests?.[0]).toMatchObject({ submissionStatus: "UPLOAD_PENDING", filename: "bill.pdf" })
    expect(JSON.stringify(projection)).not.toMatch(/storageKey|storageBucket|test-evidence/)
  })

  it("fails generically for a foreign request or version and refuses a second completed submission", async () => {
    await verify()
    await verify(otherCustomer, otherBusiness, "sam@example.com")
    const { session } = await finishAccess()
    const other = await createRequest("Other request", "Upload a cafe invoice.", otherCase)
    expect(await begin(session, other?.id ?? key())).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_upload_version_v1", [session, crypto.randomUUID()])).toBeNull()
    const request = await createRequest()
    const first = await begin(session, request?.id ?? key())
    expect(await rpc("customer_evidence_finalize_v1", [session, key(), first?.versionId])).toMatchObject({
      status: "success", uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING",
      reviewStatus: "UNREVIEWED", customerVisible: false,
    })
    expect(await begin(session, request?.id ?? key(), "second.pdf")).toEqual({ status: "conflict" })
    const docs = await db.query<{ n: number }>("select count(*)::int as n from public.case_documents where evidence_request_id=$1", [request?.id])
    expect(docs.rows[0].n).toBe(1)
    const open = await db.query<{ status: string }>("select status from public.evidence_requests where id=$1", [request?.id])
    expect(open.rows[0].status).toBe("OPEN")
    const { session: otherSession } = await finishAccess(otherCase, otherAuth, "sam@example.com")
    expect(await rpc("customer_evidence_finalize_v1", [otherSession, key(), first?.versionId])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_upload_version_v1", [otherSession, first?.versionId])).toBeNull()
  })

  it("lets Admin see the customer upload and keeps review, visibility and request status out of customer reach", async () => {
    await verify()
    const { session } = await finishAccess()
    const request = await createRequest()
    const begun = await begin(session, request?.id ?? key())
    await rpc("customer_evidence_finalize_v1", [session, key(), begun?.versionId])
    const adminCase = await rpc("admin_evidence_case_v1", [token, caseId])
    expect(adminCase?.documents?.[0]).toMatchObject({ title: "Utility bill" })
    expect(adminCase?.documents?.[0].versions[0]).toMatchObject({
      submissionSource: "CUSTOMER", originalFilename: "bill.pdf",
    })
    await expect(db.query("update public.case_document_versions set review_status='ACCEPTED' where id=$1", [begun?.versionId])).resolves.toBeTruthy()
    await db.query("update public.case_document_versions set review_status='UNREVIEWED' where id=$1", [begun?.versionId])
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["case_document_versions", "case_documents", "evidence_requests", "case_document_events"]) {
        const r = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'UPDATE') as ok", [role, `public.${table}`])
        expect(r.rows[0].ok).toBe(false)
      }
      const fn = await db.query<{ ok: boolean }>("select has_function_privilege($1,'public.customer_evidence_begin_v1(text,uuid,uuid,text,text,bigint,text)','EXECUTE') as ok", [role])
      expect(fn.rows[0].ok).toBe(false)
    }
    const receipt = await db.query<{ ok: boolean }>("select has_table_privilege('authenticated',$1,'SELECT') as ok", ["admin_private.customer_evidence_upload_receipts"])
    expect(receipt.rows[0].ok).toBe(false)
    expect(await rpc("admin_evidence_review_v1", [session, key(), caseId, begun?.versionId, 2, "accept", "Trying to accept as the customer.", null])).toMatchObject({ status: "unauthorized" })
    expect(await rpc("admin_evidence_request_v1", [session, key(), caseId, request?.id, request?.version, "fulfill", null, null, null, "Trying to fulfil as the customer."])).toMatchObject({ status: "unauthorized" })
    const stillOpen = await db.query<{ status: string }>("select status from public.evidence_requests where id=$1", [request?.id])
    expect(stillOpen.rows[0].status).toBe("OPEN")
  })

  it("resumes the same pending version after a new OTP session on the same CASE_ACCESS action", async () => {
    await verify()
    const { created, session, hash } = await finishAccess()
    const request = await createRequest()
    const pending = await begin(session, request?.id ?? key())
    expect(pending?.status).toBe("success")
    await db.query("update admin_private.customer_action_sessions set expires_at=now()-interval '1 minute' where token_hash=$1", [session])
    const nextSession = await otpSession(created?.id, hash ?? "")
    const resumed = await begin(nextSession, request?.id ?? key())
    expect(resumed).toMatchObject({ status: "success", versionId: pending?.versionId, documentId: pending?.documentId, storageKey: pending?.storageKey })
    const versions = await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions where customer_evidence_request_id=$1", [request?.id])
    expect(versions.rows[0].n).toBe(1)
  })

  it("lets a fresh CASE_ACCESS action replace an abandoned pending upload after revoke", async () => {
    await verify()
    const first = await finishAccess()
    const request = await createRequest()
    const old = await begin(first.session, request?.id ?? key())
    await rpc("admin_authorization_command_v1", [token, key(), caseId, "revoke_action", { actionId: first.created?.id, reason: "Customer reported the link was lost.", confirmed: true }])
    expect(await rpc("customer_evidence_finalize_v1", [first.session, key(), old?.versionId])).toEqual({ status: "unavailable" })
    const next = await finishAccess()
    const pack = await rpc("customer_case_pack_v1", [next.session])
    expect(pack?.evidenceRequests?.[0]).toMatchObject({ submissionStatus: "NOT_SUBMITTED", filename: null })
    const fresh = await begin(next.session, request?.id ?? key())
    expect(fresh).toMatchObject({ status: "success", documentId: old?.documentId, versionNumber: 2 })
    expect(fresh?.versionId).not.toBe(old?.versionId)
    const abandoned = await db.query<{ upload_status: string }>("select upload_status from public.case_document_versions where id=$1", [old?.versionId])
    expect(abandoned.rows[0].upload_status).toBe("FAILED")
    expect(await rpc("customer_evidence_finalize_v1", [next.session, key(), old?.versionId])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_evidence_upload_version_v1", [next.session, old?.versionId])).toBeNull()
    expect(await rpc("customer_evidence_finalize_v1", [next.session, key(), fresh?.versionId])).toMatchObject({ status: "success", uploadStatus: "UPLOADED" })
    expect(await begin(next.session, request?.id ?? key(), "later.pdf")).toEqual({ status: "conflict" })
  })

  it("recovers after an expired CASE_ACCESS is replaced, a closed case is reopened, and trust is restored", async () => {
    await verify()
    const expired = await finishAccess()
    const request = await createRequest()
    const old = await begin(expired.session, request?.id ?? key(), "expired.pdf")
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    try {
      await db.query("update public.customer_actions set expires_at=now()-interval '1 minute' where id=$1", [expired.created?.id])
    } finally {
      await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    }
    const replacement = await finishAccess()
    const replaced = await begin(replacement.session, request?.id ?? key(), "replacement.pdf")
    expect(replaced).toMatchObject({ status: "success", documentId: old?.documentId })
    expect((await db.query<{ upload_status: string }>("select upload_status from public.case_document_versions where id=$1", [old?.versionId])).rows[0].upload_status).toBe("FAILED")
    expect(await rpc("customer_evidence_finalize_v1", [replacement.session, key(), old?.versionId])).toEqual({ status: "unavailable" })

    await db.query("update public.cases set status='CLOSED' where id=$1", [caseId])
    expect(await begin(replacement.session, request?.id ?? key(), "closed.pdf")).toEqual({ status: "unavailable" })
    await db.query("update public.cases set status='RECEIVED' where id=$1", [caseId])
    const reopened = await finishAccess()
    const afterClose = await begin(reopened.session, request?.id ?? key(), "reopened.pdf")
    expect(afterClose).toMatchObject({ status: "success", documentId: old?.documentId })
    expect((await db.query<{ upload_status: string }>("select upload_status from public.case_document_versions where id=$1", [replaced?.versionId])).rows[0].upload_status).toBe("FAILED")

    await db.query("update public.customers set email='alex+changed@example.com' where id=$1", [customer])
    expect(await begin(reopened.session, request?.id ?? key(), "trust.pdf")).toEqual({ status: "unavailable" })
    await db.query("update public.customers set email='alex@example.com' where id=$1", [customer])
    await verify()
    const trusted = await finishAccess()
    const afterTrust = await begin(trusted.session, request?.id ?? key(), "trusted.pdf")
    expect(afterTrust).toMatchObject({ status: "success", documentId: old?.documentId })
    expect((await rpc("customer_case_pack_v1", [trusted.session]))?.evidenceRequests?.[0]).toMatchObject({ submissionStatus: "UPLOAD_PENDING", filename: "trusted.pdf" })
  })

  it("recovers after membership trust is restored and keeps failed history visible to Admin", async () => {
    await verify()
    const first = await finishAccess()
    const request = await createRequest()
    const old = await begin(first.session, request?.id ?? key(), "member.pdf")
    await db.query("update public.business_memberships set status='revoked', verified_at=null, verified_by=null where customer_id=$1 and business_id=$2", [customer, business])
    expect(await begin(first.session, request?.id ?? key(), "member.pdf")).toEqual({ status: "unavailable" })
    await verify()
    const next = await finishAccess()
    const fresh = await begin(next.session, request?.id ?? key(), "restored.pdf")
    expect(fresh).toMatchObject({ status: "success", documentId: old?.documentId })
    const adminCase = await rpc("admin_evidence_case_v1", [token, caseId])
    const statuses = adminCase?.documents?.[0].versions.map(version => version.uploadStatus)
    expect(statuses).toEqual(expect.arrayContaining(["FAILED", "PENDING_UPLOAD"]))
    expect((await rpc("customer_case_pack_v1", [next.session]))?.evidenceRequests?.[0]).toMatchObject({ submissionStatus: "UPLOAD_PENDING", filename: "restored.pdf" })
    expect(JSON.stringify(await rpc("customer_case_pack_v1", [next.session]))).not.toMatch(/AWAITING_REVIEW/)
  })

  it("cannot create two active customer versions for the same request", async () => {
    await verify()
    const { created, session } = await finishAccess()
    const request = await createRequest()
    const [first, second] = await Promise.all([
      begin(session, request?.id ?? key(), "bill.pdf"),
      begin(session, request?.id ?? key(), "bill.pdf"),
    ])
    expect(first).toMatchObject({ status: "success" })
    expect(second).toMatchObject({ status: "success", versionId: first?.versionId })
    const otherKey = `cases/${caseId}/documents/${first?.documentId}/versions/${crypto.randomUUID()}`
    await expect(db.query(
      `insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
        storage_bucket, storage_key, created_by, submission_source, customer_action_id, customer_evidence_request_id
      ) values (gen_random_uuid(), $1, 99, 'dup.pdf', 'application/pdf', 1024, 'test-evidence', $2, $3, 'CUSTOMER', $4, $5)`,
      [first?.documentId, otherKey, customerAuth, created?.id, request?.id],
    )).rejects.toThrow(/unique|one_customer|duplicate/i)
    const active = await db.query<{ n: number }>("select count(*)::int as n from public.case_document_versions where customer_evidence_request_id=$1 and upload_status in ('PENDING_UPLOAD','UPLOADED')", [request?.id])
    expect(active.rows[0].n).toBe(1)
  })
})
