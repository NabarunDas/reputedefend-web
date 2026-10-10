import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = path.resolve(new URL("../../../..", import.meta.url).pathname)
const prefix = path.join(repoRoot, "infra/aws/backup-cli")
const binary = path.join(prefix, "node_modules/@supabase/cli-linux-x64/bin/supabase")
const runner = readFileSync(path.join(repoRoot, "scripts/prod-db-backup-aws.sh"), "utf8")

function run(args: string[], timeout = 20000) {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` }
}

describe("pinned Supabase CLI smoke", () => {
  it("installs the linux-x64 binary and accepts the runner dump flags", () => {
    const install = spawnSync(
      "npm",
      ["ci", "--ignore-scripts", "--omit=dev", "--prefix", prefix],
      { encoding: "utf8", timeout: 120000 },
    )
    expect(install.status, install.stderr).toBe(0)

    const version = run(["--version"])
    expect(version.status).toBe(0)
    expect(version.output).toContain("2.119.0")

    const help = run(["db", "dump", "--help"])
    expect(help.status).toBe(0)
    for (const flag of ["--db-url", "--file", "--role-only", "--data-only", "--use-copy", "--exclude", "--schema"]) {
      expect(help.output).toContain(flag)
    }
    expect(runner).toContain('db dump --db-url "$db_url" -f backup-set/roles.sql --role-only')
    expect(runner).toContain('db dump --db-url "$db_url" -f backup-set/data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"')
    expect(runner).toContain('db dump --db-url "$db_url" -f backup-set/history_data.sql --use-copy --data-only --schema supabase_migrations')

    const dryRun = run([
      "db", "dump", "--dry-run",
      "--db-url", "postgresql://fixture@127.0.0.1:1/postgres",
      "-f", "/tmp/profilerelaunch-backup-cli-smoke.sql",
      "--data-only", "--use-copy",
      "-x", "storage.buckets_vectors",
      "-x", "storage.vector_indexes",
    ])
    expect(dryRun.status).toBe(0)
    const invocation = dryRun.output.match(/pg_dump \\[\s\S]*?\n\| sed/)?.[0] ?? ""
    expect(invocation).toContain('--exclude-table \\"storage\\".\\"buckets_vectors\\"')
    expect(invocation).toContain('--exclude-table \\"storage\\".\\"vector_indexes\\"')
    expect(invocation).not.toContain("--column-inserts")
    expect(dryRun.output).not.toContain("postgresql://fixture@127.0.0.1:1/postgres")
  }, 180000)
})
