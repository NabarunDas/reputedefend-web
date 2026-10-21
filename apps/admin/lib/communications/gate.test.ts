import { describe, expect, it } from "vitest"
import { acceptanceWindowExpired, communicationsSendEnabled, sendDisabledReason } from "./gate"

const live = {
  VERCEL_ENV: "production",
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_WORKER_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  RESEND_API_KEY: "re_live_key",
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  JOB_WORKER_CADENCE_SECONDS: "300",
}

describe("customer mail activation gate", () => {
  it("fails closed for the current daily Hobby cadence and disabled provider mode", () => {
    expect(communicationsSendEnabled({
      ...live,
      COMMUNICATIONS_SEND_ENABLED: undefined,
      JOB_PROVIDER_MODE: "disabled",
      JOB_WORKER_CADENCE_SECONDS: "86400",
    })).toBe(false)
    expect(communicationsSendEnabled({ ...live, JOB_WORKER_CADENCE_SECONDS: "86400" })).toBe(false)
    expect(communicationsSendEnabled({ ...live, VERCEL_ENV: "preview" })).toBe(false)
    expect(sendDisabledReason(live)).toBe("")
    expect(sendDisabledReason({})).toMatch(/not enabled yet/)
  })

  it("opens the same gate on the develop DEV preview and keeps every other preview closed", () => {
    const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    const dev = {
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      CUSTOMER_ORIGIN: portal,
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
      JOB_WORKER_CADENCE_SECONDS: "86400",
    }
    expect(communicationsSendEnabled(dev)).toBe(true)
    expect(communicationsSendEnabled({ ...dev, JOB_WORKER_ENABLED: undefined })).toBe(true)
    expect(sendDisabledReason(dev)).toBe("")
    expect(communicationsSendEnabled({ ...dev, SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, VERCEL_GIT_COMMIT_REF: "feature" })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove-.vercel.app" })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, CUSTOMER_ORIGIN: "https://customer.profilerelaunch.com" })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-prod-euw2-337909767363" })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, COMMUNICATIONS_SEND_ENABLED: undefined })).toBe(false)
    expect(communicationsSendEnabled({ ...dev, VERCEL_ENV: "production" })).toBe(false)
    expect(sendDisabledReason({ ...dev, RESEND_API_KEY: undefined })).toMatch(/development preview/)
    expect(sendDisabledReason({ ...live, VERCEL_ENV: "preview" })).toMatch(/not enabled yet/)
  })

  it("expires the unknown-acceptance window after 23 hours", () => {
    const start = new Date("2026-09-28T12:00:00.000Z")
    expect(acceptanceWindowExpired(start, Date.parse("2026-09-29T10:59:00.000Z"))).toBe(false)
    expect(acceptanceWindowExpired(start, Date.parse("2026-09-29T11:00:00.000Z"))).toBe(true)
  })
})
