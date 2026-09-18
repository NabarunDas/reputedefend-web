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
const otherLocation = "99999999-9999-4999-8999-999999999999"
const otherBusiness = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value: string) => createHash("sha256").update(value).digest("hex")
const note = "Reviewed the caller’s request and confirmed the details."
const title = "Managed recovery service agreement"
const bodyText = "This is the owner-approved service wording for this exact case snapshot and must not be invented by the application."
const scopeText = "Restore the listed Google Business Profile for this case only."
const expires = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString()
type RpcResult = {
  status?: string
  id?: string
  replay?: boolean
  missing?: boolean
  authorizationReady?: boolean
  serviceAgreementAccepted?: boolean
  caseManagementPermissionActive?: boolean
  managerAccessVerified?: boolean
  businessAuthorityVerified?: boolean
  customerEmailVerified?: boolean
  actionStatus?: string
  authorizationStatus?: string
  managerStatus?: string
  kind?: string
  maskedEmail?: string
  email?: string
  actionId?: string
  authorizationId?: string
  recordVersion?: number
  version?: number
  stage?: string
  agreements?: unknown[]
  packs?: unknown[]
  authorizations?: Array<{ status: string; source: string; acceptedEmailMasked?: string }>
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
    readdirSync(dir).find(n => n.endsWith("_admin_customer_actions_v1.sql"))!,
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
    truncate public.customer_action_events,public.customer_actions,public.authorization_events,public.authorization_records,public.agreement_versions,public.location_manager_access_events,public.location_manager_access,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.authorization_command_receipts,admin_private.customer_action_command_receipts,public.case_prepared_pack_events,public.case_prepared_pack_items,public.case_prepared_packs,admin_private.pack_command_receipts,public.case_document_events,public.case_document_versions,public.case_documents,public.evidence_requests,admin_private.evidence_command_receipts,public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.business_memberships,public.customer_contact_verifications,public.customers,public.businesses,public.locations,auth.users cascade;
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
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.locations(id,business_id,country) values('${otherLocation}','${otherBusiness}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now());`)
})

async function verify(id = customer, biz = business, email = "alex@example.com") {
  await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4) on conflict (customer_id,channel) do update set verified_value=excluded.verified_value, verified_by=excluded.verified_by, evidence=excluded.evidence, verified_at=now()", [id, email, uid, "Verified from a live call with the customer."])
  await db.query("insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4) on conflict (customer_id,business_id) do update set status='verified', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence", [id, biz, uid, "Companies House match discussed on a live call."])
}
const createData = (overrides: Record<string, unknown> = {}, hash = secretHash(secret())) => ({
  kind: "SERVICE_AGREEMENT", title, bodyText, scopeText, expiresAt: expires(), secretHash: hash, ...overrides,
})
const createAction = (data: Record<string, unknown> = {}, request = key()) => rpc("admin_authorization_command_v1", [token, request, caseId, "create_agreement_action", createData(data)])
const caseCmd = async (operation: string, data: Record<string, unknown>, version: number, request = key()) => rpc("admin_case_command_v1", [token, request, caseId, version, operation, { note, ...data }])

async function completeAccept(kind: "SERVICE_AGREEMENT" | "CASE_MANAGEMENT_PERMISSION" = "SERVICE_AGREEMENT") {
  const raw = secret(), hash = secretHash(raw), pending = secretHash(secret()), session = secretHash(secret())
  const created = await createAction({ kind, secretHash: hash })
  expect(created?.status).toBe("success")
  expect(await rpc("customer_action_exchange_v1", [created?.id, hash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok", email: "alex@example.com" })
  expect(await rpc("customer_action_attempt_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
  const acceptKey = key()
  const accepted = await rpc("customer_action_command_v1", [session, acceptKey, "accept", { accepted: true }])
  expect(accepted).toMatchObject({ status: "success", authorizationStatus: "ACTIVE" })
  expect(await rpc("customer_action_command_v1", [session, acceptKey, "accept", { accepted: true }])).toMatchObject({
    status: "success", authorizationId: accepted?.authorizationId, authorizationStatus: "ACTIVE",
  })
  expect((await db.query<{ n: number }>("select count(*)::int as n from public.authorization_records where agreement_version_id=(select agreement_version_id from public.customer_actions where id=$1)", [created?.id])).rows[0].n).toBe(1)
  return { created, session, accepted }
}

describe("customer action SQL", () => {
  it("denies unverified email, pending or revoked membership, and mismatched relationships", async () => {
    expect((await createAction()).status).toBe("denied")
    await db.query("insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)", [customer, "alex@example.com", uid, "Verified from a live call with the customer."])
    await db.query("insert into public.business_memberships(customer_id,business_id,status,evidence) values($1,$2,'pending',$3)", [customer, business, "Awaiting a live authority check."])
    expect((await createAction()).status).toBe("denied")
    await db.query("update public.business_memberships set status='revoked', evidence=$1", ["Authority withdrawn after a live check."])
    expect((await createAction()).status).toBe("denied")
    await db.query("update public.business_memberships set status='verified', verified_at=now(), verified_by=$1, evidence=$2", [uid, "Companies House match discussed on a live call."])
    expect((await createAction({ expiresAt: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString() })).status).toBe("invalid")
    expect((await createAction()).status).toBe("success")
  })

  it("returns a raw secret only at HTTP layer and stores only the hash", async () => {
    await verify()
    const raw = secret(), hash = secretHash(raw), request = key(), expiresAt = expires()
    const created = await createAction({ secretHash: hash, expiresAt }, request)
    expect(created).toMatchObject({ status: "success", replay: false })
    const replay = await createAction({ secretHash: secretHash(secret()), expiresAt }, request)
    expect(replay).toMatchObject({ status: "success", id: created?.id, replay: true })
    const rows = await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions")
    expect(rows.rows[0].secret_hash).toBe(hash)
    expect(JSON.stringify(rows.rows)).not.toContain(raw)
    const receipts = JSON.stringify((await db.query("select response from admin_private.authorization_command_receipts")).rows)
    expect(receipts).not.toContain(raw)
    expect(receipts).not.toContain("secretHash")
    const events = JSON.stringify((await db.query("select details from public.customer_action_events")).rows)
    expect(events).not.toContain(raw)
    const audit = JSON.stringify((await db.query("select details,reason from public.admin_audit_events")).rows)
    expect(audit).not.toMatch(/#[tT]=|[a-f0-9]{64}#|otp|password/i)
    expect(audit).not.toContain(raw)
  })

  it("fails secret exchange generically and binds OTP only to the expected verified email", async () => {
    await verify()
    const raw = secret(), hash = secretHash(raw), pending = secretHash(secret())
    const created = await createAction({ secretHash: hash })
    expect(await rpc("customer_action_exchange_v1", [crypto.randomUUID(), hash, pending])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_exchange_v1", [created?.id, secretHash("wrong".padEnd(32, "x")), pending])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_exchange_v1", [created?.id, hash, pending])).toMatchObject({ status: "ok", maskedEmail: "a***@example.com" })
    expect((await rpc("customer_action_begin_otp_v1", [pending]))?.email).toBe("alex@example.com")
    expect((await rpc("customer_action_begin_otp_v1", [pending]))?.status).toBe("rate_limited")
    await db.exec("update admin_private.customer_action_challenges set last_sent_at=now()-interval '61 seconds'")
    expect((await rpc("customer_action_begin_otp_v1", [pending]))?.status).toBe("ok")
    for (let i = 0; i < 5; i++) expect((await rpc("customer_action_attempt_otp_v1", [pending]))?.status).toBe("ok")
    expect(await rpc("customer_action_attempt_otp_v1", [pending])).toEqual({ status: "unavailable" })
    await db.exec("update admin_private.customer_action_challenges set attempts=0, challenge_expires_at=now()-interval '1 minute'")
    expect(await rpc("customer_action_attempt_otp_v1", [pending])).toEqual({ status: "unavailable" })
  })

  it("accepts one agreement version, keeps older snapshots immutable, and does not treat setup consent as permission", async () => {
    await verify()
    const first = await completeAccept("SERVICE_AGREEMENT")
    const consent = await db.query<{ privacy_accepted_at: string; information_accurate_at: string }>("select privacy_accepted_at, information_accurate_at from public.cases where id=$1", [caseId])
    expect(consent.rows[0].privacy_accepted_at).toBeTruthy()
    expect(consent.rows[0].information_accurate_at).toBeTruthy()
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))).toMatchObject({
      serviceAgreementAccepted: true, caseManagementPermissionActive: false, authorizationReady: false,
    })
    await expect(db.query("update public.agreement_versions set title='Forged'")).rejects.toThrow(/immutable/)
    await expect(db.query("delete from public.agreement_versions")).rejects.toThrow(/immutable/)
    const second = await completeAccept("CASE_MANAGEMENT_PERMISSION")
    const listed = await rpc("admin_case_authorization_v1", [token, caseId])
    expect(listed?.agreements).toHaveLength(2)
    expect(listed?.authorizations?.every(row => row.source === "CUSTOMER_OTP")).toBe(true)
    expect(listed?.readiness?.serviceAgreementAccepted).toBe(true)
    expect(listed?.readiness?.caseManagementPermissionActive).toBe(true)
    expect(listed?.readiness?.authorizationReady).toBe(false)
    const declined = await createAction({ kind: "SERVICE_AGREEMENT", title: "Replacement wording for a later snapshot" })
    const pending = secretHash(secret()), session = secretHash(secret()), hashRow = await db.query<{ secret_hash: string }>("select secret_hash from public.customer_actions where id=$1", [declined?.id])
    expect(await rpc("customer_action_exchange_v1", [declined?.id, hashRow.rows[0].secret_hash, pending])).toMatchObject({ status: "ok" })
    await rpc("customer_action_begin_otp_v1", [pending])
    await rpc("customer_action_attempt_otp_v1", [pending])
    await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
    const declineKey = key()
    expect(await rpc("customer_action_command_v1", [session, declineKey, "decline", {}])).toMatchObject({ status: "success", actionStatus: "DECLINED" })
    expect(await rpc("customer_action_command_v1", [session, declineKey, "decline", {}])).toMatchObject({ status: "success", actionStatus: "DECLINED" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.authorization_records where authorization_kind='SERVICE_AGREEMENT'")).rows[0].n).toBe(1)
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))?.serviceAgreementAccepted).toBe(true)
    expect(first.accepted?.authorizationId).toBeTruthy()
    expect(second.accepted?.authorizationId).toBeTruthy()
  })

  it("blocks another customer, a different action session, stale membership and email changes", async () => {
    await verify()
    const raw = secret(), hash = secretHash(raw), pending = secretHash(secret()), session = secretHash(secret())
    const created = await createAction({ secretHash: hash })
    await rpc("customer_action_exchange_v1", [created?.id, hash, pending])
    await rpc("customer_action_begin_otp_v1", [pending])
    await rpc("customer_action_attempt_otp_v1", [pending])
    expect(await rpc("customer_action_finish_otp_v1", [pending, session, otherAuth, "sam@example.com"])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_finish_otp_v1", [pending, session, uid, "alex@example.com"])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
    const permissionHash = secretHash(secret())
    const permission = await createAction({ kind: "CASE_MANAGEMENT_PERMISSION", secretHash: permissionHash, title: "Case-management permission snapshot for this case only" })
    expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])).toMatchObject({ status: "success" })
    expect((await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [permission?.id])).rows[0].status).toBe("OPEN")
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))).toMatchObject({
      serviceAgreementAccepted: true, caseManagementPermissionActive: false,
    })
    expect((await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [created?.id])).rows[0].status).toBe("COMPLETED")
    await db.query("update public.business_memberships set status='revoked', verified_at=null, verified_by=null, evidence=$1", ["Authority withdrawn after a live check."])
    expect((await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [permission?.id])).rows[0].status).toBe("REVOKED")
    await verify()
    const later = await createAction({ title: "A later owner-approved snapshot" })
    await db.query("update public.customers set email='alex.changed@example.com' where id=$1", [customer])
    expect((await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [later?.id])).rows[0].status).toBe("REVOKED")
    await db.query("update public.customers set email='alex@example.com' where id=$1", [customer])
    expect((await db.query<{ status: string }>("select status from public.customer_actions where id=$1", [later?.id])).rows[0].status).toBe("REVOKED")
  })

  it("revokes through customer OTP and Admin emergency paths without rewriting acceptance", async () => {
    await verify()
    const accepted = await completeAccept()
    const authId = accepted.accepted?.authorizationId
    const pending = secretHash(secret()), session = secretHash(secret()), hash = secretHash(secret())
    const revokeAction = await rpc("admin_authorization_command_v1", [token, key(), caseId, "create_revocation_action", { authorizationId: authId, expiresAt: expires(), secretHash: hash }])
    expect(revokeAction?.status).toBe("success")
    await rpc("customer_action_exchange_v1", [revokeAction?.id, hash, pending])
    await rpc("customer_action_begin_otp_v1", [pending])
    await rpc("customer_action_attempt_otp_v1", [pending])
    await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])
    expect(await rpc("customer_action_command_v1", [session, key(), "revoke", { confirmed: true }])).toMatchObject({ status: "success", authorizationStatus: "REVOKED" })
    const row = await db.query<{ source: string; accepted_email_snapshot: string; status: string }>("select source, accepted_email_snapshot, status from public.authorization_records where id=$1", [authId])
    expect(row.rows[0]).toMatchObject({ source: "CUSTOMER_OTP", accepted_email_snapshot: "alex@example.com", status: "REVOKED" })
    const again = await completeAccept("CASE_MANAGEMENT_PERMISSION")
    await db.exec(`update public.admin_sessions set created_at=now()-interval '6 minutes' where token_hash='${token}'`)
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", { authorizationId: again.accepted?.authorizationId, reason: "Customer asked for an emergency stop after a live call.", confirmed: true, recordVersion: 1 }])).toEqual({ status: "reauth_required" })
    await db.exec(`update public.admin_sessions set created_at=now() where token_hash='${token}'`)
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", { authorizationId: again.accepted?.authorizationId, reason: "Customer asked for an emergency stop after a live call.", confirmed: true, recordVersion: 1 }])).toMatchObject({ status: "success" })
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))?.caseManagementPermissionActive).toBe(false)
  })

  it("makes expired and revoked actions unavailable without revealing why", async () => {
    await verify()
    const expiredHash = secretHash(secret()), revokedHash = secretHash(secret()), pending = secretHash(secret())
    const expired = await createAction({ secretHash: expiredHash, title: "Expired owner-approved snapshot wording" })
    const revoked = await createAction({ kind: "CASE_MANAGEMENT_PERMISSION", secretHash: revokedHash })
    await db.query("update public.customer_actions set expires_at=now()-interval '1 minute' where id=$1", [expired?.id])
    expect(await rpc("customer_action_exchange_v1", [expired?.id, expiredHash, pending])).toEqual({ status: "unavailable" })
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "revoke_action", { actionId: revoked?.id, reason: "Operator withdrew this unused action after a live check.", confirmed: true }])).toMatchObject({ status: "success" })
    expect(await rpc("customer_action_exchange_v1", [revoked?.id, revokedHash, pending])).toEqual({ status: "unavailable" })
  })

  it("records Manager access separately and makes readiness false after revoke", async () => {
    await verify()
    await completeAccept("SERVICE_AGREEMENT")
    await completeAccept("CASE_MANAGEMENT_PERMISSION")
    await db.query("update public.locations set business_id=$1 where id=$2", [otherBusiness, location])
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", { accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true }])).toEqual({ status: "denied" })
    await db.query("update public.locations set business_id=$1 where id=$2", [business, location])
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", { accessLevel: "MANAGER", evidence: "short", confirmed: true }])).toEqual({ status: "invalid" })
    await db.exec(`update public.admin_sessions set created_at=now()-interval '6 minutes' where token_hash='${token}'`)
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", { accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true }])).toEqual({ status: "reauth_required" })
    await db.exec(`update public.admin_sessions set created_at=now() where token_hash='${token}'`)
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", { accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true }])).toMatchObject({ status: "success", managerStatus: "VERIFIED" })
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))?.authorizationReady).toBe(true)
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "revoke", { reason: "Access removed after a live Google check.", confirmed: true }])).toMatchObject({ managerStatus: "REVOKED" })
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))).toMatchObject({ managerAccessVerified: false, authorizationReady: false })
  })

  it("keeps PREPARATION and READY_TO_SUBMIT blocked when authorisation is ready", async () => {
    await verify()
    await completeAccept("SERVICE_AGREEMENT")
    await completeAccept("CASE_MANAGEMENT_PERMISSION")
    await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", { accessLevel: "OWNER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true }])
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId]))?.authorizationReady).toBe(true)
    const detail = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("plan", { track: "MANAGED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null }, detail?.version ?? 1)
    let current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    await caseCmd("transition", { target: "AUTHORIZATION_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(await caseCmd("transition", { target: "PREPARATION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)).toEqual({ status: "prerequisite" })
    expect(current?.stage).toBe("AUTHORIZATION_REQUIRED")
    await db.query("update public.cases set work_stage='PREPARATION' where id=$1", [caseId])
    current = await rpc("admin_case_detail_v1", [token, caseId, null])
    expect(await caseCmd("transition", { target: "READY_TO_SUBMIT", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }, current?.version ?? 1)).toEqual({ status: "prerequisite" })
  })

  it("revokes direct table access and keeps customer identities out of Admin", async () => {
    await verify()
    for (const table of ["agreement_versions", "authorization_records", "customer_actions", "location_manager_access"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const r = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT') as ok", [role, `public.${table}`])
        expect(r.rows[0].ok).toBe(false)
      }
    }
    expect(await rpc("admin_session_v1", [secretHash("customer-session")])).toBeNull()
    expect(await rpc("customer_action_session_v1", [token])).toBeNull()
    expect(await rpc("admin_authorization_command_v1", ["bad", key(), caseId, "create_agreement_action", createData()])).toEqual({ status: "unauthorized" })
    expect(await rpc("customer_action_command_v1", [token, key(), "accept", { accepted: true }])).toEqual({ status: "unavailable" })
    for (const fn of [
      "admin_authorization_command_v1(text,uuid,uuid,text,jsonb)",
      "admin_manager_access_command_v1(text,uuid,uuid,text,jsonb)",
      "customer_action_exchange_v1(uuid,text,text)",
      "customer_action_command_v1(text,uuid,text,jsonb)",
    ]) {
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('authenticated',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(true)
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role','admin_private.mask_email_v1(text)','EXECUTE') as ok")).rows[0].ok).toBe(false)
  })
})
