import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260916000000_relaunch_guard_data_foundation_v1.sql", import.meta.url)),
  "utf8",
)
const baseline = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260915120000_core_data_foundation_v1.sql", import.meta.url)),
  "utf8",
)
const caseIntake = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260915193000_case_intake_transaction_v1.sql", import.meta.url)),
  "utf8",
)

function rpcBody(sql: string) {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.create_monitoring_request_v1(")
  expect(start).toBeGreaterThan(0)
  return sql.slice(start)
}

describe("relaunch guard data foundation migration", () => {
  it("is a new file and does not edit earlier migrations", () => {
    expect(baseline).not.toContain("monitoring_requests")
    expect(caseIntake).not.toContain("monitoring_requests")
    expect(baseline).not.toContain("create_monitoring_request_v1")
    expect(caseIntake).not.toContain("create_monitoring_request_v1")
    expect(migration).toMatch(/CREATE TABLE public\.monitoring_requests/)
    expect(migration).toMatch(/CREATE TABLE public\.monitoring_request_events/)
  })

  it("uniquely keys submission_key and constrains status, locations, and source", () => {
    expect(migration).toMatch(/CONSTRAINT monitoring_requests_submission_key_key UNIQUE \(submission_key\)/)
    expect(migration).toContain("'REQUESTED'")
    expect(migration).toContain("'AWAITING_PAYMENT'")
    expect(migration).toContain("'AWAITING_AUTHORIZATION'")
    expect(migration).toContain("'ACTIVE'")
    expect(migration).toContain("'PAUSED'")
    expect(migration).toContain("'CANCELLED'")
    expect(migration).toMatch(/monitoring_requests_status_allowed CHECK/)
    expect(migration).toMatch(/number_of_locations >= 1 AND number_of_locations <= 1000/)
    expect(migration).toMatch(/monitoring_requests_source_allowed CHECK \(source = 'START_MONITORING'\)/)
    expect(migration).not.toMatch(/source = 'GET_HELP'/)
  })

  it("reuses set_updated_at and enables RLS without anon policies", () => {
    expect(migration).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/)
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.set_updated_at/)
    expect(migration).toContain("ALTER TABLE public.monitoring_requests ENABLE ROW LEVEL SECURITY")
    expect(migration).toContain("ALTER TABLE public.monitoring_request_events ENABLE ROW LEVEL SECURITY")
    expect(migration).not.toMatch(/CREATE POLICY/)
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.monitoring_requests FROM PUBLIC/)
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.monitoring_requests FROM anon/)
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.monitoring_requests FROM authenticated/)
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.monitoring_requests TO service_role/)
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.monitoring_request_events FROM PUBLIC/)
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.monitoring_request_events TO service_role/)
  })

  it("generalises communications to exactly one parent", () => {
    expect(migration).toMatch(/ADD COLUMN monitoring_request_id uuid REFERENCES public\.monitoring_requests/)
    expect(migration).toMatch(/ALTER COLUMN case_id DROP NOT NULL/)
    expect(migration).toMatch(/num_nonnulls\(case_id, monitoring_request_id\) = 1/)
    expect(migration).toMatch(/CREATE INDEX communications_monitoring_request_id_idx/)
    expect(caseIntake).toMatch(/INSERT INTO public\.communications AS customer_comm \(\s*case_id,/)
    expect(baseline).toMatch(/case_id uuid NOT NULL REFERENCES public\.cases/)
  })

  it("defines create_monitoring_request_v1 as SECURITY DEFINER with a safe search_path", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_monitoring_request_v1(")
    expect(migration).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, extensions, pg_temp/)
  })

  it("locks on submission_key before looking up an existing monitoring request", () => {
    const body = rpcBody(migration)
    const lockAt = body.indexOf("pg_advisory_xact_lock")
    const lookupAt = body.indexOf("FROM public.monitoring_requests AS existing_request")
    expect(lockAt).toBeGreaterThan(0)
    expect(lookupAt).toBeGreaterThan(lockAt)
    expect(body).toMatch(/hashtextextended\(p_submission_key::text/)
  })

  it("reuses customers and conservatively matches businesses from cases and monitoring_requests", () => {
    const body = rpcBody(migration)
    expect(body).toMatch(/lower\(existing_customer\.email\) = lower\(v_email\)/)
    expect(body).toMatch(/phone = CASE WHEN v_phone IS NOT NULL THEN v_phone ELSE matched_customer\.phone END/)
    expect(body).toMatch(/FROM public\.cases AS prior_case/)
    expect(body).toMatch(/FROM public\.monitoring_requests AS prior_request/)
    expect(body).toContain("public._intake_norm_text")
    expect(body).toContain("public._intake_norm_url")
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION public\._intake_norm_text/)
    expect(body).toMatch(/_intake_norm_url\(matched_location\.business_profile_url\) = public\._intake_norm_url\(v_profile_url\)/)
  })

  it("inserts the received event and two PENDING communications without creating a case", () => {
    const body = rpcBody(migration)
    expect(body).toContain("'MONITORING_REQUEST_RECEIVED'")
    expect(body).toContain("'SYSTEM'")
    expect(body).toContain("jsonb_build_object('source', 'START_MONITORING')")
    expect(body).toContain("'MONITORING_REQUEST_RECEIVED_CUSTOMER'")
    expect(body).toContain("'MONITORING_REQUEST_RECEIVED_INTERNAL'")
    expect(body).toContain("'PENDING'")
    expect(body).toMatch(/INSERT INTO public\.monitoring_requests AS created_request/)
    expect(body).toMatch(/status,\s+number_of_locations,\s+source/)
    expect(body).toContain("'REQUESTED'")
    expect(body).not.toMatch(/INSERT INTO public\.cases/)
    expect(body).not.toMatch(/generate_case_public_ref/)
    expect(body).not.toMatch(/public_ref/)
    expect(body).not.toMatch(/p_case_type/)
    expect(body).not.toMatch(/INSERT INTO public\.case_events/)
  })

  it("revokes execute from PUBLIC, anon and authenticated and grants service_role", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_monitoring_request_v1\([\s\S]*?\) FROM PUBLIC/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_monitoring_request_v1\([\s\S]*?\) FROM anon/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_monitoring_request_v1\([\s\S]*?\) FROM authenticated/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_monitoring_request_v1\([\s\S]*?\) TO service_role/,
    )
  })

  it("indexes the parent foreign keys used by future portal and admin views", () => {
    expect(migration).toContain("CREATE INDEX monitoring_requests_customer_id_idx")
    expect(migration).toContain("CREATE INDEX monitoring_requests_business_id_idx")
    expect(migration).toContain("CREATE INDEX monitoring_requests_location_id_idx")
    expect(migration).toContain("CREATE INDEX monitoring_requests_status_idx")
    expect(migration).toContain("CREATE INDEX monitoring_requests_created_at_idx")
    expect(migration).toContain("CREATE INDEX monitoring_request_events_request_id_created_at_idx")
  })
})
