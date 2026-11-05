/**
 * Two PostgreSQL sessions preparing the same Telloya offer.
 * PGlite has one connection, so it cannot show one prepare waiting on another.
 */
import { execFile as execFileCb, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
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
const port = "55494"
const admin = "c0b1c000-0000-4000-8000-0000000000aa"
const customer = "c0b1c000-0000-4000-8000-0000000000a1"
const token = "cf".repeat(32)
const reason = "The customer confirmed this commercial offer today."

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

function psqlArgs(stopOnError = true) {
  const args = ["-h", socketDir, "-p", port, "-U", "postgres", "-d", "guardlock", "-X"]
  if (stopOnError) args.push("-v", "ON_ERROR_STOP=1")
  return args
}

async function psql(sql: string) {
  const result = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-t", "-A", "-c", sql], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

function heldSession() {
  const child = spawn("stdbuf", ["-o0", "-e0", join(pgBin!, "psql"), ...psqlArgs(false)], { env: { ...process.env, PAGER: "cat" } })
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
      const errStart = err.length
      child.stdin.write(`${sql}\n\\echo ${mark}\n`)
      const deadline = Date.now() + 20000
      while (!out.slice(start).includes(mark)) {
        if (child.exitCode != null) throw new Error(`psql exited ${child.exitCode}\n${err}\n${out.slice(start)}`)
        if (Date.now() > deadline) throw new Error(`timeout\n${err}\n${out.slice(start)}`)
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      return { stdout: out.slice(start).replace(mark, "").trim(), stderr: err.slice(errStart).trim() }
    },
    end() {
      child.stdin.end()
    },
  }
}

describe.skipIf(!pgBin)("concurrent Telloya offer preparation", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "guardlock-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "guardlock"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file], { timeout: 300000 })
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
    }
    if (root) await rm(root, { recursive: true, force: true })
  })

  it("lets one prepare commit and makes the concurrent prepare conflict", async () => {
    const plan = randomUUID()
    const enquiry = randomUUID()
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${admin}', 'admin@profilerelaunch.com', now()),
        ('c0b1c000-0000-4000-8000-0000000000d1', 'concurrent.guard@example.com', now());
      update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
      insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
      insert into public.customers(id, full_name, email) values ('${customer}', 'Concurrent Owner', 'concurrent.guard@example.com');
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${customer}', 'email', 'concurrent.guard@example.com', '${admin}', '${reason}');
      insert into public.product_catalogue(code, name, kind, status) values
        ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT')
      on conflict (code) do nothing;
      insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values (
        '${plan}', 'TELLOYA', 1, 'GROWTH', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP',
        7900, 'NOT_APPLICABLE', 'TELLOYA-GROWTH-1'
      );
      insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
      values ('${plan}', 'TELLOYA', 1, 'LOCATION');
      insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      ) values (
        '${randomUUID()}', '${plan}', 'GROWTH', 'Growth', 300, false, 7900, 999, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 7900, 999, 25),
        'APPROVED', '${admin}', now()
      );
      update public.plan_versions set status = 'APPROVED', approved_by = '${admin}', approved_at = now() where id = '${plan}';
    `)
    const title = "Telloya service agreement"
    const body = "This agreement covers the named Telloya service for the selected locations only."
    const cancellation = "Cancel in writing before the next billing date."
    const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }]).replace(/'/g, "''")
    await psql(`
      insert into public.commercial_agreement_versions(
        id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
        required_confirmations, status, approved_by, approved_at
      ) values (
        '${randomUUID()}', 'TELLOYA', 'TELLOYA-GROWTH-1', '${title}', '${body}', '${cancellation}',
        admin_private.commercial_agreement_hash_v1('TELLOYA', 'TELLOYA-GROWTH-1', '${title}', '${body}', '${cancellation}', '${confirmations}'::jsonb),
        '${confirmations}'::jsonb, 'APPROVED', '${admin}', now()
      );
      insert into public.enquiries(id, submission_key, fingerprint, source, payload, internal_status, ack_status)
      values (
        '${enquiry}', gen_random_uuid(), md5('concurrent-guard'), 'phone',
        jsonb_build_object(
          'fullName', 'Concurrent Owner', 'email', 'concurrent.guard@example.com', 'phone', '07123456789',
          'businessName', 'Concurrent Shop', 'country', 'United Kingdom', 'service', 'telloya',
          'subject', 'Telloya receptionist', 'details', 'Please set up Telloya for this shop.',
          'source', 'phone', 'planTier', 'growth', 'guardInterested', true, 'guardLocationCount', 2,
          'overageInterested', false
        ),
        'SKIPPED', 'SKIPPED'
      );
    `)
    const call = (operation: string, payload: Record<string, unknown>, version: number) =>
      `select public.admin_commercial_command_v1('${token}', '${randomUUID()}'::uuid, '${operation}', '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb, ${version})::text`
    const opened = JSON.parse(await psql(call("classify", { enquiryId: enquiry, product: "TELLOYA", reason }, 0)))
    expect(opened.status).toBe("success")
    const matched = JSON.parse(await psql(call("match_customer", { enquiryId: enquiry, customerId: customer, reason }, opened.version)))
    expect(matched.status).toBe("success")
    const business = JSON.parse(await psql(call("match_business", {
      enquiryId: enquiry, create: true, name: "Concurrent Shop", website: "", membership: "verified", reason,
    }, matched.version)))
    expect(business.status).toBe("success")
    const located = JSON.parse(await psql(call("select_locations", {
      enquiryId: enquiry, locationIds: [], create: true, locationName: "Concurrent yard", country: "United Kingdom", reason,
    }, business.version)))
    expect(located.status).toBe("success")

    const prepare = (key: string) => `select public.admin_commercial_command_v1('${token}', '${key}'::uuid, 'prepare_offer', '${JSON.stringify({ enquiryId: enquiry, planVersionId: plan, guardLocationIds: [], reason }).replace(/'/g, "''")}'::jsonb, ${located.version})::text;`
    const first = heldSession()
    const second = heldSession()
    try {
      await first.query("BEGIN;")
      await second.query("BEGIN;")
      const left = first.query(prepare(randomUUID()))
      const right = second.query(prepare(randomUUID()))
      const winner = await Promise.race([
        left.then(result => ({ who: "left" as const, result })),
        right.then(result => ({ who: "right" as const, result })),
      ])
      const loser = winner.who === "left" ? right : left
      if (winner.who === "left") await first.query("COMMIT;")
      else await second.query("COMMIT;")
      const loserResult = await loser
      if (winner.who === "left") await second.query("COMMIT;")
      else await first.query("COMMIT;")
      const parsed = [winner.result, loserResult].map(result => {
        const text = result.stdout
        const start = text.indexOf("{")
        const end = text.lastIndexOf("}")
        if (start < 0 || end < start) {
          throw new Error(`prepare did not return JSON\nSTDOUT:\n${text}\nSTDERR:\n${result.stderr}`)
        }
        return JSON.parse(text.slice(start, end + 1))
      })
      expect(parsed.map(item => item.status).sort()).toEqual(["conflict", "success"])
      expect(await psql("select count(*) from public.commercial_subscriptions")).toBe("1")
      expect(await psql("select amount_minor::text from public.commercial_subscriptions")).toBe("7900")
      expect(await psql("select count(*) from public.guard_subscriptions")).toBe("0")
      expect(await psql("select count(*) from public.service_provisions")).toBe("0")
    } finally {
      first.end()
      second.end()
    }
  }, 60000)
})
