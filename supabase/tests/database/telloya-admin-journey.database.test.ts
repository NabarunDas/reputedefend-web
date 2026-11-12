/**
 * Local rehearsal of the Telloya admin journey migration.
 * PGlite only. It does not connect to hosted DEV or Production.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../../../apps/admin/lib/recovery/harness"
import { migrationChain } from "../../../apps/admin/lib/recovery/manifest"

const db = new PGlite()
const actor = "11111111-1111-4111-8111-111111111111"
const migrationName = "20261112120000_telloya_admin_journey_v1.sql"

type DemoResult = { status: string; demo_status?: string; version?: number; previous_status?: string }

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function enquiry(): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into public.enquiries(
      id, submission_key, fingerprint, source, payload, status, assigned, next_action,
      internal_status, ack_status
    ) values ($1, $2, $3, 'telloya', '{"source":"telloya"}'::jsonb, 'open', false, '', 'SKIPPED', 'SKIPPED')`,
    [id, randomUUID(), randomUUID()],
  )
  return id
}

async function transition(id: string, version: number, status: string, at: string | null, key: string, actorId: string | null = actor): Promise<DemoResult> {
  const result = (await rows<{ result: DemoResult }>(
    "select public.telloya_admin_demo_transition_v1($1,$2,$3,$4,$5::timestamptz,'Europe/London','Offline note',$6) as result",
    [id, actorId, version, status, at, key],
  ))[0]?.result
  if (!result) throw new Error("demo transition returned no row")
  return result
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 180000)

afterAll(async () => {
  await db.close()
})

describe("Telloya admin journey migration", () => {
  it("is source-only and closed to customer roles", async () => {
    const source = readFileSync(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url), "utf8")
    expect(source).toContain("Do not apply this file to DEV or Production")
    expect(migrationChain.at(-1)?.filename).toBe(migrationName)
    expect(migrationChain.at(-1)?.appliedToDev).toBe(false)
    const privileges = await rows<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, 'public.telloya_admin_demo_transition_v1(uuid,uuid,integer,text,timestamptz,text,text,text)', 'EXECUTE') as allowed
       from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)`,
    )
    expect(privileges).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: false },
      { role: "service_role", allowed: true },
    ])
    const tables = await rows<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_private' and c.relname in ('telloya_admin_demos','telloya_admin_demo_events','telloya_admin_offers')
       order by c.relname`,
    )
    expect(tables).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }, { relrowsecurity: true }])
  })

  it("records a booked and completed demonstration, and rejects a replay, a stale version, and a missing enquiry", async () => {
    const id = await enquiry()
    const missing = await transition(randomUUID(), 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-missing-01")
    expect(missing.status).toBe("missing_enquiry")
    const booked = await transition(id, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-book-0001")
    expect(booked).toMatchObject({ status: "recorded", demo_status: "BOOKED", version: 1, previous_status: "NOT_BOOKED" })
    expect(await transition(id, 0, "BOOKED", "2026-11-20T15:00:00Z", "demo-book-0001")).toMatchObject({ status: "replay", version: 1 })
    expect(await transition(id, 0, "COMPLETED", "2026-11-20T16:00:00Z", "demo-stale-0001")).toMatchObject({ status: "stale_version" })
    expect(await transition(id, 1, "COMPLETED", null, "demo-empty-0001")).toMatchObject({ status: "invalid_transition" })
    const completed = await transition(id, 1, "COMPLETED", "2026-11-20T16:00:00Z", "demo-done-0001")
    expect(completed).toMatchObject({ status: "recorded", demo_status: "COMPLETED", version: 2, previous_status: "BOOKED" })
    expect(await transition(id, 2, "BOOKED", "2026-11-21T09:00:00Z", "demo-again-0001")).toMatchObject({ status: "invalid_transition" })
    const events = await rows<{ previous_status: string; new_status: string }>(
      "select previous_status, new_status from admin_private.telloya_admin_demo_events where enquiry_id = $1 order by id",
      [id],
    )
    expect(events).toEqual([
      { previous_status: "NOT_BOOKED", new_status: "BOOKED" },
      { previous_status: "BOOKED", new_status: "COMPLETED" },
    ])
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
})
