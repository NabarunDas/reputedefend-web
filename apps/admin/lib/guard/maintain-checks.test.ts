import { describe, expect, it, vi } from "vitest"
import { maintainGuardChecksHandler } from "./maintain-checks"

describe("maintain guard checks handler", () => {
  it("does not mutate when the check gate is unset or the schedule is missing", async () => {
    const rpc = { rpc: vi.fn() }
    expect(await maintainGuardChecksHandler({}).execute({ idempotencyKey: "k", payload: {}, rpc })).toEqual({ ok: true })
    expect(rpc.rpc).not.toHaveBeenCalled()
    rpc.rpc.mockResolvedValue({ status: "denied", reason: "schedule_not_configured" })
    expect(await maintainGuardChecksHandler({ GUARD_CHECKS_ENABLED: "true" }).execute({
      idempotencyKey: "k", payload: { serviceDate: "2026-03-29" }, rpc,
    })).toEqual({ ok: true })
    expect(rpc.rpc).toHaveBeenCalledWith("guard_maintain_checks_v1", expect.objectContaining({ p_service_date: "2026-03-29" }))
  })
})
