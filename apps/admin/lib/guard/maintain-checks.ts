import "server-only"
import { guardChecksEnabled } from "./gate"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

export function maintainGuardChecksHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "MAINTAIN_GUARD_CHECKS",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      if (!guardChecksEnabled(env)) return { ok: true }
      if (!input.rpc) return { ok: false, retryable: false, error: "Missing job RPC" }
      const result = await input.rpc.rpc<{ status?: string; reason?: string }>("guard_maintain_checks_v1", {
        p_now: null,
        p_service_date: typeof input.payload.serviceDate === "string" ? input.payload.serviceDate : null,
      })
      if (result.status === "denied" && result.reason === "schedule_not_configured") return { ok: true }
      if (result.status !== "success") return { ok: false, retryable: false, error: result.reason || "Check maintenance failed" }
      return { ok: true }
    },
  }
}
