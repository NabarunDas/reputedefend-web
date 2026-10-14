/**
 * Server-side SHA-256 for evidence bytes.
 *
 * The digest is computed from the bytes a trusted server read. A browser
 * digest is not accepted, and an S3 ETag is not a SHA-256 of the object.
 * This module does not read the environment or open a network connection.
 */

import { createHash } from "node:crypto"

/** Same ceiling as the evidence presigned POST. Kept here so this module stays free of other local imports. */
export const INTEGRITY_MAX_BYTES = 10_485_760

export const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
export const PROD_EVIDENCE_BUCKET = "profilerelaunch-evidence-prod-euw2-337909767363"
export const PROD_SUPABASE_HOST_FRAGMENT = "cxwwekdzkkjjbiyofrov"

const DEV_RECOVERY_BUCKET = /^profilerelaunch-evidence-dev-recovery-[a-z0-9-]{1,24}$/
const PROD_RECOVERY_BUCKET = /^profilerelaunch-evidence-prod-recovery-[a-z0-9-]{1,24}$/
const TOO_LARGE = "EvidenceObjectTooLarge"

export type IntegrityMode = "check" | "apply" | "restore"

export type IntegrityVersion = {
  versionId: string
  declaredSizeBytes: number
  storageBucket: string
  storageKey: string
  scanStatus: string
  hasDigest: boolean
}

export type IntegrityPage = {
  versions: IntegrityVersion[]
  uploadedCount: number
  excludedPendingUploadCount: number
  excludedFailedCount: number
}

export type ObjectRead =
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "not_clean" }
  | { kind: "oversize" }

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
  | "oversize"

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
  expectedUploaded: number
  covered: number
  coverageComplete: boolean
  resumed: boolean
  excludedPendingUploadCount: number
  excludedFailedCount: number
}

const failingOutcomes = new Set<IntegrityOutcome>([
  "mismatch",
  "missing",
  "size_mismatch",
  "unreadable",
  "bucket_mismatch",
  "not_clean",
  "oversize",
])

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function evidenceObjectTooLarge(): Error {
  const error = new Error("The stored file is larger than the allowed size.")
  error.name = TOO_LARGE
  return error
}

export function isEvidenceObjectTooLarge(error: unknown): boolean {
  return error instanceof Error && error.name === TOO_LARGE
}

/**
 * A missing ContentLength is read under the stream cap. A known length outside
 * 1..INTEGRITY_MAX_BYTES is not read.
 */
export function contentLengthDecision(length: number | null | undefined): "read" | "oversize" | "unreadable" {
  if (length === undefined || length === null) return "read"
  if (!Number.isInteger(length)) return "unreadable"
  if (length > INTEGRITY_MAX_BYTES) return "oversize"
  if (length < 1) return "unreadable"
  return "read"
}

/**
 * Copies at most `maxBytes`. A chunk that would pass the cap is not copied,
 * and the bytes already accepted are discarded.
 */
export async function readAtMost(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) return { bytes: new Uint8Array(0), truncated: true }
  const parts: Uint8Array[] = []
  let total = 0
  for await (const chunk of chunks) {
    if (chunk.byteLength === 0) continue
    if (total > maxBytes - chunk.byteLength) return { bytes: new Uint8Array(0), truncated: true }
    parts.push(chunk)
    total += chunk.byteLength
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return { bytes, truncated: false }
}

export async function readBoundedObjectBody(
  body: (AsyncIterable<Uint8Array> & { destroy?: () => void }) | null | undefined,
  contentLength: number | null | undefined,
): Promise<{ kind: "bytes"; bytes: Uint8Array } | { kind: "unreadable" } | { kind: "oversize" }> {
  const decision = contentLengthDecision(contentLength)
  if (decision !== "read") {
    body?.destroy?.()
    return { kind: decision }
  }
  if (!body) return { kind: "unreadable" }
  const read = await readAtMost(body, INTEGRITY_MAX_BYTES)
  if (read.truncated) {
    body.destroy?.()
    return { kind: "oversize" }
  }
  if (read.bytes.byteLength === 0) return { kind: "unreadable" }
  return { kind: "bytes", bytes: read.bytes }
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

/**
 * A recovery bucket is a read target for check and restore. It is never the
 * live DEV or Production bucket, and apply cannot use one.
 */
export function assertRecoveryMapping(input: {
  mode: IntegrityMode
  metadataBucket: string
  recoveryBucket?: string | null
}): void {
  const recovery = input.recoveryBucket?.trim() ?? ""
  if (!recovery) return
  if (input.mode === "apply") throw new Error("apply cannot use a recovery bucket")
  if (recovery === DEV_EVIDENCE_BUCKET || recovery === PROD_EVIDENCE_BUCKET) {
    throw new Error("recovery bucket must be a separate recovery bucket")
  }
  if (input.metadataBucket === PROD_EVIDENCE_BUCKET) {
    if (!PROD_RECOVERY_BUCKET.test(recovery)) throw new Error("recovery bucket is not an allowed Production recovery bucket")
    return
  }
  if (input.metadataBucket === DEV_EVIDENCE_BUCKET) {
    if (!DEV_RECOVERY_BUCKET.test(recovery)) throw new Error("recovery bucket is not an allowed DEV recovery bucket")
    return
  }
  throw new Error("a recovery bucket requires the canonical DEV or Production evidence bucket")
}

export function resolveReadBucket(metadataBucket: string, recoveryBucket?: string | null): string {
  const recovery = recoveryBucket?.trim() ?? ""
  return recovery || metadataBucket
}

export type IntegrityCredentials = {
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_SESSION_TOKEN?: string
  AWS_WEB_IDENTITY_TOKEN_FILE?: string
  AWS_ROLE_ARN?: string
  AWS_EVIDENCE_ROLE_ARN?: string
}

/**
 * Static keys are refused. A web-identity file is accepted only when its role
 * is exactly the evidence role. Otherwise the caller uses Vercel OIDC.
 */
export function assertCredentialMode(credentials: IntegrityCredentials): "web-identity" | "vercel-oidc" {
  if (credentials.AWS_ACCESS_KEY_ID || credentials.AWS_SECRET_ACCESS_KEY || credentials.AWS_SESSION_TOKEN) {
    throw new Error("static AWS keys are refused")
  }
  const tokenFile = credentials.AWS_WEB_IDENTITY_TOKEN_FILE ?? ""
  const role = credentials.AWS_ROLE_ARN ?? ""
  if (tokenFile || role) {
    if (!tokenFile || !role) throw new Error("web identity credentials are incomplete")
    if (role !== (credentials.AWS_EVIDENCE_ROLE_ARN ?? "")) throw new Error("web identity role must be the evidence role")
    return "web-identity"
  }
  return "vercel-oidc"
}

/**
 * Exit 1 is a failed object, including a restore row that has no digest.
 * Exit 3 is an incomplete, limited or resumed run that has no harder failure.
 * Exit 0 is a from-start walk that finished. Restore exit 0 additionally
 * requires every uploaded row to match, or that there was no uploaded evidence.
 */
export function integrityExitCode(mode: IntegrityMode, result: IntegrityPassResult): number {
  const failed = result.findings.some(finding => failingOutcomes.has(finding.outcome))
  const restoreUnverified = mode === "restore" && result.findings.some(finding => finding.outcome === "unverified")
  if (failed || restoreUnverified) return 1
  if (result.stoppedEarly || result.resumed || !result.coverageComplete) return 3
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
  recoveryBucket?: string | null
  after?: string | null
  maxVersions?: number
  page: (after: string | null) => Promise<IntegrityPage>
  readObject: (version: IntegrityVersion) => Promise<ObjectRead>
  record: (version: IntegrityVersion, digest: string, byteLength: number, write: boolean) => Promise<{ status: RecordStatus }>
}): Promise<IntegrityPassResult> {
  assertRecoveryMapping({ mode: input.mode, metadataBucket: input.bucket, recoveryBucket: input.recoveryBucket })
  const findings: IntegrityFinding[] = []
  let cursor = input.after ?? null
  const resumed = Boolean(input.after)
  const maxVersions = input.maxVersions ?? Number.POSITIVE_INFINITY
  let expectedUploaded = 0
  let excludedPendingUploadCount = 0
  let excludedFailedCount = 0
  let sawPage = false
  let coverageStable = true

  const finish = (stoppedEarly: boolean): IntegrityPassResult => {
    const covered = findings.length
    const walked = sawPage && coverageStable && !stoppedEarly && !resumed
    const coverageComplete = input.mode === "apply" ? walked : walked && covered === expectedUploaded
    return {
      findings,
      cursor,
      stoppedEarly,
      expectedUploaded,
      covered,
      coverageComplete,
      resumed,
      excludedPendingUploadCount,
      excludedFailedCount,
    }
  }

  const notePage = (page: IntegrityPage) => {
    if (!sawPage) {
      expectedUploaded = page.uploadedCount
      excludedPendingUploadCount = page.excludedPendingUploadCount
      excludedFailedCount = page.excludedFailedCount
      sawPage = true
      return
    }
    if (
      page.uploadedCount !== expectedUploaded
      || page.excludedPendingUploadCount !== excludedPendingUploadCount
      || page.excludedFailedCount !== excludedFailedCount
    ) {
      coverageStable = false
      expectedUploaded = page.uploadedCount
      excludedPendingUploadCount = page.excludedPendingUploadCount
      excludedFailedCount = page.excludedFailedCount
    }
  }

  for (let pages = 0; pages < 500; pages++) {
    if (findings.length >= maxVersions) return finish(true)
    const page = await input.page(cursor)
    notePage(page)
    if (page.versions.length === 0) return finish(false)
    if (page.versions[page.versions.length - 1]?.versionId === cursor) return finish(true)
    for (const version of page.versions) {
      if (findings.length >= maxVersions) return finish(true)
      findings.push(await classify(input, version))
      cursor = version.versionId
    }
  }
  const more = await input.page(cursor)
  notePage(more)
  return finish(more.versions.length > 0)
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
  if (version.scanStatus !== "NO_THREATS_FOUND") return finding(version, "not_clean", null)
  if (version.storageBucket !== input.bucket) return finding(version, "bucket_mismatch", null)
  const object = await input.readObject(version)
  if (object.kind === "missing") return finding(version, "missing", null)
  if (object.kind === "unreadable") return finding(version, "unreadable", null)
  if (object.kind === "not_clean") return finding(version, "not_clean", null)
  if (object.kind === "oversize") return finding(version, "oversize", null)
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
