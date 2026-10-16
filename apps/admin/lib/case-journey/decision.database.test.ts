import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, readdirSync } from "node:fs"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const note = "Read the enquiry against the customer and business records."
const reason = "The name and country on the enquiry match the records we hold."

async function rpc(name: string, args: unknown[] = []) {
  // Heterogeneous database JSON results are intentionally inspected in this SQL harness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await db.query<{ value: any }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args)).rows[0].value
}

beforeAll(async () => {
  const migrations = new URL("../../../../supabase/migrations/", import.meta.url)
  for (const name of readdirSync(migrations)) {
    if (name.endsWith(".sql") && readFileSync(new URL(name, migrations), "utf8").includes("admin_case_journey_decision_v1")) {
      throw new Error(`${name} must not carry the unapproved journey function`)
    }
  }
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);`)
  const read = (name: string) => readFileSync(new URL(name, migrations), "utf8")
  await db.exec(read("20260915120000_core_data_foundation_v1.sql").replace(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
    "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  ))
  for (const name of ["20260916000000_relaunch_guard_data_foundation_v1.sql", "20260917080553_single_admin_auth_v1.sql", "20260917160740_admin_audit_foundation_v1.sql", "20260917183422_admin_client_workspace_v1.sql", readdirSync(migrations).find(n => n.endsWith("_admin_enquiry_triage_v1.sql"))!, readdirSync(migrations).find(n => n.endsWith("_admin_case_workflows_v1.sql"))!]) {
    await db.exec(read(name))
  }
  await db.exec(readFileSync(new URL("../../../../docs/admin/proposed-admin-journey-02.sql", import.meta.url), "utf8"))
}, 30000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`alter table public.admin_audit_events disable trigger admin_audit_immutable;
 truncate public.case_tasks,public.case_work_events,public.case_submissions,public.case_submission_results,admin_private.case_command_receipts,public.enquiries,public.enquiry_events,public.admin_audit_events,public.admin_auth_events,public.admin_sessions,public.admin_identity,public.customers,public.businesses,public.locations,public.business_memberships,public.customer_contact_verifications,auth.users cascade;
 alter table public.admin_audit_events enable trigger admin_audit_immutable;
 insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
 insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true);
 insert into public.admin_sessions(token_hash,auth_user_id) values('${token}','${uid}');
 insert into public.customers(id,full_name,email) values('${customer}','Alex','alex@example.com');
 insert into public.businesses(id,display_name) values('${business}','Bakery');
 insert into public.locations(id,business_id,country) values('${location}','${business}','United Kingdom');
 insert into public.cases(id,case_type,customer_id,business_id,location_id,issue_description,intake_snapshot,created_at)
 values('${caseId}','PROFILE_RECOVERY','${customer}','${business}','${location}','The profile disappeared.',
 '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,'2026-01-01');`)
})

const detail = () => rpc("admin_case_detail_v1", [token, caseId, null])
const intakeRead = () => rpc("admin_case_journey_intake_v1", [token, caseId])
const decide = (kind: string, data: Record<string, unknown>, version = 1, request = crypto.randomUUID()) =>
  rpc("admin_case_journey_decision_v1", [token, request, caseId, version, kind, data])

describe("proposed journey decision SQL", () => {
  it("records a reviewed intake once, audits the staff member, and returns the same result on retry", async () => {
    const request = crypto.randomUUID()
    const data = { outcome: "REVIEWED", nextAction: "", note }
    expect((await decide("intake", data, 1, request)).status).toBe("success")
    expect((await decide("intake", data, 1, request)).status).toBe("success")
    expect((await decide("intake", { ...data, note: "A different note that must not replace the first." }, 1, request)).status).toBe("conflict")
    const row = await detail()
    expect(row.stage).toBe("INITIAL_REVIEW")
    expect(row.version).toBe(2)
    expect(row.events).toHaveLength(1)
    expect(row.events[0]).toMatchObject({ event: "INTAKE_REVIEW", visibility: "INTERNAL", details: { outcome: "REVIEWED", nextAction: "" } })
    expect(row.customerPreview.notes).toEqual([])
    const audit = await db.query<{ actor_id: string; action: string; target_id: string; request_id: string }>(
      "select actor_id, action, target_id, request_id from public.admin_audit_events",
    )
    expect(audit.rows).toEqual([{ actor_id: uid, action: "CASE_CHANGED", target_id: caseId, request_id: request }])
    expect((await db.query("select count(*)::int as n from public.customer_contact_verifications")).rows[0]).toMatchObject({ n: 0 })
  })

  it("rejects an unauthorised caller, a closed case, and a stale version", async () => {
    expect((await rpc("admin_case_journey_decision_v1", ["bad", crypto.randomUUID(), caseId, 1, "intake", { outcome: "REVIEWED", nextAction: "", note }])).status).toBe("unauthorized")
    expect(await rpc("admin_case_journey_intake_v1", ["bad", caseId])).toBeNull()
    await db.exec(`update public.cases set status='CLOSED' where id='${caseId}'`)
    const closedVersion = (await detail()).version
    expect((await decide("intake", { outcome: "REVIEWED", nextAction: "", note }, closedVersion)).status).toBe("denied")
    await db.exec(`update public.cases set status='UNDER_REVIEW' where id='${caseId}'`)
    expect((await decide("intake", { outcome: "REVIEWED", nextAction: "", note }, 9)).status).toBe("conflict")
    const privilege = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.admin_case_journey_decision_v1(text,uuid,uuid,integer,text,jsonb)', 'EXECUTE') as ok",
    )
    expect(privilege.rows[0].ok).toBe(false)
  })

  it("stores screening without verifying email or the listing, and refuses a discrepancy or a revoked membership marked complete", async () => {
    const screening = { outcome: "PRELIMINARY_COMPLETE", source: "Public listing", listing: "SUSPENDED_OR_MISSING", website: "NONE", discrepancy: false, reason, note }
    expect((await decide("verification", screening)).status).toBe("success")
    const stored = (await detail()).events[0].details
    expect(stored).toMatchObject({ outcome: "PRELIMINARY_COMPLETE", listing: "SUSPENDED_OR_MISSING", website: "NONE", discrepancy: false })
    expect(stored).not.toHaveProperty("emailVerified")
    expect((await decide("verification", { ...screening, discrepancy: true })).status).toBe("invalid")
    expect((await decide("verification", { ...screening, outcome: "LISTING_UNAVAILABLE", listing: "ACCESSIBLE" })).status).toBe("invalid")
    expect((await decide("verification", { ...screening, emailVerified: true })).status).toBe("invalid")
    await db.exec(`insert into public.business_memberships(customer_id,business_id,status,evidence) values('${customer}','${business}','revoked','Membership was withdrawn after the check.')`)
    expect((await decide("verification", screening, 2)).status).toBe("invalid")
    expect((await decide("verification", { ...screening, outcome: "ESCALATE", discrepancy: true }, 2)).status).toBe("success")
  })

  it("reads the original snapshot and rolls a decision back", async () => {
    const read = await intakeRead()
    expect(read.snapshot.details).toBe("The profile disappeared.")
    expect(read.events).toEqual([])
    await db.exec("BEGIN")
    expect((await decide("intake", { outcome: "INCOMPLETE", nextAction: "Ask for the town", note })).status).toBe("success")
    await db.exec("ROLLBACK")
    expect((await detail()).events).toEqual([])
    expect((await db.query("select count(*)::int as n from public.admin_audit_events")).rows[0]).toMatchObject({ n: 0 })
  })
})
