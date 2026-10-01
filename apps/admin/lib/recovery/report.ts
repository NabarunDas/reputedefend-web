/**
 * Recovery evidence report.
 *
 * A rehearsal is only useful if it leaves something an Owner can read later
 * and a machine can diff. This produces both from the same structure.
 *
 * Two questions get separate answers, because one boolean cannot honestly
 * carry both. "Did the rehearsal execute correctly?" is `rehearsalStatus`.
 * "Is the restored state actually recovered?" is `recoveryVerification`. A
 * failure-injection rehearsal that correctly detects a missing evidence object
 * executed perfectly and proved the restore is not usable, and it should say
 * exactly that: execution PASSED, verification BLOCKED.
 *
 * Verification is derived in one place, `deriveRecoveryVerification`, from
 * facts the domain modules expose. Rendering consumes the derived status and
 * does not re-decide anything.
 *
 * A report is an artefact that gets attached to tickets and pasted into
 * messages, so it must be safe by construction rather than by care. Nothing
 * here accepts a secret, a token, a presigned URL, a storage key, personal
 * data or a raw provider body, and `assertReportIsSafe` re-checks the
 * rendered output before it is returned.
 */

import { blockingOutcomes } from "./storage"
import type { FingerprintComparison } from "./fingerprint"
import type { JobRecoveryReport } from "./jobs"
import type { PackRecoveryReport } from "./packs"
import type { ReconciliationReport } from "./storage"

export type RehearsalType =
  | "clean_schema_rebuild"
  | "existing_database_upgrade"
  | "backfill_safety"
  | "storage_reconciliation"
  | "job_outbox_recovery"
  | "failure_injection"
  | "migration_history_only"

export type CheckResult = {
  name: string
  passed: boolean
  detail: string
}

/** Did the rehearsal itself run correctly? Derived from its own checks only. */
export type RehearsalStatus = "PASSED" | "FAILED"

/** Is the restored state actually recovered? A different question entirely. */
export type RecoveryVerification = "VERIFIED" | "PARTIALLY_VERIFIED" | "BLOCKED" | "NOT_APPLICABLE"

/**
 * `INFO` is context, `LIMITATION` is something this rehearsal could not
 * establish, `BLOCKER` is a concrete reason the restored state is not
 * recovered. An unapproved production RTO is not a failed rehearsal.
 */
export type GapSeverity = "INFO" | "LIMITATION" | "BLOCKER"

export type UnresolvedGap = {
  severity: GapSeverity
  detail: string
}

export type VerificationScope = {
  /**
   * False for an execution-only exercise, such as a migration-history parser
   * test, which never claims to have verified a restored state. It is not a
   * way to avoid reporting a blocker.
   */
  verifiesRecoveredState: boolean
  /**
   * True when the scenario needs the evidence bytes proven rather than merely
   * matched on bucket, key, size and content type.
   */
  requiresByteIntegrity: boolean
}

export type RecoveryVerificationResult = {
  verification: RecoveryVerification
  /** Concrete reasons the restored state is not recovered. */
  blockers: readonly string[]
  /** Dimensions this rehearsal could not establish either way. */
  limitations: readonly string[]
}

export type RecoveryStatusInput = {
  scope: VerificationScope
  checks: readonly CheckResult[]
  fingerprint: FingerprintComparison | null
  storage: ReconciliationReport | null
  packs: PackRecoveryReport | null
  jobs: JobRecoveryReport | null
  unresolvedGaps: readonly UnresolvedGap[]
}

export type RecoveryReportInput = RecoveryStatusInput & {
  runId: string
  /** Git revision the rehearsal ran from. */
  sourceRevision: string
  /** Migration version at the head of the rebuilt schema. */
  migrationHead: string
  rehearsalType: RehearsalType
  startedAt: string
  finishedAt: string
  /** Observed durations. These are rehearsal measurements, not commitments. */
  rpoRtoObservations: readonly string[]
}

export type RecoveryReport = RecoveryReportInput & {
  /** Always true: no rehearsal in this repository uses customer data. */
  syntheticData: true
  rehearsalStatus: RehearsalStatus
  recoveryVerification: RecoveryVerificationResult
  /** Left unsigned. An Owner signs a rehearsal off, a script does not. */
  signoff: { approvedBy: null; approvedAt: null; note: string }
}

/**
 * Patterns that must never appear in a report. These are shapes, not a list of
 * known secrets, so an unexpected value is caught rather than assumed safe.
 */
const forbiddenPatterns: readonly { name: string; pattern: RegExp }[] = [
  { name: "presigned URL", pattern: /[?&]X-Amz-Signature=/i },
  { name: "presigned URL", pattern: /[?&]Signature=/i },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "evidence storage key", pattern: /\bcases\/[0-9a-f-]{36}\/documents\//i },
  { name: "Google access token", pattern: /\bya29\.[A-Za-z0-9._-]{8,}/ },
  { name: "Google refresh token", pattern: /(^|[^A-Za-z0-9+/=_-])1\/\/[A-Za-z0-9._-]{20,}/ },
  { name: "Google client secret", pattern: /\bGOCSPX-[A-Za-z0-9_-]{8,}/ },
  { name: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/ },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: "session token hash", pattern: /"token_?[Hh]ash"/ },
  { name: "email address", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "UK telephone number", pattern: /\+44\d{9,10}\b/ },
]

export class UnsafeReportError extends Error {}

/** Throws rather than redacting: a report that tried to carry a secret is a defect. */
export function assertReportIsSafe(rendered: string): void {
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(rendered)) {
      throw new UnsafeReportError(`recovery report would disclose a ${rule.name}`)
    }
  }
}

/** The rehearsal ran correctly when every check it defined for itself passed. */
export function deriveRehearsalStatus(checks: readonly CheckResult[]): RehearsalStatus {
  return checks.every(check => check.passed) ? "PASSED" : "FAILED"
}

/**
 * The single place that decides whether a restored state is recovered.
 *
 * Domain modules report facts — `blocked`, `byteIntegrityProven`,
 * `requiresHumanReview` — and this combines them. Nothing else in the codebase
 * should form its own opinion about whether a recovery succeeded.
 */
export function deriveRecoveryVerification(input: RecoveryStatusInput): RecoveryVerificationResult {
  if (!input.scope.verifiesRecoveredState) {
    return { verification: "NOT_APPLICABLE", blockers: [], limitations: [] }
  }

  const blockers: string[] = []
  const limitations: string[] = []

  for (const check of input.checks) {
    if (!check.passed) blockers.push(`recovery check failed: ${check.name}`)
  }

  if (input.fingerprint === null) {
    limitations.push("no fingerprint comparison was made, so restored data was not compared with a known-good capture")
  } else if (!input.fingerprint.matched) {
    blockers.push(`the data fingerprint differs in ${input.fingerprint.differences.length} place(s)`)
  }

  const storage = input.storage
  if (storage === null) {
    const detail = "evidence object storage was not reconciled by this rehearsal"
    if (input.scope.requiresByteIntegrity) blockers.push(`${detail}, and this scenario requires byte-level evidence integrity`)
    else limitations.push(detail)
  } else {
    if (!storage.inventorySupplied) {
      blockers.push("no object inventory was supplied, so no evidence object was confirmed to exist")
    } else if (storage.blocked) {
      const outcomes = blockingOutcomes
        .filter(outcome => storage.counts[outcome] > 0)
        .map(outcome => `${storage.counts[outcome]} ${outcome}`)
      blockers.push(`evidence storage reconciliation is blocked by ${outcomes.join(", ")}`)
    } else if (!storage.byteIntegrityProven) {
      const detail =
        "evidence objects matched on bucket, key, size and content type only; the schema stores no content hash, so byte-level integrity is unproven"
      if (input.scope.requiresByteIntegrity) blockers.push(`${detail}, and this scenario requires it`)
      else limitations.push(detail)
    }

    if (storage.incompleteUploads > 0) {
      limitations.push(
        `${storage.incompleteUploads} version(s) never finished uploading, so no object was expected; an operator decides whether to abandon, retry or leave each one pending`,
      )
    }
  }

  if (input.packs === null) {
    limitations.push("prepared pack recovery was not exercised by this rehearsal")
  } else if (input.packs.blocked) {
    blockers.push(`${input.packs.nonRecoverablePacks.length} prepared pack(s) cannot be rebuilt as approved`)
  }

  if (input.jobs === null) {
    limitations.push("job and outbox reconciliation was not exercised by this rehearsal")
  } else if (input.jobs.requiresHumanReview) {
    blockers.push("the restored queue has findings that need human or provider reconciliation before workers resume")
  }

  for (const gap of input.unresolvedGaps) {
    if (gap.severity === "BLOCKER") blockers.push(gap.detail)
    else if (gap.severity === "LIMITATION") limitations.push(gap.detail)
  }

  if (blockers.length > 0) return { verification: "BLOCKED", blockers, limitations }
  if (limitations.length > 0) return { verification: "PARTIALLY_VERIFIED", blockers, limitations }
  return { verification: "VERIFIED", blockers, limitations }
}

export function buildRecoveryReport(input: RecoveryReportInput): RecoveryReport {
  return {
    ...input,
    syntheticData: true,
    rehearsalStatus: deriveRehearsalStatus(input.checks),
    recoveryVerification: deriveRecoveryVerification(input),
    signoff: {
      approvedBy: null,
      approvedAt: null,
      note: "A rehearsal result is not an approved recovery target. An Owner signs this off.",
    },
  }
}

/**
 * Deep, order-stable copy. Object keys are sorted at every depth, arrays keep
 * their order, and primitives and nulls pass through untouched. The source is
 * never mutated.
 *
 * A `JSON.stringify` replacer array cannot do this: it is applied at every
 * depth, so a nested key survives only if it happens to appear in the
 * top-level key list. That silently drops evidence from the report.
 */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== "object") return value
  const source = value as Record<string, unknown>
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) ordered[key] = stableValue(source[key])
  return ordered
}

/** Machine-readable form. Keys are sorted at every depth so two runs diff cleanly. */
export function renderReportJson(report: RecoveryReport): string {
  const json = JSON.stringify(stableValue(report), null, 2)
  assertReportIsSafe(json)
  return json
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [``, `## ${title}`, ``, ...lines]
}

/** Human-readable form for an Owner, an incident ticket or a signoff record. */
export function renderReportText(report: RecoveryReport): string {
  const lines: string[] = [
    `# Recovery rehearsal ${report.runId}`,
    ``,
    `- Rehearsal execution: ${report.rehearsalStatus}`,
    `- Recovery verification: ${report.recoveryVerification.verification}`,
    `- Rehearsal type: ${report.rehearsalType}`,
    `- Source revision: ${report.sourceRevision}`,
    `- Migration head: ${report.migrationHead}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Data: synthetic rehearsal dataset only; no customer data was used`,
  ]

  lines.push(...section("Checks", report.checks.map(check => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`)))

  lines.push(...section("Recovery blockers", report.recoveryVerification.blockers.map(blocker => `- ${blocker}`)))
  lines.push(...section("Not verified by this rehearsal", report.recoveryVerification.limitations.map(limitation => `- ${limitation}`)))

  if (report.fingerprint) {
    lines.push(...section("Data fingerprint", [
      `- ${report.fingerprint.matched ? "Identical before and after." : `${report.fingerprint.differences.length} difference(s) found.`}`,
      ...report.fingerprint.differences.map(difference => `- ${difference.area} ${difference.key}: ${difference.before} became ${difference.after}`),
    ]))
  }

  if (report.storage) {
    lines.push(...section("Evidence object reconciliation", [
      ...Object.entries(report.storage.counts).map(([outcome, count]) => `- ${outcome}: ${count}`),
      `- Structurally matched (bucket, key, size, content type): ${report.storage.structurallyMatched ? "yes" : "no"}`,
      `- Byte-level integrity: ${report.storage.byteIntegrityProven ? "proven by matching hashes" : "UNPROVEN"}`,
      `- Incomplete uploads awaiting an operator decision: ${report.storage.incompleteUploads}`,
      ...report.storage.unverified.map(note => `- Not verified: ${note}`),
    ]))
  }

  if (report.packs) {
    lines.push(...section("Prepared pack recovery", [
      `- Recoverable packs: ${report.packs.recoverablePacks.length}`,
      `- Non-recoverable packs: ${report.packs.nonRecoverablePacks.length}`,
      ...report.packs.items.filter(item => item.outcome !== "RECOVERABLE").map(item => `- Item ${item.itemId}: ${item.outcome}, ${item.detail}`),
    ]))
  }

  if (report.jobs) {
    lines.push(...section("Job and outbox reconciliation", [
      ...Object.entries(report.jobs.counts).map(([action, count]) => `- ${action}: ${count}`),
      `- Human review required: ${report.jobs.requiresHumanReview ? "yes" : "no"}`,
      `- Blind replay permitted: no`,
    ]))
  }

  lines.push(...section("Unresolved gaps", report.unresolvedGaps.map(gap => `- ${gap.severity}: ${gap.detail}`)))
  lines.push(...section("RPO and RTO observations", [
    ...report.rpoRtoObservations.map(observation => `- ${observation}`),
    `- These are rehearsal measurements on synthetic data. They are not an approved recovery target.`,
  ]))
  lines.push(...section("Signoff", [
    `- Approved by: ${report.signoff.approvedBy ?? "Not yet approved"}`,
    `- Approved at: ${report.signoff.approvedAt ?? "Not yet approved"}`,
    `- ${report.signoff.note}`,
  ]))

  const rendered = `${lines.join("\n")}\n`
  assertReportIsSafe(rendered)
  return rendered
}
