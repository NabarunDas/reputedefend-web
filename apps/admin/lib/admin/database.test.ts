import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"
const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222"
const target = "33333333-3333-4333-8333-333333333333", request = "44444444-4444-4444-8444-444444444444"
const token = "a".repeat(64)
async function rpc(name: string, args: unknown[] = []) {
  return (await db.query<{ value: unknown }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}
const revoke = () => rpc("admin_revoke_session_v1", [token, target, request])
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const dir = new URL("../../../../supabase/migrations/", import.meta.url)
  await db.exec(readFileSync(new URL("20260917080553_single_admin_auth_v1.sql", dir), "utf8"))
  // Existing events are backfilled without altering their date or losing their source reference.
  await db.exec(`insert into public.admin_auth_events(auth_user_id,event) values ('${uid}','SIGNED_IN')`)
  await db.exec(readFileSync(new URL(readdirSync(dir).find(name => name.endsWith("_admin_audit_foundation_v1.sql"))!, dir), "utf8"))
  expect((await db.query("select auth_event_id from public.admin_audit_events")).rows).toEqual([{ auth_event_id: 1 }])
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  // Test fixture only: the real app cannot disable triggers, truncate, or access these tables.
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
    truncate public.admin_audit_events,public.admin_sessions,public.admin_identity,public.admin_auth_events,auth.users cascade;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    insert into auth.users values ('${uid}','admin@profilerelaunch.com',now(),null,null),('${other}','customer@example.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
    insert into public.admin_sessions(token_hash,auth_user_id) values ('${token}','${uid}');
    insert into public.admin_sessions(id,token_hash,auth_user_id) values ('${target}','${"b".repeat(64)}','${uid}');`)
})
describe("admin audit and scoped commands", () => {
  it("revokes only the selected session, attributes the actor and rejects replay", async () => {
    expect(await revoke()).toBe("success")
    expect(await rpc("admin_session_v1", ["b".repeat(64)])).toBeNull()
    expect(await rpc("admin_session_v1", [token])).not.toBeNull()
    expect(await revoke()).toBe("conflict")
    const events = await db.query("select actor_id,action,outcome,target_id,request_id from public.admin_audit_events order by id")
    expect(events.rows).toEqual(["success", "conflict"].map(outcome => ({ actor_id: uid, action: "SESSION_REVOKED", outcome, target_id: target, request_id: request })))
  })
  it.each(["revoked_at=now()", "expires_at=now()-interval '1 second'", "last_seen_at=now()-interval '31 minutes'"])("denies an invalid caller: %s", async change => {
    await db.exec(`update public.admin_sessions set ${change} where token_hash='${token}'`)
    expect(await revoke()).toBe("unauthorized")
    expect(await rpc("admin_audit_list_v1", [token])).toBeNull()
    expect((await db.query("select * from public.admin_audit_events")).rows).toHaveLength(0)
  })
  it("rechecks the bound identity even for a valid token", async () => {
    await db.exec("update public.admin_identity set enabled=false")
    expect(await revoke()).toBe("unauthorized")
    expect(await rpc("admin_audit_list_v1", [token])).toBeNull()
  })
  it("requires fresh OTP sign-in and records a rejected action without changing the target", async () => {
    await db.exec(`update public.admin_sessions set created_at=now()-interval '6 minutes' where token_hash='${token}'`)
    expect(await revoke()).toBe("reauth_required")
    expect(await rpc("admin_session_v1", ["b".repeat(64)])).not.toBeNull()
    expect((await db.query("select outcome from public.admin_audit_events")).rows).toEqual([{ outcome: "reauth_required" }])
  })
  it("does not allow ending the current session through this command", async () => {
    const current = (await rpc("admin_session_v1", [token])) as { id: string }
    expect(await rpc("admin_revoke_session_v1", [token, current.id, request])).toBe("denied")
    expect(await rpc("admin_session_v1", [token])).not.toBeNull()
  })
  it.each(["auth_user_id='22222222-2222-4222-8222-222222222222'", "expires_at=now()-interval '1 second'", "last_seen_at=now()-interval '31 minutes'"])("cannot modify unrelated or stale targets: %s", async change => {
    await db.exec(`update public.admin_sessions set ${change} where id='${target}'`)
    expect(await revoke()).toBe("conflict")
    expect((await db.query("select revoked_at from public.admin_sessions where id=$1", [target])).rows).toEqual([{ revoked_at: null }])
  })
  it("rolls back the business change when audit insertion fails", async () => {
    await db.exec("alter table public.admin_audit_events add constraint simulate_audit_failure check (action <> 'SESSION_REVOKED')")
    try {
      await expect(revoke()).rejects.toThrow(/simulate_audit_failure/)
      expect((await db.query("select revoked_at from public.admin_sessions where id=$1", [target])).rows).toEqual([{ revoked_at: null }])
    } finally { await db.exec("alter table public.admin_audit_events drop constraint simulate_audit_failure") }
  })
  it("records existing login/logout actions automatically", async () => {
    await rpc("admin_begin_otp_v1", ["c".repeat(64)])
    await rpc("admin_attempt_otp_v1", ["c".repeat(64)])
    await rpc("admin_finish_otp_v1", ["c".repeat(64), "d".repeat(64), uid])
    await rpc("admin_revoke_sessions_v1", ["d".repeat(64), false])
    await rpc("admin_revoke_sessions_v1", [token, true])
    expect((await db.query("select action from public.admin_audit_events order by id")).rows).toEqual(["SIGNED_IN", "SIGNED_OUT", "SIGNED_OUT_ALL"].map(action => ({ action })))
  })
  it.each(["update public.admin_audit_events set outcome='denied'", "delete from public.admin_audit_events", "truncate public.admin_audit_events"])("prevents audit tampering: %s", async sql => {
    await revoke()
    await expect(db.exec(sql)).rejects.toThrow(/append-only/)
  })
  it("paginates with string IDs and filters without exposing identity or token hashes", async () => {
    await db.exec(`insert into public.admin_auth_events(auth_user_id,event) select '${uid}','SIGNED_IN' from generate_series(1,55)`)
    await revoke()
    const first = await rpc("admin_audit_list_v1", [token, null, "SIGNED_IN", "success"]) as { id: string }[]
    expect(first).toHaveLength(51)
    expect(typeof first[0].id).toBe("string")
    const second = await rpc("admin_audit_list_v1", [token, first[49].id, "SIGNED_IN", "success"]) as { id: string }[]
    expect(second).toHaveLength(5)
    expect(second.every(row => !first.slice(0,50).some(x => x.id === row.id))).toBe(true)
    expect(JSON.stringify(first)).not.toContain(token)
    expect(JSON.stringify(first)).not.toContain(uid)
    await expect(rpc("admin_audit_list_v1", [token, null, "FORGED"])).rejects.toThrow(/Invalid activity filter/)
  })
  it("blocks direct table/writer access and browser RPC access; server RPCs still require a session", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query("select * from public.admin_audit_events")).rejects.toThrow(/permission denied/)
        await expect(db.query("insert into public.admin_audit_events(action,outcome) values ('SIGNED_IN','success')")).rejects.toThrow(/permission denied/)
        await expect(db.query("select admin_private.write_audit_v1(null,'SIGNED_IN','success',null,null)")).rejects.toThrow(/permission denied/)
        if (role !== "service_role") {
          await expect(revoke()).rejects.toThrow(/permission denied/)
          await expect(rpc("admin_audit_list_v1", [token])).rejects.toThrow(/permission denied/)
        } else {
          expect(await rpc("admin_revoke_session_v1", ["x".repeat(64), target, request])).toBe("unauthorized")
          expect(await revoke()).toBe("success")
          expect(await rpc("admin_audit_list_v1", [token])).toHaveLength(1)
        }
      } finally { await db.exec("reset role") }
    }
  })
})
