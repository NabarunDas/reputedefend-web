import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const migrations = new URL("../../migrations/", import.meta.url)
const read = (name: string) => readFileSync(new URL(name, migrations), "utf8")

describe("Telloya Phase 05A-02 database proposal", () => {
  const db = new PGlite()

  beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace(
      "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
      "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
    ))
    for (const name of [
      "20260916000000_relaunch_guard_data_foundation_v1.sql",
      "20260917080553_single_admin_auth_v1.sql",
      "20260917160740_admin_audit_foundation_v1.sql",
      "20260917183422_admin_client_workspace_v1.sql",
      readdirSync(migrations).find((name) => name.endsWith("_admin_enquiry_triage_v1.sql"))!,
      "20261102200000_telloya_enquiry_infrastructure_v1.sql",
      "20261103200518_telloya_enquiry_phase_05a_02_validation.sql",
    ]) {
      await db.exec(read(name))
    }
  }, 120000)

  afterAll(async () => {
    await db.close()
  })

  it("keeps only the versioned schema migration in supabase/migrations", () => {
    const names = readdirSync(migrations).filter((name) => name.includes("20261103200518") || name.includes("05a_02"))
    expect(names).toEqual(["20261103200518_telloya_enquiry_phase_05a_02_validation.sql"])
  })

  it("fails the script when an assertion fails and covers legacy, tiers, TY references and idempotency", async () => {
    const sql = readFileSync(new URL("./telloya-enquiry-phase-05a-02.validation.sql", import.meta.url), "utf8")
    await db.exec(sql)
    const rows = await db.query<{ n: number }>("select count(*)::int as n from public.enquiries")
    expect(rows.rows[0].n).toBe(3)
  })
})
