/**
 * Step 23 security acceptance: whole-schema checks on the privileged surface.
 *
 * The per-domain suites each assert the permissions of the functions they
 * introduced. Nothing checked the schema as a whole, so a function added later
 * without a `search_path` or without its REVOKE could only be caught by
 * reading the migration. These tests enumerate what the chain actually built
 * and hold every object to the same rule, which means a future migration that
 * forgets either one fails here rather than in production.
 *
 * The database is built from the full migration chain in a throwaway in-memory
 * instance. Nothing connects to a Supabase project.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "./recovery/harness"

const db = new PGlite()

type FunctionRow = { schema: string; name: string; args: string; config: string[] | null; kind: string }

async function functions(): Promise<FunctionRow[]> {
  const result = await db.query<FunctionRow>(`
    select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
           p.proconfig as config, p.prokind as kind
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'admin_private')
    order by n.nspname, p.proname, args`)
  return result.rows
}

async function executable(role: string): Promise<string[]> {
  const result = await db.query<{ signature: string }>(`
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'admin_private')
      and p.prokind = 'f'
      and has_function_privilege($1, p.oid, 'EXECUTE')
    order by 1`, [role])
  return result.rows.map(row => row.signature)
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 120000)
afterAll(async () => { await db.close() })

describe("schema-wide database hardening", () => {
  it("builds the privileged surface the rest of these checks inspect", async () => {
    const all = await functions()
    expect(all.filter(row => row.schema === "public").length).toBeGreaterThan(50)
    expect(all.filter(row => row.schema === "admin_private").length).toBeGreaterThan(50)
  })

  it("pins search_path on every function, so none resolves names through the caller's path", async () => {
    // A SECURITY DEFINER function without a pinned search_path can be made to
    // call an attacker's object by a caller who can create one. Pinning it on
    // every function, definer or not, removes the question entirely.
    const unpinned = (await functions())
      .filter(row => !(row.config ?? []).some(entry => entry.startsWith("search_path=")))
      .map(row => `${row.schema}.${row.name}(${row.args})`)
    expect(unpinned).toEqual([])
  })

  it("exposes nothing in the schema PostgREST can reach to anonymous or signed-in roles", async () => {
    // Every caller, including the marketing intake forms, reaches the database
    // through the service key from a server route. The browser never speaks to
    // PostgREST, so even the public intake functions stay unreachable by the
    // roles an API key would select.
    for (const role of ["anon", "authenticated"]) {
      expect((await executable(role)).filter(signature => signature.startsWith("public."))).toEqual([])
    }
  })

  it("keeps the whole admin_private schema out of reach of anonymous and signed-in roles", async () => {
    // The helpers inside admin_private keep PostgreSQL's default EXECUTE grant
    // to PUBLIC, so a privilege-bit check alone reads as permissive. USAGE on
    // the schema is the gate that actually decides, and it is withheld, so the
    // call cannot be made. The next test proves that by making it.
    for (const role of ["anon", "authenticated"]) {
      const usage = await db.query<{ ok: boolean }>("select has_schema_privilege($1, 'admin_private', 'USAGE') as ok", [role])
      expect(usage.rows[0].ok).toBe(false)
    }
  })

  it("refuses an actual call from the anonymous and signed-in roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const statement of [
        "select admin_private.contact_verified_v1('11111111-1111-4111-8111-111111111111','email')",
        "select public.admin_session_v1('token')",
        "select public.admin_dashboard_today_v1('token','today')",
        "select * from public.cases",
        "select * from admin_private.jobs",
      ]) {
        await db.exec(`set role ${role}`)
        await expect(db.query(statement)).rejects.toThrow(/permission denied/i)
        await db.exec("reset role")
      }
    }
  })

  it("reaches every admin RPC through the service role and no other", async () => {
    // admin_identity_id_v1 is revoked from service_role as well. It resolves
    // the single Admin identity and is only ever called from inside another
    // SECURITY DEFINER function, so nothing should be able to invoke it
    // directly, including the role the application connects as.
    const internalOnly = ["public.admin_identity_id_v1()"]
    const service = await executable("service_role")
    const adminRpcs = (await functions())
      .filter(row => row.schema === "public" && row.name.startsWith("admin_") && row.kind === "f")
      .map(row => `public.${row.name}(${row.args})`)
    expect(adminRpcs.length).toBeGreaterThan(70)
    expect(adminRpcs.filter(signature => !service.includes(signature))).toEqual(internalOnly)
  })

  it("never grants a table to anonymous or signed-in roles", async () => {
    // Admin data is read through SECURITY DEFINER functions. No PostgREST role
    // should be able to select a row directly even if row-level security were
    // misconfigured on some table.
    for (const role of ["anon", "authenticated"]) {
      const granted = await db.query<{ name: string }>(`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'admin_private') and c.relkind in ('r', 'p', 'v', 'm')
          and (has_table_privilege($1, c.oid, 'SELECT') or has_table_privilege($1, c.oid, 'INSERT')
               or has_table_privilege($1, c.oid, 'UPDATE') or has_table_privilege($1, c.oid, 'DELETE'))
        order by 1`, [role])
      expect(granted.rows.map(row => row.name)).toEqual([])
    }
  })

  it("enables row-level security on every table the chain creates", async () => {
    const unprotected = await db.query<{ name: string }>(`
      select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'admin_private') and c.relkind = 'r' and not c.relrowsecurity
      order by 1`)
    expect(unprotected.rows.map(row => row.name)).toEqual([])
  })

  it("does not carry the pre-repository helpers a rebuilt project must not inherit", async () => {
    // `public.set_case_public_ref` and `public.rls_auto_enable` exist on the
    // development project from before this repository held the schema, and the
    // Supabase advisors flag both. No migration creates them, so a project
    // built from this chain does not have them; Step 1 instead created
    // `public.cases_assign_public_ref`, which pins its search_path and is
    // revoked from every role but service_role. Removing them from the
    // development project is a cutover task, recorded for Step 24.
    const legacy = await db.query<{ n: number }>(`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('set_case_public_ref', 'rls_auto_enable')`)
    expect(legacy.rows[0].n).toBe(0)
    const replacement = await db.query<{ config: string[] }>(`
      select p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'cases_assign_public_ref'`)
    expect(replacement.rows[0].config).toEqual(["search_path=public, pg_temp"])
  })
})
