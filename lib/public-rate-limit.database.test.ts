import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const db = new PGlite()
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const clientA = hash("client-a")
const clientB = hash("client-b")

async function rpc(clientHash: string) {
  return (await db.query<{ value: { status?: string } }>(
    "select public.consume_public_rate_limit_v1($1) as value",
    [clientHash],
  )).rows[0].value
}

async function hits(clientHash: string) {
  return (await db.query<{ n: number }>(
    "select cardinality(hits)::int as n from admin_private.public_rate_limit_buckets where client_hash = $1",
    [clientHash],
  )).rows[0]?.n ?? 0
}

beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;")
  const sql = readFileSync(new URL("../supabase/migrations/20261013153000_public_request_rate_limit_v1.sql", import.meta.url), "utf8")
  await db.exec(sql)
})

afterAll(async () => { await db.close() })

describe("shared public rate limit", () => {
  it("allows eight requests and rejects the ninth for the same client hash", async () => {
    for (let index = 0; index < 8; index += 1) expect(await rpc(clientA)).toEqual({ status: "ok" })
    expect(await rpc(clientA)).toEqual({ status: "limited" })
    expect(await hits(clientA)).toBe(8)
    expect(await rpc(clientB)).toEqual({ status: "ok" })
    expect(await hits(clientB)).toBe(1)
  })

  it("opens a new window after the recorded hits age out", async () => {
    await db.query(
      `update admin_private.public_rate_limit_buckets
       set hits = array(select now() - interval '11 minutes' from generate_series(1, 8))
       where client_hash = $1`,
      [clientA],
    )
    expect(await rpc(clientA)).toEqual({ status: "ok" })
    expect(await hits(clientA)).toBe(1)
  })

  it("does not store an invalid hash", async () => {
    expect(await rpc("not-a-hash")).toEqual({ status: "unavailable" })
    expect(await rpc(`${clientA.slice(0, 63)}G`)).toEqual({ status: "unavailable" })
    const rows = await db.query<{ n: number }>(
      "select count(*)::int as n from admin_private.public_rate_limit_buckets where client_hash in ('not-a-hash', $1)",
      [`${clientA.slice(0, 63)}G`],
    )
    expect(rows.rows[0].n).toBe(0)
  })

  it("revokes public, anon and authenticated access and keeps the table private", async () => {
    const fn = "public.consume_public_rate_limit_v1(text)"
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, fn])).rows[0].ok).toBe(false)
      expect((await db.query<{ ok: boolean }>(
        "select has_table_privilege($1, 'admin_private.public_rate_limit_buckets', 'SELECT') as ok",
        [role],
      )).rows[0].ok).toBe(false)
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [fn])).rows[0].ok).toBe(true)
    expect((await db.query<{ ok: boolean }>(
      "select has_table_privilege('service_role', 'admin_private.public_rate_limit_buckets', 'SELECT') as ok",
    )).rows[0].ok).toBe(false)
    await db.exec("create role public_rate_probe")
    try {
      expect((await db.query<{ ok: boolean }>(
        "select has_function_privilege('public_rate_probe', $1, 'EXECUTE') as ok",
        [fn],
      )).rows[0].ok).toBe(false)
    } finally {
      await db.exec("drop role public_rate_probe")
    }
    const security = await db.query<{ definer: boolean; config: string[] | null; rls: boolean; policies: number }>(`
      select p.prosecdef as definer, p.proconfig as config, c.relrowsecurity as rls,
             (select count(*)::int from pg_policy pol where pol.polrelid = c.oid) as policies
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_class c on c.relname = 'public_rate_limit_buckets'
      join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'admin_private'
      where n.nspname = 'public' and p.proname = 'consume_public_rate_limit_v1'`)
    expect(security.rows[0].definer).toBe(true)
    expect(security.rows[0].config).toEqual(['search_path=""'])
    expect(security.rows[0].rls).toBe(true)
    expect(Number(security.rows[0].policies)).toBe(0)
    await db.exec("set role anon")
    await expect(db.query("select * from admin_private.public_rate_limit_buckets")).rejects.toThrow(/permission denied/i)
    await expect(db.query("select public.consume_public_rate_limit_v1($1)", [clientA])).rejects.toThrow(/permission denied/i)
    await db.exec("reset role")
  })

  it("deletes clients idle for more than 24 hours and keeps active buckets", async () => {
    const stale = hash("retention-stale")
    const staleHits = hash("retention-stale-hits")
    const recent = hash("retention-recent")
    const recentHit = hash("retention-recent-hit")
    const caller = hash("retention-caller")
    await db.query(
      `insert into admin_private.public_rate_limit_buckets (client_hash, hits, updated_at) values
        ($1, '{}', now() - interval '25 hours'),
        ($2, array[now() - interval '30 hours'], now() - interval '30 hours'),
        ($3, '{}', now() - interval '23 hours'),
        ($4, array[now() - interval '1 hour'], now() - interval '48 hours'),
        ($5, array[now() - interval '48 hours'], now() - interval '48 hours')`,
      [stale, staleHits, recent, recentHit, caller],
    )
    expect(await rpc(caller)).toEqual({ status: "ok" })
    const remaining = new Set((await db.query<{ client_hash: string }>(
      "select client_hash from admin_private.public_rate_limit_buckets where client_hash = any($1::text[])",
      [[stale, staleHits, recent, recentHit, caller]],
    )).rows.map(row => row.client_hash))
    expect(remaining.has(stale)).toBe(false)
    expect(remaining.has(staleHits)).toBe(false)
    expect(remaining.has(recent)).toBe(true)
    expect(remaining.has(recentHit)).toBe(true)
    expect(remaining.has(caller)).toBe(true)
    expect(await hits(caller)).toBe(1)
    expect(await rpc(caller)).toEqual({ status: "ok" })
    expect(await hits(recent)).toBe(0)
    expect(await hits(recentHit)).toBe(1)
  })

  it("removes idle clients in a bounded batch and leaves the caller in place", async () => {
    const idle = Array.from({ length: 40 }, (_, index) => hash(`retention-idle-${index}`))
    for (const clientHash of idle) {
      await db.query(
        "insert into admin_private.public_rate_limit_buckets (client_hash, hits, updated_at) values ($1, '{}', now() - interval '26 hours')",
        [clientHash],
      )
    }
    const keeper = hash("retention-keeper")
    expect(await rpc(keeper)).toEqual({ status: "ok" })
    const countIdle = async () => (await db.query<{ n: number }>(
      "select count(*)::int as n from admin_private.public_rate_limit_buckets where client_hash = any($1::text[])",
      [idle],
    )).rows[0].n
    expect(await countIdle()).toBe(8)
    expect(await hits(keeper)).toBe(1)
    expect(await rpc(keeper)).toEqual({ status: "ok" })
    expect(await countIdle()).toBe(0)
    expect(await hits(keeper)).toBe(2)
  })
})
