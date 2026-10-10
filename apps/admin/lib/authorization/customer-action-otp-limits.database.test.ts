import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
import { createHash, randomBytes } from "node:crypto"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const key = () => crypto.randomUUID()
const secret = () => randomBytes(32).toString("hex")
const secretHash = (value: string) => createHash("sha256").update(value).digest("hex")
const title = "Managed recovery service agreement"
const bodyText = "This is the owner-approved service wording for this exact case snapshot and must not be invented by the application."
const scopeText = "Restore the listed Google Business Profile for this case only."
const expires = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString()

type RpcResult = { status?: string; email?: string; actionId?: string; kind?: string; maskedEmail?: string }
type Challenge = {
  attempts: number
  sends: number
  pending_hash: string
  last_attempt_at: string | null
  sent_at: string | null
}

async function rpc(name: string, args: unknown[] = []): Promise<RpcResult | null> {
  return (await db.query<{ value: RpcResult | null }>(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
    args,
  )).rows[0].value
}

beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, dir), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
    "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)'; CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')'; CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
  ))
  for (const name of [
    "20260916000000_relaunch_guard_data_foundation_v1.sql",
    "20260917080553_single_admin_auth_v1.sql",
    "20260917160740_admin_audit_foundation_v1.sql",
    "20260917183422_admin_client_workspace_v1.sql",
    readdirSync(dir).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_admin_customer_actions_v1.sql"))!,
    readdirSync(dir).find(n => n.endsWith("_customer_action_otp_limits_v1.sql"))!,
  ]) await db.exec(read(name))
}, 60000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table public.customer_action_events disable trigger customer_action_events_immutable;
    alter table public.authorization_events disable trigger authorization_events_immutable;
    alter table public.location_manager_access_events disable trigger location_manager_access_events_immutable;
    alter table public.agreement_versions disable trigger agreement_versions_immutable;
    truncate public.customer_action_events,public.customer_actions,public.authorization_events,public.authorization_records,public.agreement_versions,public.location_manager_access_events,public.location_manager_access,admin_private.customer_action_sessions,admin_private.customer_action_challenges,admin_private.authorization_command_receipts,admin_private.customer_action_command_receipts,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.business_memberships,public.customer_contact_verifications,public.customers,public.businesses,public.locations,auth.users cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table public.customer_action_events enable trigger customer_action_events_immutable;
    alter table public.authorization_events enable trigger authorization_events_immutable;
    alter table public.location_manager_access_events enable trigger location_manager_access_events_immutable;
    alter table public.agreement_versions enable trigger agreement_versions_immutable;
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into auth.users values('${customerAuth}','alex@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${token}','${uid}',now());
    insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
    insert into public.businesses(id,display_name) values('${business}','Bakery');
    insert into public.locations(id,business_id,country) values('${location}','${business}','UK');
    insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,created_at,information_accurate_at,privacy_accepted_at,service_track) values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','Profile suspended','2026-01-01',now(),now(),'MANAGED');`)
  await db.query(
    "insert into public.customer_contact_verifications(customer_id,channel,verified_value,verified_by,evidence) values($1,'email',$2,$3,$4)",
    [customer, "alex@example.com", uid, "Verified from a live call with the customer."],
  )
  await db.query(
    "insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values($1,$2,'verified',now(),$3,$4)",
    [customer, business, uid, "Companies House match discussed on a live call."],
  )
})

async function challenge(actionId: string): Promise<Challenge | undefined> {
  return (await db.query<Challenge>(
    `select attempts, cardinality(otp_send_attempts)::int as sends, pending_hash, last_attempt_at, sent_at
     from admin_private.customer_action_challenges where action_id = $1`,
    [actionId],
  )).rows[0]
}

async function ageCooldown(actionId: string) {
  await db.query(
    "update admin_private.customer_action_challenges set last_attempt_at = now() - interval '61 seconds' where action_id = $1",
    [actionId],
  )
}

async function openAction() {
  const raw = secret()
  const hash = secretHash(raw)
  const pending = secretHash(secret())
  const created = await rpc("admin_authorization_command_v1", [token, key(), caseId, "create_agreement_action", {
    kind: "SERVICE_AGREEMENT", title, bodyText, scopeText, expiresAt: expires(), secretHash: hash,
  }])
  expect(created?.status).toBe("success")
  expect(await rpc("customer_action_exchange_v1", [created?.id, hash, pending])).toMatchObject({ status: "ok", maskedEmail: "a***@example.com" })
  return { id: created!.id as string, hash, pending, raw }
}

async function sendAndConfirm(pending: string) {
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok", email: "alex@example.com" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toEqual({ status: "ok" })
}

describe("customer action OTP limits", () => {
  it("keeps five failed verification attempts after repeated exchanges", async () => {
    const action = await openAction()
    await sendAndConfirm(action.pending)
    for (let i = 0; i < 5; i++) expect((await rpc("customer_action_attempt_otp_v1", [action.pending]))?.status).toBe("ok")
    expect(await rpc("customer_action_attempt_otp_v1", [action.pending])).toEqual({ status: "unavailable" })
    expect((await challenge(action.id))?.attempts).toBe(5)

    const rotated = secretHash(secret())
    expect(await rpc("customer_action_exchange_v1", [action.id, action.hash, rotated])).toMatchObject({ status: "ok" })
    const again = secretHash(secret())
    expect(await rpc("customer_action_exchange_v1", [action.id, action.hash, again])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_attempt_otp_v1", [action.pending])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_attempt_otp_v1", [again])).toEqual({ status: "unavailable" })
    expect((await challenge(action.id))?.attempts).toBe(5)
    expect((await challenge(action.id))?.pending_hash).toBe(again)
    await ageCooldown(action.id)
    expect(await rpc("customer_action_begin_otp_v1", [again])).toEqual({ status: "unavailable" })
    expect((await challenge(action.id))?.attempts).toBe(5)
    expect(JSON.stringify(await rpc("customer_action_attempt_otp_v1", [again]))).not.toContain("alex@example.com")
  })

  it("keeps the 60-second send cooldown across re-exchange", async () => {
    const action = await openAction()
    expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toEqual({ status: "rate_limited" })
    const before = await challenge(action.id)
    expect(before?.sends).toBe(1)
    const rotated = secretHash(secret())
    expect(await rpc("customer_action_exchange_v1", [action.id, action.hash, rotated])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [rotated])).toEqual({ status: "rate_limited" })
    expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toEqual({ status: "unavailable" })
    const after = await challenge(action.id)
    expect(after?.sends).toBe(1)
    expect(new Date(after!.last_attempt_at!).toISOString()).toBe(new Date(before!.last_attempt_at!).toISOString())
    expect(after?.attempts).toBe(0)
    const requested = await db.query<{ n: number }>(
      "select count(*)::int as n from public.customer_action_events where action_id = $1 and event = 'OTP_REQUESTED'",
      [action.id],
    )
    expect(requested.rows[0].n).toBe(1)
  })

  it("caps OTP sends at five in a rolling 30-minute window and does not reset that cap on exchange", async () => {
    const action = await openAction()
    for (let i = 0; i < 5; i++) {
      if (i > 0) await ageCooldown(action.id)
      expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toMatchObject({ status: "ok" })
    }
    await ageCooldown(action.id)
    expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toEqual({ status: "rate_limited" })
    expect((await challenge(action.id))?.sends).toBe(5)
    const rotated = secretHash(secret())
    expect(await rpc("customer_action_exchange_v1", [action.id, action.hash, rotated])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [rotated])).toEqual({ status: "rate_limited" })
    expect((await challenge(action.id))?.sends).toBe(5)
    await db.query(
      `update admin_private.customer_action_challenges
       set otp_send_attempts = array(select now() - interval '31 minutes' from generate_series(1, 5)),
           last_attempt_at = now() - interval '61 seconds'
       where action_id = $1`,
      [action.id],
    )
    expect(await rpc("customer_action_begin_otp_v1", [rotated])).toMatchObject({ status: "ok" })
    expect((await challenge(action.id))?.sends).toBe(1)
  })

  it("does not restore failed verification attempts when a new code is sent", async () => {
    const action = await openAction()
    await sendAndConfirm(action.pending)
    for (let i = 0; i < 3; i++) expect((await rpc("customer_action_attempt_otp_v1", [action.pending]))?.status).toBe("ok")
    await ageCooldown(action.id)
    expect(await rpc("customer_action_begin_otp_v1", [action.pending])).toMatchObject({ status: "ok" })
    expect((await challenge(action.id))?.attempts).toBe(3)
    expect((await challenge(action.id))?.sent_at).toBeNull()
    expect(await rpc("customer_action_attempt_otp_v1", [action.pending])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_confirm_otp_sent_v1", [action.pending])).toEqual({ status: "ok" })
    expect((await rpc("customer_action_attempt_otp_v1", [action.pending]))?.status).toBe("ok")
    expect((await rpc("customer_action_attempt_otp_v1", [action.pending]))?.status).toBe("ok")
    expect(await rpc("customer_action_attempt_otp_v1", [action.pending])).toEqual({ status: "unavailable" })
    expect((await challenge(action.id))?.attempts).toBe(5)
    const sent = await db.query<{ n: number }>(
      "select count(*)::int as n from public.customer_action_events where action_id = $1 and event = 'OTP_SENT'",
      [action.id],
    )
    expect(sent.rows[0].n).toBe(2)
  })

  it("refuses a fresh budget for an expired, completed, or revoked action", async () => {
    const expired = await openAction()
    await sendAndConfirm(expired.pending)
    await rpc("customer_action_attempt_otp_v1", [expired.pending])
    await db.exec("alter table public.customer_actions disable trigger customer_actions_protect")
    await db.query("update public.customer_actions set expires_at = now() - interval '1 minute' where id = $1", [expired.id])
    await db.exec("alter table public.customer_actions enable trigger customer_actions_protect")
    const expiredPending = secretHash(secret())
    expect(await rpc("customer_action_exchange_v1", [expired.id, expired.hash, expiredPending])).toEqual({ status: "unavailable" })
    expect(await rpc("customer_action_begin_otp_v1", [expired.pending])).toEqual({ status: "unavailable" })
    expect((await challenge(expired.id))?.pending_hash).toBe(expired.pending)
    expect((await challenge(expired.id))?.attempts).toBe(1)
    expect(JSON.stringify(await rpc("customer_action_exchange_v1", [expired.id, expired.hash, expiredPending]))).not.toContain("alex@example.com")

    await db.query(
      "update public.customer_actions set status = 'COMPLETED', completed_at = now() where id = $1",
      [expired.id],
    )
    expect(await rpc("customer_action_exchange_v1", [expired.id, expired.hash, secretHash(secret())])).toEqual({ status: "unavailable" })
    expect((await challenge(expired.id))?.attempts).toBe(1)

    const revoked = await openAction()
    await sendAndConfirm(revoked.pending)
    await rpc("customer_action_attempt_otp_v1", [revoked.pending])
    expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "revoke_action", {
      actionId: revoked.id, confirmed: true, reason: "Customer asked for this action to be withdrawn.",
    }])).toMatchObject({ status: "success" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.customer_action_challenges where action_id = $1", [revoked.id])).rows[0].n).toBe(0)
    expect(await rpc("customer_action_exchange_v1", [revoked.id, revoked.hash, secretHash(secret())])).toEqual({ status: "unavailable" })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.customer_action_challenges where action_id = $1", [revoked.id])).rows[0].n).toBe(0)
  })

  it("still lets a customer finish inside the send and verification limits", async () => {
    const action = await openAction()
    await sendAndConfirm(action.pending)
    expect(await rpc("customer_action_confirm_otp_sent_v1", [action.pending])).toEqual({ status: "ok" })
    expect((await rpc("customer_action_attempt_otp_v1", [action.pending]))?.email).toBe("alex@example.com")
    const session = secretHash(secret())
    expect(await rpc("customer_action_finish_otp_v1", [action.pending, session, customerAuth, "alex@example.com"])).toMatchObject({
      status: "ok", actionId: action.id, kind: "AGREEMENT_ACCEPTANCE",
    })
    expect(await rpc("customer_action_session_v1", [session])).toMatchObject({
      actionId: action.id, maskedEmail: "a***@example.com",
    })
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.customer_action_challenges where action_id = $1", [action.id])).rows[0].n).toBe(0)
    const events = await db.query<{ event: string }>(
      "select event from public.customer_action_events where action_id = $1 and event in ('ACTION_EXCHANGED','OTP_REQUESTED','OTP_SENT') order by id",
      [action.id],
    )
    expect(events.rows.map(row => row.event)).toEqual(["ACTION_EXCHANGED", "OTP_REQUESTED", "OTP_SENT"])
    expect(await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])).toMatchObject({ status: "success" })
    expect(await rpc("customer_action_exchange_v1", [action.id, action.hash, secretHash(secret())])).toEqual({ status: "unavailable" })
  })

  it("preserves signatures, execution grants, row security, and an empty search_path", async () => {
    const functions = [
      "customer_action_exchange_v1(uuid,text,text)",
      "customer_action_begin_otp_v1(text)",
      "customer_action_confirm_otp_sent_v1(text)",
      "customer_action_attempt_otp_v1(text)",
      "customer_action_finish_otp_v1(text,text,uuid,text)",
    ]
    const defined = await db.query<{ signature: string; config: string[] | null; definer: boolean }>(`
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
             p.proconfig as config, p.prosecdef as definer
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'customer_action_%otp%' or p.proname = 'customer_action_exchange_v1')
      order by 1`)
    const argumentTypes = (signature: string) => signature
      .replace(/\b[a-z_][a-z0-9_]*\s+(?=(?:text|uuid|jsonb|integer|boolean|timestamptz)\b)/g, "")
      .replaceAll(" ", "")
    expect(defined.rows.map(row => argumentTypes(row.signature)).sort()).toEqual([...functions].sort())
    for (const row of defined.rows) {
      expect(row.definer).toBe(true)
      expect(row.config).toEqual(['search_path=""'])
    }
    for (const fn of functions) {
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('authenticated',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(true)
    }
    await db.exec("create role otp_limits_probe_role")
    try {
      for (const fn of [...functions, "admin_private.customer_action_lock_pending_v1(text)"]) {
        expect((await db.query<{ ok: boolean }>("select has_function_privilege('otp_limits_probe_role',$1,'EXECUTE') as ok", [fn])).rows[0].ok).toBe(false)
      }
    } finally {
      await db.exec("drop role otp_limits_probe_role")
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect((await db.query<{ ok: boolean }>(
        "select has_function_privilege($1,'admin_private.customer_action_lock_pending_v1(text)','EXECUTE') as ok",
        [role],
      )).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>(
        "select has_table_privilege($1,'admin_private.customer_action_challenges','SELECT') as ok",
        [role],
      )).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>(
        "select has_column_privilege($1,'admin_private.customer_action_challenges','otp_send_attempts','SELECT') as ok",
        [role],
      )).rows[0].ok).toBe(false)
    }
    const security = await db.query<{ rls: boolean; policies: number }>(`
      select c.relrowsecurity as rls,
             (select count(*)::int from pg_policy pol where pol.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'admin_private' and c.relname = 'customer_action_challenges'`)
    expect(security.rows[0].rls).toBe(true)
    expect(Number(security.rows[0].policies)).toBe(0)
    const helper = await db.query<{ config: string[] | null; src: string }>(`
      select p.proconfig as config, p.prosrc as src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'admin_private' and p.proname = 'customer_action_lock_pending_v1'`)
    expect(helper.rows[0].config).toEqual(['search_path=""'])
    expect(helper.rows[0].src.indexOf("FROM public.customer_actions")).toBeLessThan(
      helper.rows[0].src.indexOf("FROM admin_private.customer_action_challenges WHERE action_id"),
    )
    const bodies = await db.query<{ name: string; src: string }>(`
      select p.proname as name, p.prosrc as src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'customer_action_begin_otp_v1','customer_action_confirm_otp_sent_v1',
        'customer_action_attempt_otp_v1','customer_action_finish_otp_v1','customer_action_exchange_v1')`)
    for (const row of bodies.rows) {
      if (row.name === "customer_action_exchange_v1") {
        expect(row.src.indexOf("FROM public.customer_actions")).toBeLessThan(row.src.indexOf("INSERT INTO admin_private.customer_action_challenges"))
        expect(row.src).not.toMatch(/attempts\s*=/)
        expect(row.src).not.toMatch(/last_attempt_at\s*=/)
      } else {
        expect(row.src).not.toMatch(/for update/i)
        expect(row.src).toContain("customer_action_lock_pending_v1")
      }
    }
    await db.exec("set role anon")
    await expect(db.query("select * from admin_private.customer_action_challenges")).rejects.toThrow(/permission denied/i)
    await db.exec("reset role")
  })
})
