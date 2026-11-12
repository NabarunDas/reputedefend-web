/**
 * Local rehearsal of the Telloya admin journey migration.
 * PGlite only. It does not connect to hosted DEV or Production.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../../../apps/admin/lib/recovery/harness"
import { findMigration, migrationHead } from "../../../apps/admin/lib/recovery/manifest"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const token = "a".repeat(64)
const migrationName = "20261112120000_telloya_admin_journey_v1.sql"
const transitionSignature = "public.telloya_admin_demo_transition_v1(text,uuid,integer,text,timestamptz,text,text,text)"

type DemoResult = { status: string; demo_status?: string; version?: number; previous_status?: string }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function enquiry(source = "telloya", createdAt: string | null = null, status = "open"): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into public.enquiries(
      id, submission_key, fingerprint, source, payload, status, assigned, next_action,
      internal_status, ack_status, created_at
    ) values ($1, $2, $3, $4, jsonb_build_object('source', $4::text), $5, false, '', 'SKIPPED', 'SKIPPED', coalesce($6::timestamptz, now()))`,
    [id, randomUUID(), randomUUID(), source, status, createdAt],
  )
  return id
}

async function transition(id: string, version: number, status: string, at: string | null, key: string, session = token, zone = "Europe/London"): Promise<DemoResult> {
  const result = (await rows<{ result: DemoResult }>(
    "select public.telloya_admin_demo_transition_v1($1,$2,$3,$4,$5::timestamptz,$6,'Offline note',$7) as result",
    [session, id, version, status, at, zone, key],
  ))[0]?.result
  if (!result) throw new Error("demo transition returned no row")
  return result
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
  `)
}, 180000)

afterAll(async () => {
  await db.close()
})

describe("Telloya admin journey migration", () => {
  it("is recorded as applied on DEV and closed to customer roles", async () => {
    const source = readFileSync(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url), "utf8")
    expect(source).toContain("Do not apply this file to DEV or Production")
    expect(source).toContain("ON DELETE CASCADE")
    expect(source).not.toContain("telloya_admin_offers")
    expect(source).not.toContain("p_actor_id")
    expect(findMigration(migrationName)).toMatchObject({
      appliedToDev: true,
      containsDataChange: true,
      safeToReplay: false,
    })
    expect(migrationHead.filename).toBe("20261112210000_telloya_offer_draft_v1.sql")
    expect(migrationHead.appliedToDev).toBe(true)
    expect(migrationHead.containsDataChange).toBe(false)
    expect(migrationHead.safeToReplay).toBe(false)
    const privileges = await rows<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, '${transitionSignature}', 'EXECUTE') as allowed
       from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)`,
    )
    expect(privileges).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: false },
      { role: "service_role", allowed: true },
    ])
    const tables = await rows<{ relname: string; relrowsecurity: boolean; delete_rule: string }>(
      `select c.relname, c.relrowsecurity, confdeltype as delete_rule
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_constraint fk on fk.conrelid = c.oid and fk.contype = 'f'
       where n.nspname = 'admin_private'
         and c.relname in ('telloya_admin_demos','telloya_admin_demo_events')
       order by c.relname`,
    )
    expect(tables).toEqual([
      { relname: "telloya_admin_demo_events", relrowsecurity: true, delete_rule: "c" },
      { relname: "telloya_admin_demos", relrowsecurity: true, delete_rule: "c" },
    ])
  })

  it("records a booked and completed demonstration for the signed-in administrator", async () => {
    const id = await enquiry()
    const missing = await transition(randomUUID(), 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-missing-01")
    expect(missing.status).toBe("missing_enquiry")
    const booked = await transition(id, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-book-0001")
    expect(booked).toMatchObject({ status: "recorded", demo_status: "BOOKED", version: 1, previous_status: "NOT_BOOKED" })
    expect(await transition(id, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-book-0001")).toMatchObject({ status: "replay", version: 1 })
    expect(await transition(id, 0, "COMPLETED", "2026-11-20T16:00:00Z", "demo-stale-0001")).toMatchObject({ status: "stale_version" })
    expect(await transition(id, 1, "COMPLETED", null, "demo-empty-0001")).toMatchObject({ status: "invalid_transition" })
    const unzoned = await enquiry()
    expect(await transition(unzoned, 0, "BOOKED", "2026-11-20T16:00:00Z", "demo-zone-0001", token, "Not/AZone")).toMatchObject({ status: "invalid_timezone" })
    const completed = await transition(id, 1, "COMPLETED", "2026-11-20T16:00:00Z", "demo-done-0001")
    expect(completed).toMatchObject({ status: "recorded", demo_status: "COMPLETED", version: 2, previous_status: "BOOKED" })
    const events = await rows<{ actor_id: string; previous_status: string; new_status: string }>(
      "select actor_id, previous_status, new_status from admin_private.telloya_admin_demo_events where enquiry_id = $1 order by id",
      [id],
    )
    expect(events).toEqual([
      { actor_id: admin, previous_status: "NOT_BOOKED", new_status: "BOOKED" },
      { actor_id: admin, previous_status: "BOOKED", new_status: "COMPLETED" },
    ])
    const view = (await rows<{ result: { status: string; demo_status: string; version: number } }>(
      "select public.telloya_admin_demo_v1($1,$2) as result",
      [token, id],
    ))[0]?.result
    expect(view).toMatchObject({ status: "ready", demo_status: "COMPLETED", version: 2 })
  })

  it("rejects a ProfileRelaunch enquiry and a session that is not the signed-in administrator", async () => {
    const other = await enquiry("homepage")
    expect(await transition(other, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-other-0001")).toMatchObject({ status: "not_telloya" })
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.telloya_admin_demos where enquiry_id = $1", [other]))[0]?.n).toBe(0)
    const id = await enquiry()
    expect(await transition(id, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-spoof-0001", "b".repeat(64))).toMatchObject({ status: "unauthorized" })
    expect((await rows<{ result: null }>("select public.telloya_admin_demo_v1($1,$2) as result", ["b".repeat(64), id]))[0]?.result).toBeNull()
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.telloya_admin_demo_events where enquiry_id = $1", [id]))[0]?.n).toBe(0)
  })

  it("returns a cancelled booking to not booked without inventing a completion", async () => {
    const id = await enquiry()
    await transition(id, 0, "BOOKED", "2026-11-22T10:00:00Z", "demo-book-0002")
    const cancelled = await transition(id, 1, "NOT_BOOKED", null, "demo-cancel-01")
    expect(cancelled).toMatchObject({ status: "recorded", demo_status: "NOT_BOOKED", version: 2, previous_status: "BOOKED" })
    const stored = (await rows<{ status: string; scheduled_at: string | null; completed_at: string | null }>(
      "select status, scheduled_at, completed_at from admin_private.telloya_admin_demos where enquiry_id = $1",
      [id],
    ))[0]
    expect(stored).toEqual({ status: "NOT_BOOKED", scheduled_at: null, completed_at: null })
  })

  it("lets an eligible Telloya enquiry with a demonstration be deleted when retention is explicitly enabled", async () => {
    const before = await rows<{ n: number }>("select count(*)::int as n from admin_private.telloya_marketing_enquiry_retention_control")
    expect(before[0]?.n).toBe(0)
    const id = await enquiry("telloya", "2026-01-01T00:00:00Z", "new")
    expect(await transition(id, 0, "BOOKED", "2026-01-02T15:00:00Z", "demo-retain-01")).toMatchObject({ status: "recorded" })
    const disabled = (await rows<{ result: { status: string; deleted: number } }>(
      "select admin_private.telloya_marketing_enquiry_retention_v1(now(), 'execute', 25) as result",
    ))[0]?.result
    expect(disabled).toMatchObject({ status: "disabled", deleted: 0 })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.enquiries where id = $1", [id]))[0]?.n).toBe(1)
    await db.query("insert into admin_private.telloya_marketing_enquiry_retention_control(singleton, destructive_enabled) values (true, true)")
    const executed = (await rows<{ result: { status: string; deleted: number; failed: number } }>(
      "select admin_private.telloya_marketing_enquiry_retention_v1(timestamptz '2026-11-12T12:00:00Z', 'execute', 25) as result",
    ))[0]?.result
    expect(executed).toMatchObject({ status: "complete", failed: 0 })
    expect(executed?.deleted).toBeGreaterThanOrEqual(1)
    expect((await rows<{ n: number }>("select count(*)::int as n from public.enquiries where id = $1", [id]))[0]?.n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.telloya_admin_demos where enquiry_id = $1", [id]))[0]?.n).toBe(0)
    expect((await rows<{ n: number }>("select count(*)::int as n from admin_private.telloya_admin_demo_events where enquiry_id = $1", [id]))[0]?.n).toBe(0)
    await db.query("delete from admin_private.telloya_marketing_enquiry_retention_control")
  })
})
