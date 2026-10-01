import { describe, expect, it } from "vitest"
import {
  assertReportIsSafe,
  buildRecoveryReport,
  deriveRecoveryVerification,
  renderReportJson,
  renderReportText,
  UnsafeReportError,
  type RecoveryReportInput,
  type RecoveryStatusInput,
} from "./report"
import { reconcileEvidenceStorage, type EvidenceRecord, type StorageObject } from "./storage"
import { reconcileJobRecovery, type JobRecord } from "./jobs"
import { validatePackRecovery, type PackItemRecord, type PackVersionRecord } from "./packs"
import { rehearsalBucket, rehearsalStorageKey } from "./dataset"

const caseId = "5e5e5e5e-0000-4000-8000-000000000050"
const documentId = "5e5e5e5e-0000-4000-8000-000000000070"
const versionId = "5e5e5e5e-0000-4000-8000-000000000080"
const packId = "5e5e5e5e-0000-4000-8000-000000000090"
const itemId = "5e5e5e5e-0000-4000-8000-000000000091"
const key = rehearsalStorageKey(caseId, documentId, versionId)

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
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

function storageWith(
  records: readonly EvidenceRecord[],
  inventory: readonly StorageObject[] | null,
) {
  return reconcileEvidenceStorage(records, { expectedBucket: rehearsalBucket, inventory })
}

/** Both sides carry the same hash, so the bytes really are proven. */
const provenStorage = storageWith([evidence({ checksum: "cafe" })], [object({ checksum: "cafe" })])
/** Matches on size and content type only, which is all the schema can offer today. */
const structuralStorage = storageWith([evidence()], [object()])

const packItem: PackItemRecord = {
  packId,
  itemId,
  documentId,
  versionId,
  position: 1,
  contentType: "application/pdf",
  sizeBytes: 20480,
}
const packVersion: PackVersionRecord = {
  versionId,
  documentId,
  contentType: "application/pdf",
  sizeBytes: 20480,
  reviewStatus: "ACCEPTED",
}
const recoverablePacks = validatePackRecovery({ items: [packItem], versions: [packVersion], storage: provenStorage })
const cleanJobs = reconcileJobRecovery({ jobs: [], outbox: [], now: new Date(), providerGatesEnabled: false })

function status(overrides: Partial<RecoveryStatusInput> = {}): RecoveryStatusInput {
  return {
    scope: { verifiesRecoveredState: true, requiresByteIntegrity: false },
    checks: [{ name: "schema rebuilt from zero", passed: true, detail: "26 migrations applied in order" }],
    fingerprint: { matched: true, differences: [] },
    storage: provenStorage,
    packs: recoverablePacks,
    jobs: cleanJobs,
    unresolvedGaps: [],
    ...overrides,
  }
}

function input(overrides: Partial<RecoveryReportInput> = {}): RecoveryReportInput {
  return {
    ...status(),
    runId: "rehearsal-0001",
    sourceRevision: "6fc926c8c057d6566b0f824c552738014840b793",
    migrationHead: "20261001175315",
    rehearsalType: "clean_schema_rebuild",
    startedAt: "2026-10-01T12:00:00.000Z",
    finishedAt: "2026-10-01T12:00:04.000Z",
    rpoRtoObservations: [],
    ...overrides,
  }
}

describe("the recovery evidence report", () => {
  it("records the run, the revision, the migration head and that the data was synthetic", () => {
    const report = buildRecoveryReport(input())
    expect(report.syntheticData).toBe(true)
    const text = renderReportText(report)
    expect(text).toContain("rehearsal-0001")
    expect(text).toContain("6fc926c8c057d6566b0f824c552738014840b793")
    expect(text).toContain("20261001175315")
    expect(text).toContain("no customer data was used")
  })

  it("separates how the rehearsal ran from whether the state is recovered", () => {
    const text = renderReportText(buildRecoveryReport(input()))
    expect(text).toContain("Rehearsal execution: PASSED")
    expect(text).toContain("Recovery verification: VERIFIED")
    expect(text).not.toContain("Result: PASSED")
  })

  it("marks the rehearsal itself failed when one of its own checks failed", () => {
    const report = buildRecoveryReport(input({
      checks: [{ name: "orphan probe", passed: false, detail: "3 versions had no document" }],
    }))
    expect(report.rehearsalStatus).toBe("FAILED")
    expect(report.recoveryVerification.verification).toBe("BLOCKED")
    expect(renderReportText(report)).toContain("FAIL orphan probe")
  })

  it("lets a failure-injection rehearsal execute correctly while reporting an unrecovered state", () => {
    const report = buildRecoveryReport(input({
      rehearsalType: "failure_injection",
      checks: [{ name: "missing object detected", passed: true, detail: "the absent object was classified DATABASE_ONLY" }],
      storage: storageWith([evidence()], []),
      packs: validatePackRecovery({ items: [packItem], versions: [packVersion], storage: storageWith([evidence()], []) }),
    }))
    expect(report.rehearsalStatus).toBe("PASSED")
    expect(report.recoveryVerification.verification).toBe("BLOCKED")
    const text = renderReportText(report)
    expect(text).toContain("Rehearsal execution: PASSED")
    expect(text).toContain("Recovery verification: BLOCKED")
  })

  it("leaves signoff to an Owner rather than recording its own approval", () => {
    const report = buildRecoveryReport(input())
    expect(report.signoff.approvedBy).toBeNull()
    expect(report.signoff.approvedAt).toBeNull()
    expect(renderReportText(report)).toContain("Not yet approved")
  })

  it("never presents a rehearsal duration as a recovery target", () => {
    const report = buildRecoveryReport(input({ rpoRtoObservations: ["schema rebuilt in 2.1 seconds"] }))
    const text = renderReportText(report)
    expect(text).toContain("schema rebuilt in 2.1 seconds")
    expect(text).toContain("not an approved recovery target")
  })

  it("states unresolved gaps with their severity instead of leaving them implicit", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: [{ severity: "LIMITATION", detail: "no live Supabase restore has been performed" }],
    }))
    expect(renderReportText(report)).toContain("LIMITATION: no live Supabase restore has been performed")
  })

  it("summarises storage and job reconciliation without disclosing object paths", () => {
    const report = buildRecoveryReport(input({ storage: storageWith([evidence()], []) }))
    const text = renderReportText(report)
    expect(text).toContain("DATABASE_ONLY: 1")
    expect(text).toContain("Blind replay permitted: no")
    expect(text).not.toContain("cases/")
  })

  it("says byte-level integrity is unproven when only size and content type matched", () => {
    const text = renderReportText(buildRecoveryReport(input({ storage: structuralStorage })))
    expect(text).toContain("Byte-level integrity: UNPROVEN")
    expect(text).toContain("Structurally matched (bucket, key, size, content type): yes")
  })
})

describe("deriving the recovery verification", () => {
  it("verifies a clean synthetic recovery where every domain was exercised", () => {
    const result = deriveRecoveryVerification(status())
    expect(result.verification).toBe("VERIFIED")
    expect(result.blockers).toEqual([])
    expect(result.limitations).toEqual([])
  })

  it("blocks on a failed recovery check", () => {
    const result = deriveRecoveryVerification(status({
      checks: [{ name: "every pack item resolves", passed: false, detail: "one item lost its version" }],
    }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers[0]).toContain("every pack item resolves")
  })

  it("blocks when the fingerprint changed", () => {
    const result = deriveRecoveryVerification(status({
      fingerprint: { matched: false, differences: [{ area: "tableRowCounts", key: "public.cases", before: "1", after: "0" }] },
    }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers[0]).toContain("fingerprint differs in 1")
  })

  it.each([
    ["DATABASE_ONLY", storageWith([evidence({ checksum: "cafe" })], [])],
    ["OBJECT_ONLY", storageWith([], [object({ checksum: "cafe" })])],
    ["METADATA_MISMATCH", storageWith([evidence({ checksum: "cafe" })], [object({ checksum: "cafe", sizeBytes: 1 })])],
    ["CHECKSUM_MISMATCH", storageWith([evidence({ checksum: "cafe" })], [object({ checksum: "beef" })])],
  ])("blocks on a %s storage outcome", (outcome, storage) => {
    const result = deriveRecoveryVerification(status({ storage }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers.join(" ")).toContain(outcome)
  })

  it("blocks when no object inventory was supplied, rather than treating silence as success", () => {
    const result = deriveRecoveryVerification(status({ storage: storageWith([evidence()], null) }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers[0]).toContain("no object inventory was supplied")
  })

  it("treats a structural match without a content hash as partial, never full, recovery", () => {
    const result = deriveRecoveryVerification(status({ storage: structuralStorage }))
    expect(result.verification).toBe("PARTIALLY_VERIFIED")
    expect(result.limitations.join(" ")).toContain("byte-level integrity is unproven")
  })

  it("blocks on an unproven structural match when the scenario requires byte integrity", () => {
    const result = deriveRecoveryVerification(status({
      scope: { verifiesRecoveredState: true, requiresByteIntegrity: true },
      storage: structuralStorage,
    }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers.join(" ")).toContain("byte-level integrity is unproven")
  })

  it("keeps an incomplete upload visible without pretending an object went missing", () => {
    const storage = storageWith([evidence({ checksum: "cafe" }), evidence({
      versionId: "5e5e5e5e-0000-4000-8000-000000000081",
      key: rehearsalStorageKey(caseId, documentId, "5e5e5e5e-0000-4000-8000-000000000081"),
      uploadStatus: "PENDING_UPLOAD",
    })], [object({ checksum: "cafe" })])
    expect(storage.counts.DATABASE_ONLY).toBe(0)
    expect(storage.incompleteUploads).toBe(1)
    const result = deriveRecoveryVerification(status({ storage }))
    expect(result.verification).toBe("PARTIALLY_VERIFIED")
    expect(result.limitations.join(" ")).toContain("never finished uploading")
  })

  it("blocks on a prepared pack that cannot be rebuilt as approved", () => {
    const result = deriveRecoveryVerification(status({
      packs: validatePackRecovery({ items: [packItem], versions: [], storage: provenStorage }),
    }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers.join(" ")).toContain("1 prepared pack(s) cannot be rebuilt")
  })

  it("blocks while the restored queue still needs human or provider reconciliation", () => {
    const leased: JobRecord = {
      jobId: "5e5e5e5e-0000-4000-8000-000000000120",
      jobType: "SYSTEM_HEALTH_PROBE",
      idempotencyKey: "rehearsal-job-0001",
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 5,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      leaseOwner: "worker-that-no-longer-exists",
    }
    const jobs = reconcileJobRecovery({ jobs: [leased], outbox: [], now: new Date(), providerGatesEnabled: false })
    const result = deriveRecoveryVerification(status({ jobs }))
    expect(result.verification).toBe("BLOCKED")
    expect(result.blockers.join(" ")).toContain("human or provider reconciliation")
  })

  it("does not invent a blocker from a clean job and outbox state", () => {
    expect(deriveRecoveryVerification(status({ jobs: cleanJobs })).verification).toBe("VERIFIED")
  })

  it("reports a domain that was not exercised as a limitation, not a blocker", () => {
    const result = deriveRecoveryVerification(status({ storage: null, packs: null, jobs: null }))
    expect(result.verification).toBe("PARTIALLY_VERIFIED")
    expect(result.blockers).toEqual([])
    expect(result.limitations).toHaveLength(3)
  })

  it("blocks when storage is absent but the scenario requires byte integrity", () => {
    const result = deriveRecoveryVerification(status({
      scope: { verifiesRecoveredState: true, requiresByteIntegrity: true },
      storage: null,
    }))
    expect(result.verification).toBe("BLOCKED")
  })

  it("distinguishes an Owner decision from an immediate recovery blocker", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: [{ severity: "INFO", detail: "no production RPO or RTO has been approved" }],
    }))
    expect(report.rehearsalStatus).toBe("PASSED")
    expect(report.recoveryVerification.verification).toBe("VERIFIED")

    const blocked = deriveRecoveryVerification(status({
      unresolvedGaps: [{ severity: "BLOCKER", detail: "the evidence inventory could not be collected" }],
    }))
    expect(blocked.verification).toBe("BLOCKED")
  })

  it("reports NOT_APPLICABLE for an execution-only exercise", () => {
    const result = deriveRecoveryVerification(status({
      scope: { verifiesRecoveredState: false, requiresByteIntegrity: false },
      storage: null,
      packs: null,
      jobs: null,
      fingerprint: null,
    }))
    expect(result.verification).toBe("NOT_APPLICABLE")
    expect(result.blockers).toEqual([])
  })
})

describe("machine-readable serialisation", () => {
  const blockedStorage = storageWith([evidence(), evidence({
    versionId: "5e5e5e5e-0000-4000-8000-000000000082",
    key: rehearsalStorageKey(caseId, documentId, "5e5e5e5e-0000-4000-8000-000000000082"),
  })], [object()])
  const staleJobs = reconcileJobRecovery({
    jobs: [{
      jobId: "5e5e5e5e-0000-4000-8000-000000000121",
      jobType: "SYSTEM_HEALTH_PROBE",
      idempotencyKey: "rehearsal-job-0002",
      status: "RUNNING",
      attempts: 1,
      maxAttempts: 5,
      leaseExpiresAt: new Date(Date.now() - 1000),
      leaseOwner: "rehearsal-worker",
    }],
    outbox: [{ outboxId: "5e5e5e5e-0000-4000-8000-000000000130", eventKey: "rehearsal-event-1", topic: "SYSTEM", promoted: false, hasJob: false }],
    now: new Date(),
    providerGatesEnabled: false,
  })

  function fullReport() {
    return buildRecoveryReport(input({
      checks: [{ name: "chain applied in order", passed: true, detail: "26 migrations applied with nothing cherry-picked" }],
      fingerprint: { matched: false, differences: [{ area: "tableRowCounts", key: "public.cases", before: "2", after: "1" }] },
      storage: blockedStorage,
      packs: validatePackRecovery({ items: [packItem], versions: [], storage: blockedStorage }),
      jobs: staleJobs,
      unresolvedGaps: [{ severity: "LIMITATION", detail: "no live AWS operation was performed" }],
      rpoRtoObservations: ["clean rebuild completed in 2.2 seconds against in-process PostgreSQL"],
    }))
  }

  it("keeps nested check fields through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.checks[0].name).toBe("chain applied in order")
    expect(parsed.checks[0].passed).toBe(true)
    expect(parsed.checks[0].detail).toBe("26 migrations applied with nothing cherry-picked")
  })

  it("keeps nested fingerprint differences through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.fingerprint.matched).toBe(false)
    expect(parsed.fingerprint.differences[0]).toEqual({
      after: "1",
      area: "tableRowCounts",
      before: "2",
      key: "public.cases",
    })
  })

  it("keeps nested storage counts and reconciliation rows through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.storage.counts.MATCHED).toBe(1)
    expect(parsed.storage.counts.DATABASE_ONLY).toBe(1)
    expect(parsed.storage.rows.length).toBe(2)
    const missing = parsed.storage.rows.find((row: { outcome: string }) => row.outcome === "DATABASE_ONLY")
    expect(missing.reasons).toContain("object_missing")
    expect(missing.objectDigest).toHaveLength(16)
    expect(parsed.storage.byteIntegrityProven).toBe(false)
    expect(parsed.storage.inventorySupplied).toBe(true)
  })

  it("keeps nested prepared pack findings through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.packs.items[0].outcome).toBe("VERSION_MISSING")
    expect(parsed.packs.items[0].versionId).toBe(versionId)
    expect(parsed.packs.nonRecoverablePacks).toEqual([packId])
    expect(parsed.packs.blocked).toBe(true)
  })

  it("keeps nested job findings through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.jobs.counts.release_stale_lease).toBe(1)
    expect(parsed.jobs.counts.promote_outbox_entry).toBe(1)
    expect(parsed.jobs.requiresHumanReview).toBe(false)
    expect(parsed.jobs.blindReplayPermitted).toBe(false)
    expect(parsed.jobs.findings[0].classification).toBe("expired lease")
    expect(parsed.jobs.findings[0].action).toBe("release_stale_lease")
  })

  it("keeps nested signoff and status fields through a round trip", () => {
    const parsed = JSON.parse(renderReportJson(fullReport()))
    expect(parsed.signoff.approvedBy).toBeNull()
    expect(parsed.signoff.approvedAt).toBeNull()
    expect(parsed.signoff.note).toContain("An Owner signs this off")
    expect(parsed.rehearsalStatus).toBe("PASSED")
    expect(parsed.recoveryVerification.verification).toBe("BLOCKED")
    expect(parsed.recoveryVerification.blockers.length).toBeGreaterThan(0)
  })

  it("sorts keys at every depth so two runs diff cleanly", () => {
    const first = renderReportJson(fullReport())
    expect(renderReportJson(fullReport())).toBe(first)
    const parsed = JSON.parse(first)
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort())
    expect(Object.keys(parsed.checks[0])).toEqual(["detail", "name", "passed"])
    expect(Object.keys(parsed.signoff)).toEqual(["approvedAt", "approvedBy", "note"])
  })

  it("preserves array order rather than sorting values", () => {
    const report = buildRecoveryReport(input({
      checks: [
        { name: "zulu", passed: true, detail: "first" },
        { name: "alpha", passed: true, detail: "second" },
      ],
    }))
    const parsed = JSON.parse(renderReportJson(report))
    expect(parsed.checks.map((check: { name: string }) => check.name)).toEqual(["zulu", "alpha"])
  })

  it("does not mutate the report it was given", () => {
    const report = fullReport()
    const before = structuredClone(report)
    renderReportJson(report)
    expect(report).toEqual(before)
    expect(Object.keys(report)).toEqual(Object.keys(before))
    expect(Object.keys(report.checks[0])).toEqual(Object.keys(before.checks[0]))
  })
})

describe("report safety", () => {
  const cases: [string, string][] = [
    ["presigned URL", "https://bucket.s3.amazonaws.com/object?X-Amz-Signature=deadbeefdeadbeef"],
    ["AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
    ["evidence storage key", "cases/11111111-1111-4111-8111-111111111111/documents/x"],
    ["Google access token", "ya29.aBcDeFgHiJkLmNoP"],
    ["Google refresh token", "token 1//0gLongRefreshTokenValueHere"],
    ["Google client secret", "GOCSPX-abcdefgh1234"],
    ["Stripe secret key", "sk_test_abcdefgh12345678"],
    ["bearer token", "Authorization: Bearer abcdefghijklmnopqrst"],
    ["session token hash", '{"token_hash":"abc"}'],
    ["email address", "customer.one@rehearsal.invalid"],
    ["UK telephone number", "+447700900001"],
  ]

  it.each(cases)("refuses to render a report carrying a %s", (name, value) => {
    expect(() => assertReportIsSafe(value)).toThrow(UnsafeReportError)
    expect(() => assertReportIsSafe(value)).toThrow(new RegExp(name))
  })

  it("throws rather than quietly redacting, because a leaking report is a defect", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: [{ severity: "INFO", detail: "operator reached s3 via https://x/y?X-Amz-Signature=aaaabbbbccccdddd" }],
    }))
    expect(() => renderReportText(report)).toThrow(UnsafeReportError)
    expect(() => renderReportJson(report)).toThrow(UnsafeReportError)
  })

  it("catches unsafe data buried several levels deep in the structure", () => {
    const report = buildRecoveryReport(input({
      packs: {
        recoverablePacks: [],
        nonRecoverablePacks: [packId],
        blocked: true,
        items: [{
          packId,
          itemId,
          versionId,
          outcome: "OBJECT_NOT_RECOVERED",
          detail: "operator note: cases/11111111-1111-4111-8111-111111111111/documents/abc was absent",
        }],
      },
    }))
    expect(() => renderReportJson(report)).toThrow(UnsafeReportError)
    expect(() => renderReportJson(report)).toThrow(/evidence storage key/)
    expect(() => renderReportText(report)).toThrow(UnsafeReportError)
  })

  it("accepts a report built only from counts, states and digests", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: [{ severity: "LIMITATION", detail: "no live AWS operation was performed" }],
      rpoRtoObservations: ["clean rebuild completed in 2.2 seconds against in-process PostgreSQL"],
    }))
    expect(() => renderReportText(report)).not.toThrow()
    expect(() => renderReportJson(report)).not.toThrow()
  })
})
