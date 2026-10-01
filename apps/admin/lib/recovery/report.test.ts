import { describe, expect, it } from "vitest"
import {
  assertReportIsSafe,
  buildRecoveryReport,
  renderReportJson,
  renderReportText,
  UnsafeReportError,
  type RecoveryReportInput,
} from "./report"
import { reconcileEvidenceStorage } from "./storage"
import { reconcileJobRecovery } from "./jobs"

function input(overrides: Partial<RecoveryReportInput> = {}): RecoveryReportInput {
  return {
    runId: "rehearsal-0001",
    sourceRevision: "6fc926c8c057d6566b0f824c552738014840b793",
    migrationHead: "20261001175315",
    rehearsalType: "clean_schema_rebuild",
    startedAt: "2026-10-01T12:00:00.000Z",
    finishedAt: "2026-10-01T12:00:04.000Z",
    checks: [{ name: "schema rebuilt from zero", passed: true, detail: "26 migrations applied in order" }],
    fingerprint: null,
    storage: null,
    packs: null,
    jobs: null,
    unresolvedGaps: [],
    rpoRtoObservations: [],
    ...overrides,
  }
}

describe("the recovery evidence report", () => {
  it("records the run, the revision, the migration head and that the data was synthetic", () => {
    const report = buildRecoveryReport(input())
    expect(report.syntheticData).toBe(true)
    expect(report.passed).toBe(true)
    const text = renderReportText(report)
    expect(text).toContain("rehearsal-0001")
    expect(text).toContain("6fc926c8c057d6566b0f824c552738014840b793")
    expect(text).toContain("20261001175315")
    expect(text).toContain("no customer data was used")
  })

  it("fails the report when any check failed", () => {
    const report = buildRecoveryReport(input({
      checks: [{ name: "orphan probe", passed: false, detail: "3 versions had no document" }],
    }))
    expect(report.passed).toBe(false)
    expect(renderReportText(report)).toContain("FAIL orphan probe")
  })

  it("fails the report when the fingerprint changed", () => {
    const report = buildRecoveryReport(input({
      fingerprint: { matched: false, differences: [{ area: "tableRowCounts", key: "public.cases", before: "1", after: "0" }] },
    }))
    expect(report.passed).toBe(false)
    expect(renderReportText(report)).toContain("public.cases: 1 became 0")
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

  it("states unresolved gaps instead of leaving them implicit", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: ["no live Supabase restore has been performed"],
    }))
    expect(renderReportText(report)).toContain("no live Supabase restore has been performed")
  })

  it("produces machine-readable output with stable key ordering", () => {
    const first = renderReportJson(buildRecoveryReport(input()))
    const second = renderReportJson(buildRecoveryReport(input()))
    expect(first).toBe(second)
    expect(Object.keys(JSON.parse(first))).toEqual([...Object.keys(JSON.parse(first))].sort())
  })

  it("summarises storage and job reconciliation without disclosing object paths", () => {
    const storage = reconcileEvidenceStorage(
      [{
        versionId: "5e5e5e5e-0000-4000-8000-000000000080",
        documentId: "5e5e5e5e-0000-4000-8000-000000000070",
        caseId: "5e5e5e5e-0000-4000-8000-000000000050",
        bucket: "synthetic-rehearsal-evidence",
        key: "cases/5e5e5e5e-0000-4000-8000-000000000050/documents/5e5e5e5e-0000-4000-8000-000000000070/versions/5e5e5e5e-0000-4000-8000-000000000080",
        sizeBytes: 1,
        contentType: "application/pdf",
        uploadStatus: "UPLOADED",
        scanStatus: "NO_THREATS_FOUND",
        validationStatus: "VALID",
      }],
      { expectedBucket: "synthetic-rehearsal-evidence", inventory: [] },
    )
    const jobs = reconcileJobRecovery({ jobs: [], outbox: [], now: new Date(), providerGatesEnabled: false })
    const text = renderReportText(buildRecoveryReport(input({ storage, jobs })))
    expect(text).toContain("DATABASE_ONLY: 1")
    expect(text).toContain("Blind replay permitted: no")
    expect(text).not.toContain("cases/")
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
      unresolvedGaps: ["operator reached s3 via https://x/y?X-Amz-Signature=aaaabbbbccccdddd"],
    }))
    expect(() => renderReportText(report)).toThrow(UnsafeReportError)
    expect(() => renderReportJson(report)).toThrow(UnsafeReportError)
  })

  it("accepts a report built only from counts, states and digests", () => {
    const report = buildRecoveryReport(input({
      unresolvedGaps: ["no live AWS operation was performed"],
      rpoRtoObservations: ["clean rebuild completed in 2.2 seconds against in-process PostgreSQL"],
    }))
    expect(() => renderReportText(report)).not.toThrow()
    expect(() => renderReportJson(report)).not.toThrow()
  })
})
