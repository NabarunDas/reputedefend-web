import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260915193000_case_intake_transaction_v1.sql", import.meta.url)),
  "utf8",
)
const baseline = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260915120000_core_data_foundation_v1.sql", import.meta.url)),
  "utf8",
)

describe("case intake transaction migration", () => {
  it("adds submission_key without editing the baseline migration", () => {
    expect(baseline).not.toContain("submission_key")
    expect(migration).toMatch(/ADD COLUMN submission_key uuid/)
    expect(migration).toMatch(/CREATE UNIQUE INDEX cases_submission_key_uidx/)
    expect(migration).toMatch(/WHERE submission_key IS NOT NULL/)
  })

  it("defines create_case_intake_v1 as SECURITY DEFINER with an explicit search_path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_case_intake_v1(")
    expect(migration).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, extensions, pg_temp/)
  })

  it("revokes execute from PUBLIC, anon and authenticated and grants service_role", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_case_intake_v1\([\s\S]*?\) FROM PUBLIC/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_case_intake_v1\([\s\S]*?\) FROM anon/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_case_intake_v1\([\s\S]*?\) FROM authenticated/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_case_intake_v1\([\s\S]*?\) TO service_role/,
    )
  })

  it("inserts the CASE_RECEIVED event and both pending communications", () => {
    expect(migration).toMatch(/event_type,\s+actor_type,\s+event_data/)
    expect(migration).toContain("'CASE_RECEIVED'")
    expect(migration).toContain("'SYSTEM'")
    expect(migration).toContain("'CASE_RECEIVED_CUSTOMER'")
    expect(migration).toContain("'CASE_RECEIVED_INTERNAL'")
    expect(migration).toContain("'PENDING'")
  })

  it("lets the database generate public_ref rather than accepting one from the application", () => {
    expect(migration).not.toMatch(/p_public_ref/)
    const insert = migration.match(/INSERT INTO public\.cases AS created_case \(([\s\S]*?)\)\s+VALUES/)?.[1] ?? ""
    expect(insert).toContain("submission_key")
    expect(insert).not.toContain("public_ref")
    expect(migration).toMatch(/RETURNING\s+created_case\.id,\s+created_case\.public_ref,\s+created_case\.case_type/)
  })

  it("serialises same-key retries with a transaction advisory lock before lookup", () => {
    const lockAt = migration.indexOf("pg_advisory_xact_lock")
    const lookupAt = migration.indexOf("FROM public.cases AS existing_case")
    expect(lockAt).toBeGreaterThan(0)
    expect(lookupAt).toBeGreaterThan(lockAt)
    expect(migration).toMatch(/hashtextextended\(p_submission_key::text/)
    expect(migration).not.toMatch(/#variable_conflict/)
  })

  it("does not treat an arbitrary unique_violation as a submission_key hit", () => {
    expect(migration.match(/EXCEPTION WHEN unique_violation/g)).toHaveLength(1)
    expect(migration).toContain("INSERT INTO public.customers AS new_customer")
    expect(migration).not.toMatch(/INSERT INTO public\.cases AS created_case[\s\S]*EXCEPTION WHEN unique_violation/)
  })

  it("returns the persisted snapshot and communication recipients", () => {
    expect(migration).toMatch(/RETURNS TABLE \([\s\S]*intake_snapshot jsonb/)
    expect(migration).toMatch(/RETURNS TABLE \([\s\S]*customer_communication_recipient text/)
    expect(migration).toMatch(/RETURNS TABLE \([\s\S]*internal_communication_recipient text/)
    expect(migration).toMatch(/intake_snapshot := v_snapshot/)
    expect(migration).toMatch(/customer_communication_recipient := v_customer_recipient/)
    expect(migration).toMatch(/internal_communication_recipient := v_internal_recipient/)
  })
})
