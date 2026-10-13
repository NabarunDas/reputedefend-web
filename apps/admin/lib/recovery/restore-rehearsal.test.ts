import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = path.resolve(new URL("../../../..", import.meta.url).pathname)
const scriptPath = path.join(repoRoot, "scripts/recovery/restore-prod-backup-to-sandbox.sh")
const runbookPath = path.join(repoRoot, "docs/admin/production-db-restore-rehearsal.md")
const script = readFileSync(scriptPath, "utf8")
const runbook = readFileSync(runbookPath, "utf8")

describe("SEC-01 isolated restore runbook", () => {
  it("is syntactically valid bash", () => {
    const result = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects a missing backup ID without performing work", () => {
    const result = spawnSync("bash", [scriptPath], { encoding: "utf8" })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("Supply one UTC backup ID")
  })

  it("pins the source and dedicated destination; does not use standard DEV", () => {
    expect(script).toContain('SOURCE_REF="cxwwekdzkkjjbiyofrov"')
    expect(script).toContain('RESTORE_REF="mguynvowyhupycznwbyd"')
    expect(script).not.toContain("rmzozuiamjcclvtgutgd")
    expect(script).toContain('PGUSER="postgres.$RESTORE_REF"')
    expect(script).toContain('PGSSLMODE="require"')
    expect(script).toContain('if [[ "$CHECK" != "postgres|17|0|0|0|false" ]]')
    expect(script).toContain('if [[ "$CONFIRM" != "RESTORE $RESTORE_REF" ]]')
  })

  it("checks checksum and metadata before any SQL restore", () => {
    expect(script.indexOf('sha256sum "$TMP/$ARCHIVE"')).toBeLessThan(
      script.indexOf('=== 7. Restore roles, schema and data'),
    )
    expect(script).toContain('diff -q "$TMP/expected-files" "$TMP/actual-files"')
    expect(script).toContain('.source_project_ref == $source')
    expect(script).toContain('.migration_aligned == true')
    expect(script).toContain('.previous_backup_gap_over_rpo == false')
    expect(script).toContain('cmp -s "$TMP/manifest.json" "$TMP/completed.json"')
  })

  it("fails closed on changes to the one reviewed role grant", () => {
    expect(script).toContain("if len(lines) != 15:")
    expect(script).toContain("lines[12].strip()")
    expect(script).toContain('"log_min_messages"\\s+TO')
    expect(script).toContain('lines[12] = "-- Omitted unsupported')
    expect(script).toContain('sum("log_min_messages" in line.lower() for line in lines) != 1')
    expect(script).toContain("--single-transaction")
    expect(script).toContain("-v ON_ERROR_STOP=1")
  })

  it("documents a non-automated rehearsal and recovery limitations", () => {
    expect(runbook).toContain("Do not rerun")
    expect(runbook).toContain("new reusable utility")
    expect(runbook).toContain("Auth")
    expect(runbook).toContain("61 seconds")
    expect(runbook).toContain("102")
    expect(runbook).toContain("38")
  })
})
