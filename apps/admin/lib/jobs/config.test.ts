import { afterEach, describe, expect, it } from "vitest"
import { canRegisterLiveProvider, cronAuthorized, jobWorkerConfig, lateAfterSeconds, parseWorkerCadenceSeconds, productionProviderAllowed, resolveProviderMode } from "./config"

afterEach(() => {
  // env stubs are local objects in these tests
})

describe("job worker environment safety", () => {
  it("rejects production provider mode outside Vercel production", () => {
    expect(resolveProviderMode({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "preview" })).toBe("disabled")
    expect(resolveProviderMode({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "development" })).toBe("disabled")
    expect(resolveProviderMode({ JOB_PROVIDER_MODE: "production" })).toBe("disabled")
    expect(productionProviderAllowed({ VERCEL_ENV: "preview" })).toBe(false)
    expect(canRegisterLiveProvider("production", { VERCEL_ENV: "preview" })).toBe(false)
    expect(resolveProviderMode({ JOB_PROVIDER_MODE: "production", VERCEL_ENV: "production" })).toBe("production")
    expect(canRegisterLiveProvider("production", { VERCEL_ENV: "production" })).toBe(true)
  })

  it("does not let the DEV payment event flag enable the production worker", () => {
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      VERCEL_ENV: "preview",
      CRON_SECRET: "a".repeat(32),
      DEV_PAYMENT_EVENT_WORKER_ENABLED: "true",
      DEV_PAYMENT_EVENT_WORKER_SECRET: "b".repeat(32),
      PAYMENTS_PROVIDER_MODE: "stripe_test",
    })).toMatchObject({ enabled: false, environment: "preview", workerName: "admin-jobs" })
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      VERCEL_ENV: "production",
      CRON_SECRET: "a".repeat(32),
      DEV_PAYMENT_EVENT_WORKER_ENABLED: "true",
      DEV_PAYMENT_EVENT_WORKER_SECRET: "b".repeat(32),
    })).toMatchObject({ enabled: true, environment: "production", workerName: "admin-jobs" })
  })

  it("does not let the DEV Stripe one-shot flag enable the production worker", () => {
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      VERCEL_ENV: "preview",
      CRON_SECRET: "a".repeat(32),
      DEV_STRIPE_ONE_SHOT_ENABLED: "true",
      PAYMENTS_PROVIDER_MODE: "stripe_test",
    })).toMatchObject({ enabled: false, environment: "preview" })
    expect(jobWorkerConfig({
      VERCEL_ENV: "production",
      DEV_STRIPE_ONE_SHOT_ENABLED: "true",
    })).toMatchObject({ enabled: false, environment: "production" })
  })

  it("keeps the scheduled worker off on the develop DEV mail lane", () => {
    expect(jobWorkerConfig({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      CUSTOMER_ORIGIN: "https://profilerelaunch-customer-git-develop-clientcove.vercel.app",
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
      JOB_WORKER_ENABLED: "true",
      CRON_SECRET: "a".repeat(32),
      JOB_WORKER_CADENCE_SECONDS: "86400",
    })).toMatchObject({ enabled: false, environment: "preview", providerMode: "disabled" })
  })

  it("never enables the worker outside production even when JOB_WORKER_ENABLED is true", () => {
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      VERCEL_ENV: "preview",
      CRON_SECRET: "a".repeat(32),
    })).toMatchObject({ enabled: false, environment: "preview", providerMode: "disabled" })
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      VERCEL_ENV: "production",
      CRON_SECRET: "a".repeat(32),
    })).toMatchObject({ enabled: true, environment: "production", providerMode: "disabled" })
    expect(jobWorkerConfig({
      JOB_WORKER_ENABLED: "true",
      VERCEL_ENV: "production",
    })).toMatchObject({ enabled: false })
  })

  it("defaults worker cadence to the daily Hobby-compatible schedule and rejects unsafe values", () => {
    expect(parseWorkerCadenceSeconds({})).toBe(86400)
    expect(parseWorkerCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "300" })).toBe(300)
    expect(parseWorkerCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "-1" })).toBe(86400)
    expect(parseWorkerCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "9999999" })).toBe(86400)
    expect(parseWorkerCadenceSeconds({ JOB_WORKER_CADENCE_SECONDS: "1.5" })).toBe(86400)
    expect(lateAfterSeconds(86400)).toBe(93600)
    expect(lateAfterSeconds(300)).toBe(600)
    expect(jobWorkerConfig({ VERCEL_ENV: "preview" })).toMatchObject({
      enabled: false, cadenceSeconds: 86400, lateAfterSeconds: 93600,
    })
  })

  it("compares Cron bearer tokens without accepting a missing secret", () => {
    expect(cronAuthorized("Bearer secret", null)).toBe("missing_secret")
    expect(cronAuthorized(null, "a".repeat(32))).toBe("unauthorized")
    expect(cronAuthorized("Bearer wrong", "a".repeat(32))).toBe("unauthorized")
    expect(cronAuthorized(`Bearer ${"a".repeat(32)}`, "a".repeat(32))).toBe("ok")
  })
})
