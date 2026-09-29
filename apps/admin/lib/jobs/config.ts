import { timingSafeEqual } from "node:crypto"
import type { ProviderMode } from "./model"

export type EnvMap = Record<string, string | undefined>

export const DEFAULT_WORKER_CADENCE_SECONDS = 86400
export const MIN_WORKER_CADENCE_SECONDS = 60
export const MAX_WORKER_CADENCE_SECONDS = 604800

export type JobWorkerConfig = {
  enabled: boolean
  environment: string
  providerMode: ProviderMode
  cronSecret: string | null
  deploymentId: string | null
  workerName: string
  cadenceSeconds: number
  lateAfterSeconds: number
}

export function parseWorkerCadenceSeconds(env: EnvMap = process.env): number {
  const raw = env.JOB_WORKER_CADENCE_SECONDS
  if (raw === undefined || raw === "") return DEFAULT_WORKER_CADENCE_SECONDS
  if (!/^[0-9]+$/.test(raw)) return DEFAULT_WORKER_CADENCE_SECONDS
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < MIN_WORKER_CADENCE_SECONDS || value > MAX_WORKER_CADENCE_SECONDS) {
    return DEFAULT_WORKER_CADENCE_SECONDS
  }
  return value
}

export function lateAfterSeconds(cadenceSeconds: number): number {
  if (cadenceSeconds >= DEFAULT_WORKER_CADENCE_SECONDS) return cadenceSeconds + 7200
  return cadenceSeconds + Math.max(cadenceSeconds, 300)
}

export function productionProviderAllowed(env: EnvMap = process.env): boolean {
  return env.VERCEL_ENV === "production"
}

export function resolveProviderMode(env: EnvMap = process.env): ProviderMode {
  const requested = env.JOB_PROVIDER_MODE
  if (requested === "production") {
    if (!productionProviderAllowed(env)) return "disabled"
    return "production"
  }
  if (requested === "mock") return "mock"
  return "disabled"
}

export function jobWorkerConfig(env: EnvMap = process.env): JobWorkerConfig {
  const cronSecret = env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null
  const environment = env.VERCEL_ENV || "local"
  const enabled = env.JOB_WORKER_ENABLED === "true"
    && environment === "production"
    && !!cronSecret
  const cadenceSeconds = parseWorkerCadenceSeconds(env)
  return {
    enabled,
    environment,
    providerMode: resolveProviderMode(env),
    cronSecret,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ? env.VERCEL_DEPLOYMENT_ID.slice(0, 80) : null,
    workerName: "admin-jobs",
    cadenceSeconds,
    lateAfterSeconds: lateAfterSeconds(cadenceSeconds),
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

export function canRegisterLiveProvider(mode: ProviderMode, env: EnvMap = process.env): boolean {
  return mode === "production" && productionProviderAllowed(env)
}
