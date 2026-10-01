/**
 * Evidence object recovery model.
 *
 * Database backups restore the metadata in `case_document_versions`. They do
 * not restore the bytes, which live in a private AWS S3 bucket on a separate
 * recovery path. After any restore the two have to be reconciled, because
 * either side can come back without the other.
 *
 * This module is deliberately pure. It cannot list, read, presign or delete an
 * object, and it holds no AWS client, so nothing here can touch real evidence.
 * An operator collects an object inventory out of band and passes it in. That
 * keeps live recovery an operator action rather than something the Admin
 * application can be talked into performing.
 *
 * Reports never contain a storage key. Keys are replaced by a short digest so
 * a report can be shared, stored and diffed without disclosing object paths.
 *
 * Three states are kept apart on purpose, because collapsing them is how an
 * unproven recovery gets declared successful:
 *
 * - *structurally matched* means bucket, key, size and content type agree. The
 *   schema stores no content hash, so that is as far as the database can take
 *   us and it is not a statement about the bytes.
 * - *byte integrity proven* additionally requires a hash on both sides that
 *   agrees. Today it is only reachable when an operator supplies one.
 * - *blocked* means something concrete is wrong, or nothing was checked at all.
 *   An absent inventory blocks: not knowing is not the same as being fine.
 *
 * A version whose upload never finished is a fourth thing again. The database
 * never claimed an object existed, so its absence is correct and inventing a
 * missing-object failure for it would be wrong. It is counted separately as an
 * incomplete upload, and an operator decides per row whether to abandon the
 * transaction, retry it later or leave it for manual reconciliation. Nothing
 * here retries or uploads anything.
 */

import { createHash } from "node:crypto"

export type EvidenceRecord = {
  versionId: string
  documentId: string
  caseId: string
  bucket: string
  key: string
  sizeBytes: number
  contentType: string
  uploadStatus: "PENDING_UPLOAD" | "UPLOADED" | "FAILED"
  scanStatus: string
  validationStatus: string
  /**
   * The schema stores no content hash for evidence today, so this is null for
   * every restored row. An operator may supply one from an independent record.
   */
  checksum?: string | null
}

/** One entry of an operator-collected object listing. */
export type StorageObject = {
  bucket: string
  key: string
  sizeBytes: number
  contentType?: string | null
  checksum?: string | null
}

export type ReconciliationOutcome =
  | "MATCHED"
  | "DATABASE_ONLY"
  | "OBJECT_ONLY"
  | "METADATA_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "NOT_CHECKED"

export type ReconciliationReason =
  | "object_missing"
  | "object_unexpected"
  | "bucket_mismatch"
  | "size_mismatch"
  | "content_type_mismatch"
  | "checksum_mismatch"
  | "checksum_unavailable"
  | "upload_not_finished"
  | "inventory_not_supplied"

export type ReconciliationRow = {
  outcome: ReconciliationOutcome
  versionId: string | null
  caseId: string | null
  /** Short digest of bucket and key. Never the key itself. */
  objectDigest: string
  expectedBucket: string | null
  reasons: readonly ReconciliationReason[]
}

export type ReconciliationReport = {
  /** True only when every expected object matched and its bytes were proven. */
  fullyVerified: boolean
  /** Bucket, key, size and content type agree for every expected object. Says nothing about the bytes. */
  structurallyMatched: boolean
  /** A hash was compared on both sides for every expected object and agreed. */
  byteIntegrityProven: boolean
  /** Something concrete is wrong, or nothing was checked. Recovery cannot be declared complete. */
  blocked: boolean
  /** False when no inventory was collected, which is itself a blocker. */
  inventorySupplied: boolean
  /** Versions whose upload never finished, so no object was ever expected. */
  incompleteUploads: number
  counts: Record<ReconciliationOutcome, number>
  rows: readonly ReconciliationRow[]
  /** Comparisons that could not be made, so a reader never mistakes silence for success. */
  unverified: readonly string[]
}

/** Short, stable, irreversible stand-in for a bucket and key pair. */
export function objectDigest(bucket: string, key: string): string {
  return createHash("sha256").update(`${bucket}\u0000${key}`).digest("hex").slice(0, 16)
}

function inventoryKey(bucket: string, key: string): string {
  return `${bucket}\u0000${key}`
}

export type ReconcileOptions = {
  /** Null when no inventory could be collected: the result then fails closed. */
  inventory: readonly StorageObject[] | null
  /** The bucket the deployment is configured to use. */
  expectedBucket: string
}

export function reconcileEvidenceStorage(
  records: readonly EvidenceRecord[],
  options: ReconcileOptions,
): ReconciliationReport {
  const rows: ReconciliationRow[] = []
  const unverified: string[] = []

  if (options.inventory === null) {
    for (const record of records) {
      rows.push({
        outcome: "NOT_CHECKED",
        versionId: record.versionId,
        caseId: record.caseId,
        objectDigest: objectDigest(record.bucket, record.key),
        expectedBucket: record.bucket,
        reasons: ["inventory_not_supplied"],
      })
    }
    unverified.push("no object inventory was supplied, so no evidence object was confirmed to exist")
    return {
      fullyVerified: false,
      structurallyMatched: false,
      byteIntegrityProven: false,
      blocked: true,
      inventorySupplied: false,
      incompleteUploads: records.filter(record => record.uploadStatus !== "UPLOADED").length,
      counts: countOutcomes(rows),
      rows,
      unverified,
    }
  }

  const remaining = new Map(options.inventory.map(object => [inventoryKey(object.bucket, object.key), object]))

  for (const record of records) {
    const digest = objectDigest(record.bucket, record.key)
    const found = remaining.get(inventoryKey(record.bucket, record.key))
    remaining.delete(inventoryKey(record.bucket, record.key))

    if (record.uploadStatus !== "UPLOADED") {
      // The database never claimed an object exists, so its absence is correct
      // and its presence is not evidence of recovery either way.
      rows.push({
        outcome: "NOT_CHECKED",
        versionId: record.versionId,
        caseId: record.caseId,
        objectDigest: digest,
        expectedBucket: record.bucket,
        reasons: ["upload_not_finished"],
      })
      continue
    }

    if (!found) {
      rows.push({
        outcome: "DATABASE_ONLY",
        versionId: record.versionId,
        caseId: record.caseId,
        objectDigest: digest,
        expectedBucket: record.bucket,
        reasons: ["object_missing"],
      })
      continue
    }

    const reasons: ReconciliationReason[] = []
    if (record.bucket !== options.expectedBucket) reasons.push("bucket_mismatch")
    if (found.sizeBytes !== record.sizeBytes) reasons.push("size_mismatch")
    if (found.contentType != null && found.contentType !== record.contentType) reasons.push("content_type_mismatch")

    const bothChecksums = typeof found.checksum === "string" && typeof record.checksum === "string"
    if (bothChecksums && found.checksum !== record.checksum) {
      rows.push({
        outcome: "CHECKSUM_MISMATCH",
        versionId: record.versionId,
        caseId: record.caseId,
        objectDigest: digest,
        expectedBucket: record.bucket,
        reasons: [...reasons, "checksum_mismatch"],
      })
      continue
    }

    if (reasons.length > 0) {
      rows.push({
        outcome: "METADATA_MISMATCH",
        versionId: record.versionId,
        caseId: record.caseId,
        objectDigest: digest,
        expectedBucket: record.bucket,
        reasons,
      })
      continue
    }

    // Size and content type agreeing is not the same as the bytes agreeing.
    // Without a stored hash the match is structural only, and the report says so.
    rows.push({
      outcome: "MATCHED",
      versionId: record.versionId,
      caseId: record.caseId,
      objectDigest: digest,
      expectedBucket: record.bucket,
      reasons: bothChecksums ? [] : ["checksum_unavailable"],
    })
  }

  for (const object of remaining.values()) {
    rows.push({
      outcome: "OBJECT_ONLY",
      versionId: null,
      caseId: null,
      objectDigest: objectDigest(object.bucket, object.key),
      expectedBucket: object.bucket,
      reasons: ["object_unexpected"],
    })
  }

  const unchecked = rows.filter(row => row.reasons.includes("checksum_unavailable"))
  if (unchecked.length > 0) {
    unverified.push(
      `${unchecked.length} object(s) matched on size and content type only; the schema stores no content hash, so byte-level integrity was not proved`,
    )
  }

  const incompleteUploads = rows.filter(row => row.reasons.includes("upload_not_finished")).length
  if (incompleteUploads > 0) {
    unverified.push(
      `${incompleteUploads} version(s) never finished uploading, so no object was expected; an operator decides whether to abandon, retry or leave each one pending`,
    )
  }

  const counts = countOutcomes(rows)
  const blocked = blockingOutcomes.some(outcome => counts[outcome] > 0)
  const expected = rows.length - incompleteUploads
  const structurallyMatched = !blocked && counts.MATCHED === expected
  const byteIntegrityProven = structurallyMatched && unchecked.length === 0

  return {
    fullyVerified: byteIntegrityProven && incompleteUploads === 0 && rows.length > 0,
    structurallyMatched,
    byteIntegrityProven,
    blocked,
    inventorySupplied: true,
    incompleteUploads,
    counts,
    rows,
    unverified,
  }
}

function countOutcomes(rows: readonly ReconciliationRow[]): Record<ReconciliationOutcome, number> {
  const counts: Record<ReconciliationOutcome, number> = {
    MATCHED: 0,
    DATABASE_ONLY: 0,
    OBJECT_ONLY: 0,
    METADATA_MISMATCH: 0,
    CHECKSUM_MISMATCH: 0,
    NOT_CHECKED: 0,
  }
  for (const row of rows) counts[row.outcome] += 1
  return counts
}

/**
 * Object outcomes that block declaring evidence storage recovered. An absent
 * inventory blocks too, but it is not an outcome of a comparison that happened,
 * so it is carried by `inventorySupplied` rather than added to this list.
 */
export const blockingOutcomes: readonly ReconciliationOutcome[] = [
  "DATABASE_ONLY",
  "OBJECT_ONLY",
  "METADATA_MISMATCH",
  "CHECKSUM_MISMATCH",
]

export function storageRecoveryBlocked(report: ReconciliationReport): boolean {
  return report.blocked
}
