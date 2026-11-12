import { telloyaAdminJourneyEnabled } from "./telloya-admin-journey-flag"

export type TelloyaDemoStatus = "NOT_BOOKED" | "BOOKED" | "COMPLETED"

export type TelloyaDemoRecord = {
  status: TelloyaDemoStatus
  version: number
  scheduledAt: string | null
  completedAt: string | null
  timezone: string
  note: string
  idempotencyKey: string
}

export type TelloyaDemoCommand = {
  enquiryPresent: boolean
  role: "staff" | "customer"
  actorId: string | null
  expectedVersion: number
  status: string
  at: string | null
  timezone: string
  note: string
  idempotencyKey: string
  enabled: boolean
  migrationApplied: boolean
}

export type TelloyaDemoDecision =
  | { status: "closed"; reason: "telloya_admin_journey_disabled" | "source_only_migration_not_applied" }
  | { status: "ready" }

const STATUSES = new Set<TelloyaDemoStatus>(["NOT_BOOKED", "BOOKED", "COMPLETED"])

export function absentTelloyaDemo(): TelloyaDemoRecord {
  return { status: "NOT_BOOKED", version: 0, scheduledAt: null, completedAt: null, timezone: "", note: "", idempotencyKey: "" }
}

export function decideTelloyaDemoWrite(input: { enabled: boolean; migrationApplied: boolean }): TelloyaDemoDecision {
  if (!input.enabled) return { status: "closed", reason: "telloya_admin_journey_disabled" }
  if (!input.migrationApplied) return { status: "closed", reason: "source_only_migration_not_applied" }
  return { status: "ready" }
}

export function transitionTelloyaDemo(current: TelloyaDemoRecord, command: TelloyaDemoCommand): { result: string; record: TelloyaDemoRecord; previousStatus?: TelloyaDemoStatus } {
  const gate = decideTelloyaDemoWrite(command)
  if (gate.status === "closed") return { result: gate.reason, record: current }
  if (command.role !== "staff" || !command.actorId) return { result: "forbidden", record: current }
  if (!command.enquiryPresent) return { result: "missing_enquiry", record: current }
  if (command.idempotencyKey.trim().length < 8 || command.idempotencyKey.length > 120 || command.note.length > 500 || command.timezone.length > 80) {
    return { result: "invalid", record: current }
  }
  if (!STATUSES.has(command.status as TelloyaDemoStatus)) return { result: "invalid_transition", record: current }
  const next = command.status as TelloyaDemoStatus
  if (current.idempotencyKey && current.idempotencyKey === command.idempotencyKey) {
    return { result: "replay", record: current }
  }
  if (current.version !== command.expectedVersion) return { result: "stale_version", record: current }
  const allowed = (current.status === "NOT_BOOKED" && next === "BOOKED" && Boolean(command.at))
    || (current.status === "BOOKED" && next === "COMPLETED" && Boolean(command.at))
    || (current.status === "BOOKED" && next === "NOT_BOOKED")
  if (!allowed) return { result: "invalid_transition", record: current }
  const record: TelloyaDemoRecord = {
    status: next,
    version: current.version + 1,
    scheduledAt: next === "NOT_BOOKED" ? null : next === "BOOKED" ? command.at : current.scheduledAt,
    completedAt: next === "COMPLETED" ? command.at : null,
    timezone: next === "NOT_BOOKED" ? "" : command.timezone,
    note: command.note,
    idempotencyKey: command.idempotencyKey,
  }
  return { result: "recorded", record, previousStatus: current.status }
}

export function telloyaDemoWriteAvailable(flag: string | undefined = process.env.TELLOYA_ADMIN_JOURNEY_ENABLED): boolean {
  return telloyaAdminJourneyEnabled(flag)
}
