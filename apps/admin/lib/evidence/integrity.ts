/**
 * Server-side SHA-256 for evidence bytes.
 *
 * The digest is computed from the bytes a trusted server read. A browser
 * digest is not accepted, and an S3 ETag is not a SHA-256 of the object.
 * This module does not read the environment or open a network connection.
 */

import { createHash } from "node:crypto"

export const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
export const PROD_EVIDENCE_BUCKET = "profilerelaunch-evidence-prod-euw2-337909767363"
export const PROD_SUPABASE_HOST_FRAGMENT = "cxwwekdzkkjjbiyofrov"

export type IntegrityMode = "check" | "apply" | "restore"

export type IntegrityVersion = {
  versionId: string
  declaredSizeBytes: number
  storageBucket: string
  storageKey: string
  hasDigest: boolean
}

export type ObjectRead =
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "not_clean" }

export type RecordStatus =
  | "recorded"
  | "already_trusted"
  | "mismatch"
  | "unverified"
  | "size_mismatch"
  | "missing"
  | "invalid"

export type IntegrityOutcome =
  | "would_record"
  | "match"
  | "mismatch"
  | "missing"
  | "size_mismatch"
  | "unreadable"
  | "bucket_mismatch"
  | "unverified"
  | "recorded"
  | "already_trusted"
  | "not_clean"

export type IntegrityFinding = {
  versionId: string
  outcome: IntegrityOutcome
  declaredSizeBytes: number
  objectSizeBytes: number | null
}

export type IntegrityPassResult = {
  findings: IntegrityFinding[]
  cursor: string | null
  stoppedEarly: boolean
}

const failingOutcomes = new Set<IntegrityOutcome>([
  "mismatch",
  "missing",
  "size_mismatch",
  "unreadable",
  "bucket_mismatch",
  "not_clean",
])

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/**
 * `check` and `restore` are read-only and may target Production.
 * `apply` writes a null digest and is refused for Production.
 */
export function assertApplyAllowed(input: {
  mode: IntegrityMode
  bucket: string
  vercelEnv?: string
  supabaseUrl?: string
}): void {
  if (input.mode !== "apply") return
  const url = (input.supabaseUrl ?? "").toLowerCase()
  if (
    input.vercelEnv === "production"
    || input.bucket === PROD_EVIDENCE_BUCKET
    || url.includes(PROD_SUPABASE_HOST_FRAGMENT)
  ) {
    throw new Error("apply is refused for Production")
  }
  if (input.bucket !== DEV_EVIDENCE_BUCKET) {
    throw new Error("apply is allowed only for the DEV evidence bucket")
  }
}

export function integrityExitCode(result: Pick<IntegrityPassResult, "findings" | "stoppedEarly">): number {
  if (result.findings.some(finding => failingOutcomes.has(finding.outcome))) return 1
  if (result.stoppedEarly) return 3
  return 0
}

export function byteIntegrityProven(findings: readonly IntegrityFinding[]): boolean {
  return findings.length > 0 && findings.every(finding => finding.outcome === "match" || finding.outcome === "already_trusted" || finding.outcome === "recorded")
}

function finding(version: IntegrityVersion, outcome: IntegrityOutcome, objectSizeBytes: number | null): IntegrityFinding {
  return { versionId: version.versionId, outcome, declaredSizeBytes: version.declaredSizeBytes, objectSizeBytes }
}

export async function runIntegrityPass(input: {
  mode: IntegrityMode
  bucket: string
  after?: string | null
  maxVersions?: number
  page: (after: string | null) => Promise<IntegrityVersion[]>
  readObject: (version: IntegrityVersion) => Promise<ObjectRead>
  record: (version: IntegrityVersion, digest: string, byteLength: number, write: boolean) => Promise<{ status: RecordStatus }>
}): Promise<IntegrityPassResult> {
  const findings: IntegrityFinding[] = []
  let cursor = input.after ?? null
  const maxVersions = input.maxVersions ?? Number.POSITIVE_INFINITY
  for (let pages = 0; pages < 500; pages++) {
    if (findings.length >= maxVersions) return { findings, cursor, stoppedEarly: true }
    const versions = await input.page(cursor)
    if (versions.length === 0) return { findings, cursor, stoppedEarly: false }
    if (versions[versions.length - 1]?.versionId === cursor) return { findings, cursor, stoppedEarly: true }
    for (const version of versions) {
      if (findings.length >= maxVersions) return { findings, cursor, stoppedEarly: true }
      findings.push(await classify(input, version))
      cursor = version.versionId
    }
  }
  const more = await input.page(cursor)
  return { findings, cursor, stoppedEarly: more.length > 0 }
}

async function classify(
  input: {
    mode: IntegrityMode
    bucket: string
    readObject: (version: IntegrityVersion) => Promise<ObjectRead>
    record: (version: IntegrityVersion, digest: string, byteLength: number, write: boolean) => Promise<{ status: RecordStatus }>
  },
  version: IntegrityVersion,
): Promise<IntegrityFinding> {
  if (version.storageBucket !== input.bucket) return finding(version, "bucket_mismatch", null)
  const object = await input.readObject(version)
  if (object.kind === "missing") return finding(version, "missing", null)
  if (object.kind === "unreadable") return finding(version, "unreadable", null)
  if (object.kind === "not_clean") return finding(version, "not_clean", null)
  const size = object.bytes.byteLength
  if (size !== version.declaredSizeBytes) return finding(version, "size_mismatch", size)
  const digest = sha256Hex(object.bytes)
  if (!version.hasDigest) {
    if (input.mode !== "apply") {
      return finding(version, input.mode === "restore" ? "unverified" : "would_record", size)
    }
    const recorded = await input.record(version, digest, size, true)
    if (recorded.status === "recorded") return finding(version, "recorded", size)
    if (recorded.status === "already_trusted") return finding(version, "already_trusted", size)
    if (recorded.status === "mismatch") return finding(version, "mismatch", size)
    if (recorded.status === "size_mismatch") return finding(version, "size_mismatch", size)
    return finding(version, "unreadable", size)
  }
  const recorded = await input.record(version, digest, size, false)
  if (recorded.status === "already_trusted") return finding(version, input.mode === "apply" ? "already_trusted" : "match", size)
  if (recorded.status === "mismatch") return finding(version, "mismatch", size)
  if (recorded.status === "size_mismatch") return finding(version, "size_mismatch", size)
  return finding(version, "unreadable", size)
}
