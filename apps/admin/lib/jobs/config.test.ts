import { afterEach, describe, expect, it } from "vitest"
import { canRegisterLiveProvider, cronAuthorized, jobWorkerConfig, productionProviderAllowed, resolveProviderMode } from "./config"

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

  it("compares Cron bearer tokens without accepting a missing secret", () => {
    expect(cronAuthorized("Bearer secret", null)).toBe("missing_secret")
    expect(cronAuthorized(null, "a".repeat(32))).toBe("unauthorized")
    expect(cronAuthorized("Bearer wrong", "a".repeat(32))).toBe("unauthorized")
    expect(cronAuthorized(`Bearer ${"a".repeat(32)}`, "a".repeat(32))).toBe("ok")
  })
})
