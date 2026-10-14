import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEV_EVIDENCE_BUCKET, PROD_EVIDENCE_BUCKET } from "./config"
import { MAX_EVIDENCE_BYTES } from "./model"
import {
  INTEGRITY_MAX_BYTES,
  DEV_EVIDENCE_BUCKET as integrityDevBucket,
  PROD_EVIDENCE_BUCKET as integrityProdBucket,
  PROD_SUPABASE_HOST_FRAGMENT,
  assertApplyAllowed,
  assertCredentialMode,
  assertRecoveryMapping,
  byteIntegrityProven,
  integrityExitCode,
  readAtMost,
  readBoundedObjectBody,
  resolveReadBucket,
  runIntegrityPass,
  sha256Hex,
  type IntegrityPage,
  type IntegrityVersion,
  type ObjectRead,
} from "./integrity"

const versionId = "77777777-7777-4777-8777-777777777777"
const secondId = "88888888-8888-4888-8888-888888888888"
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
const digest = sha256Hex(pdf)

function version(overrides: Partial<IntegrityVersion> = {}): IntegrityVersion {
  return {
    versionId,
    declaredSizeBytes: pdf.byteLength,
    storageBucket: DEV_EVIDENCE_BUCKET,
    storageKey: "cases/55555555-5555-4555-8555-555555555555/documents/66666666-6666-4666-8666-666666666666/versions/77777777-7777-4777-8777-777777777777",
    scanStatus: "NO_THREATS_FOUND",
    hasDigest: false,
    ...overrides,
  }
}

function pageOf(rows: IntegrityVersion[], counts: Partial<IntegrityPage> = {}): (after: string | null) => Promise<IntegrityPage> {
  return async after => ({
    versions: rows
      .filter(row => !after || row.versionId > after)
      .sort((left, right) => left.versionId < right.versionId ? -1 : left.versionId > right.versionId ? 1 : 0),
    uploadedCount: counts.uploadedCount ?? rows.length,
    excludedPendingUploadCount: counts.excludedPendingUploadCount ?? 0,
    excludedFailedCount: counts.excludedFailedCount ?? 0,
  })
}

describe("evidence SHA-256 integrity", () => {
  it("uses the same DEV and Production buckets as the Admin evidence config", () => {
    expect(integrityDevBucket).toBe(DEV_EVIDENCE_BUCKET)
    expect(integrityProdBucket).toBe(PROD_EVIDENCE_BUCKET)
    expect(INTEGRITY_MAX_BYTES).toBe(MAX_EVIDENCE_BYTES)
    expect(PROD_SUPABASE_HOST_FRAGMENT).toBe("cxwwekdzkkjjbiyofrov")
  })

  it("refuses apply against Production and allows read-only check and restore", () => {
    const production = {
      bucket: PROD_EVIDENCE_BUCKET,
      vercelEnv: "production",
      supabaseUrl: `https://${PROD_SUPABASE_HOST_FRAGMENT}.supabase.co`,
    }
    expect(() => assertApplyAllowed({ mode: "apply", ...production })).toThrow(/refused for Production/)
    expect(() => assertApplyAllowed({ mode: "apply", bucket: PROD_EVIDENCE_BUCKET, supabaseUrl: "https://example.supabase.co" })).toThrow(/refused for Production/)
    expect(() => assertApplyAllowed({ mode: "apply", bucket: DEV_EVIDENCE_BUCKET, vercelEnv: "production", supabaseUrl: "https://example.supabase.co" })).toThrow(/refused for Production/)
    expect(() => assertApplyAllowed({ mode: "apply", bucket: DEV_EVIDENCE_BUCKET, supabaseUrl: production.supabaseUrl })).toThrow(/refused for Production/)
    expect(() => assertApplyAllowed({ mode: "apply", bucket: "other-bucket", supabaseUrl: "https://example.supabase.co" })).toThrow(/DEV evidence bucket/)
    expect(() => assertApplyAllowed({ mode: "check", ...production })).not.toThrow()
    expect(() => assertApplyAllowed({ mode: "restore", ...production })).not.toThrow()
    expect(() => assertApplyAllowed({ mode: "apply", bucket: DEV_EVIDENCE_BUCKET, vercelEnv: "preview", supabaseUrl: "https://example.supabase.co" })).not.toThrow()
  })

  it("records good bytes once and does not write again on a repeated backfill", async () => {
    const writes: boolean[] = []
    const stored = { digest: null as string | null, verifiedAt: "2026-10-14T00:00:00.000Z" }
    const pass = (mode: "check" | "apply" | "restore", hasDigest: boolean) => runIntegrityPass({
      mode,
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([version({ hasDigest })]),
      readObject: async () => ({ kind: "bytes", bytes: pdf }),
      record: async (_version, next, _size, write) => {
        writes.push(write)
        if (!write) return { status: stored.digest === next ? "already_trusted" : "mismatch" }
        if (stored.digest && stored.digest !== next) return { status: "mismatch" }
        stored.digest = next
        return { status: "recorded" }
      },
    })
    const preview = await pass("check", false)
    expect(preview.findings[0].outcome).toBe("would_record")
    expect(writes).toEqual([])
    const first = await pass("apply", false)
    expect(first.findings[0].outcome).toBe("recorded")
    expect(stored.digest).toBe(digest)
    const verifiedAt = stored.verifiedAt
    const second = await pass("apply", true)
    expect(second.findings[0].outcome).toBe("already_trusted")
    expect(stored.verifiedAt).toBe(verifiedAt)
    expect(writes).toEqual([true, false])
    expect(JSON.stringify(second.findings)).not.toContain(digest)
    expect(JSON.stringify(second.findings)).not.toContain("storageKey")
  })

  it("reports modified bytes, a missing object, a size mismatch and an unreadable object", async () => {
    const rows = [
      version(),
      version({ versionId: secondId, hasDigest: true }),
      version({ versionId: "99999999-9999-4999-8999-999999999999", hasDigest: true, declaredSizeBytes: 99 }),
      version({ versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hasDigest: true }),
    ]
    const reads: ObjectRead[] = [
      { kind: "missing" },
      { kind: "bytes", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
      { kind: "bytes", bytes: pdf },
      { kind: "unreadable" },
    ]
    const result = await runIntegrityPass({
      mode: "restore",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf(rows),
      readObject: async () => reads.shift()!,
      record: async () => ({ status: "mismatch" }),
    })
    expect(result.findings.map(finding => finding.outcome)).toEqual(["missing", "mismatch", "size_mismatch", "unreadable"])
    expect(integrityExitCode("restore", result)).toBe(1)
    expect(byteIntegrityProven(result.findings)).toBe(false)
  })

  it("does not read an object in another bucket or an object that is no longer clean", async () => {
    const read: string[] = []
    const result = await runIntegrityPass({
      mode: "check",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([
        version({ storageBucket: PROD_EVIDENCE_BUCKET }),
        version({ versionId: secondId }),
      ]),
      readObject: async row => {
        read.push(row.versionId)
        return { kind: "not_clean" }
      },
      record: async () => { throw new Error("must not record") },
    })
    expect(read).toEqual([secondId])
    expect(result.findings.map(finding => finding.outcome)).toEqual(["bucket_mismatch", "not_clean"])
  })

  it("resumes a restore from the last completed version", async () => {
    const rows = [version(), version({ versionId: secondId, hasDigest: true })]
    const page = pageOf(rows)
    const readObject = async (): Promise<ObjectRead> => ({ kind: "bytes", bytes: pdf })
    const record = async () => ({ status: "already_trusted" as const })
    const first = await runIntegrityPass({
      mode: "restore", bucket: DEV_EVIDENCE_BUCKET, maxVersions: 1, page, readObject, record,
    })
    expect(first.findings.map(finding => finding.outcome)).toEqual(["unverified"])
    expect(first.cursor).toBe(versionId)
    expect(first.stoppedEarly).toBe(true)
    expect(integrityExitCode("restore", first)).toBe(1)
    const second = await runIntegrityPass({
      mode: "restore", bucket: DEV_EVIDENCE_BUCKET, after: first.cursor, page, readObject, record,
    })
    expect(second.findings).toEqual([expect.objectContaining({ versionId: secondId, outcome: "match" })])
    expect(second.stoppedEarly).toBe(false)
    expect(second.resumed).toBe(true)
    expect(byteIntegrityProven(second.findings)).toBe(true)
    expect(integrityExitCode("restore", second)).toBe(3)
  })

  it("keeps the operator script read-only by default and free of printed object keys", () => {
    const source = readFileSync(new URL("../../../../scripts/evidence-sha256.mjs", import.meta.url), "utf8")
    const policy = readFileSync(new URL("./integrity.ts", import.meta.url), "utf8")
    const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8")
    expect(source).toContain('argument(argv, "--mode") ?? "check"')
    expect(source).toContain("assertApplyAllowed")
    expect(source).toContain("assertCredentialMode")
    expect(source).toContain("assertRecoveryMapping")
    expect(source).toContain("fromWebToken")
    expect(source).toContain("readBoundedObjectBody")
    expect(policy).toContain("static AWS keys are refused")
    expect(source).not.toMatch(/PutObject|ETag|transformToByteArray/)
    expect(storage).not.toMatch(/transformToByteArray/)
    expect(source).toContain("never writes an object")
    expect(source).not.toMatch(/console\.log\([^)]*storageKey/)
  })

  it("treats a stored scan that is not clean as not_clean and does not read those bytes", async () => {
    const clean = "99999999-9999-4999-8999-999999999999"
    const read: string[] = []
    const result = await runIntegrityPass({
      mode: "restore",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([
        version({ scanStatus: "THREATS_FOUND" }),
        version({ versionId: secondId, scanStatus: "FAILED" }),
        version({ versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", scanStatus: "PENDING" }),
        version({ versionId: clean, hasDigest: true }),
      ], { excludedPendingUploadCount: 1, excludedFailedCount: 2 }),
      readObject: async row => {
        read.push(row.versionId)
        return { kind: "bytes", bytes: pdf }
      },
      record: async () => ({ status: "already_trusted" }),
    })
    expect(read).toEqual([clean])
    expect(result.findings.map(item => item.outcome)).toEqual(["not_clean", "not_clean", "match", "not_clean"])
    expect(result.expectedUploaded).toBe(4)
    expect(result.covered).toBe(4)
    expect(result.coverageComplete).toBe(true)
    expect(result.excludedPendingUploadCount).toBe(1)
    expect(integrityExitCode("restore", result)).toBe(1)
  })

  it("returns a non-zero restore status for unverified, incomplete and empty evidence", async () => {
    const unverified = await runIntegrityPass({
      mode: "restore",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([version()]),
      readObject: async () => ({ kind: "bytes", bytes: pdf }),
      record: async () => { throw new Error("must not record") },
    })
    expect(unverified.findings[0].outcome).toBe("unverified")
    expect(unverified.coverageComplete).toBe(true)
    expect(integrityExitCode("restore", unverified)).toBe(1)

    const empty = await runIntegrityPass({
      mode: "restore",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([], { uploadedCount: 0, excludedPendingUploadCount: 2 }),
      readObject: async () => { throw new Error("must not read") },
      record: async () => { throw new Error("must not record") },
    })
    expect(empty.findings).toEqual([])
    expect(empty.coverageComplete).toBe(true)
    expect(byteIntegrityProven(empty.findings)).toBe(false)
    expect(integrityExitCode("restore", empty)).toBe(0)

    const preview = await runIntegrityPass({
      mode: "check",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([version()]),
      readObject: async () => ({ kind: "bytes", bytes: pdf }),
      record: async () => { throw new Error("must not record") },
    })
    expect(preview.findings[0].outcome).toBe("would_record")
    expect(integrityExitCode("check", preview)).toBe(0)

    const limited = await runIntegrityPass({
      mode: "check",
      bucket: DEV_EVIDENCE_BUCKET,
      maxVersions: 1,
      page: pageOf([version({ hasDigest: true }), version({ versionId: secondId, hasDigest: true })]),
      readObject: async () => ({ kind: "bytes", bytes: pdf }),
      record: async () => ({ status: "already_trusted" }),
    })
    expect(limited.stoppedEarly).toBe(true)
    expect(integrityExitCode("check", limited)).toBe(3)
  })

  it("reads a mapped recovery bucket without treating it as the metadata bucket", async () => {
    const recovery = "profilerelaunch-evidence-prod-recovery-lab"
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: PROD_EVIDENCE_BUCKET, recoveryBucket: recovery })).not.toThrow()
    expect(() => assertRecoveryMapping({ mode: "check", metadataBucket: DEV_EVIDENCE_BUCKET, recoveryBucket: "profilerelaunch-evidence-dev-recovery-lab1" })).not.toThrow()
    expect(() => assertRecoveryMapping({ mode: "apply", metadataBucket: DEV_EVIDENCE_BUCKET, recoveryBucket: "profilerelaunch-evidence-dev-recovery-lab1" })).toThrow(/apply cannot use a recovery bucket/)
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: PROD_EVIDENCE_BUCKET, recoveryBucket: DEV_EVIDENCE_BUCKET })).toThrow(/separate recovery bucket/)
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: DEV_EVIDENCE_BUCKET, recoveryBucket: PROD_EVIDENCE_BUCKET })).toThrow(/separate recovery bucket/)
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: PROD_EVIDENCE_BUCKET, recoveryBucket: "profilerelaunch-evidence-dev-recovery-lab" })).toThrow(/Production recovery bucket/)
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: DEV_EVIDENCE_BUCKET, recoveryBucket: "profilerelaunch-evidence-prod-recovery-lab" })).toThrow(/DEV recovery bucket/)
    expect(() => assertRecoveryMapping({ mode: "restore", metadataBucket: "other-bucket", recoveryBucket: recovery })).toThrow(/canonical DEV or Production/)
    expect(resolveReadBucket(PROD_EVIDENCE_BUCKET, recovery)).toBe(recovery)
    expect(resolveReadBucket(DEV_EVIDENCE_BUCKET, null)).toBe(DEV_EVIDENCE_BUCKET)

    const read: string[] = []
    const result = await runIntegrityPass({
      mode: "restore",
      bucket: PROD_EVIDENCE_BUCKET,
      recoveryBucket: recovery,
      page: pageOf([
        version({ storageBucket: PROD_EVIDENCE_BUCKET, hasDigest: true }),
        version({ versionId: secondId, storageBucket: recovery, hasDigest: true }),
      ]),
      readObject: async row => {
        read.push(row.storageBucket)
        return { kind: "bytes", bytes: pdf }
      },
      record: async () => ({ status: "already_trusted" }),
    })
    expect(read).toEqual([PROD_EVIDENCE_BUCKET])
    expect(result.findings.map(item => item.outcome)).toEqual(["match", "bucket_mismatch"])
    await expect(runIntegrityPass({
      mode: "apply",
      bucket: DEV_EVIDENCE_BUCKET,
      recoveryBucket: "profilerelaunch-evidence-dev-recovery-lab",
      page: async () => { throw new Error("must not page") },
      readObject: async () => { throw new Error("must not read") },
      record: async () => { throw new Error("must not record") },
    })).rejects.toThrow(/apply cannot use a recovery bucket/)
  })

  it("refuses static keys and accepts web identity only for the evidence role", () => {
    expect(assertCredentialMode({})).toBe("vercel-oidc")
    expect(() => assertCredentialMode({ AWS_ACCESS_KEY_ID: "AKIA" })).toThrow(/static AWS keys are refused/)
    expect(() => assertCredentialMode({ AWS_SECRET_ACCESS_KEY: "secret" })).toThrow(/static AWS keys are refused/)
    expect(() => assertCredentialMode({ AWS_SESSION_TOKEN: "session" })).toThrow(/static AWS keys are refused/)
    expect(() => assertCredentialMode({ AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/token" })).toThrow(/incomplete/)
    expect(() => assertCredentialMode({
      AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/token",
      AWS_ROLE_ARN: "arn:aws:iam::337909767363:role/Other",
      AWS_EVIDENCE_ROLE_ARN: "arn:aws:iam::337909767363:role/ProfileRelaunchProdAdminEvidence",
    })).toThrow(/evidence role/)
    expect(assertCredentialMode({
      AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/token",
      AWS_ROLE_ARN: "arn:aws:iam::337909767363:role/ProfileRelaunchProdAdminEvidence",
      AWS_EVIDENCE_ROLE_ARN: "arn:aws:iam::337909767363:role/ProfileRelaunchProdAdminEvidence",
    })).toBe("web-identity")
    expect(() => assertCredentialMode({
      AWS_ACCESS_KEY_ID: "AKIA",
      AWS_WEB_IDENTITY_TOKEN_FILE: "/tmp/token",
      AWS_ROLE_ARN: "arn:aws:iam::337909767363:role/ProfileRelaunchProdAdminEvidence",
      AWS_EVIDENCE_ROLE_ARN: "arn:aws:iam::337909767363:role/ProfileRelaunchProdAdminEvidence",
    })).toThrow(/static AWS keys are refused/)
  })

  it("caps an object read at the upload maximum and does not retain the extra bytes", async () => {
    const exact = new Uint8Array(8)
    exact[0] = 7
    async function* parts(chunks: Uint8Array[]) {
      for (const chunk of chunks) yield chunk
    }
    const within = await readAtMost(parts([exact.slice(0, 3), exact.slice(3)]), 8)
    expect(within).toEqual({ bytes: exact, truncated: false })
    const over = await readAtMost(parts([new Uint8Array(4), new Uint8Array(5)]), 8)
    expect(over.truncated).toBe(true)
    expect(over.bytes.byteLength).toBe(0)

    const full = new Uint8Array(MAX_EVIDENCE_BYTES)
    full[0] = 1
    const allowed = await readBoundedObjectBody({
      async *[Symbol.asyncIterator]() { yield full },
    }, MAX_EVIDENCE_BYTES)
    expect(allowed.kind).toBe("bytes")
    if (allowed.kind === "bytes") expect(allowed.bytes.byteLength).toBe(MAX_EVIDENCE_BYTES)

    let started = false
    let destroyed = false
    const declared = await readBoundedObjectBody({
      async *[Symbol.asyncIterator]() { started = true; yield new Uint8Array([1]) },
      destroy() { destroyed = true },
    }, MAX_EVIDENCE_BYTES + 1)
    expect(declared).toEqual({ kind: "oversize" })
    expect(started).toBe(false)
    expect(destroyed).toBe(true)

    let streamDestroyed = false
    const streamed = await readBoundedObjectBody({
      async *[Symbol.asyncIterator]() { yield full; yield new Uint8Array([2]) },
      destroy() { streamDestroyed = true },
    }, undefined)
    expect(streamed).toEqual({ kind: "oversize" })
    expect(streamDestroyed).toBe(true)

    const result = await runIntegrityPass({
      mode: "restore",
      bucket: DEV_EVIDENCE_BUCKET,
      page: pageOf([version({ hasDigest: true })]),
      readObject: async () => ({ kind: "oversize" }),
      record: async () => { throw new Error("must not record") },
    })
    expect(result.findings[0].outcome).toBe("oversize")
    expect(integrityExitCode("restore", result)).toBe(1)
  })
})
