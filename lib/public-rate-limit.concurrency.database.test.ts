/**
 * Two or more real PostgreSQL sessions. PGlite has one connection, so it
 * cannot show that a second transaction waits on the bucket row.
 */
import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55434"
const clientHash = createHash("sha256").update("shared-client").digest("hex")

let dataDir = ""
let socketDir = ""

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "sec03",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=15000" } })
  return result.stdout
}

describe.skipIf(!pgBin)("public rate limit under concurrent PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "sec03-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "sec03"])
    await psql("create role anon; create role authenticated; create role service_role bypassrls;")
    await execFile(join(pgBin!, "psql"), [
      "-h", socketDir, "-p", port, "-U", "postgres", "-d", "sec03", "-v", "ON_ERROR_STOP=1",
      "-f", new URL("../supabase/migrations/20261013153000_public_request_rate_limit_v1.sql", import.meta.url).pathname,
    ])
  }, 120000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  it("lets only eight of sixteen concurrent calls through for one client", async () => {
    const calls = Array.from({ length: 16 }, () => psql(
      `select public.consume_public_rate_limit_v1('${clientHash}')->>'status'`,
    ))
    const statuses = (await Promise.all(calls)).map(value => value.trim())
    expect(statuses.filter(status => status === "ok")).toHaveLength(8)
    expect(statuses.filter(status => status === "limited")).toHaveLength(8)
    expect((await psql(
      `select cardinality(hits) from admin_private.public_rate_limit_buckets where client_hash = '${clientHash}'`,
    )).trim()).toBe("8")
  })

  it("keeps concurrent callers and an active bucket while deleting idle rows", async () => {
    const callers = Array.from({ length: 8 }, (_, index) => createHash("sha256").update(`concurrent-caller-${index}`).digest("hex"))
    const stale = Array.from({ length: 5 }, (_, index) => createHash("sha256").update(`concurrent-stale-${index}`).digest("hex"))
    const warm = createHash("sha256").update("concurrent-warm").digest("hex")
    const values = [
      ...stale.map(hash => `('${hash}', '{}', clock_timestamp() - interval '25 hours')`),
      `('${warm}', '{}', clock_timestamp() - interval '1 hour')`,
    ].join(", ")
    await psql(`insert into admin_private.public_rate_limit_buckets (client_hash, hits, updated_at) values ${values}`)
    const statuses = (await Promise.all(callers.map(hash => psql(
      `select public.consume_public_rate_limit_v1('${hash}')->>'status'`,
    )))).map(value => value.trim())
    expect(statuses).toEqual(Array.from({ length: 8 }, () => "ok"))
    for (const hash of callers) {
      expect((await psql(
        `select count(*) from admin_private.public_rate_limit_buckets where client_hash = '${hash}'`,
      )).trim()).toBe("1")
    }
    for (const hash of stale) {
      expect((await psql(
        `select count(*) from admin_private.public_rate_limit_buckets where client_hash = '${hash}'`,
      )).trim()).toBe("0")
    }
    expect((await psql(
      `select count(*) from admin_private.public_rate_limit_buckets where client_hash = '${warm}'`,
    )).trim()).toBe("1")
  })
})
