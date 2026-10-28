/**
 * Disposable check for the Guided pack mail-context volatility.
 * Nothing here connects to a live database, publishes a pack, sends mail,
 * or collects a payment.
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
const token = "c".repeat(64)
const signatures = [
  "public.admin_guided_pack_mail_context_v1(text,uuid,uuid)",
  "public.admin_guided_completion_context_v1(text,uuid)",
  "public.admin_managed_notice_context_v1(text,text,uuid,uuid)",
]

type Json = { status?: string; reason?: string; id?: string; recordVersion?: number }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await rows<{ value: T }>(sql, args))[0].value
}

async function inTransaction<T>(readOnly: boolean, run: () => Promise<T>): Promise<T> {
  await db.exec("BEGIN")
  if (readOnly) await db.exec("SET TRANSACTION READ ONLY")
  try {
    const value = await run()
    await db.exec("COMMIT")
    return value
  } catch (error) {
    await db.exec("ROLLBACK")
    throw error
  }
}

async function insertCase(reference: string, track: string) {
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

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at, last_seen_at) values ('${token}', '${admin}', now(), now());
    insert into public.customers(id, full_name, email) values ('${customer}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("Guided pack mail context volatility", () => {
  it("changes only the volatility marker and keeps the session update and privileges", async () => {
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261028223000_admin_pack_mail_context_volatile_v1.sql", import.meta.url), "utf8")
    expect(sql).toContain("ALTER FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) VOLATILE")
    expect(sql).toContain("ALTER FUNCTION public.admin_guided_completion_context_v1(text, uuid) VOLATILE")
    expect(sql).toContain("ALTER FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) VOLATILE")
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.admin_session_v1/)
    expect(sql).not.toContain("PR-26-GHNLB9")
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.admin_guided_pack_mail_context_v1/)
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.admin_guided_completion_context_v1/)
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.admin_managed_notice_context_v1/)
    for (const signature of signatures) {
      const marker = await rows<{ provolatile: string; prosecdef: boolean; proconfig: string[] | null }>(
        `select provolatile, prosecdef, proconfig from pg_proc where oid = '${signature}'::regprocedure`,
      )
      expect(marker).toEqual([{ provolatile: "v", prosecdef: true, proconfig: ["search_path=\"\""] }])
      expect(await rows<{ ok: boolean }>(`select has_function_privilege('anon', '${signature}', 'execute') as ok`)).toEqual([{ ok: false }])
      expect(await rows<{ ok: boolean }>(`select has_function_privilege('authenticated', '${signature}', 'execute') as ok`)).toEqual([{ ok: false }])
      expect(await rows<{ ok: boolean }>(`select has_function_privilege('service_role', '${signature}', 'execute') as ok`)).toEqual([{ ok: true }])
    }
    const session = await rows<{ provolatile: string; def: string }>(
      "select provolatile, pg_get_functiondef(oid) as def from pg_proc where oid = 'public.admin_session_v1(text)'::regprocedure",
    )
    expect(session[0].provolatile).toBe("v")
    expect(session[0].def).toContain("last_seen_at=now()")
    expect(session[0].def).toContain("interval '30 minutes'")
    const stableCallers = await rows<{ signature: string }>(`
      select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog', 'information_schema')
        and p.provolatile = 's'
        and p.prosrc like '%admin_session_v1%'
      order by 1
    `)
    expect(stableCallers.map(row => row.signature)).toEqual([])
  })

  it("follows PostgREST transaction mode: read-only rejects the session update and read-write refreshes it", async () => {
    const marker = await rows<{ provolatile: string }>(`select provolatile from pg_proc where oid = '${signatures[0]}'::regprocedure`)
    expect(marker[0].provolatile).toBe("v")
    const readWrite = marker[0].provolatile === "v"
    await expect(inTransaction(true, () => rpc("admin_session_v1", [token]))).rejects.toThrow(/read-only transaction/)
    await db.exec(`
      create function public.test_stable_session_probe_v1(p_token text)
      returns jsonb language plpgsql stable security definer set search_path = ''
      as $fn$ begin return public.admin_session_v1(p_token); end $fn$;
    `)
    await expect(inTransaction(true, () => rpc("test_stable_session_probe_v1", [token]))).rejects.toThrow(/read-only transaction/)
    await db.exec("drop function public.test_stable_session_probe_v1(text)")

    const managed = await insertCase("PR-26-MXAAAA", "MANAGED")
    const managedPack = await rpc<Json>("admin_prepared_pack_command_v1", [token, randomUUID(), managed, null, null, "create", {}])
    expect(managedPack.status).toBe("success")
    await db.query("update public.admin_sessions set last_seen_at = now() - interval '10 minutes' where token_hash = $1", [token])
    const context = await inTransaction(!readWrite, () => rpc<Json>("admin_guided_pack_mail_context_v1", [token, managed, managedPack.id]))
    expect(context).toEqual({ status: "not_guided" })
    expect(await rows<{ fresh: boolean }>(
      "select last_seen_at > now() - interval '2 minutes' as fresh from public.admin_sessions where token_hash = $1",
      [token],
    )).toEqual([{ fresh: true }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.case_prepared_pack_events where pack_id = $1 and event = 'PACK_PUBLISHED'", [managedPack.id])).toEqual([{ n: 0 }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.guided_pack_announcements where pack_id = $1", [managedPack.id])).toEqual([{ n: 0 }])

    await expect(inTransaction(!readWrite, () => rpc<Json>("admin_guided_pack_mail_context_v1", [token, managed, managedPack.id]))).resolves.toEqual({ status: "not_guided" })
    const guided = await insertCase("PR-26-MXAAAB", "GUIDED")
    const guidedPack = await rpc<Json>("admin_prepared_pack_command_v1", [token, randomUUID(), guided, null, null, "create", {}])
    expect(guidedPack.status).toBe("success")
    const denied = await inTransaction(!readWrite, () => rpc<Json>("admin_guided_pack_mail_context_v1", [token, guided, guidedPack.id]))
    expect(denied).toEqual({ status: "denied", reason: "order" })
    expect(await rows<{ published_at: string | null }>("select published_at from public.case_prepared_packs where id = $1", [guidedPack.id])).toEqual([{ published_at: null }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.communications where case_id = $1", [guided])).toEqual([{ n: 0 }])

    await db.query("update public.admin_sessions set last_seen_at = now() - interval '10 minutes' where token_hash = $1", [token])
    const completion = await inTransaction(!readWrite, () => rpc<Json>("admin_guided_completion_context_v1", [token, managed]))
    expect(completion).toEqual({ status: "not_applicable" })
    expect(await rows<{ fresh: boolean }>(
      "select last_seen_at > now() - interval '2 minutes' as fresh from public.admin_sessions where token_hash = $1",
      [token],
    )).toEqual([{ fresh: true }])

    await db.query("update public.admin_sessions set last_seen_at = now() - interval '10 minutes' where token_hash = $1", [token])
    const notice = await inTransaction(!readWrite, () => rpc<Json>("admin_managed_notice_context_v1", [token, "submission", managed, null]))
    expect(notice).toEqual({ status: "not_applicable" })
    expect(await rows<{ fresh: boolean }>(
      "select last_seen_at > now() - interval '2 minutes' as fresh from public.admin_sessions where token_hash = $1",
      [token],
    )).toEqual([{ fresh: true }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.managed_customer_notices where case_id = $1", [managed])).toEqual([{ n: 0 }])
    expect(await rows<{ n: number }>("select count(*)::int as n from public.communications where case_id = $1", [managed])).toEqual([{ n: 0 }])

    await db.query("update public.admin_sessions set created_at = now() - interval '31 minutes', last_seen_at = now() - interval '10 minutes' where token_hash = $1", [token])
    const reauth = await inTransaction(!readWrite, () => rpc<Json>("admin_managed_notice_context_v1", [token, "submission", managed, null]))
    expect(reauth).toEqual({ status: "reauth_required" })
    expect(await rows<{ fresh: boolean }>(
      "select last_seen_at > now() - interval '2 minutes' as fresh from public.admin_sessions where token_hash = $1",
      [token],
    )).toEqual([{ fresh: true }])
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])

    await db.query("update public.admin_sessions set last_seen_at = now() - interval '31 minutes' where token_hash = $1", [token])
    const stale = await inTransaction(!readWrite, () => rpc<Json>("admin_guided_pack_mail_context_v1", [token, managed, managedPack.id]))
    expect(stale).toEqual({ status: "unauthorized" })
    expect(await rows<{ idle: boolean }>(
      "select last_seen_at < now() - interval '30 minutes' as idle from public.admin_sessions where token_hash = $1",
      [token],
    )).toEqual([{ idle: true }])
    const unknown = await inTransaction(!readWrite, () => rpc<Json>("admin_guided_pack_mail_context_v1", ["d".repeat(64), managed, managedPack.id]))
    expect(unknown).toEqual({ status: "unauthorized" })
    await db.query("update public.admin_sessions set last_seen_at = now() where token_hash = $1", [token])
  })

  it("still rejects the volatile context function when PostgREST would have used a read-only transaction", async () => {
    const managed = await insertCase("PR-26-MXAAAC", "MANAGED")
    const pack = await rpc<Json>("admin_prepared_pack_command_v1", [token, randomUUID(), managed, null, null, "create", {}])
    await expect(inTransaction(true, () => rpc("admin_guided_pack_mail_context_v1", [token, managed, pack.id]))).rejects.toThrow(/read-only transaction/)
    await expect(inTransaction(true, () => rpc("admin_guided_completion_context_v1", [token, managed]))).rejects.toThrow(/read-only transaction/)
    await expect(inTransaction(true, () => rpc("admin_managed_notice_context_v1", [token, "submission", managed, null]))).rejects.toThrow(/read-only transaction/)
    expect(await rows<{ published_at: string | null }>("select published_at from public.case_prepared_packs where id = $1", [pack.id])).toEqual([{ published_at: null }])
  })
})
