import { describe, expect, it, vi } from "vitest"
import { maintainGuardAlertsHandler } from "./maintain-alerts"

describe("maintain Guard alerts handler", () => {
  it("no-ops when the alert gate is unset", async () => {
    const rpc = { rpc: vi.fn() }
    const result = await maintainGuardAlertsHandler({}).execute({
      idempotencyKey: "maintain-guard-alerts:2026-09-30",
      payload: { serviceDate: "2026-09-30" },
      rpc,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).not.toHaveBeenCalled()
  })

  it("calls the maintenance RPC when enabled", async () => {
    const rpc = { rpc: vi.fn().mockResolvedValue({ status: "success" }) }
    const result = await maintainGuardAlertsHandler({ GUARD_ALERTS_ENABLED: "true" }).execute({
      idempotencyKey: "maintain-guard-alerts:2026-09-30",
      payload: {},
      rpc,
    })
    expect(result).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_maintain_alerts_v1", { p_now: null })
  })
})
