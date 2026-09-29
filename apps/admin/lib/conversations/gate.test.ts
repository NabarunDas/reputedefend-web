import { describe, expect, it } from "vitest"
import { communicationsInboundEnabled, inboundMailDomain, inboundOwnedAddresses, inboundStorageConfig } from "./gate"

describe("inbound mail gate", () => {
  it("stays disabled without production inbound configuration", () => {
    expect(communicationsInboundEnabled({
      COMMUNICATIONS_INBOUND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_test",
      INBOUND_MAIL_DOMAIN: "reply.profilerelaunch.com",
    })).toBe(false)
    expect(inboundMailDomain({ INBOUND_MAIL_DOMAIN: "profilerelaunch.com" })).toBeNull()
    expect(inboundOwnedAddresses({ COMMUNICATIONS_FROM_EMAIL: "ops@reputedefend.com" })).toEqual(["ops@reputedefend.com"])
  })

  it("fails closed for inbound storage unless dedicated OIDC placeholders are present", () => {
    expect(inboundStorageConfig({
      AWS_ACCESS_KEY_ID: "AKIA",
      AWS_REGION: "eu-west-2",
      AWS_INBOUND_MAIL_BUCKET: "inbound-mail-private",
      AWS_INBOUND_MAIL_ROLE_ARN: "arn:aws:iam::123456789012:role/inbound",
    })).toBeNull()
    expect(inboundStorageConfig({
      VERCEL_ENV: "preview",
      AWS_REGION: "eu-west-2",
      AWS_INBOUND_MAIL_BUCKET: "inbound-mail-private",
      AWS_INBOUND_MAIL_ROLE_ARN: "arn:aws:iam::123456789012:role/inbound",
    })).toBeNull()
    expect(inboundStorageConfig({
      AWS_REGION: "eu-west-2",
    })).toBeNull()
    expect(inboundStorageConfig({
      AWS_REGION: "eu-west-2",
      AWS_INBOUND_MAIL_BUCKET: "inbound-mail-private",
      AWS_INBOUND_MAIL_ROLE_ARN: "arn:aws:iam::123456789012:role/inbound",
    })).toEqual({
      region: "eu-west-2",
      bucket: "inbound-mail-private",
      roleArn: "arn:aws:iam::123456789012:role/inbound",
    })
  })
})
