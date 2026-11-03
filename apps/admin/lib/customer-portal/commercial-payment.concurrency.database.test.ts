/**
 * Two real PostgreSQL sessions preparing one commercial checkout.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 */
import { execFile as execFileCb } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { migrationSql } from "../recovery/harness"
import { migrationChain } from "../recovery/manifest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55476"
const alex = "a033b000-0000-4000-8000-0000000000a1"
const alexAuth = "a033b000-0000-4000-8000-0000000000d4"
const actor = "a033b000-0000-4000-8000-0000000000aa"
const bakery = "a033b000-0000-4000-8000-000000000011"
const high = "a033b000-0000-4000-8000-000000000021"
const dock = "a033b000-0000-4000-8000-000000000022"
const email = "alex.concurrent@example.com"
const selector = "VC-26-PAY2AQ"

let root = ""
let dataDir = ""
let socketDir = ""
let session = ""

const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialpay",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

describe.skipIf(!pgBin)("simultaneous commercial checkout preparation", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "commercialpay-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "commercialpay"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    let index = 0
    for (const entry of migrationChain) {
      const file = join(root, `${index}.sql`)
      index += 1
      const { writeFile } = await import("node:fs/promises")
      await writeFile(file, migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "commercialpay",
        "-v", "ON_ERROR_STOP=1", "-f", file,
      ])
    }
    const plan = randomUUID()
    const subscription = randomUUID()
    const request = randomUUID()
    const terms = "TELLOYA-PAY-201"
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${alexAuth}', '${email}', now()),
        ('${actor}', 'actor.concurrent@example.com', now());
      insert into public.customers(id, full_name, email) values ('${alex}', 'Alex Baker', '${email}');
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
        ('${alex}', 'email', '${email}', '${actor}', 'Verified from a live call with the customer.');
      insert into public.businesses(id, display_name) values ('${bakery}', 'Harbour Bakery');
      insert into public.locations(id, business_id, country, location_name) values
        ('${high}', '${bakery}', 'GB', 'High Street'),
        ('${dock}', '${bakery}', 'GB', 'Dock');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
        ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery');
      insert into public.product_catalogue(code, name, kind, status) values ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT');
      insert into public.plan_versions(
        id, product_code, version_number, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values ('${plan}', 'TELLOYA', 41, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 4900, 'NOT_APPLICABLE', '${terms}');
      insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
        values ('${plan}', 'TELLOYA', 2, 'LOCATION');
      update public.plan_versions set status = 'APPROVED', approved_by = '${actor}', approved_at = now() where id = '${plan}';
    `)
    const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }]).replace(/'/g, "''")
    await psql(`
      insert into public.commercial_agreement_versions(
        id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
        required_confirmations, status, approved_by, approved_at
      ) values (
        '${randomUUID()}', 'TELLOYA', '${terms}', 'Telloya service agreement',
        'This agreement covers the named Telloya service for the selected locations only.',
        'Cancel in writing before the next billing date.',
        admin_private.commercial_agreement_hash_v1(
          'TELLOYA', '${terms}', 'Telloya service agreement',
          'This agreement covers the named Telloya service for the selected locations only.',
          'Cancel in writing before the next billing date.',
          '${confirmations}'::jsonb
        ),
        '${confirmations}'::jsonb, 'APPROVED', '${actor}', now()
      );
      insert into public.commercial_subscriptions(
        id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
      ) values (
        '${subscription}', '${selector}', '${alex}', '${bakery}', 'VOICE', '${plan}', 'BILLABLE', 'DRAFT',
        4900, 'GBP', 'NOT_APPLICABLE', 'MONTH', '${terms}'
      );
      insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
        values ('${subscription}', 'TELLOYA', 1, 2);
      update public.commercial_subscriptions set state = 'OFFERED' where id = '${subscription}';
      insert into public.onboarding_requests(
        id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
      ) values ('${request}', '${alex}', '${bakery}', '${email}', 'TELLOYA', 'VOICE', 'OFFERED', '${subscription}');
      insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values
        ('${request}', '${high}'), ('${request}', '${dock}');
      insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        '${randomUUID()}', '${plan}', 'GROWTH', 'Growth', 300, false, 4900, null, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 4900, null, 25),
        'APPROVED', '${actor}', now()
      );
    `)
    const pending = hash(randomBytes(32).toString("hex"))
    const started = JSON.parse(await psql(`select public.customer_portal_begin_login_v1('${email}', '${pending}')`))
    expect(started.status).toBe("ok")
    const confirmed = JSON.parse(await psql(`select public.customer_portal_confirm_otp_sent_v1('${pending}')`))
    expect(confirmed.status).toBe("ok")
    session = hash(randomBytes(32).toString("hex"))
    const finished = JSON.parse(await psql(
      `select public.customer_portal_finish_otp_v1('${pending}', '${session}', '${alexAuth}', '${email}')`,
    ))
    expect(finished.status).toBe("ok")
    const version = await psql(`select record_version::text from public.commercial_subscriptions where id = '${subscription}'`)
    const consent = JSON.stringify({
      offerVersion: Number(version),
      priceMinor: 4900,
      taxBehaviour: "NOT_APPLICABLE",
      taxMinor: null,
      cadence: "MONTH",
      agreementRef: terms,
      agreementAccepted: true,
      recurringConsent: true,
      confirmations: { business_authority: true },
      conditions: {
        tier: "Growth",
        includedMinutes: 300,
        minutesRollover: false,
        baseAmountMinor: 4900,
        guardIncluded: false,
        guardUnitMinor: null,
        guardQuantity: 0,
        overagePermitted: true,
        overageRateMinor: 25,
        overageOptIn: false,
        overageCapMinor: null,
      },
    }).replace(/'/g, "''")
    const accepted = JSON.parse(await psql(
      `select public.customer_portal_commercial_offer_command_v1('${session}', '${randomUUID()}', '${selector}', '${consent}'::jsonb)`,
    ))
    expect(accepted.status).toBe("success")
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("reserves one preparation when two checkout requests arrive together", async () => {
    const prepare = (request: string) => psql(
      `select public.customer_portal_commercial_payment_prepare_v1('${session}', '${request}', '${selector}')`,
    )
    const [left, right] = await Promise.all([prepare(randomUUID()), prepare(randomUUID())])
    const parsed = [left, right].map(text => JSON.parse(text))
    expect(parsed.map(item => item.status).sort()).toEqual(["success", "success"])
    expect(parsed[0].providerOperationId).toBe(parsed[1].providerOperationId)
    expect(parsed[0].priceOperationId).toBe(parsed[1].priceOperationId)
    expect(parsed.map(item => item.existing).sort()).toEqual([false, true])
    expect(await psql("select count(*) from public.commercial_checkout_preparations")).toBe("1")
    expect(await psql("select count(*) from public.provider_operations where purpose = 'COMMERCIAL_PRICE'")).toBe("1")
    expect(await psql("select count(*) from public.provider_operations where purpose = 'COMMERCIAL_CHECKOUT'")).toBe("1")
    expect(await psql(`select state from public.commercial_subscriptions where public_ref = '${selector}'`)).toBe("PAYMENT_PENDING")
    expect(await psql("select count(*) from public.commercial_subscriptions where state = 'ACTIVE'")).toBe("0")
    expect(await psql("select count(*) from public.commercial_payment_evidence")).toBe("0")
    expect(await psql("select count(*) from public.product_entitlements")).toBe("0")
    expect(await psql("select count(*) from public.guard_subscriptions")).toBe("0")
  })
})
