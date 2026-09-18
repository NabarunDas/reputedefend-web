import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { evidenceAwsConfig } from "./config"
import { createEvidenceStorage, isMissingS3Object, presignedPostInput, probeFromTaggingError } from "./storage"
import { MAX_EVIDENCE_BYTES, UPLOAD_EXPIRES_SECONDS, evidenceObjectKey, isOpaqueEvidenceKey, mapGuardDutyStatus, usesConfiguredEvidenceBucket } from "./model"

const caseId = "55555555-5555-4555-8555-555555555555"
const documentId = "66666666-6666-4666-8666-666666666666"
const versionId = "77777777-7777-4777-8777-777777777777"

describe("evidence storage policy", () => {
  afterEach(() => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    delete process.env.AWS_SESSION_TOKEN
    delete process.env.AWS_REGION
    delete process.env.AWS_EVIDENCE_BUCKET
    delete process.env.AWS_EVIDENCE_ROLE_ARN
    delete process.env.VERCEL_ENV
  })

  it("builds opaque object keys without the original filename", () => {
    const key = evidenceObjectKey(caseId, documentId, versionId)
    expect(key).toBe(`cases/${caseId}/documents/${documentId}/versions/${versionId}`)
    expect(isOpaqueEvidenceKey(key, "Customer Bakery invoice.pdf")).toBe(true)
    expect(key).not.toMatch(/invoice|bakery|customer|\.pdf/i)
  })

  it("limits the presigned POST to five minutes, the exact key, type and 10 MB", () => {
    const key = evidenceObjectKey(caseId, documentId, versionId)
    const policy = presignedPostInput(key, "image/png")
    expect(policy.Expires).toBeLessThanOrEqual(UPLOAD_EXPIRES_SECONDS)
    expect(policy.Expires).toBeLessThanOrEqual(300)
    expect(policy.Key).toBe(key)
    expect(policy.Fields).toEqual({ key, "Content-Type": "image/png" })
    expect(policy.Conditions).toEqual([
      ["eq", "$key", key],
      ["eq", "$Content-Type", "image/png"],
      ["content-length-range", 1, MAX_EVIDENCE_BYTES],
    ])
    expect(MAX_EVIDENCE_BYTES).toBe(10_485_760)
  })

  it("fails closed without OIDC role configuration or when static keys are present", () => {
    process.env.AWS_REGION = "eu-west-2"
    process.env.AWS_EVIDENCE_BUCKET = "evidence-test-bucket-01"
    process.env.AWS_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/AdminEvidenceTestRole"
    expect(evidenceAwsConfig()?.roleArn).toMatch(/^arn:aws:iam::\d+:role\//)
    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"
    process.env.AWS_SECRET_ACCESS_KEY = "secret"
    expect(evidenceAwsConfig()).toBeNull()
    expect(createEvidenceStorage()).toBeNull()
  })

  it("does not use preview or missing environment credentials", () => {
    process.env.AWS_REGION = "eu-west-2"
    process.env.AWS_EVIDENCE_BUCKET = "evidence-test-bucket-01"
    process.env.AWS_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/AdminEvidenceTestRole"
    process.env.VERCEL_ENV = "preview"
    expect(evidenceAwsConfig()).toBeNull()
    delete process.env.VERCEL_ENV
    delete process.env.AWS_EVIDENCE_ROLE_ARN
    expect(evidenceAwsConfig()).toBeNull()
    expect(createEvidenceStorage()).toBeNull()
  })

  it("treats only NoSuchKey and NotFound as a missing object", () => {
    expect(isMissingS3Object(Object.assign(new Error("missing"), { name: "NoSuchKey", Code: "NoSuchKey" }))).toBe(true)
    expect(isMissingS3Object(Object.assign(new Error("missing"), { name: "NotFound" }))).toBe(true)
    expect(probeFromTaggingError(Object.assign(new Error("missing"), { name: "NoSuchKey" }))).toEqual({ exists: false, scan: "PENDING" })
    const denied = Object.assign(new Error("AccessDenied on arn:aws:s3:::secret-bucket"), { name: "AccessDenied", Code: "AccessDenied" })
    expect(isMissingS3Object(denied)).toBe(false)
    expect(() => probeFromTaggingError(denied)).toThrow(denied)
    expect(() => probeFromTaggingError(new Error("OIDC token exchange failed for arn:aws:iam::123456789012:role/AdminEvidenceTestRole"))).toThrow(/OIDC token exchange failed/)
    expect(usesConfiguredEvidenceBucket({ storageBucket: "evidence-test-bucket-01" }, "evidence-test-bucket-01")).toBe(true)
    expect(usesConfiguredEvidenceBucket({ storageBucket: "evidence-test-bucket-01" }, "prod-evidence-bucket")).toBe(false)
  })

  it("maps only documented GuardDuty tags and treats unknown values as failed", () => {
    expect(mapGuardDutyStatus(undefined)).toBe("PENDING")
    expect(mapGuardDutyStatus("NO_THREATS_FOUND")).toBe("NO_THREATS_FOUND")
    expect(mapGuardDutyStatus("THREATS_FOUND")).toBe("THREATS_FOUND")
    expect(mapGuardDutyStatus("UNSUPPORTED")).toBe("UNSUPPORTED")
    expect(mapGuardDutyStatus("ACCESS_DENIED")).toBe("ACCESS_DENIED")
    expect(mapGuardDutyStatus("FAILED")).toBe("FAILED")
    expect(mapGuardDutyStatus("CLEAN")).toBe("FAILED")
  })

  it("never references static AWS access keys in the adapter", () => {
    const source = [
      readFileSync(new URL("./storage.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./config.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./command.ts", import.meta.url), "utf8"),
    ].join("\n")
    expect(source).not.toMatch(/fromAccessToken|accessKeyId\s*:/)
    expect(source).toContain("awsCredentialsProvider")
    expect(source).toContain("roleArn")
    expect(source).toContain("AWS_ACCESS_KEY_ID")
  })
})
