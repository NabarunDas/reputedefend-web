import { canRegisterLiveProvider, resolveProviderMode, type EnvMap } from "./config"
import type { JobHandler, JobHandlerInput, JobHandlerResult, JobType } from "./model"

export function systemHealthProbeHandler(): JobHandler {
  return {
    jobType: "SYSTEM_HEALTH_PROBE",
    async execute() {
      return { ok: true }
    },
  }
}

export function createIdempotentFakeProvider() {
  const processed = new Set<string>()
  let effects = 0
  let calls = 0
  return {
    get effects() { return effects },
    get calls() { return calls },
    async execute({ idempotencyKey }: JobHandlerInput): Promise<JobHandlerResult> {
      calls += 1
      if (processed.has(idempotencyKey)) return { ok: true }
      processed.add(idempotencyKey)
      effects += 1
      return { ok: true }
    },
  }
}

export function registeredJobHandlers(env: EnvMap = process.env): Partial<Record<JobType, JobHandler>> {
  const mode = resolveProviderMode(env)
  if (mode === "production" && !canRegisterLiveProvider(mode, env)) return {}
  return {
    SYSTEM_HEALTH_PROBE: systemHealthProbeHandler(),
  }
}

export function handlerFor(jobType: string, handlers: Partial<Record<JobType, JobHandler>> = registeredJobHandlers()): JobHandler | null {
  if (jobType === "SYSTEM_HEALTH_PROBE") return handlers.SYSTEM_HEALTH_PROBE ?? null
  return null
}
