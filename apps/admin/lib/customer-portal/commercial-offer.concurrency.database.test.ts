/**
 * A plan retirement and a customer acceptance on two PostgreSQL sessions.
 * PGlite has one connection, so it cannot show the acceptance waiting.
 */
import { execFile as execFileCb, spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { migrationSql } from "../recovery/harness"
import { migrationChain } from "../recovery/manifest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55482"
const alex = "a032c000-0000-4000-8000-0000000000a2"
const alexAuth = "a032c000-0000-4000-8000-0000000000d4"
const actor = "a032c000-0000-4000-8000-0000000000aa"
const bakery = "a032c000-0000-4000-8000-000000000022"
const high = "a032c000-0000-4000-8000-000000000032"
const plan = "a032c000-0000-4000-8000-000000000042"
const subscription = "a032c000-0000-4000-8000-000000000052"
const request = "a032c000-0000-4000-8000-000000000062"
const email = "alex.lock@example.com"
const selector = "VC-26-LCK242"
const pending = createHash("sha256").update("pending-lock").digest("hex")
const sessionHash = createHash("sha256").update("session-lock").digest("hex")

let root = ""
let dataDir = ""
let socketDir = ""

const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

function psqlArgs(database = "offerlock") {
  return ["-h", socketDir, "-p", port, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-X"]
}

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    ...psqlArgs(), "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

function heldSession() {
  const child = spawn("stdbuf", [
    "-o0", "-e0", join(pgBin!, "psql"),
    ...psqlArgs(), "-q",
  ], { env: { ...process.env, PAGER: "cat" } })
  let out = ""
  let err = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", chunk => { out += chunk })
  child.stderr.on("data", chunk => { err += chunk })
  return {
    async query(sql: string) {
      const mark = `READY_${randomUUID().replace(/-/g, "")}`
      const start = out.length
      child.stdin.write(`${sql}\n\\echo ${mark}\n`)
      const deadline = Date.now() + 20000
      while (!out.slice(start).includes(mark)) {
        if (child.exitCode != null) throw new Error(`psql exited ${child.exitCode}\n${err}\n${out.slice(start)}`)
        if (Date.now() > deadline) throw new Error(`timeout\n${err}\n${out.slice(start)}`)
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      return out.slice(start).replace(mark, "").trim()
    },
    end() {
      child.stdin.end()
    },
  }
}

describe.skipIf(!pgBin)("concurrent plan retirement and commercial acceptance", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "offerlock-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "offerlock"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file])
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${alexAuth}', '${email}', now()),
        ('${actor}', 'actor.lock@example.com', now());
      insert into public.customers(id, full_name, email) values ('${alex}', 'Alex Baker', '${email}');
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
        ('${alex}', 'email', '${email}', '${actor}', 'Verified from a live call with the customer.');
      insert into public.businesses(id, display_name) values ('${bakery}', 'Harbour Bakery');
      insert into public.locations(id, business_id, country, location_name) values ('${high}', '${bakery}', 'GB', 'High Street');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery');
      insert into public.product_catalogue(code, name, kind, status) values
        ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT')
      on conflict (code) do nothing;
      insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency, amount_minor, tax_behaviour, terms_ref
      ) values (
        '${plan}', 'TELLOYA', 7, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', 'TELLOYA-TERMS-LOCK'
      );
      insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
        values ('${plan}', 'TELLOYA', 1, 'LOCATION');
      update public.plan_versions set status = 'APPROVED', approved_by = '${actor}', approved_at = now() where id = '${plan}';
    `)
    await psql(`
      insert into public.commercial_agreement_versions(
        id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
        required_confirmations, status, approved_by, approved_at
      ) values (
        '${randomUUID()}', 'TELLOYA', 'TELLOYA-TERMS-LOCK', 'Telloya service agreement',
        'This agreement covers the named Telloya service for the selected locations only.',
        'Cancel in writing before the next billing date.',
        admin_private.commercial_agreement_hash_v1(
          'TELLOYA', 'TELLOYA-TERMS-LOCK', 'Telloya service agreement',
          'This agreement covers the named Telloya service for the selected locations only.',
          'Cancel in writing before the next billing date.',
          '[{"key":"business_authority","label":"I can accept this offer for the business."}]'::jsonb
        ),
        '[{"key":"business_authority","label":"I can accept this offer for the business."}]'::jsonb,
        'APPROVED', '${actor}', now()
      );
      insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        '${randomUUID()}', '${plan}', 'GROWTH', 'Growth', 300, false, 4900, null, null,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, null, null),
        'APPROVED', '${actor}', now()
      );
      insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values (
        '${subscription}', '${selector}', '${alex}', '${bakery}', 'VOICE', '${plan}', 'BILLABLE', 'DRAFT',
        4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', 'TELLOYA-TERMS-LOCK'
      );
      insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
        values ('${subscription}', 'TELLOYA', 1, 1);
      update public.commercial_subscriptions set state = 'OFFERED' where id = '${subscription}';
      insert into public.onboarding_requests(
        id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
      ) values (
        '${request}', '${alex}', '${bakery}', '${email}', 'TELLOYA', 'VOICE', 'OFFERED', '${subscription}'
      );
      insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id)
        values ('${request}', '${high}');
    `)
    const started = await psql(`select public.customer_portal_begin_login_v1('${email}', '${pending}')`)
    if (!started.includes('"ok"')) throw new Error(`login did not start: ${started}`)
    const confirmed = await psql(`select public.customer_portal_confirm_otp_sent_v1('${pending}')`)
    if (!confirmed.includes('"ok"')) throw new Error(`otp confirm failed: ${confirmed}`)
    const finished = await psql(`select public.customer_portal_finish_otp_v1('${pending}', '${sessionHash}', '${alexAuth}', '${email}')`)
    if (!finished.includes('"ok"')) throw new Error(`otp finish failed: ${finished}`)
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("lets a retirement that already holds the plan row win over acceptance", async () => {
    const version = await psql(`select record_version::text from public.commercial_subscriptions where id = '${subscription}'`)
    const holder = heldSession()
    await holder.query(`
      BEGIN;
      UPDATE public.plan_versions
      SET status = 'RETIRED', retired_by = '${actor}', retired_at = now()
      WHERE id = '${plan}';
    `)
    const command = execFile(join(pgBin!, "psql"), [
      ...psqlArgs(), "-t", "-A", "-c",
      `select public.customer_portal_commercial_offer_command_v1(
        '${sessionHash}',
        '${randomUUID()}',
        '${selector}',
        jsonb_build_object(
          'offerVersion', ${version},
          'priceMinor', 4900,
          'taxBehaviour', 'NOT_APPLICABLE',
          'taxMinor', null,
          'cadence', 'MONTH',
          'agreementRef', 'TELLOYA-TERMS-LOCK',
          'agreementAccepted', true,
          'recurringConsent', true,
          'confirmations', jsonb_build_object('business_authority', true),
          'conditions', jsonb_build_object(
            'tier', 'Growth',
            'includedMinutes', 300,
            'minutesRollover', false,
            'baseAmountMinor', 4900,
            'guardIncluded', false,
            'guardUnitMinor', null,
            'guardQuantity', 0,
            'overagePermitted', false,
            'overageRateMinor', null,
            'overageOptIn', false,
            'overageCapMinor', null
          )
        )
      )`,
    ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
    let waiting = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const locks = await psql(`
        select count(*)::text from pg_stat_activity
        where datname = 'offerlock'
          and wait_event_type = 'Lock'
          and query like '%customer_portal_commercial_offer_command_v1%'
      `)
      if (locks === "1") {
        waiting = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    expect(waiting).toBe(true)
    await holder.query("COMMIT;")
    holder.end()
    const accepted = await command
    expect(accepted.stdout).toContain("superseded")
    expect(await psql(`select state from public.commercial_subscriptions where id = '${subscription}'`)).toBe("OFFERED")
    expect(await psql("select count(*)::text from public.commercial_offer_acceptances")).toBe("0")
  })
})
