import { timingSafeEqual } from "node:crypto"
import type { ProviderMode } from "./model"

export type JobWorkerConfig = {
  enabled: boolean
  environment: string
  providerMode: ProviderMode
  cronSecret: string | null
  deploymentId: string | null
  workerName: string
}

export function productionProviderAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production"
}

export function resolveProviderMode(env: NodeJS.ProcessEnv = process.env): ProviderMode {
  const requested = env.JOB_PROVIDER_MODE
  if (requested === "production") {
    if (!productionProviderAllowed(env)) return "disabled"
    return "production"
  }
  if (requested === "mock") return "mock"
  return "disabled"
}

export function jobWorkerConfig(env: NodeJS.ProcessEnv = process.env): JobWorkerConfig {
  const cronSecret = env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null
  const environment = env.VERCEL_ENV || "local"
  const enabled = env.JOB_WORKER_ENABLED === "true"
    && environment === "production"
    && !!cronSecret
  return {
    enabled,
    environment,
    providerMode: resolveProviderMode(env),
    cronSecret,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ? env.VERCEL_DEPLOYMENT_ID.slice(0, 80) : null,
    workerName: "admin-jobs",
  }
}

export function cronAuthorized(header: string | null, secret: string | null): "missing_secret" | "unauthorized" | "ok" {
  if (!secret) return "missing_secret"
  if (!header?.startsWith("Bearer ")) return "unauthorized"
  const token = header.slice(7)
  const expected = Buffer.from(secret)
  const provided = Buffer.from(token)
  if (provided.length !== expected.length) {
    timingSafeEqual(expected, expected)
    return "unauthorized"
  }
  return timingSafeEqual(provided, expected) ? "ok" : "unauthorized"
}

export function canRegisterLiveProvider(mode: ProviderMode, env: NodeJS.ProcessEnv = process.env): boolean {
  return mode === "production" && productionProviderAllowed(env)
}
