import { afterEach, describe, expect, it } from "vitest"
import { customerEvidenceAwsConfig } from "./config"
import { createCustomerEvidenceStorage, isAllowedReadExpiry, signedUrlExpiresSeconds } from "./storage"
import { READ_EXPIRES_SECONDS } from "./model"

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

  it("uses the customer role only and fails closed on static keys or preview", () => {
    process.env.AWS_REGION = "eu-west-2"
    process.env.AWS_EVIDENCE_BUCKET = "evidence-test-bucket-01"
    process.env.AWS_CUSTOMER_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/CustomerEvidenceReadRole"
    expect(customerEvidenceAwsConfig()?.roleArn).toMatch(/CustomerEvidenceReadRole/)
    process.env.AWS_EVIDENCE_ROLE_ARN = "arn:aws:iam::123456789012:role/AdminEvidenceTestRole"
    expect(customerEvidenceAwsConfig()?.roleArn).toMatch(/CustomerEvidenceReadRole/)
    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE"
    expect(customerEvidenceAwsConfig()).toBeNull()
    expect(createCustomerEvidenceStorage()).toBeNull()
    delete process.env.AWS_ACCESS_KEY_ID
    process.env.VERCEL_ENV = "preview"
    expect(customerEvidenceAwsConfig()).toBeNull()
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
