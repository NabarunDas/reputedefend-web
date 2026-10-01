/**
 * Recovery evidence report.
 *
 * A rehearsal is only useful if it leaves something an Owner can read later
 * and a machine can diff. This produces both from the same structure.
 *
 * A report is an artefact that gets attached to tickets and pasted into
 * messages, so it must be safe by construction rather than by care. Nothing
 * here accepts a secret, a token, a presigned URL, a storage key, personal
 * data or a raw provider body, and `assertReportIsSafe` re-checks the
 * rendered output before it is returned.
 */

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

export type CheckResult = {
  name: string
  passed: boolean
  detail: string
}

export type RecoveryReportInput = {
  runId: string
  /** Git revision the rehearsal ran from. */
  sourceRevision: string
  /** Migration version at the head of the rebuilt schema. */
  migrationHead: string
  rehearsalType: RehearsalType
  startedAt: string
  finishedAt: string
  checks: readonly CheckResult[]
  fingerprint: FingerprintComparison | null
  storage: ReconciliationReport | null
  packs: PackRecoveryReport | null
  jobs: JobRecoveryReport | null
  /** Things this rehearsal could not establish. Never left implicit. */
  unresolvedGaps: readonly string[]
  /** Observed durations. These are rehearsal measurements, not commitments. */
  rpoRtoObservations: readonly string[]
}

export type RecoveryReport = RecoveryReportInput & {
  /** Always true: no rehearsal in this repository uses customer data. */
  syntheticData: true
  passed: boolean
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

export function buildRecoveryReport(input: RecoveryReportInput): RecoveryReport {
  const checksPassed = input.checks.every(check => check.passed)
  const fingerprintPassed = input.fingerprint === null || input.fingerprint.matched
  return {
    ...input,
    syntheticData: true,
    passed: checksPassed && fingerprintPassed,
    signoff: {
      approvedBy: null,
      approvedAt: null,
      note: "A rehearsal result is not an approved recovery target. An Owner signs this off.",
    },
  }
}

/** Machine-readable form. Keys are ordered so two runs diff cleanly. */
export function renderReportJson(report: RecoveryReport): string {
  const json = JSON.stringify(report, Object.keys(report).sort(), 2)
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
    `- Result: ${report.passed ? "PASSED" : "FAILED"}`,
    `- Rehearsal type: ${report.rehearsalType}`,
    `- Source revision: ${report.sourceRevision}`,
    `- Migration head: ${report.migrationHead}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Data: synthetic rehearsal dataset only; no customer data was used`,
  ]

  lines.push(...section("Checks", report.checks.map(check => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`)))

  if (report.fingerprint) {
    lines.push(...section("Data fingerprint", [
      `- ${report.fingerprint.matched ? "Identical before and after." : `${report.fingerprint.differences.length} difference(s) found.`}`,
      ...report.fingerprint.differences.map(difference => `- ${difference.area} ${difference.key}: ${difference.before} became ${difference.after}`),
    ]))
  }

  if (report.storage) {
    lines.push(...section("Evidence object reconciliation", [
      ...Object.entries(report.storage.counts).map(([outcome, count]) => `- ${outcome}: ${count}`),
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

  lines.push(...section("Unresolved gaps", report.unresolvedGaps.map(gap => `- ${gap}`)))
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
