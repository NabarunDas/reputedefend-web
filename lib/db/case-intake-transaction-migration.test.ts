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
    const insert = migration.match(/INSERT INTO public\.cases \(([\s\S]*?)\)\s+VALUES/)?.[1] ?? ""
    expect(insert).toContain("submission_key")
    expect(insert).not.toContain("public_ref")
  })
})
