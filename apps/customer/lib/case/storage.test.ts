import { afterEach, describe, expect, it } from "vitest"
import { DEV_EVIDENCE_BUCKET, PROD_EVIDENCE_BUCKET, customerEvidenceAwsConfig } from "./config"
import { createCustomerEvidenceStorage, isAllowedReadExpiry, presignedPostInput, signedUrlExpiresSeconds } from "./storage"
import { MAX_EVIDENCE_BYTES, READ_EXPIRES_SECONDS, UPLOAD_EXPIRES_SECONDS, evidenceObjectKey } from "./model"

describe("customer evidence storage policy", () => {
  afterEach(() => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    delete process.env.AWS_SESSION_TOKEN
    delete process.env.AWS_REGION
    delete process.env.AWS_EVIDENCE_BUCKET
    delete process.env.AWS_CUSTOMER_EVIDENCE_ROLE_ARN
    delete process.env.AWS_EVIDENCE_ROLE_ARN
    delete process.env.VERCEL_ENV
  })

  it("uses the customer role only and pins Preview to DEV / Production to PROD", () => {
    process.env.AWS_REGION = "eu-west-2"
    process.env.AWS_EVIDENCE_BUCKET = DEV_EVIDENCE_BUCKET
    process.env.AWS_CUSTOMER_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/ProfileRelaunchDevCustomerEvidence"
    process.env.AWS_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/AdminEvidenceTestRole"
    process.env.VERCEL_ENV = "preview"
    expect(customerEvidenceAwsConfig()?.bucket).toBe(DEV_EVIDENCE_BUCKET)
    expect(customerEvidenceAwsConfig()?.roleArn).toMatch(/DevCustomerEvidence/)

    process.env.AWS_EVIDENCE_BUCKET = PROD_EVIDENCE_BUCKET
    process.env.AWS_CUSTOMER_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/ProfileRelaunchProdCustomerEvidence"
    expect(customerEvidenceAwsConfig()).toBeNull()

    process.env.VERCEL_ENV = "production"
    expect(customerEvidenceAwsConfig()?.bucket).toBe(PROD_EVIDENCE_BUCKET)

    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"
    expect(customerEvidenceAwsConfig()).toBeNull()
    expect(createCustomerEvidenceStorage()).toBeNull()
  })

  it("limits the presigned POST to five minutes, the exact key, type and 10 MB", () => {
    const key = evidenceObjectKey("55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777")
    const policy = presignedPostInput(key, "image/png")
    expect(policy.Expires).toBe(UPLOAD_EXPIRES_SECONDS)
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

  it("limits signed GET expiry to 60 seconds", () => {
    expect(READ_EXPIRES_SECONDS).toBe(60)
    expect(isAllowedReadExpiry(60)).toBe(true)
    expect(isAllowedReadExpiry(61)).toBe(false)
    expect(signedUrlExpiresSeconds("https://s3.example/object?X-Amz-Expires=60")).toBe(60)
    expect(signedUrlExpiresSeconds("https://s3.example/object?X-Amz-Expires=120")).toBe(120)
    expect(isAllowedReadExpiry(signedUrlExpiresSeconds("https://s3.example/object?X-Amz-Expires=120"))).toBe(false)
  })
})
