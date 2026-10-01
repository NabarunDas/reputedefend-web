/**
 * Compares three independent views of the migration chain: the files in the
 * repository, the manifest of what has been applied, and remote migration
 * history supplied by an operator.
 *
 * This module reports. It never connects to a database, never applies a
 * migration and never repairs history. It fails closed: when remote history is
 * missing or unreadable the result is `blocked`, never `clean`, because an
 * unverified chain is not a verified one.
 */

import { manifestFilenames, migrationChain } from "./manifest"

/** One row of `supabase migration list`, as transcribed by an operator. */
export type RemoteMigration = { version: string; name: string }

export type HistoryFindingCode =
  | "remote_history_unavailable"
  | "remote_history_malformed"
  | "applied_file_missing"
  | "repo_file_unmanifested"
  | "applied_not_in_remote"
  | "remote_not_in_repo"
  | "duplicate_logical_migration"
  | "version_drift"
  | "applied_migration_renamed"
  | "order_divergence"
  | "replay_of_applied_migration"
  | "foundation_treated_as_new"

export type HistoryFinding = {
  code: HistoryFindingCode
  detail: string
  version: string | null
  name: string | null
}

export type HistoryStatus = "clean" | "diverged" | "blocked"

export type HistoryReport = {
  status: HistoryStatus
  /** Number of manifest entries the validator was able to compare. */
  compared: number
  findings: readonly HistoryFinding[]
}

export type HistoryInput = {
  /** Migration filenames present in `supabase/migrations/`. */
  repoFilenames: readonly string[]
  /** Remote history, or null when it could not be collected. */
  remote: readonly RemoteMigration[] | null
  /** Migrations an operator proposes to apply next. */
  candidates?: readonly string[]
}

/** `20261001175315_google_integration_readiness_v1.sql` -> `google_integration_readiness_v1`. */
export function logicalName(filename: string): string {
  return filename.replace(/^\d+_/, "").replace(/\.sql$/, "")
}

/** `20261001175315_google_integration_readiness_v1.sql` -> `20261001175315`. */
export function migrationVersion(filename: string): string {
  return filename.replace(/_.*$/, "").replace(/\.sql$/, "")
}

function finding(code: HistoryFindingCode, detail: string, version: string | null, name: string | null): HistoryFinding {
  return { code, detail, version, name }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

function validRemoteRow(row: unknown): row is RemoteMigration {
  if (typeof row !== "object" || row === null) return false
  const candidate = row as Partial<RemoteMigration>
  return /^\d{14}$/.test(candidate.version ?? "") && typeof candidate.name === "string" && candidate.name.length > 0
}

export function validateMigrationHistory(input: HistoryInput): HistoryReport {
  const findings: HistoryFinding[] = []
  const manifestFiles = manifestFilenames()
  const repoFiles = [...input.repoFilenames].sort()

  for (const filename of manifestFiles) {
    if (!repoFiles.includes(filename)) {
      const version = migrationVersion(filename)
      const renamed = repoFiles.find(name => migrationVersion(name) === version)
      if (renamed) {
        findings.push(finding(
          "applied_migration_renamed",
          `applied migration ${filename} now appears in the repository as ${renamed}; an applied migration must never be renamed`,
          version,
          logicalName(filename),
        ))
      } else {
        findings.push(finding(
          "applied_file_missing",
          `applied migration ${filename} is absent from the repository`,
          version,
          logicalName(filename),
        ))
      }
    }
  }

  for (const filename of repoFiles) {
    if (manifestFiles.includes(filename)) continue
    if (manifestFiles.some(name => migrationVersion(name) === migrationVersion(filename))) continue
    findings.push(finding(
      "repo_file_unmanifested",
      `repository migration ${filename} is not described by the manifest`,
      migrationVersion(filename),
      logicalName(filename),
    ))
  }

  for (const name of duplicates(repoFiles.map(logicalName))) {
    findings.push(finding(
      "duplicate_logical_migration",
      `logical migration ${name} appears more than once in the repository`,
      null,
      name,
    ))
  }

  if (input.remote === null) {
    findings.push(finding(
      "remote_history_unavailable",
      "remote migration history was not supplied; the chain cannot be confirmed and no migration may be applied",
      null,
      null,
    ))
    return { status: "blocked", compared: 0, findings }
  }

  const malformed = input.remote.filter(row => !validRemoteRow(row))
  if (malformed.length > 0) {
    findings.push(finding(
      "remote_history_malformed",
      `${malformed.length} remote history row(s) are not a 14-digit version with a name; the chain cannot be confirmed`,
      null,
      null,
    ))
    return { status: "blocked", compared: 0, findings }
  }

  const remote = [...input.remote]
  for (const name of duplicates(remote.map(row => row.name))) {
    findings.push(finding(
      "duplicate_logical_migration",
      `logical migration ${name} is recorded more than once in remote history`,
      null,
      name,
    ))
  }

  for (const entry of migrationChain) {
    if (!entry.appliedToDev) continue
    const name = logicalName(entry.filename)
    const byVersion = remote.find(row => row.version === entry.version)
    const byName = remote.filter(row => row.name === name)
    if (!byVersion && byName.length === 0) {
      findings.push(finding(
        "applied_not_in_remote",
        `${entry.filename} is recorded as applied but is absent from remote history`,
        entry.version,
        name,
      ))
      continue
    }
    if (!byVersion && byName.length > 0) {
      findings.push(finding(
        "version_drift",
        `${name} is applied remotely as version ${byName.map(row => row.version).join(", ")} but the repository carries version ${entry.version}`,
        entry.version,
        name,
      ))
      continue
    }
    if (byVersion && byVersion.name !== name) {
      findings.push(finding(
        "applied_migration_renamed",
        `version ${entry.version} is recorded remotely as ${byVersion.name} but as ${name} in the repository`,
        entry.version,
        name,
      ))
    }
  }

  const appliedVersions = new Set(migrationChain.filter(entry => entry.appliedToDev).map(entry => entry.version))
  for (const row of remote) {
    if (appliedVersions.has(row.version)) continue
    if (repoFiles.some(filename => logicalName(filename) === row.name)) continue
    findings.push(finding(
      "remote_not_in_repo",
      `remote history contains ${row.version} ${row.name}, which the repository does not provide`,
      row.version,
      row.name,
    ))
  }

  const expectedOrder = migrationChain.filter(entry => entry.appliedToDev && remote.some(row => row.version === entry.version)).map(entry => entry.version)
  const remoteOrder = remote.filter(row => appliedVersions.has(row.version)).map(row => row.version)
  if (expectedOrder.join(",") !== remoteOrder.join(",")) {
    findings.push(finding(
      "order_divergence",
      `remote history order ${remoteOrder.join(" ")} does not match the manifest order ${expectedOrder.join(" ")}`,
      null,
      null,
    ))
  }

  for (const candidate of input.candidates ?? []) {
    const version = migrationVersion(candidate)
    const name = logicalName(candidate)
    if (appliedVersions.has(version) || remote.some(row => row.version === version || row.name === name)) {
      findings.push(finding(
        "replay_of_applied_migration",
        `${candidate} is already applied; replaying it is never permitted`,
        version,
        name,
      ))
      continue
    }
    const entry = migrationChain.find(item => item.filename === candidate)
    if (entry?.kind === "foundation") {
      findings.push(finding(
        "foundation_treated_as_new",
        `${candidate} is a foundation migration and cannot be treated as a new additive change`,
        version,
        name,
      ))
    }
  }

  return {
    status: findings.length === 0 ? "clean" : "diverged",
    compared: migrationChain.filter(entry => entry.appliedToDev).length,
    findings,
  }
}

/** A chain may only be extended when validation is clean. */
export function mayApplyMigrations(report: HistoryReport): boolean {
  return report.status === "clean"
}
