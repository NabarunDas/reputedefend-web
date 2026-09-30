import "server-only"
import { guardAlertsEnabled } from "./gate"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

export function maintainGuardAlertsHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "MAINTAIN_GUARD_ALERTS",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      if (!guardAlertsEnabled(env)) return { ok: true }
      if (!input.rpc) return { ok: false, retryable: false, error: "Missing job RPC" }
      const result = await input.rpc.rpc<{ status?: string; reason?: string }>("guard_maintain_alerts_v1", {
        p_now: null,
      })
      if (result.status !== "success") return { ok: false, retryable: false, error: result.reason || "Alert maintenance failed" }
      return { ok: true }
    },
  }
}
