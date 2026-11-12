import { describe, expect, it } from "vitest"
import { absentTelloyaDemo, decideTelloyaDemoWrite, transitionTelloyaDemo, type TelloyaDemoCommand } from "./telloya-demo-status"

function command(overrides: Partial<TelloyaDemoCommand> = {}): TelloyaDemoCommand {
  return {
    enquiryPresent: true,
    role: "staff",
    actorId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 0,
    status: "BOOKED",
    at: "2026-11-20T15:00:00.000Z",
    timezone: "Europe/London",
    note: "Arranged by phone.",
    idempotencyKey: "demo-book-0001",
    enabled: true,
    migrationApplied: true,
    ...overrides,
  }
}

describe("Telloya offline demonstration status", () => {
  it("stays closed when the journey flag is off, including a true-looking value", () => {
    expect(decideTelloyaDemoWrite({ enabled: false, migrationApplied: true })).toEqual({ status: "closed", reason: "telloya_admin_journey_disabled" })
    const closed = transitionTelloyaDemo(absentTelloyaDemo(), command({ enabled: false }))
    expect(closed.result).toBe("telloya_admin_journey_disabled")
    expect(closed.record.version).toBe(0)
  })

  it("stays closed when the source-only migration has not been applied", () => {
    expect(decideTelloyaDemoWrite({ enabled: true, migrationApplied: false }).reason).toBe("source_only_migration_not_applied")
  })

  it("books, completes, replays and returns a cancelled booking to not booked", () => {
    const booked = transitionTelloyaDemo(absentTelloyaDemo(), command())
    expect(booked).toMatchObject({ result: "recorded", previousStatus: "NOT_BOOKED", record: { status: "BOOKED", version: 1 } })
    const replay = transitionTelloyaDemo(booked.record, command())
    expect(replay.result).toBe("replay")
    expect(replay.record).toBe(booked.record)
    const completed = transitionTelloyaDemo(booked.record, command({
      expectedVersion: 1,
      status: "COMPLETED",
      at: "2026-11-20T15:40:00.000Z",
      idempotencyKey: "demo-done-0001",
      note: "Completed offline.",
    }))
    expect(completed.record).toMatchObject({ status: "COMPLETED", version: 2, completedAt: "2026-11-20T15:40:00.000Z" })
    const cancelled = transitionTelloyaDemo(booked.record, command({
      expectedVersion: 1,
      status: "NOT_BOOKED",
      at: null,
      idempotencyKey: "demo-cancel-0001",
      note: "Customer asked to rearrange.",
    }))
    expect(cancelled.record).toMatchObject({ status: "NOT_BOOKED", version: 2, scheduledAt: null, completedAt: null })
  })

  it("rejects a stale version, a missing time, a customer, and a completed demo that nobody attended", () => {
    const booked = transitionTelloyaDemo(absentTelloyaDemo(), command()).record
    expect(transitionTelloyaDemo(booked, command({ expectedVersion: 0, idempotencyKey: "demo-stale-0001" })).result).toBe("stale_version")
    expect(transitionTelloyaDemo(booked, command({ expectedVersion: 1, status: "COMPLETED", at: null, idempotencyKey: "demo-empty-0001" })).result).toBe("invalid_transition")
    expect(transitionTelloyaDemo(absentTelloyaDemo(), command({ role: "customer" })).result).toBe("forbidden")
    expect(transitionTelloyaDemo(absentTelloyaDemo(), command({ enquiryPresent: false })).result).toBe("missing_enquiry")
    const completed = transitionTelloyaDemo(booked, command({ expectedVersion: 1, status: "COMPLETED", at: "2026-11-20T16:00:00.000Z", idempotencyKey: "demo-done-0002" })).record
    expect(transitionTelloyaDemo(completed, command({ expectedVersion: 2, status: "BOOKED", idempotencyKey: "demo-again-0001" })).result).toBe("invalid_transition")
  })
})
