/**
 * Two PostgreSQL sessions approving commercial plans.
 * PGlite has one connection, so it cannot show one approval waiting on another.
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
const port = "55493"
const actor = "c0a1c000-0000-4000-8000-0000000000aa"

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

function psqlArgs(database = "tierlock", stopOnError = true) {
  const args = ["-h", socketDir, "-p", port, "-U", "postgres", "-d", database, "-X"]
  if (stopOnError) args.push("-v", "ON_ERROR_STOP=1")
  return args
}

async function psql(sql: string) {
  const result = await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-t", "-A", "-c", sql], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout.trim()
}

function heldSession() {
  const child = spawn("stdbuf", ["-o0", "-e0", join(pgBin!, "psql"), ...psqlArgs("tierlock", false)], { env: { ...process.env, PAGER: "cat" } })
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

async function draft(product: "TELLOYA" | "COMPLETE", tier: string, version: number) {
  const id = randomUUID()
  await psql(`
    insert into public.plan_versions(
      id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values (
      '${id}', '${product}', ${version}, '${tier}', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP',
      4900, 'NOT_APPLICABLE', '${product}-${tier}-${version}'
    );
    insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
    values ('${id}', 'TELLOYA', 1, 'LOCATION');
  `)
  if (product === "COMPLETE") {
    await psql(`insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ('${id}', 'GUARD', 1, 'LOCATION')`)
  }
  return id
}

describe.skipIf(!pgBin)("concurrent tier approvals", () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "tierlock-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "tierlock"])
    const prelude = `create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`
    const combined = [prelude, ...migrationChain.map(entry => migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub))].join("\n")
    const file = join(root, "chain.sql")
    await writeFile(file, combined)
    await execFile(join(pgBin!, "psql"), [...psqlArgs(), "-f", file], { timeout: 180000 })
    await psql(`
      insert into public.product_catalogue(code, name, kind, status) values
        ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
        ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
      on conflict (code) do nothing;
    `)
  }, 300000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it("approves two different tiers while both transactions are open", async () => {
    const basic = await draft("TELLOYA", "BASIC", 1)
    const growth = await draft("TELLOYA", "GROWTH", 2)
    const first = heldSession()
    const second = heldSession()
    await first.query("BEGIN;")
    await second.query("BEGIN;")
    const basicUpdate = first.query(`
      UPDATE public.plan_versions
      SET status = 'APPROVED', approved_by = '${actor}', approved_at = now()
      WHERE id = '${basic}';
    `)
    await new Promise(resolve => setTimeout(resolve, 300))
    const growthUpdate = await second.query(`
      UPDATE public.plan_versions
      SET status = 'APPROVED', approved_by = '${actor}', approved_at = now()
      WHERE id = '${growth}';
    `)
    expect(growthUpdate.stderr).toBe("")
    expect(growthUpdate.stdout).toContain("UPDATE 1")
    await second.query("COMMIT;")
    const basicResult = await basicUpdate
    expect(basicResult.stderr).toBe("")
    expect(basicResult.stdout).toContain("UPDATE 1")
    await first.query("COMMIT;")
    first.end()
    second.end()
    expect(await psql("select count(*)::text from public.plan_versions where product_code = 'TELLOYA' and status = 'APPROVED'")).toBe("2")
  })

  it("lets exactly one of two concurrent approvals keep the same tier", async () => {
    const left = await draft("COMPLETE", "GROWTH", 1)
    const right = await draft("COMPLETE", "GROWTH", 2)
    const first = heldSession()
    const second = heldSession()
    await first.query("BEGIN;")
    await second.query("BEGIN;")
    const winner = first.query(`
      UPDATE public.plan_versions
      SET status = 'APPROVED', approved_by = '${actor}', approved_at = now()
      WHERE id = '${left}';
    `)
    await new Promise(resolve => setTimeout(resolve, 300))
    const loser = second.query(`
      UPDATE public.plan_versions
      SET status = 'APPROVED', approved_by = '${actor}', approved_at = now()
      WHERE id = '${right}';
    `)
    await new Promise(resolve => setTimeout(resolve, 300))
    await first.query("COMMIT;")
    const won = await winner
    const lost = await loser
    expect(won.stdout).toContain("UPDATE 1")
    expect(lost.stderr).toContain("overlapping approved plan versions are not allowed")
    await second.query("ROLLBACK;")
    first.end()
    second.end()
    expect(await psql("select count(*)::text from public.plan_versions where product_code = 'COMPLETE' and status = 'APPROVED' and tier_code = 'GROWTH'")).toBe("1")
  })
})
