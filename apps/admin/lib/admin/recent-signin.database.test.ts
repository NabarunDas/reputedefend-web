import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { createHash, randomBytes } from "node:crypto"
import { applyChain, preparePlatform } from "../recovery/harness"
import { issueOAuthState } from "../../../../lib/google-business-profile/oauth"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { proposedServiceAgreement } from "../../../../lib/commercial/service-agreements"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const sideLocation = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const includedLocation = "ccccccc1-cccc-4ccc-8ccc-ccccccccccc1"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const otherSession = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value = secret()) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()
const periodEnd = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
const reason = "Checked the record with the customer on a live call."

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; orderId?: string; quoteVersionId?: string; obligationId?: string; subscriptionId?: string; providerOperationId?: string }

const replaced = [
  ["public", "admin_contact_verify_v1"],
  ["public", "admin_membership_save_v1"],
  ["public", "admin_record_save_v1"],
  ["public", "admin_authorization_command_v1"],
  ["public", "admin_manager_access_command_v1"],
  ["public", "admin_revoke_session_v1"],
  ["public", "admin_catalogue_command_v1"],
  ["public", "admin_job_replay_v1"],
  ["public", "admin_dev_stripe_one_shot_claim_v1"],
  ["admin_private", "admin_payment_command_core_v1"],
  ["public", "payment_prepare_invoice_v1"],
  ["admin_private", "guard_activate_v1"],
  ["admin_private", "guard_approve_credit_v1"],
  ["admin_private", "guard_approve_immediate_cancellation_v1"],
  ["admin_private", "guard_approve_refund_v1"],
  ["admin_private", "guard_issue_price_change_v1"],
  ["admin_private", "guard_map_provider_price_v1"],
  ["admin_private", "guard_request_immediate_cancellation_v1"],
  ["admin_private", "guard_schedule_cancellation_v1"],
  ["admin_private", "guard_undo_cancellation_v1"],
  ["admin_private", "settings_reauth_ok_v1"],
] as const

async function call<T>(schema: string, name: string, args: unknown[] = []): Promise<T> {
  const sql = `select ${schema}.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}
const rpc = (name: string, args: unknown[] = []) => call<Json | null>("public", name, args)
async function seedQualifyingChecks(orderId: string, profileUrl: string) {
  const basis = (await db.query<{
    case_id: string
    customer_id: string
    success_definition: string
    issue_description: string
    case_type: string
  }>(`
    select so.case_id, so.customer_id, qv.success_definition, cs.issue_description, cs.case_type
    from public.service_orders so
    join public.quote_versions qv on qv.id = so.quote_version_id
    join public.cases cs on cs.id = so.case_id
    where so.id = $1
  `, [orderId])).rows[0]
  const accepted = (await db.query<{ accepted_target_ref: string | null }>(`
    select qa.accepted_target_ref
    from public.service_orders so
    join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
    where so.id = $1
  `, [orderId])).rows[0].accepted_target_ref
  if (accepted !== profileUrl) {
    throw new Error("The qualifying checks must use the target frozen at quote acceptance.")
  }
  async function evidence(hoursAgo: number) {
    const documentId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    await db.query(
      "insert into public.case_documents(id, case_id, title, created_by) values ($1,$2,'Check screenshot',$3)",
      [documentId, basis.case_id, uid],
    )
    await db.query(`
      insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
        storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, created_by, created_at
      ) values ($1,$2,1,'check.png','image/png',2048,'test-evidence',$3,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4, now() - ($5 * interval '1 hour'))
    `, [versionId, documentId, `cases/${basis.case_id}/documents/${documentId}/versions/${versionId}`, uid, hoursAgo])
    return versionId
  }
  const baselineEvidence = await evidence(0)
  await db.query(`
    insert into public.success_baselines(
      request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
      evidence_version_id, recorded_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [crypto.randomUUID(), basis.case_id, basis.customer_id, orderId, accepted, basis.issue_description, basis.success_definition, baselineEvidence, uid])
  for (const hours of [72, 12]) {
    const versionId = await evidence(hours)
    await db.query(`
      insert into public.success_observations(
        request_id, baseline_id, case_id, customer_id, service_order_id, evidence_version_id, success_definition,
        observed_at, finding, review_visibility, source_access, historic_exception, historic_reason,
        observer_ref, note, approved_by, approved_at
      )
      select $1, b.id, b.case_id, b.customer_id, b.service_order_id, $2, b.success_definition,
        now() - ($3 * interval '1 hour'), 'ABSENT',
        case when $4 = 'REVIEW_PROTECTION' then 'NOT_SHOWN' else 'NOT_APPLICABLE' end,
        'ACCESSIBLE', true, 'Disposable synthetic evidence stands for this historic check.',
        'staff-observer-live-check', 'Checked the contracted target on the accepted evidence.', $5::uuid, now()
      from public.success_baselines b
      where b.service_order_id = $6::uuid
    `, [crypto.randomUUID(), versionId, hours, basis.case_type, uid, orderId])
  }
}

async function age(minutes: number) {
  await db.query(
    `update public.admin_sessions
     set created_at = now() - ($1 * interval '1 minute'),
         last_seen_at = now(),
         expires_at = now() + interval '12 hours',
         revoked_at = null
     where token_hash = $2`,
    [minutes, token],
  )
}
async function expireSession() {
  await db.query(
    "update public.admin_sessions set created_at = now(), last_seen_at = now(), expires_at = now() - interval '1 minute', revoked_at = null where token_hash = $1",
    [token],
  )
}
async function revokeSession() {
  await db.query(
    "update public.admin_sessions set created_at = now(), last_seen_at = now(), expires_at = now() + interval '12 hours', revoked_at = now() where token_hash = $1",
    [token],
  )
}
async function customerEmail() {
  return (await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email
}
async function finishOtp(actionId: string, actionSecret: string) {
  const email = await customerEmail()
  await db.query("update auth.users set email=$1 where id=$2", [email, customerAuth])
  const pending = secretHash()
  const session = secretHash()
  expect(await rpc("customer_action_exchange_v1", [actionId, actionSecret, pending]), "exchange").toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending]), "otp begin").toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending]), "otp sent").toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, email]), "otp finish").toMatchObject({ status: "ok" })
  return session
}
async function offerQuote(serviceCode: string, caseForQuote: string | null, locationId = location) {
  const established = await rpc("admin_record_business_establishment_v1", [token, key(), {
    businessId: business, countryCode: "GB", legalName: "Synthetic Purchasing Business Ltd",
    evidenceType: "OTHER", verificationStatus: "VERIFIED",
    evidenceReference: "Synthetic record of where this purchasing business belongs. It is not a Google listing and not a tax approval.",
  }])
  expect(established?.status, JSON.stringify(established)).toBe("success")
  const agreement = proposedServiceAgreement(serviceCode)
  const approved = await rpc("admin_record_owner_paid_service_agreement_approval_v1", [
    token, key(), agreement?.version, "Business owner approved this exact wording in the project conversation on 22 October 2026.",
  ])
  expect(["confirmed", "already_confirmed", "replay"], JSON.stringify(approved)).toContain(approved?.status)
  const price = (await db.query<{ id: string }>("select id from public.price_versions where service_code=$1 and seed_key is not null", [serviceCode])).rows[0].id
  const draft = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    serviceCode, customerId: customer, businessId: business, caseId: caseForQuote, locationId,
    priceVersionId: price,
    scope: "Prepare the agreed service for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false,
  }, null])
  expect(draft?.status, JSON.stringify(draft)).toBe("success")
  const taxed = await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", {
    quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE",
  }, draft!.version])
  expect(taxed?.status, JSON.stringify(taxed)).toBe("success")
  const offered = await rpc("admin_quote_command_v1", [token, key(), "offer", {
    quoteId: draft!.id, quoteVersionId: taxed?.quoteVersionId ?? draft!.quoteVersionId,
  }, taxed?.version])
  expect(offered?.status, JSON.stringify(offered)).toBe("success")
  const hash = secretHash()
  const issued = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
    quoteId: draft!.id, expiresAt: actionExpiry(), secretHash: hash,
  }, null])
  expect(issued?.status, JSON.stringify(issued)).toBe("success")
  const pinned = (await db.query<{ quote_version_id: string; service_code: string; location_id: string; total_amount_minor: number }>(
    `select a.quote_version_id, v.service_code, v.location_id, v.total_amount_minor
     from public.customer_actions a join public.quote_versions v on v.id = a.quote_version_id where a.id = $1`,
    [issued!.id],
  )).rows[0]
  const session = await finishOtp(String(issued!.id), hash)
  const acceptance = paidQuoteCommand({
    quoteVersionId: pinned.quote_version_id,
    serviceCode: pinned.service_code,
    locationId: pinned.location_id,
    amountMinor: pinned.total_amount_minor,
  })
  acceptance.terms = { accepted: true, version: agreement!.version, hash: agreement!.contentHash }
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", acceptance])
  expect(accepted?.status, JSON.stringify(accepted)).toBe("success")
  return accepted!
}
async function orderVersion(orderId: string) {
  return (await db.query<{ record_version: number }>("select record_version from public.service_orders where id=$1", [orderId])).rows[0].record_version
}
async function guard(operation: string, payload: Record<string, unknown>, version: number | null = null) {
  return rpc("admin_guard_command_v1", [token, key(), operation, payload, version])
}
async function subVersion(id: string) {
  return (await db.query<{ record_version: number }>("select record_version from public.guard_subscriptions where id=$1", [id])).rows[0].record_version
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    alter table public.admin_identity disable trigger admin_identity_protect;
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
    alter table public.admin_identity enable trigger admin_identity_protect;
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.admin_sessions(id,token_hash,auth_user_id,created_at) values('${otherSession}','${"b".repeat(64)}','${uid}',now());
    insert into public.customers(id,full_name,email,phone) values('${customer}','Alex','alex@example.com','+441234567890');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country,location_name,business_profile_url) values('${location}','${business}','UK','High Street','https://maps.google.com/?cid=bakery');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track)
      values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED');
  `)
}, 240000)

afterAll(async () => { await db.close() })

describe("Admin recent sign-in is 30 minutes after the follow-up migration", () => {
  it("reads 30 minutes back from the replaced functions and leaves unrelated timers", async () => {
    const defs = await db.query<{ schema: string; name: string; def: string }>(`
      select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname, p.proname) in (${replaced.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(",")})
    `, replaced.flatMap(([schema, name]) => [schema, name]))
    expect(defs.rows).toHaveLength(replaced.length)
    for (const row of defs.rows) {
      expect(row.def, row.name).toContain("interval '30 minutes'")
      expect(row.def, row.name).not.toContain("interval '5 minutes'")
    }
    const backoff = await db.query<{ def: string }>("select pg_get_functiondef('admin_private.job_backoff_v1(integer)'::regprocedure) as def")
    expect(backoff.rows[0].def).toContain("interval '5 minutes'")
    const cutoff = await db.query<{ n: number }>(`
      select count(*)::int as n from pg_proc p
      where p.prokind = 'f' and pg_get_functiondef(p.oid) like '%48 hours 5 minutes%'
    `)
    expect(cutoff.rows[0].n).toBeGreaterThan(0)
    const email = await db.query<{ def: string }>(
      "select pg_get_functiondef('public.admin_dev_send_email_claim_v1(text,uuid,uuid,boolean,text)'::regprocedure) as def",
    )
    expect(email.rows[0].def).toContain("interval '30 minutes'")
    expect(email.rows[0].def).not.toContain("interval '5 minutes'")
    const session = await db.query<{ def: string }>("select pg_get_functiondef('public.admin_session_v1(text)'::regprocedure) as def")
    expect(session.rows[0].def).toContain("last_seen_at > now()-interval '30 minutes'")
    const logout = await db.query<{ def: string }>("select pg_get_functiondef('public.admin_revoke_sessions_v1(text,boolean)'::regprocedure) as def")
    expect(logout.rows[0].def).not.toContain("interval '5 minutes'")
    const helper = defs.rows.find(row => row.name === "settings_reauth_ok_v1")
    expect(helper?.def).toContain("s.created_at >= now() - interval '30 minutes'")
    expect(helper?.def).toContain("s.revoked_at IS NULL")
  })

  it("lets record, contact and authority changes succeed at 29 minutes and stop at 31", async () => {
    await age(31)
    const blockedEmail = await rpc("admin_record_save_v1", [token, "client", customer, 1, { name: "Alex", email: "late@example.com", phone: "" }, reason, key()])
    expect(blockedEmail).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email).toBe("alex@example.com")
    await age(29)
    const changed = await rpc("admin_record_save_v1", [token, "client", customer, 1, { name: "Alex", email: "alex.moved@example.com", phone: "" }, reason, key()])
    expect(changed).toMatchObject({ status: "success" })
    expect((await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email).toBe("alex.moved@example.com")

    const version = (await db.query<{ record_version: number }>("select record_version from public.customers where id=$1", [customer])).rows[0].record_version
    await age(31)
    expect(await rpc("admin_contact_verify_v1", [token, customer, version, "email", reason, key()])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_contact_verifications where customer_id=$1", [customer])).rows[0].n).toBe(0)
    await age(29)
    expect(await rpc("admin_contact_verify_v1", [token, customer, version, "email", reason, key()])).toMatchObject({ status: "success" })

    await age(31)
    expect(await rpc("admin_membership_save_v1", [token, customer, business, 0, "verified", reason, key()])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.business_memberships where customer_id=$1", [customer])).rows[0].n).toBe(0)
    await age(29)
    expect(await rpc("admin_membership_save_v1", [token, customer, business, 0, "verified", reason, key()])).toMatchObject({ status: "success" })
    expect((await db.query<{ status: string }>("select status from public.business_memberships where customer_id=$1", [customer])).rows[0].status).toBe("verified")

    await expireSession()
    expect(await rpc("admin_contact_verify_v1", [token, customer, version + 1, "email", reason, key()])).toMatchObject({ status: "unauthorized" })
    await revokeSession()
    expect(await rpc("admin_membership_save_v1", [token, customer, business, 1, "pending", reason, key()])).toMatchObject({ status: "unauthorized" })
    await age(0)
    expect(await rpc("admin_record_save_v1", ["c".repeat(64), "client", customer, version, { name: "Alex", email: "someone@example.com", phone: "" }, reason, key()])).toMatchObject({ status: "unauthorized" })
    expect((await db.query<{ email: string }>("select email from public.customers where id=$1", [customer])).rows[0].email).toBe("alex.moved@example.com")
  })

  it("ends another session at 29 minutes and refuses an old, expired or revoked caller", async () => {
    await age(31)
    expect(await call<string>("public", "admin_revoke_session_v1", [token, otherSession, key()])).toBe("reauth_required")
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from public.admin_sessions where id=$1", [otherSession])).rows[0].revoked_at).toBeNull()
    await age(29)
    expect(await call<string>("public", "admin_revoke_session_v1", [token, otherSession, key()])).toBe("success")
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from public.admin_sessions where id=$1", [otherSession])).rows[0].revoked_at).toBeTruthy()
    await db.query("update public.admin_sessions set revoked_at=null where id=$1", [otherSession])
    await expireSession()
    expect(await call<string>("public", "admin_revoke_session_v1", [token, otherSession, key()])).toBe("unauthorized")
    await revokeSession()
    expect(await call<string>("public", "admin_revoke_session_v1", [token, otherSession, key()])).toBe("unauthorized")
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from public.admin_sessions where id=$1", [otherSession])).rows[0].revoked_at).toBeNull()
    await age(0)
    await db.query("update public.admin_sessions set last_seen_at = now() - interval '31 minutes' where token_hash=$1", [token])
    expect(await call<string>("public", "admin_revoke_session_v1", [token, otherSession, key()])).toBe("unauthorized")
    await age(0)
  })

  it("approves a future price and replays a dead letter inside 30 minutes only", async () => {
    await age(0)
    const created = await rpc("admin_catalogue_command_v1", [token, key(), "create_price_version", {
      serviceCode: "GUIDED_REVIEW", displayName: "Guided Review", amountMinor: 5900, effectiveFrom: "2027-06-01T00:00:00Z", taxBehaviour: "UNCONFIRMED",
    }, null])
    expect(created?.status).toBe("success")
    await age(31)
    expect(await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: created?.id }, created?.version])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ status: string }>("select status from public.price_versions where id=$1", [created?.id])).rows[0].status).toBe("DRAFT")
    await age(29)
    expect(await rpc("admin_catalogue_command_v1", [token, key(), "approve_price_version", { priceVersionId: created?.id }, created?.version])).toMatchObject({ status: "success" })
    expect((await db.query<{ status: string }>("select status from public.price_versions where id=$1", [created?.id])).rows[0].status).toBe("APPROVED")

    await age(0)
    const probe = await rpc("admin_enqueue_job_probe_v1", [token, key()])
    expect(probe?.status).toBe("success")
    expect((await rpc("job_promote_outbox_v1", [20]))?.status).toBe("success")
    const claimed = await rpc("job_claim_batch_v1", [10, "worker-reauth", 120, "dpl_reauth"])
    const job = (claimed?.jobs as Array<{ jobId: string; leaseToken: string }> | undefined)?.[0]
    expect(job?.jobId).toBeTruthy()
    expect((await rpc("job_fail_v1", [job!.jobId, job!.leaseToken, "permanent", false]))?.jobStatus).toBe("DEAD_LETTER")
    const version = (await db.query<{ record_version: number }>("select record_version from admin_private.jobs where id=$1", [job!.jobId])).rows[0].record_version
    await age(31)
    expect(await rpc("admin_job_replay_v1", [token, key(), job!.jobId, "Need to retry the health probe after a worker fault.", true, version])).toEqual({ status: "reauth_required" })
    expect((await db.query<{ status: string }>("select status from admin_private.jobs where id=$1", [job!.jobId])).rows[0].status).toBe("DEAD_LETTER")
    await age(29)
    expect(await rpc("admin_job_replay_v1", [token, key(), job!.jobId, "Need to retry the health probe after a worker fault.", true, version])).toMatchObject({ status: "success" })
    expect((await db.query<{ status: string }>("select status from admin_private.jobs where id=$1", [job!.jobId])).rows[0].status).toBe("PENDING")
    await expireSession()
    expect(await rpc("admin_job_replay_v1", [token, key(), job!.jobId, "Need to retry the health probe after a worker fault.", true, version + 1])).toMatchObject({ status: "unauthorized" })
    await age(0)
  })

  it("claims a DEV Stripe event at 29 minutes and requires reauthentication at 31", async () => {
    await age(0)
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_reauth30_early", "payment_intent.succeeded", "pi_reauth30_early"])).toMatchObject({ status: "success" })
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_reauth30_late", "payment_intent.succeeded", "pi_reauth30_late"])).toMatchObject({ status: "success" })
    await age(29)
    expect(await rpc("admin_dev_stripe_one_shot_claim_v1", [token, key(), "evt_reauth30_early", true, false])).toMatchObject({ status: "success" })
    await age(31)
    expect(await rpc("admin_dev_stripe_one_shot_claim_v1", [token, key(), "evt_reauth30_late", true, false])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where idempotency_key = 'process-stripe-event:evt_reauth30_late'")).rows[0].n).toBe(0)
    await expireSession()
    expect(await rpc("admin_dev_stripe_one_shot_claim_v1", [token, key(), "evt_reauth30_late", true, false])).toMatchObject({ status: "unauthorized" })
    await revokeSession()
    expect(await rpc("admin_dev_stripe_one_shot_claim_v1", [token, key(), "evt_reauth30_late", true, false])).toMatchObject({ status: "unauthorized" })
    await age(0)
  })

  it("uses the settings helper for templates, integrations and privacy export", async () => {
    await age(29)
    expect(await call<boolean>("admin_private", "settings_reauth_ok_v1", [token])).toBe(true)
    await age(31)
    expect(await call<boolean>("admin_private", "settings_reauth_ok_v1", [token])).toBe(false)
    await revokeSession()
    expect(await call<boolean>("admin_private", "settings_reauth_ok_v1", [token])).toBe(false)
    await age(0)
    const draft = await rpc("admin_settings_command_v1", [token, key(), "create_template_draft", {
      templateKey: "CASE_UPDATE", name: "Case update v-next", subject: "Update on {case_ref}", body: "{fact} {effect} {next_step}",
    }, null])
    expect(draft?.status).toBe("success")
    const listed = await rpc("admin_template_list_v1", [token])
    const row = (listed?.drafts as Array<{ id: string; recordVersion: number }> | undefined)?.find(item => item.id === draft?.id)
    await age(31)
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_template_draft", { id: draft?.id }, row?.recordVersion])).toMatchObject({ status: "reauth_required" })
    await age(29)
    expect(await rpc("admin_settings_command_v1", [token, key(), "approve_template_draft", { id: draft?.id }, row?.recordVersion])).toMatchObject({ status: "success" })

    const issued = issueOAuthState({ now: new Date() })
    const begin = {
      stateHash: issued.stateHash, sessionBinding: createHash("sha256").update("binding").digest("hex"),
      redirectUri: "https://admin.example.com/api/integrations/google/callback", expiresAt: issued.expiresAt, customerId: customer,
    }
    await age(31)
    expect(await rpc("admin_integration_command_v1", [token, key(), "begin_connect", begin])).toMatchObject({ status: "reauth_required" })
    await age(29)
    expect(await rpc("admin_integration_command_v1", [token, key(), "begin_connect", begin])).toMatchObject({ status: "success" })

    await age(0)
    const request = await rpc("admin_settings_command_v1", [token, key(), "create_privacy_request", {
      kind: "ACCESS", customerId: customer, notes: "Subject access request covering the current record.",
    }, null])
    expect(request?.status).toBe("success")
    let version = 1
    const step = async (operation: string, payload: Record<string, unknown>) => {
      const result = await rpc("admin_settings_command_v1", [token, key(), operation, { id: request?.id, ...payload }, version])
      if (typeof result?.version === "number") version = result.version
      return result
    }
    expect((await step("verify_privacy_request", {}))?.status).toBe("success")
    expect((await step("start_privacy_review", {}))?.status).toBe("success")
    expect((await step("preview_privacy_request", {}))?.status).toBe("success")
    expect((await step("review_disposition", {
      category: "CONSENT_RECORDS", proposedAction: "RETAIN", status: "READY", reason: "Consent history reviewed and retained.",
    }))?.status).toBe("success")
    await age(31)
    expect(await rpc("admin_privacy_export_v1", [token, key(), request?.id, version])).toMatchObject({ status: "reauth_required" })
    await age(29)
    expect(await rpc("admin_privacy_export_v1", [token, key(), request?.id, version])).toMatchObject({ status: "success" })
    await expireSession()
    expect(await rpc("admin_privacy_export_v1", [token, key(), request?.id, version])).toMatchObject({ status: "unauthorized" })
    await age(0)
  })

  it("revokes an authorisation and verifies Manager access at 29 minutes only", async () => {
    await age(0)
    const hash = secretHash()
    const created = await rpc("admin_authorization_command_v1", [token, key(), caseId, "create_agreement_action", {
      kind: "CASE_MANAGEMENT_PERMISSION",
      title: "Case-management permission snapshot for this case only",
      bodyText: "This is the owner-approved service wording for this exact case snapshot and must not be invented by the application.",
      scopeText: "Restore the listed Google Business Profile for this case only.",
      expiresAt: later(), secretHash: hash,
    }])
    expect(created?.status, JSON.stringify(created)).toBe("success")
    const session = await finishOtp(String(created!.id), hash)
    const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
    expect(accepted?.status, JSON.stringify(accepted)).toBe("success")
    const authorizationId = accepted?.authorizationId
    const recordVersion = (await db.query<{ record_version: number }>("select record_version from public.authorization_records where id=$1", [authorizationId])).rows[0].record_version
    const revoke = {
      authorizationId, reason: "Customer asked for an emergency stop after a live call.", confirmed: true, recordVersion,
    }
    await age(31)
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", revoke])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ status: string }>("select status from public.authorization_records where id=$1", [authorizationId])).rows[0].status).toBe("ACTIVE")
    await age(29)
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", revoke])).toMatchObject({ status: "success" })
    expect((await db.query<{ status: string }>("select status from public.authorization_records where id=$1", [authorizationId])).rows[0].status).toBe("REVOKED")
    await expireSession()
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", revoke])).toMatchObject({ status: "unauthorized" })
    await age(0)

    const evidence = "Seen in Google Business Manager on a live screen share."
    await age(31)
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
      accessLevel: "MANAGER", evidence, confirmed: true, recordVersion: 0,
    }])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.location_manager_access where location_id=$1", [location])).rows[0].n).toBe(0)
    await age(29)
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
      accessLevel: "MANAGER", evidence, confirmed: true, recordVersion: 0,
    }])).toMatchObject({ status: "success", managerStatus: "VERIFIED" })
    await revokeSession()
    expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
      accessLevel: "OWNER", evidence, confirmed: true, recordVersion: 1,
    }])).toMatchObject({ status: "unauthorized" })
    await age(0)
  }, 60000)

  it("approves a success fee and prepares an invoice at 29 minutes only", async () => {
    await age(0)
    const accepted = await offerQuote("MANAGED_RELAUNCH", caseId)
    const orderId = String(accepted.orderId)
    const evidenceId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    await db.query("insert into public.case_documents(id, case_id, title, created_by) values ($1,$2,'Outcome screenshot',$3)", [documentId, caseId, uid])
    await db.query(
      `insert into public.case_document_versions(
        id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
        storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, created_by
      ) values ($1,$2,1,'outcome.png','image/png',2048,'test-evidence',$3,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)`,
      [evidenceId, documentId, `cases/${caseId}/documents/${documentId}/versions/${evidenceId}`, uid],
    )
    await db.exec("alter table public.cases disable trigger cases_workflow_version")
    await db.query("update public.cases set outcome='RESTORED', work_stage='OUTCOME_REVIEW' where id=$1", [caseId])
    await db.exec("alter table public.cases enable trigger cases_workflow_version")
    const fee = {
      serviceOrderId: orderId, outcomeEvidenceVersionId: evidenceId,
      evidenceNote: "Screenshot of the Google outcome page.",
      approvalReason: "Outcome matches the accepted success definition.",
    }
    await age(31)
    expect(await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", fee, await orderVersion(orderId)])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_obligations where service_order_id=$1", [orderId])).rows[0].n).toBe(0)
    await seedQualifyingChecks(orderId, "https://maps.google.com/?cid=bakery")
    await age(29)
    const approved = await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", fee, await orderVersion(orderId)])
    expect(approved?.status, JSON.stringify(approved)).toBe("success")
    expect(approved?.obligationId).toBeTruthy()

    const guidedCase = crypto.randomUUID()
    await db.query(
      "insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values($1,'PROFILE_RECOVERY',$2,$3,$4,'Guided profile','2026-01-01',now(),now(),'UNDECIDED')",
      [guidedCase, customer, business, location],
    )
    const guided = await offerQuote("GUIDED_RELAUNCH", guidedCase)
    const guidedOrder = String(guided.orderId)
    const obligationId = (await db.query<{ id: string }>("select id from public.payment_obligations where service_order_id=$1 and state<>'VOID'", [guidedOrder])).rows[0].id
    await age(31)
    expect(await rpc("payment_prepare_invoice_v1", [token, obligationId, false])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_invoices where obligation_id=$1", [obligationId])).rows[0].n).toBe(0)
    await age(29)
    const prepared = await rpc("payment_prepare_invoice_v1", [token, obligationId, false])
    expect(prepared?.status, JSON.stringify(prepared)).toBe("success")
    await age(0)
    expect((await rpc("payment_record_invoice_v1", [
      prepared!.providerOperationId, "in_reauth30", "https://invoice.stripe.test/in_reauth30", prepared!.amountMinor, "gbp",
    ]))?.status).toBe("success")
    const fallback = {
      serviceOrderId: guidedOrder, obligationId, expiresAt: actionExpiry(), secretHash: secretHash(),
    }
    await age(31)
    expect(await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", fallback, await orderVersion(guidedOrder)])).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.customer_actions where kind='INVOICE_PAYMENT' and service_order_id=$1", [guidedOrder])).rows[0].n).toBe(0)
    await age(29)
    expect((await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", fallback, await orderVersion(guidedOrder)]))?.status).toBe("success")
    const blankLocation = crypto.randomUUID()
    const blankCase = crypto.randomUUID()
    await db.query(
      "insert into public.locations(id,business_id,country,location_name) values($1,$2,'UK','Missing listing')",
      [blankLocation, business],
    )
    await db.query(
      "insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values($1,'PROFILE_RECOVERY',$2,$3,$4,'Listing was not available.','2026-01-01',now(),now(),'MANAGED')",
      [blankCase, customer, business, blankLocation],
    )
    const blank = await offerQuote("MANAGED_RELAUNCH", blankCase, blankLocation)
    const blankRef = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id=$1", [blankCase])).rows[0].public_ref
    const blankTarget = (await db.query<{ accepted_target_ref: string }>(`
      select qa.accepted_target_ref
      from public.service_orders so
      join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
      where so.id = $1
    `, [blank.orderId])).rows[0].accepted_target_ref
    expect(blankTarget).toBe(`case:${blankRef}`)
    expect(blankTarget).not.toMatch(/^https:\/\//)
    await age(0)
    await seedQualifyingChecks(String(blank.orderId), blankTarget)
    expect((await db.query<{ target_ref: string }>("select target_ref from public.success_baselines where service_order_id=$1", [blank.orderId])).rows[0].target_ref).toBe(blankTarget)
    await db.query("update public.locations set business_profile_url='https://maps.google.com/?cid=appeared-later' where id=$1", [blankLocation])
    await db.exec("begin")
    try {
      await expect(db.query(`
        insert into public.success_baselines(
          request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
          evidence_version_id, recorded_by
        )
        select $1, so.case_id, so.customer_id, so.id, qa.accepted_target_ref, left(cs.issue_description, 500), qv.success_definition, b.evidence_version_id, $2
        from public.service_orders so
        join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
        join public.cases cs on cs.id = so.case_id
        join public.quote_versions qv on qv.id = so.quote_version_id
        join public.success_baselines b on b.service_order_id = so.id
        where so.id = $3
      `, [crypto.randomUUID(), uid, blank.orderId])).rejects.toThrow(/target_changed/)
    } finally {
      await db.exec("rollback")
    }
    await expireSession()
    expect(await rpc("payment_prepare_invoice_v1", [token, obligationId, false])).toMatchObject({ status: "unauthorized" })
    await revokeSession()
    expect(await rpc("admin_payment_command_v1", [token, key(), "approve_success_fee", fee, await orderVersion(orderId)])).toMatchObject({ status: "unauthorized" })
    await age(0)
  }, 60000)

  it("lets every Guard step-up succeed at 29 minutes and stop at 31", async () => {
    await age(0)
    await db.exec("alter table public.price_versions disable trigger price_versions_protect; alter table public.price_versions disable trigger price_versions_overlap;")
    await db.query("update public.price_versions set tax_behaviour='NOT_APPLICABLE' where service_code='RELAUNCH_GUARD' and seed_key is not null")
    await db.exec("alter table public.price_versions enable trigger price_versions_protect; alter table public.price_versions enable trigger price_versions_overlap;")
    const guardPrice = (await db.query<{ id: string }>("select id from public.price_versions where service_code='RELAUNCH_GUARD' and seed_key is not null")).rows[0].id
    await age(31)
    expect(await guard("map_provider_price", { priceVersionId: guardPrice })).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.provider_operations where kind='CREATE_RECURRING_PRICE'")).rows[0].n).toBe(0)
    await age(29)
    const mapped = await guard("map_provider_price", { priceVersionId: guardPrice })
    expect(mapped?.status, JSON.stringify(mapped)).toBe("success")
    expect((await rpc("guard_record_provider_price_map_v1", [mapped!.providerOperationId, guardPrice, "prod_reauth30", "price_reauth30", uid]))?.status).toBe("success")

    await db.query(
      "insert into public.locations(id,business_id,country,location_name,business_profile_url) values($1,$2,'UK','Side Street','https://maps.google.com/?cid=2')",
      [sideLocation, business],
    )
    const high = await paidGuard(location, "high")
    const side = await paidGuard(sideLocation, "side")

    await db.exec("alter table public.price_versions disable trigger price_versions_protect; alter table public.price_versions disable trigger price_versions_overlap;")
    const raised = crypto.randomUUID()
    await db.query(
      "insert into public.price_versions(id,service_code,display_name,amount_minor,currency,payment_model,billing_cadence,billing_unit,effective_from,status,tax_behaviour,created_by,approved_by,approved_at,seed_key) values($1,'RELAUNCH_GUARD','Relaunch Guard',1299,'GBP','RECURRING_MONTHLY','MONTHLY','LOCATION_MONTH',now() + interval '40 days','APPROVED','NOT_APPLICABLE',$2,$2,now(),'TEST_REAUTH_GUARD_UP')",
      [raised, uid],
    )
    await db.exec("alter table public.price_versions enable trigger price_versions_protect; alter table public.price_versions enable trigger price_versions_overlap;")
    const pricePayload = { subscriptionId: high.subscriptionId, priceVersionId: raised, expiresAt: actionExpiry(), secretHash: secretHash() }
    await age(31)
    expect(await guard("issue_price_change_action", pricePayload, await subVersion(high.subscriptionId))).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_price_change_offers where subscription_id=$1", [high.subscriptionId])).rows[0].n).toBe(0)
    await age(29)
    expect((await guard("issue_price_change_action", { ...pricePayload, secretHash: secretHash() }, await subVersion(high.subscriptionId)))?.status).toBe("success")

    await age(31)
    expect(await guard("approve_service_credit", {
      subscriptionId: high.subscriptionId, amountMinor: 100, reason: "Bounded credit for a short outage period.",
    })).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_billing_adjustments where subscription_id=$1 and kind='SERVICE_CREDIT'", [high.subscriptionId])).rows[0].n).toBe(0)
    await age(29)
    expect((await guard("approve_service_credit", {
      subscriptionId: high.subscriptionId, amountMinor: 100, reason: "Bounded credit for a short outage period.",
    }))?.status).toBe("success")

    await age(31)
    expect(await guard("schedule_period_end_cancellation", {
      subscriptionId: high.subscriptionId, reason: "Stop after the paid month.",
    }, await subVersion(high.subscriptionId))).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ requested_cancel_at_period_end: boolean }>("select requested_cancel_at_period_end from public.guard_subscriptions where id=$1", [high.subscriptionId])).rows[0].requested_cancel_at_period_end).toBe(false)
    await age(29)
    expect((await guard("schedule_period_end_cancellation", {
      subscriptionId: high.subscriptionId, reason: "Stop after the paid month.",
    }, await subVersion(high.subscriptionId)))?.status).toBe("success")
    await age(31)
    expect(await guard("undo_scheduled_cancellation", { subscriptionId: high.subscriptionId }, await subVersion(high.subscriptionId))).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ requested_cancel_at_period_end: boolean }>("select requested_cancel_at_period_end from public.guard_subscriptions where id=$1", [high.subscriptionId])).rows[0].requested_cancel_at_period_end).toBe(true)
    await age(29)
    expect((await guard("undo_scheduled_cancellation", { subscriptionId: high.subscriptionId }, await subVersion(high.subscriptionId)))?.status).toBe("success")

    await age(31)
    expect(await guard("request_immediate_cancellation", {
      subscriptionId: side.subscriptionId, reason: "Finance must review a partial refund.",
    }, await subVersion(side.subscriptionId))).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_billing_adjustments where subscription_id=$1", [side.subscriptionId])).rows[0].n).toBe(0)
    await age(29)
    const review = await guard("request_immediate_cancellation", {
      subscriptionId: side.subscriptionId, reason: "Finance must review a partial refund.",
    }, await subVersion(side.subscriptionId))
    expect(review?.status, JSON.stringify(review)).toBe("success")
    const adjustmentId = String(review?.adjustmentId)
    await age(31)
    expect(await guard("approve_refund", { adjustmentId, amountMinor: 100 })).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.guard_refunds where subscription_id=$1", [side.subscriptionId])).rows[0].n).toBe(0)
    await age(29)
    expect((await guard("approve_refund", { adjustmentId, amountMinor: 100 }))?.status).toBe("success")
    await age(31)
    expect(await guard("approve_immediate_cancellation", { subscriptionId: side.subscriptionId }, await subVersion(side.subscriptionId))).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.provider_operations where kind='CANCEL_SUBSCRIPTION_IMMEDIATE' and guard_subscription_id=$1", [side.subscriptionId])).rows[0].n).toBe(0)
    await age(29)
    expect((await guard("approve_immediate_cancellation", { subscriptionId: side.subscriptionId }, await subVersion(side.subscriptionId)))?.status).toBe("success")

    const includedCase = crypto.randomUUID()
    await db.query(
      "insert into public.locations(id,business_id,country,location_name,business_profile_url) values($1,$2,'UK','Lane','https://maps.google.com/?cid=3')",
      [includedLocation, business],
    )
    await db.query(
      "insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values($1,'PROFILE_RECOVERY',$2,$3,$4,'Included guard','2026-01-01',now(),now(),'MANAGED')",
      [includedCase, customer, business, includedLocation],
    )
    const managed = await offerQuote("MANAGED_RELAUNCH", includedCase, includedLocation)
    await db.exec("alter table public.cases disable trigger cases_workflow_version")
    await db.query("update public.cases set status='CLOSED', work_stage='FINISHED', outcome='RESTORED' where id=$1", [includedCase])
    await db.exec("alter table public.cases enable trigger cases_workflow_version")
    const versionId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    await db.query("insert into public.case_documents(id,case_id,title,created_by) values($1,$2,'Outcome evidence',$3)", [documentId, includedCase, uid])
    await db.query(
      "insert into public.case_document_versions(id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,storage_bucket,storage_key,upload_status,scan_status,validation_status,review_status,created_by) values($1,$2,1,'outcome.png','image/png',1200,'evidence-test',$3,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4)",
      [versionId, documentId, `cases/${includedCase}/documents/${documentId}/versions/${versionId}`, uid],
    )
    await seedQualifyingChecks(String(managed.orderId), "https://maps.google.com/?cid=3")
    await db.query(
      "insert into public.success_fee_approvals(service_order_id,case_id,quote_version_id,outcome,success_definition,outcome_evidence_version_id,evidence_note,approval_reason,amount_minor,currency,discount_amount_minor,tax_behaviour,tax_amount_minor,payment_method_ready,approved_by) select o.id,o.case_id,o.quote_version_id,'RESTORED','Restored the listed profile.', $1, 'Outcome evidence accepted after review.', 'Approved after the restored outcome evidence was checked.', o.amount_minor,o.currency,0,o.tax_behaviour,o.tax_amount_minor,false,$2 from public.service_orders o where o.id=$3",
      [versionId, uid, managed.orderId],
    )
    await age(0)
    const offer = await guard("create_included_offer", { caseId: includedCase, serviceOrderId: managed.orderId })
    expect(offer?.status, JSON.stringify(offer)).toBe("success")
    const coverageId = String(offer!.id)
    const readyVersion = await prepareIncluded(coverageId)
    await age(31)
    expect(await guard("activate", { coverageId }, readyVersion)).toMatchObject({ status: "reauth_required" })
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [coverageId])).rows[0].state).not.toBe("ACTIVE")
    await age(29)
    expect((await guard("activate", { coverageId }, readyVersion))?.status).toBe("success")
    expect((await db.query<{ state: string }>("select state from public.guard_coverages where id=$1", [coverageId])).rows[0].state).toBe("ACTIVE")
    await expireSession()
    expect(await guard("activate", { coverageId }, readyVersion)).toMatchObject({ status: "unauthorized" })
    await age(0)
  }, 120000)
})

async function paidGuard(targetLocation: string, suffix: string) {
  const stripeSubscription = `sub_${suffix}`
  const stripeCustomer = `cus_${suffix}`
  const invoiceId = `in_${suffix}`
  const requestId = crypto.randomUUID()
  await db.query(
    "insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,source,intake_snapshot,terms_accepted_at) values($1,$2,$3,$4,$5,'REQUESTED',1,'START_MONITORING','{}',now())",
    [requestId, crypto.randomUUID(), customer, business, targetLocation],
  )
  const orderId = String((await offerQuote("RELAUNCH_GUARD", null, targetLocation)).orderId)
  const mapping = (await db.query<{ id: string }>("select id from public.guard_onboarding_locations where monitoring_request_id=$1 and location_id=$2", [requestId, targetLocation])).rows[0].id
  const created = await guard("create_direct_coverage", { mappingId: mapping, serviceOrderId: orderId })
  expect(created?.status, JSON.stringify(created)).toBe("success")
  const hash = secretHash()
  const issued = await guard("issue_subscription_start_action", { coverageId: created!.id, expiresAt: actionExpiry(), secretHash: hash })
  expect(issued?.status, JSON.stringify(issued)).toBe("success")
  const session = await finishOtp(String(issued!.id), hash)
  expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true, consentVersion: "GUARD_RECURRING_CONSENT_V1" }])).toMatchObject({ status: "success" })
  expect((await rpc("guard_apply_subscription_event_v1", [crypto.randomUUID(), "customer.subscription.created", stripeSubscription, {
    subscriptionId: stripeSubscription, providerStatus: "active", quantity: 1, subscriptionItemId: `si_${suffix}`,
    guardSubscriptionId: issued!.subscriptionId, stripeCustomerId: stripeCustomer,
  }]))?.status).toBe("success")
  const sub = (await db.query<{ amount_minor: number; customer_id: string; service_order_id: string }>(
    "select amount_minor, customer_id, service_order_id from public.guard_subscriptions where id=$1",
    [issued!.subscriptionId],
  )).rows[0]
  expect((await rpc("guard_apply_subscription_event_v1", [crypto.randomUUID(), "invoice.paid", invoiceId, {
    livemode: false, stripeCustomerId: stripeCustomer, subscriptionId: stripeSubscription,
    subscriptionItemId: `si_${suffix}`, priceId: "price_reauth30", quantity: 1,
    amountPaidMinor: sub.amount_minor, amountMinor: sub.amount_minor, currency: "gbp",
    periodStart: new Date().toISOString(), periodEnd: periodEnd(), paymentIntentId: `pi_${suffix}`, chargeId: `ch_${suffix}`,
    guardSubscriptionId: issued!.subscriptionId, customerId: sub.customer_id, serviceOrderId: sub.service_order_id,
  }]))?.status).toBe("success")
  return { subscriptionId: String(issued!.subscriptionId), coverageId: String(created!.id) }
}

async function prepareIncluded(coverageId: string) {
  const mapping = (await db.query<{ id: string; record_version: number }>(
    "select m.id, m.record_version from public.guard_onboarding_locations m join public.guard_coverages g on g.onboarding_location_id=m.id where g.id=$1",
    [coverageId],
  )).rows[0]
  if (mapping) expect((await guard("mark_mapping_ready", { mappingId: mapping.id }, mapping.record_version))?.status).toBe("success")
  const hash = secretHash()
  const issued = await guard("issue_permission_action", { coverageId, expiresAt: actionExpiry(), secretHash: hash })
  expect(issued?.status, JSON.stringify(issued)).toBe("success")
  const session = await finishOtp(String(issued!.id), hash)
  expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }])).toMatchObject({ status: "success" })
  const coverageLocation = (await db.query<{ location_id: string; business_profile_url: string }>(
    "select g.location_id, l.business_profile_url from public.guard_coverages g join public.locations l on l.id=g.location_id where g.id=$1",
    [coverageId],
  )).rows[0]
  await db.query(
    "insert into public.location_manager_access(business_id,location_id,status,access_level,verified_at,verified_by,evidence) values($1,$2,'VERIFIED','MANAGER',now(),$3,$4) on conflict (location_id) do update set status='VERIFIED', verified_at=now(), verified_by=excluded.verified_by, evidence=excluded.evidence, revoked_at=null",
    [business, coverageLocation.location_id, uid, "Manager access confirmed on a live screenshare."],
  )
  const versionOf = async () => (await db.query<{ record_version: number }>("select record_version from public.guard_coverages where id=$1", [coverageId])).rows[0].record_version
  expect((await guard("record_baseline", {
    coverageId, profileUrl: coverageLocation.business_profile_url, displayedBusinessName: "Bakery",
    profileAvailability: "AVAILABLE", notes: "Manual capture of the current profile and review counts.",
  }, await versionOf()))?.status).toBe("success")
  expect((await guard("assign_rota", { coverageId }, await versionOf()))?.status).toBe("success")
  return versionOf()
}
