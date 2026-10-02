import { describe, expect, it } from "vitest"
import { manifestFilenames, migrationChain } from "./manifest"
import { logicalName, mayApplyMigrations, migrationVersion, validateMigrationHistory, type RemoteMigration } from "./history"

const repoFilenames = manifestFilenames()
const appliedChain = migrationChain.filter(entry => entry.appliedToDev)
// Remote history contains only what the dev project actually received. Every
// migration in the tracked chain has now been applied, so this fixture is the
// whole manifest; a reviewed migration still waiting to be applied would be
// absent from it.
const healthyRemote: RemoteMigration[] = appliedChain.map(entry => ({
  version: entry.version,
  name: logicalName(entry.filename),
}))

function codes(result: ReturnType<typeof validateMigrationHistory>): string[] {
  return result.findings.map(finding => finding.code)
}

describe("the migration history validator", () => {
  it("reports a clean chain when the repository, manifest and remote history agree", () => {
    const result = validateMigrationHistory({ repoFilenames, remote: healthyRemote })
    expect(result.status).toBe("clean")
    expect(result.findings).toEqual([])
    expect(result.compared).toBe(appliedChain.length)
    expect(mayApplyMigrations(result)).toBe(true)
  })

  it("has no pending migration now the UX-3 projection is applied", () => {
    const pending = migrationChain.filter(entry => !entry.appliedToDev)
    expect(pending).toEqual([])
    const result = validateMigrationHistory({ repoFilenames, remote: healthyRemote })
    expect(result.status).toBe("clean")
    expect(codes(result)).toEqual([])
    expect(mayApplyMigrations(result)).toBe(true)
  })

  it("refuses to replay the UX-3 projection now that dev has received it", () => {
    // The remote ledger assigned 20261002194215 rather than the version the
    // local CLI generated, so the file was renamed to match. Offering it again
    // must read as a replay of an applied migration, not as a new change.
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261002194215_admin_case_flow_batch_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("fails closed when remote history was never collected", () => {
    const result = validateMigrationHistory({ repoFilenames, remote: null })
    expect(result.status).toBe("blocked")
    expect(codes(result)).toContain("remote_history_unavailable")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("fails closed when remote history cannot be read as versions and names", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: [{ version: "not-a-version", name: "" } as RemoteMigration],
    })
    expect(result.status).toBe("blocked")
    expect(codes(result)).toContain("remote_history_malformed")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("detects an applied migration that is missing from remote history", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote.filter(row => row.version !== "20261001141218"),
    })
    expect(codes(result)).toContain("applied_not_in_remote")
    expect(result.status).toBe("diverged")
  })

  it("detects a remote migration the repository does not provide", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: [...healthyRemote, { version: "20261002090000", name: "applied_out_of_band_v1" }],
    })
    expect(codes(result)).toContain("remote_not_in_repo")
  })

  it("detects a duplicated logical migration in remote history", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: [...healthyRemote, { version: "20261002090000", name: "google_integration_readiness_v1" }],
    })
    expect(codes(result)).toContain("duplicate_logical_migration")
  })

  it("detects the same migration name applied under a different version", () => {
    const drifted = healthyRemote.map(row =>
      row.version === "20261001175315" ? { version: "20261001153235", name: row.name } : row,
    )
    const result = validateMigrationHistory({ repoFilenames, remote: drifted })
    expect(codes(result)).toContain("version_drift")
  })

  it("detects an applied migration that has been renamed in the repository", () => {
    const renamed = repoFilenames.map(name =>
      name === "20261001175315_google_integration_readiness_v1.sql"
        ? "20261001175315_google_integration_readiness_v2.sql"
        : name,
    )
    const result = validateMigrationHistory({ repoFilenames: renamed, remote: healthyRemote })
    expect(codes(result)).toContain("applied_migration_renamed")
  })

  it("detects an applied migration file that has been deleted", () => {
    const result = validateMigrationHistory({
      repoFilenames: repoFilenames.filter(name => !name.startsWith("20261001141218")),
      remote: healthyRemote,
    })
    expect(codes(result)).toContain("applied_file_missing")
  })

  it("detects a repository migration the manifest does not describe", () => {
    const result = validateMigrationHistory({
      repoFilenames: [...repoFilenames, "20261002090000_untracked_change_v1.sql"],
      remote: healthyRemote,
    })
    expect(codes(result)).toContain("repo_file_unmanifested")
  })

  it("detects remote history applied in a different order from the manifest", () => {
    const reordered = [...healthyRemote]
    const last = reordered.pop() as RemoteMigration
    reordered.splice(2, 0, last)
    const result = validateMigrationHistory({ repoFilenames, remote: reordered })
    expect(codes(result)).toContain("order_divergence")
  })

  it("refuses an attempt to replay a migration that is already applied", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261001175315_google_integration_readiness_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to treat a foundation migration as a new additive change", () => {
    // Offering a foundation migration as something to apply is how a live
    // schema gets recreated. It is reported as a foundation mistake as well as
    // a replay, because the two call for different conversations.
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20260915120000_core_data_foundation_v1.sql"],
    })
    expect(codes(result)).toContain("foundation_treated_as_new")
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("permits a genuinely new migration once the chain is confirmed", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261002090000_future_additive_change_v1.sql"],
    })
    expect(result.status).toBe("clean")
    expect(mayApplyMigrations(result)).toBe(true)
  })

  it("derives a version and a logical name from a filename", () => {
    expect(migrationVersion("20261001175315_google_integration_readiness_v1.sql")).toBe("20261001175315")
    expect(logicalName("20261001175315_google_integration_readiness_v1.sql")).toBe("google_integration_readiness_v1")
  })
})
