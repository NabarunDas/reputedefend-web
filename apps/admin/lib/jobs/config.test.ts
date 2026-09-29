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
