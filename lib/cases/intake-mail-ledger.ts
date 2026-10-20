import type { Json } from "@/lib/supabase/database"

export const INTAKE_MAIL_ATTEMPT_LIMIT = 3

export type IntakeMailState = "sending" | "accepted" | "rejected" | "unknown"

export type IntakeMailClaim =
  | { outcome: "claimed"; claim: string }
  | { outcome: "accepted" }
  | { outcome: "held" }
  | { outcome: "exhausted" }

export type IntakeMailRow = {
  status: string | null
  providerMessageId: string | null
  metadata: unknown
}

type MailMetadata = { [key: string]: Json | undefined }

function mailMetadata(value: unknown): MailMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return { ...(value as MailMetadata) }
}

function mailState(value: unknown): IntakeMailState | null {
  return value === "sending" || value === "accepted" || value === "rejected" || value === "unknown" ? value : null
}

/**
 * One worker may call the provider. A row already accepted, already in flight,
 * or left unknown after a provider call is not claimed again. A definite
 * rejection may be claimed again until the attempt limit.
 */
export function planIntakeMailClaim(row: IntakeMailRow, claimId: string): IntakeMailClaim & { metadata?: MailMetadata } {
  if (row.status === "SENT" || (typeof row.providerMessageId === "string" && row.providerMessageId.length > 0)) {
    return { outcome: "accepted" }
  }
  const metadata = mailMetadata(row.metadata)
  const state = mailState(metadata.intakeState)
  const claim = typeof metadata.intakeClaim === "string" && metadata.intakeClaim.length > 0 ? metadata.intakeClaim : null
  if (state === "sending" || state === "unknown" || state === "accepted" || claim) return { outcome: "held" }
  const attempts = typeof metadata.intakeAttempts === "number" && Number.isInteger(metadata.intakeAttempts) && metadata.intakeAttempts > 0
    ? metadata.intakeAttempts
    : 0
  if (attempts >= INTAKE_MAIL_ATTEMPT_LIMIT) return { outcome: "exhausted" }
  return {
    outcome: "claimed",
    claim: claimId,
    metadata: {
      ...metadata,
      intakeClaim: claimId,
      intakeAttempts: attempts + 1,
      intakeState: "sending",
    },
  }
}

export type IntakeMailLedger = {
  claim(id: string): Promise<IntakeMailClaim>
  recordAccepted(id: string, claim: string, write: { subject: string; providerMessageId: string; sentAt: string }): Promise<boolean>
  recordRejected(id: string, claim: string, write: { subject: string }): Promise<void>
  recordUnknown(id: string, claim: string, write: { subject: string }): Promise<void>
}

export type MemoryIntakeMailLedger = IntakeMailLedger & {
  seed(id: string, row: IntakeMailRow): void
  failNextAcceptedWrite(): void
}

function createMutex() {
  let tail = Promise.resolve()
  return function exclusive<T>(run: () => T | Promise<T>): Promise<T> {
    const next: Promise<T> = tail.then(run)
    tail = next.then(() => undefined, () => undefined)
    return next
  }
}

/** In-process compare-and-set used by tests and by any caller that supplies its own persistence hook. */
export function createMemoryIntakeMailLedger(
  onWrite?: (id: string, values: {
    subject?: string
    provider?: string
    status?: string
    provider_message_id?: string | null
    sent_at?: string | null
    error_message?: string | null
    metadata?: Json
  }) => Promise<void>,
): MemoryIntakeMailLedger {
  const rows = new Map<string, { status: string | null; providerMessageId: string | null; metadata: MailMetadata }>()
  const exclusive = createMutex()
  let failAcceptedWrite = false

  const write = async (id: string, values: Parameters<NonNullable<typeof onWrite>>[1]) => {
    if (onWrite) await onWrite(id, values)
  }

  return {
    seed(id, row) {
      if (rows.has(id)) return
      rows.set(id, {
        status: row.status,
        providerMessageId: row.providerMessageId,
        metadata: mailMetadata(row.metadata),
      })
    },
    failNextAcceptedWrite() {
      failAcceptedWrite = true
    },
    claim(id) {
      return exclusive(() => {
        const row = rows.get(id)
        if (!row) return { outcome: "held" as const }
        const decision = planIntakeMailClaim(row, crypto.randomUUID())
        if (decision.outcome === "claimed" && decision.metadata) row.metadata = decision.metadata
        if (decision.outcome === "claimed") return { outcome: "claimed" as const, claim: decision.claim }
        return { outcome: decision.outcome }
      })
    },
    recordAccepted(id, claim, accepted) {
      return exclusive(async () => {
        const row = rows.get(id)
        if (!row || row.metadata.intakeClaim !== claim) return false
        if (failAcceptedWrite) {
          failAcceptedWrite = false
          row.metadata = { ...row.metadata, intakeState: "unknown" }
          await write(id, {
            subject: accepted.subject,
            provider: "resend",
            status: "FAILED",
            error_message: "Delivery failed.",
            metadata: row.metadata as Json,
          })
          return false
        }
        row.status = "SENT"
        row.providerMessageId = accepted.providerMessageId
        row.metadata = { ...row.metadata, intakeState: "accepted" }
        await write(id, {
          subject: accepted.subject,
          provider: "resend",
          status: "SENT",
          provider_message_id: accepted.providerMessageId,
          sent_at: accepted.sentAt,
          error_message: null,
          metadata: row.metadata as Json,
        })
        return true
      })
    },
    recordRejected(id, claim, rejected) {
      return exclusive(async () => {
        const row = rows.get(id)
        if (!row || row.metadata.intakeClaim !== claim) return
        row.status = "FAILED"
        row.metadata = { ...row.metadata, intakeClaim: null, intakeState: "rejected" }
        await write(id, {
          subject: rejected.subject,
          provider: "resend",
          status: "FAILED",
          error_message: "Delivery failed.",
          metadata: row.metadata as Json,
        })
      })
    },
    recordUnknown(id, claim, unknown) {
      return exclusive(async () => {
        const row = rows.get(id)
        if (!row || row.metadata.intakeClaim !== claim) return
        row.metadata = { ...row.metadata, intakeState: "unknown" }
        await write(id, {
          subject: unknown.subject,
          provider: "resend",
          status: "FAILED",
          error_message: "Delivery failed.",
          metadata: row.metadata as Json,
        })
      })
    },
  }
}
