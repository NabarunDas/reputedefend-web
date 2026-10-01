import { describe, expect, it } from "vitest"
import { objectDigest, reconcileEvidenceStorage, storageRecoveryBlocked, type EvidenceRecord, type StorageObject } from "./storage"
import { validatePackRecovery, type PackItemRecord, type PackVersionRecord } from "./packs"
import { rehearsalBucket, rehearsalStorageKey } from "./dataset"

const caseId = "5e5e5e5e-0000-4000-8000-000000000050"
const documentId = "5e5e5e5e-0000-4000-8000-000000000070"
const versionId = "5e5e5e5e-0000-4000-8000-000000000080"
const key = rehearsalStorageKey(caseId, documentId, versionId)

function record(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    versionId,
    documentId,
    caseId,
    bucket: rehearsalBucket,
    key,
    sizeBytes: 20480,
    contentType: "application/pdf",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    checksum: null,
    ...overrides,
  }
}

function object(overrides: Partial<StorageObject> = {}): StorageObject {
  return { bucket: rehearsalBucket, key, sizeBytes: 20480, contentType: "application/pdf", ...overrides }
}

const options = { expectedBucket: rehearsalBucket }

describe("evidence object reconciliation against a synthetic inventory", () => {
  it("matches a version whose object is present with the expected metadata", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object()] })
    expect(report.counts.MATCHED).toBe(1)
    expect(storageRecoveryBlocked(report)).toBe(false)
  })

  it("detects an object that is missing from the bucket", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [] })
    expect(report.counts.DATABASE_ONLY).toBe(1)
    expect(report.rows[0].reasons).toContain("object_missing")
    expect(storageRecoveryBlocked(report)).toBe(true)
  })

  it("detects an object stored under the wrong key", () => {
    const wrongKey = rehearsalStorageKey(caseId, documentId, "5e5e5e5e-0000-4000-8000-000000000999")
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object({ key: wrongKey })] })
    expect(report.counts.DATABASE_ONLY).toBe(1)
    expect(report.counts.OBJECT_ONLY).toBe(1)
    expect(storageRecoveryBlocked(report)).toBe(true)
  })

  it("detects a size mismatch rather than accepting the object", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object({ sizeBytes: 1024 })] })
    expect(report.counts.METADATA_MISMATCH).toBe(1)
    expect(report.rows[0].reasons).toContain("size_mismatch")
    expect(report.counts.MATCHED).toBe(0)
  })

  it("detects a content type mismatch", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object({ contentType: "image/png" })] })
    expect(report.counts.METADATA_MISMATCH).toBe(1)
    expect(report.rows[0].reasons).toContain("content_type_mismatch")
  })

  it("detects a checksum mismatch when both sides supply one", () => {
    const report = reconcileEvidenceStorage(
      [record({ checksum: "aaaa" })],
      { ...options, inventory: [object({ checksum: "bbbb" })] },
    )
    expect(report.counts.CHECKSUM_MISMATCH).toBe(1)
    expect(storageRecoveryBlocked(report)).toBe(true)
  })

  it("detects an orphan object that no database row claims", () => {
    const orphanKey = rehearsalStorageKey(caseId, documentId, "5e5e5e5e-0000-4000-8000-000000000998")
    const report = reconcileEvidenceStorage([], { ...options, inventory: [object({ key: orphanKey })] })
    expect(report.counts.OBJECT_ONLY).toBe(1)
    expect(report.rows[0].reasons).toContain("object_unexpected")
    expect(storageRecoveryBlocked(report)).toBe(true)
  })

  it("detects an object held in a bucket the deployment does not use", () => {
    const foreign = "someone-elses-bucket"
    const report = reconcileEvidenceStorage(
      [record({ bucket: foreign })],
      { ...options, inventory: [object({ bucket: foreign })] },
    )
    expect(report.counts.METADATA_MISMATCH).toBe(1)
    expect(report.rows[0].reasons).toContain("bucket_mismatch")
  })

  it("never marks a mismatched object recovered", () => {
    const report = reconcileEvidenceStorage(
      [record(), record({ versionId: "5e5e5e5e-0000-4000-8000-000000000081", key: `${key}x` })],
      { ...options, inventory: [object({ sizeBytes: 999 })] },
    )
    expect(report.counts.MATCHED).toBe(0)
    expect(report.fullyVerified).toBe(false)
  })

  it("does not expect an object for a version whose upload never finished", () => {
    const report = reconcileEvidenceStorage([record({ uploadStatus: "PENDING_UPLOAD" })], { ...options, inventory: [] })
    expect(report.counts.NOT_CHECKED).toBe(1)
    expect(report.counts.DATABASE_ONLY).toBe(0)
    expect(storageRecoveryBlocked(report)).toBe(false)
  })

  it("counts an incomplete upload separately rather than letting it pass as recovered", () => {
    const report = reconcileEvidenceStorage(
      [record({ checksum: "cafe" }), record({
        versionId: "5e5e5e5e-0000-4000-8000-000000000081",
        key: rehearsalStorageKey(caseId, documentId, "5e5e5e5e-0000-4000-8000-000000000081"),
        uploadStatus: "PENDING_UPLOAD",
      })],
      { ...options, inventory: [object({ checksum: "cafe" })] },
    )
    expect(report.incompleteUploads).toBe(1)
    expect(report.byteIntegrityProven).toBe(true)
    expect(report.fullyVerified).toBe(false)
    expect(report.unverified.join(" ")).toMatch(/never finished uploading/)
    expect(storageRecoveryBlocked(report)).toBe(false)
  })

  it("fails closed when no inventory could be collected", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: null })
    expect(report.counts.NOT_CHECKED).toBe(1)
    expect(report.inventorySupplied).toBe(false)
    expect(report.fullyVerified).toBe(false)
    expect(report.structurallyMatched).toBe(false)
    expect(report.byteIntegrityProven).toBe(false)
    expect(storageRecoveryBlocked(report)).toBe(true)
    expect(report.unverified[0]).toMatch(/no object inventory/)
  })

  it("says plainly that a size match is not a byte match while no hash is stored", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object()] })
    expect(report.rows[0].reasons).toContain("checksum_unavailable")
    expect(report.structurallyMatched).toBe(true)
    expect(report.byteIntegrityProven).toBe(false)
    expect(report.fullyVerified).toBe(false)
    expect(report.unverified.join(" ")).toMatch(/no content hash/)
  })

  it("confirms byte-level integrity once both sides carry the same hash", () => {
    const report = reconcileEvidenceStorage(
      [record({ checksum: "cafe" })],
      { ...options, inventory: [object({ checksum: "cafe" })] },
    )
    expect(report.counts.MATCHED).toBe(1)
    expect(report.rows[0].reasons).toEqual([])
    expect(report.structurallyMatched).toBe(true)
    expect(report.byteIntegrityProven).toBe(true)
    expect(report.fullyVerified).toBe(true)
  })

  it("identifies objects by digest so a report never carries a storage key", () => {
    const report = reconcileEvidenceStorage([record()], { ...options, inventory: [object()] })
    const serialised = JSON.stringify(report)
    expect(serialised).not.toContain(key)
    expect(serialised).not.toContain("cases/")
    expect(report.rows[0].objectDigest).toBe(objectDigest(rehearsalBucket, key))
    expect(report.rows[0].objectDigest).toHaveLength(16)
  })
})

describe("prepared pack recovery", () => {
  const packId = "5e5e5e5e-0000-4000-8000-000000000090"
  const item: PackItemRecord = {
    packId,
    itemId: "5e5e5e5e-0000-4000-8000-000000000091",
    documentId,
    versionId,
    position: 1,
    contentType: "application/pdf",
    sizeBytes: 20480,
  }
  const version: PackVersionRecord = {
    versionId,
    documentId,
    contentType: "application/pdf",
    sizeBytes: 20480,
    reviewStatus: "ACCEPTED",
  }
  const storage = reconcileEvidenceStorage([record({ checksum: "cafe" })], { ...options, inventory: [object({ checksum: "cafe" })] })

  it("confirms a pack item still resolves to the same version with the same metadata", () => {
    const report = validatePackRecovery({ items: [item], versions: [version], storage })
    expect(report.items[0].outcome).toBe("RECOVERABLE")
    expect(report.recoverablePacks).toEqual([packId])
    expect(report.nonRecoverablePacks).toEqual([])
    expect(report.blocked).toBe(false)
  })

  it("marks a pack non-recoverable when its pinned evidence version is gone", () => {
    const report = validatePackRecovery({ items: [item], versions: [], storage })
    expect(report.items[0].outcome).toBe("VERSION_MISSING")
    expect(report.nonRecoverablePacks).toEqual([packId])
    expect(report.blocked).toBe(true)
  })

  it("does not silently rebind a pack item to a newer version of the document", () => {
    const newerVersion: PackVersionRecord = { ...version, versionId: "5e5e5e5e-0000-4000-8000-000000000082" }
    const report = validatePackRecovery({ items: [item], versions: [newerVersion], storage })
    expect(report.items[0].outcome).toBe("VERSION_MISSING")
    expect(report.items[0].versionId).toBe(versionId)
    expect(report.recoverablePacks).toEqual([])
  })

  it("detects version metadata that changed under the pack", () => {
    const report = validatePackRecovery({ items: [item], versions: [{ ...version, sizeBytes: 999 }], storage })
    expect(report.items[0].outcome).toBe("VERSION_METADATA_CHANGED")
  })

  it("detects a version that now belongs to a different document", () => {
    const rebound: PackVersionRecord = { ...version, documentId: "5e5e5e5e-0000-4000-8000-000000000071" }
    const report = validatePackRecovery({ items: [item], versions: [rebound], storage })
    expect(report.items[0].outcome).toBe("DOCUMENT_REBOUND")
  })

  it("marks a pack non-recoverable when the version survived but its object did not", () => {
    const missing = reconcileEvidenceStorage([record()], { ...options, inventory: [] })
    const report = validatePackRecovery({ items: [item], versions: [version], storage: missing })
    expect(report.items[0].outcome).toBe("OBJECT_NOT_RECOVERED")
    expect(report.nonRecoverablePacks).toEqual([packId])
  })

  it("keeps storage keys and presigned material out of the pack report", () => {
    const report = validatePackRecovery({ items: [item], versions: [version], storage })
    const serialised = JSON.stringify(report)
    expect(serialised).not.toContain("cases/")
    expect(serialised).not.toContain(rehearsalBucket)
    expect(serialised).not.toContain("X-Amz-Signature")
  })
})
