/**
 * Two real PostgreSQL sessions finishing one invited OTP.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 */
import { execFile as execFileCb } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
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
const port = "55474"
const customer = "22222222-2222-4222-8222-222222222222"
const authUser = "66666666-6666-4666-8666-666666666666"
const pendingBusiness = "33333333-3333-4333-8333-333333333333"
const revokedBusiness = "44444444-4444-4444-8444-444444444444"
const email = "invited.concurrent@example.com"
const secret = "a".repeat(64)
const invitation = createHash("sha256").update(secret).digest("hex")
const pendingSecret = "b".repeat(64)
const pending = createHash("sha256").update(pendingSecret).digest("hex")
const sessionA = createHash("sha256").update("c".repeat(64)).digest("hex")
const sessionB = createHash("sha256").update("d".repeat(64)).digest("hex")

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

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "invitedotp",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

describe.skipIf(!pgBin)("simultaneous invited OTP completion", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "invitedotp-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "invitedotp"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    let index = 0
    for (const entry of migrationChain) {
      const file = join(root, `${index}.sql`)
      index += 1
      await writeFile(file, migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "invitedotp",
        "-v", "ON_ERROR_STOP=1", "-f", file,
      ])
    }
    const request = randomUUID()
    await psql(`
      insert into public.product_catalogue(code, name, kind, status) values ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT');
      insert into public.customers(id, full_name, email) values ('${customer}', 'Alex Customer', '${email}');
      insert into auth.users(id, email, email_confirmed_at) values ('${authUser}', '${email}', now());
      insert into public.businesses(id, display_name) values ('${pendingBusiness}', 'Pending Shop'), ('${revokedBusiness}', 'Revoked Shop');
      insert into public.business_memberships(customer_id, business_id, status, evidence) values
        ('${customer}', '${pendingBusiness}', 'pending', 'Membership is waiting for an ownership check.'),
        ('${customer}', '${revokedBusiness}', 'revoked', 'Membership is waiting for an ownership check.');
      insert into public.onboarding_requests(id, customer_id, email_snapshot, product_code, plan_family, state)
        values ('${request}', '${customer}', '${email}', 'TELLOYA', 'VOICE', 'MAILBOX_REQUIRED');
      insert into admin_private.onboarding_invitations(token_hash, onboarding_request_id, email_snapshot, customer_id, expires_at)
        values ('${invitation}', '${request}', '${email}', '${customer}', now() + interval '7 days');
    `)
    const started = await psql(`select public.customer_portal_begin_invited_login_v1('${invitation}', '${pending}')`)
    expect(started).toContain('"status": "ok"')
    const confirmed = await psql(`select public.customer_portal_confirm_invited_otp_sent_v1('${pending}', '${invitation}')`)
    expect(confirmed).toContain('"status": "ok"')
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("lets one completion consume the invitation and refuses the other", async () => {
    const finish = (session: string) => psql(
      `select public.customer_portal_finish_invited_otp_v1('${pending}', '${session}', '${authUser}', '${email}', '${invitation}')`,
    )
    const [left, right] = await Promise.all([finish(sessionA), finish(sessionB)])
    const statuses = [left, right].map(text => JSON.parse(text).status).sort()
    expect(statuses).toEqual(["ok", "unavailable"])
    expect(await psql(
      `select count(*) from public.customer_contact_verifications where customer_id = '${customer}' and proof_kind = 'MAILBOX_OTP' and verified_by is null`,
    )).toBe("1")
    expect(await psql(
      "select count(*) from admin_private.customer_portal_sessions where customer_id = '" + customer + "'",
    )).toBe("1")
    expect(await psql(
      `select send_count::text || ' ' || (consumed_at is not null)::text from admin_private.onboarding_invitations where token_hash = '${invitation}'`,
    )).toBe("0 true")
    expect(await psql(
      `select string_agg(status, ',' order by status) from public.business_memberships where customer_id = '${customer}'`,
    )).toBe("pending,revoked")
    expect(await psql("select count(*) from public.communications")).toBe("0")
    expect(await psql("select count(*) from public.product_entitlements")).toBe("0")
    expect(await psql("select count(*) from public.commercial_subscriptions")).toBe("0")
    expect(await psql("select count(*) from public.commercial_payment_evidence")).toBe("0")
  })
})
