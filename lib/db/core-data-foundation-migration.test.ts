import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260915120000_core_data_foundation_v1.sql", import.meta.url)),
  "utf8",
)

describe("core data foundation migration", () => {
  it("creates all six tables", () => {
    expect(migration).toMatch(/CREATE TABLE public\.customers/)
    expect(migration).toMatch(/CREATE TABLE public\.businesses/)
    expect(migration).toMatch(/CREATE TABLE public\.locations/)
    expect(migration).toMatch(/CREATE TABLE public\.cases/)
    expect(migration).toMatch(/CREATE TABLE public\.case_events/)
    expect(migration).toMatch(/CREATE TABLE public\.communications/)
  })

  it("enables RLS on all six tables", () => {
    for (const table of ["customers", "businesses", "locations", "cases", "case_events", "communications"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(migration).not.toMatch(/CREATE POLICY/)
  })

  it("constrains case types and statuses", () => {
    expect(migration).toContain("PROFILE_RECOVERY")
    expect(migration).toContain("REVIEW_PROTECTION")
    expect(migration).not.toMatch(/case_type IN \([^)]*PROFILE_ACCESS/)
    expect(migration).toContain("RECEIVED")
    expect(migration).toContain("UNDER_REVIEW")
    expect(migration).toContain("AWAITING_CUSTOMER")
    expect(migration).toContain("RECOMMENDATION_READY")
    expect(migration).toContain("CLOSED")
    expect(migration).toContain("CANCELLED")
  })

  it("protects public case references in the database", () => {
    expect(migration).toContain("generate_case_public_ref")
    expect(migration).toContain("UNIQUE (public_ref)")
    expect(migration).toContain("^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$")
    expect(migration).toContain("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.generate_case_public_ref\(text\) FROM PUBLIC/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.generate_case_public_ref\(text\) FROM anon/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.generate_case_public_ref\(text\) FROM authenticated/)
  })

  it("is not wired into the current enquiry path", () => {
    const enquiryRoute = readFileSync(
      fileURLToPath(new URL("../../app/api/enquiry/route.ts", import.meta.url)),
      "utf8",
    )
    const getHelp = readFileSync(
      fileURLToPath(new URL("../../app/get-help/page.tsx", import.meta.url)),
      "utf8",
    )
    expect(enquiryRoute).not.toMatch(/supabase/i)
    expect(getHelp).not.toMatch(/supabase/i)
    expect(enquiryRoute).not.toContain("insertCase")
    expect(getHelp).not.toContain("insertCase")
  })
})
