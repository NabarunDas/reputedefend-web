import { describe, expect, it } from "vitest"
import { manifestFilenames, migrationChain } from "./manifest"
import { logicalName, mayApplyMigrations, migrationVersion, validateMigrationHistory, type RemoteMigration } from "./history"

const repoFilenames = manifestFilenames()
const appliedChain = migrationChain.filter(entry => entry.appliedToDev)
// This validator fixture models the complete applied manifest, not a literal
// copy of live DEV migration history. Live DEV is still missing the three
// initial foundation entries tracked in issue #190. After DEV-HISTORY-01 the
// synthetic chain ends at the observed DEV ledger head 20261022172455.
// Production remains at SEC-08 and is NOT represented by this synthetic ledger.
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

  it("keeps synthetic remote history aligned through the observed DEV head", () => {
    const pending = migrationChain.filter(entry => !entry.appliedToDev)
    expect(pending.map(entry => entry.filename)).toEqual([
      "20261025020000_guided_payment_request_email_v1.sql",
      "20261025140000_guided_fulfilment_handover_v1.sql",
    ])
    expect(healthyRemote.at(-1)).toEqual({
      version: "20261024233701",
      name: "admin_reconcile_accepted_service_v1",
    })
    expect(healthyRemote.some(row => row.version === "20261015230000" && row.name === "dev_stripe_one_shot_v1")).toBe(true)
    const result = validateMigrationHistory({ repoFilenames, remote: healthyRemote })
    expect(result.status).toBe("clean")
    expect(codes(result)).toEqual([])
    expect(mayApplyMigrations(result)).toBe(true)
  })

  it("treats a ledger that stops at SEC-03 as missing the applied DEV SEC-08 migration", () => {
    const stopped = healthyRemote.filter(row => row.version <= "20261013153000")
    expect(stopped.at(-1)).toEqual({
      version: "20261013153000",
      name: "public_request_rate_limit_v1",
    })
    const result = validateMigrationHistory({ repoFilenames, remote: stopped })
    expect(codes(result)).toContain("applied_not_in_remote")
    expect(result.status).toBe("diverged")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay the DEV send-email claim after the filename was aligned", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261021132018_dev_send_email_claim_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay the gross-price migration after the filename was aligned", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261021214813_gross_customer_price_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay the preliminary evidence migration after the filename was aligned", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261021155147_communication_access_preliminary_evidence_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay a DEV-HISTORY-01 statement that DEV has already applied", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261019163645_admin_journey_05_assessment_dev_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay SEC-08 now that DEV has received it", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261014170000_evidence_content_sha256_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay the UX-10H Guard migration now that dev has received it", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261004000625_customer_portal_relaunch_guard_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay the UX-10G payments migration now that dev has received it", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261003224746_customer_portal_payments_receipts_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
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

  it("refuses to replay the UX-10I migration now that dev has received it", () => {
    const result = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261004080853_customer_portal_messages_account_v1.sql"],
    })
    expect(codes(result)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(result)).toBe(false)
  })

  it("refuses to replay Step 10B and the prior observed DEV head", () => {
    const pending = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261019183000_admin_journey_10b_record_outcome_v1.sql"],
    })
    expect(codes(pending)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(pending)).toBe(false)
    const historical = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261019163645_admin_journey_05_assessment_dev_v1.sql"],
    })
    expect(codes(historical)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(historical)).toBe(false)
    const outcome = validateMigrationHistory({
      repoFilenames,
      remote: healthyRemote,
      candidates: ["20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql"],
    })
    expect(codes(outcome)).toContain("replay_of_applied_migration")
    expect(mayApplyMigrations(outcome)).toBe(false)
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
