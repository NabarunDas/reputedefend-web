import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const challenge = "a".repeat(64)
const token = "b".repeat(64)
async function rpc(name: string, args: unknown[] = []) {
  const result = await db.query<{ value: unknown }>(`select public.${name}(${args.map((_, i) => `$${i+1}`).join(",")}) as value`, args)
  return result.rows[0].value
}
async function login() {
  expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
  expect(await rpc("admin_attempt_otp_v1", [challenge])).toBe(uid)
  expect(await rpc("admin_finish_otp_v1", [challenge, token, uid])).toBe(true)
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  await db.exec(readFileSync(new URL("../../../../supabase/migrations/20260917000000_single_admin_auth_v1.sql", import.meta.url), "utf8"))
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await db.exec(`truncate public.admin_identity,public.admin_sessions,public.admin_auth_events,auth.users cascade;
    insert into auth.users values ('${uid}','admin@profilerelaunch.com',now(),null,null),('${customer}','customer@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);`)
})
describe("single-admin database security", () => {
  it("creates a session once, stores hashes and lists no token material", async () => {
    await login()
    expect(await rpc("admin_finish_otp_v1", [challenge, "c".repeat(64), uid])).toBe(false)
    expect(await rpc("admin_session_v1", [token])).toMatchObject({userId:uid})
    const sessions = await rpc("admin_list_sessions_v1", [token])
    expect(sessions).toEqual([expect.objectContaining({current:true})])
    expect(JSON.stringify(sessions)).not.toContain(token)
    expect(await rpc("admin_session_v1", ["unknown"])).toBeNull()
  })
  it("enforces 60 second resend delay and an hourly account-wide limit", async () => {
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
    expect(await rpc("admin_begin_otp_v1", ["d".repeat(64)])).toBeNull()
    await db.exec("update public.admin_identity set last_sent_at=now()-interval '61 seconds', sends=10")
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBeNull()
    await db.exec("update public.admin_identity set send_window=now()-interval '61 minutes'")
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
  })
  it("allows only five verification attempts per challenge", async () => {
    await rpc("admin_begin_otp_v1", [challenge])
    for(let i=0;i<5;i++) expect(await rpc("admin_attempt_otp_v1", [challenge])).toBe(uid)
    expect(await rpc("admin_attempt_otp_v1", [challenge])).toBeNull()
  })
  it("does not reset global verification limits on resend", async () => {
    await rpc("admin_begin_otp_v1", [challenge])
    await db.exec("update public.admin_identity set verifications=20,last_sent_at=now()-interval '61 seconds'")
    await rpc("admin_begin_otp_v1", [challenge])
    expect(await rpc("admin_attempt_otp_v1", [challenge])).toBeNull()
  })
  it("rejects expired or mismatched challenges and a customer identity", async () => {
    await rpc("admin_begin_otp_v1", [challenge])
    expect(await rpc("admin_attempt_otp_v1", ["d".repeat(64)])).toBeNull()
    expect(await rpc("admin_finish_otp_v1", [challenge, token, customer])).toBe(false)
    await db.exec("update public.admin_identity set challenge_expires_at=now()-interval '1 second'")
    expect(await rpc("admin_attempt_otp_v1", [challenge])).toBeNull()
    expect(await rpc("admin_finish_otp_v1", [challenge, token, uid])).toBe(false)
  })
  it.each(["enabled=false", "auth_user_id=null"])("immediately denies sessions when %s", async change => {
    await login()
    await db.exec(`update public.admin_identity set ${change}`)
    expect(await rpc("admin_session_v1", [token])).toBeNull()
  })
  it.each(["email='customer@example.com'", "email_confirmed_at=null", "banned_until=now()+interval '1 day'", "deleted_at=now()"])("denies a changed Auth identity: %s", async change => {
    await login()
    await db.exec(`update auth.users set ${change} where id='${uid}'`)
    expect(await rpc("admin_session_v1", [token])).toBeNull()
  })
  it.each(["last_seen_at=now()-interval '31 minutes'", "expires_at=now()-interval '1 second'"])("rejects expired session: %s", async change => {
    await login()
    await db.exec(`update public.admin_sessions set ${change}`)
    expect(await rpc("admin_session_v1", [token])).toBeNull()
  })
  it("deleting the Auth user clears binding and revokes access", async () => {
    await login()
    await db.exec(`delete from auth.users where id='${uid}'`)
    expect(await rpc("admin_session_v1", [token])).toBeNull()
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBeNull()
  })
  it("signs out current or all sessions and invalidates outstanding challenges", async () => {
    await login()
    await db.exec(`insert into public.admin_sessions(token_hash,auth_user_id) values ('${"c".repeat(64)}','${uid}')`)
    expect(await rpc("admin_revoke_sessions_v1", [token,false])).toBe(true)
    expect(await rpc("admin_session_v1", [token])).toBeNull()
    expect(await rpc("admin_session_v1", ["c".repeat(64)])).not.toBeNull()
    expect(await rpc("admin_revoke_sessions_v1", ["c".repeat(64),true])).toBe(true)
    expect(await rpc("admin_session_v1", ["c".repeat(64)])).toBeNull()
  })
  it("does not grant browser roles direct table or RPC access", async () => {
    for(const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query("select * from public.admin_sessions")).rejects.toThrow(/permission denied/)
        await expect(rpc("admin_begin_otp_v1", [challenge])).rejects.toThrow(/permission denied/)
        await expect(rpc("admin_finish_otp_v1", [challenge,token,uid])).rejects.toThrow(/permission denied/)
      } finally { await db.exec("reset role") }
    }
    await db.exec("set role service_role")
    try {
      expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
      await expect(db.query("select * from public.admin_sessions")).rejects.toThrow(/permission denied/)
    } finally { await db.exec("reset role") }
  })
  it("bootstrap binds only an existing confirmed account and refuses rebinding", async () => {
    await db.exec("update public.admin_identity set auth_user_id=null,enabled=false")
    const sql = readFileSync(new URL("../../../../scripts/admin/bind-admin.sql",import.meta.url),"utf8")
    await db.exec(sql)
    expect(await rpc("admin_begin_otp_v1", [challenge])).toBe(uid)
    await expect(db.exec(sql)).rejects.toThrow(/already bound/)
    await db.exec("rollback")
  })
})
