/**
 * Two real PostgreSQL sessions accepting one quotation at the same time.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 */
import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"
import { migrationChain } from "../recovery/manifest"
import { syntheticPurchasingEstablishmentSql } from "./purchasing-establishment.fixture"
import { SYNTHETIC_APPROVAL_EVIDENCE } from "./paid-service-approval.fixture"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55446"
const alex = "c13b0000-0000-4000-8000-0000000000a1"
const alexAuth = "c13b0000-0000-4000-8000-0000000000d4"
const verifier = "c13b0000-0000-4000-8000-0000000000a7"
const business = "c13b0000-0000-4000-8000-000000000022"
const location = "c13b0000-0000-4000-8000-000000000023"
const adminToken = "b".repeat(64)
const session = "c".repeat(64)

let dataDir = ""
let socketDir = ""

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "com13b",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

describe.skipIf(!pgBin)("paid-service acceptance under two PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "com13b-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "com13b"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    for (const entry of migrationChain) {
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "com13b", "-v", "ON_ERROR_STOP=1",
        "-f", new URL(`../../../../supabase/migrations/${entry.filename}`, import.meta.url).pathname,
      ])
    }
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${alexAuth}', 'alex@example.com', now()),
        ('${verifier}', 'admin@profilerelaunch.com', now());
      insert into public.customers(id, full_name, email) values ('${alex}', 'Alex', 'alex@example.com');
      insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
      insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
        values ('${alex}', 'email', 'alex@example.com', '${verifier}', 'Verified from a live call with the customer.');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
        values ('${alex}', '${business}', 'verified', now(), '${verifier}', 'Companies House match discussed on a live call.');
      update public.admin_identity set auth_user_id = '${verifier}', enabled = true where singleton;
      insert into public.admin_sessions(token_hash, auth_user_id) values ('${adminToken}', '${verifier}');
    `)
    await psql(syntheticPurchasingEstablishmentSql(business, verifier))
    const approved = await psql(`select public.admin_confirm_paid_service_agreement_v1('${adminToken}', '${randomUUID()}', '${SYNTHETIC_APPROVAL_EVIDENCE}')->>'status'`)
    if (approved !== "confirmed") throw new Error(approved)
  }, 180000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  it("creates one order when two sessions accept the same quotation together", async () => {
    const caseId = randomUUID()
    const quoteId = randomUUID()
    const version = randomUUID()
    const actionId = randomUUID()
    const snapshot = randomUUID()
    await psql(`
      insert into public.cases(
        id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description,
        information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at, intake_snapshot
      ) values ('${caseId}', 'PR-26-CNRACE', 'PROFILE_RECOVERY', 'UNDER_REVIEW', '${alex}', '${business}', '${location}',
        'Synthetic issue kept inside the database.', now(), now(), 'GUIDED', 'SERVICE_SELECTION', now(), '{}'::jsonb);
      insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
        policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ('${snapshot}', '${location}', 'NONE', 'UNKNOWN', 'NONE', 'UNPROVEN', 'GUIDED_RELAUNCH', 'NONE', 0,
        'NOT_QUALIFIED', 'SYNTHETIC_PORTAL', 9900, 0, 9900, '${verifier}', 'ADMIN_RECORDED');
      insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
        values ('${quoteId}', 'QT-26-CNRACE', '${alex}', '${business}', '${location}', '${caseId}', 'OFFERED', '${verifier}');
      insert into public.quote_versions(
        id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor,
        currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
      )
      select '${version}', '${quoteId}', 1, 'OFFERED', '${alex}', '${business}', '${location}', '${caseId}', 'GUIDED_RELAUNCH', p.id,
        'GUIDED_RELAUNCH', 'UPFRONT', 'We prepare the service for this location.', 'Work outside this quotation is excluded.',
        'The service terms define when a fee is earned.', 9900, 'NONE', 0, 0, 9900, 'NOT_APPLICABLE', 0, 9900, 'GBP',
        '${snapshot}', now() + interval '30 days', 'Payment follows the accepted service terms.',
        'The paid-service agreement named on this quotation applies.', '${verifier}', now(), '${verifier}'
      from public.price_versions p
      where p.service_code = 'GUIDED_RELAUNCH' and p.status = 'APPROVED'
      order by p.effective_from limit 1;
      update public.quotes set current_version_id = '${version}' where id = '${quoteId}';
      insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ('${actionId}', '${alex}', '${business}', '${location}', '${caseId}', 'QUOTE_ACCEPTANCE', '${version}',
        '${"d".repeat(64)}', 'alex@example.com', now() + interval '2 days', '${verifier}');
      insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at)
        values ('${session}', '${actionId}', '${alexAuth}', now() + interval '1 day');
    `)
    const payload = JSON.stringify({
      quoteVersionId: version,
      businessPurpose: { accepted: true },
      terms: { accepted: true, version: "PS-2026-10-14.2", hash: paidServiceAgreementContentHash },
      feeBasis: null,
    }).replace(/'/g, "''")
    const calls = [randomUUID(), randomUUID()].map(request => psql(
      `select public.accept_paid_service_terms_v1('${session}', '${request}', '${payload}'::jsonb)->>'status'`,
    ))
    const statuses = (await Promise.all(calls)).sort()
    expect(statuses).toEqual(["already_accepted", "success"])
    expect(await psql(`select count(*) from public.service_orders where quote_version_id = '${version}'`)).toBe("1")
    expect(await psql(`select count(*) from public.paid_service_acceptances where quote_version_id = '${version}'`)).toBe("1")
    expect(await psql(`select count(*) from public.payment_obligations where quote_version_id = '${version}'`)).toBe("1")
  }, 60000)
})
