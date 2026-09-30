import "server-only"
import { guardAlertsEnabled } from "./gate"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

export function maintainGuardAlertsHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "MAINTAIN_GUARD_ALERTS",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      if (!guardAlertsEnabled(env)) return { ok: true }
      if (!input.rpc) return { ok: false, retryable: false, error: "Missing job RPC" }
      for (let batch = 0; batch < 40; batch += 1) {
        const result = await input.rpc.rpc<{ status?: string; reason?: string; hasMore?: boolean }>("guard_maintain_alerts_v1", {
          p_now: null,
          p_batch: 50,
        })
        if (result.status !== "success") return { ok: false, retryable: false, error: result.reason || "Alert maintenance failed" }
        if (result.hasMore !== true) return { ok: true }
      }
      return { ok: false, retryable: true, error: "More Guard alert maintenance remains" }
    },
  }
}
