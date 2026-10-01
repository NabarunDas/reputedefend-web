/**
 * Job, outbox and idempotency recovery reconciliation.
 *
 * A restored queue is not a safe queue. Leases belong to workers that no
 * longer exist, jobs that already produced a provider effect may look
 * runnable again, and dead letters that were waiting for a human decision
 * must not be swept away by a bulk retry.
 *
 * This module decides nothing on its own and executes nothing. It classifies
 * what the restore produced and states the review a person has to perform.
 * There is no "replay everything" path here on purpose: after a restore the
 * correct first action is reconciliation, not execution.
 */

export type JobRecord = {
  jobId: string
  jobType: string
  idempotencyKey: string
  status: "PENDING" | "RUNNING" | "RETRY" | "SUCCEEDED" | "DEAD_LETTER"
  attempts: number
  maxAttempts: number
  /** Null unless the job is leased. A lease that has passed is stale. */
  leaseExpiresAt: Date | null
  leaseOwner: string | null
}

export type OutboxRecord = {
  outboxId: string
  eventKey: string
  topic: string
  promoted: boolean
  /** True when a job row exists for this outbox entry in the restored database. */
  hasJob: boolean
}

export type JobRecoveryAction =
  | "no_action"
  | "release_stale_lease"
  | "await_scheduled_run"
  | "human_review_required"
  | "promote_outbox_entry"
  | "reconcile_provider_effect"

export type JobFinding = {
  reference: string
  classification: string
  action: JobRecoveryAction
  detail: string
}

export type JobRecoveryReport = {
  findings: readonly JobFinding[]
  counts: Record<JobRecoveryAction, number>
  /** True when a person must look at the queue before any worker is resumed. */
  requiresHumanReview: boolean
  /** Always false: this module never authorises a bulk replay. */
  blindReplayPermitted: false
}

export type JobRecoveryInput = {
  jobs: readonly JobRecord[]
  outbox: readonly OutboxRecord[]
  /** The moment the reconciliation is evaluated against. */
  now: Date
  /**
   * Provider gates as they stand after the restore. A restore must never
   * change them, so they are reported rather than adjusted.
   */
  providerGatesEnabled: boolean
}

export function reconcileJobRecovery(input: JobRecoveryInput): JobRecoveryReport {
  const findings: JobFinding[] = []

  for (const job of input.jobs) {
    if (job.status === "SUCCEEDED") {
      // A completed idempotent action must not run a second time. The
      // idempotency key is what stops a restored queue repeating a provider
      // effect, so it is recorded rather than cleared.
      findings.push({
        reference: job.jobId,
        classification: "completed",
        action: "no_action",
        detail: `completed work is protected by idempotency key ${job.idempotencyKey} and must not be re-executed`,
      })
      continue
    }

    if (job.status === "DEAD_LETTER") {
      findings.push({
        reference: job.jobId,
        classification: "dead letter",
        action: "human_review_required",
        detail: "a dead letter stays visible and keeps its history; it is never cleared as part of recovery",
      })
      continue
    }

    if (job.status === "RUNNING") {
      const stale = job.leaseExpiresAt !== null && job.leaseExpiresAt <= input.now
      if (stale) {
        findings.push({
          reference: job.jobId,
          classification: "expired lease",
          action: "release_stale_lease",
          detail: `the lease held by ${job.leaseOwner ?? "an unknown worker"} has expired; it must be reclaimed so the job does not sit stuck`,
        })
      } else {
        findings.push({
          reference: job.jobId,
          classification: "leased to a worker that no longer exists",
          action: "human_review_required",
          detail: "a restore cannot know whether the original attempt reached the provider; the effect must be reconciled before the lease is reused",
        })
      }
      continue
    }

    if (job.attempts >= job.maxAttempts) {
      findings.push({
        reference: job.jobId,
        classification: "attempts exhausted",
        action: "human_review_required",
        detail: "the job has used its attempts but is not dead-lettered; a person decides whether it is still wanted",
      })
      continue
    }

    findings.push({
      reference: job.jobId,
      classification: job.status === "RETRY" ? "awaiting retry" : "pending",
      action: "await_scheduled_run",
      detail: "the job runs again on its own schedule once workers resume; no manual intervention is needed",
    })
  }

  for (const entry of input.outbox) {
    if (entry.promoted && !entry.hasJob) {
      findings.push({
        reference: entry.outboxId,
        classification: "promoted outbox entry without a job",
        action: "reconcile_provider_effect",
        detail: "the restore split the outbox entry from its job; whether the effect happened must be established before anything is re-enqueued",
      })
      continue
    }
    if (!entry.promoted) {
      findings.push({
        reference: entry.outboxId,
        classification: "unpromoted outbox entry",
        action: "promote_outbox_entry",
        detail: `event ${entry.eventKey} was committed with its transaction and still needs promoting; the unique event key prevents a duplicate`,
      })
    }
  }

  if (input.providerGatesEnabled) {
    findings.push({
      reference: "provider-gates",
      classification: "provider gates enabled",
      action: "human_review_required",
      detail: "recovery does not change a gate; an enabled gate during reconciliation risks repeating a provider effect and should be reviewed first",
    })
  }

  const counts: Record<JobRecoveryAction, number> = {
    no_action: 0,
    release_stale_lease: 0,
    await_scheduled_run: 0,
    human_review_required: 0,
    promote_outbox_entry: 0,
    reconcile_provider_effect: 0,
  }
  for (const finding of findings) counts[finding.action] += 1

  return {
    findings,
    counts,
    requiresHumanReview: counts.human_review_required > 0 || counts.reconcile_provider_effect > 0,
    blindReplayPermitted: false,
  }
}

/**
 * The order a person works through a restored queue. Resuming workers first
 * is what turns a recoverable incident into a duplicated one.
 */
export const jobReconciliationSequence: readonly string[] = [
  "Leave workers and Cron stopped, and leave every provider gate exactly as the restore left it.",
  "Record the dead-letter set as it stands, before anything is touched.",
  "Reconcile promoted outbox entries that have no job against provider records to establish whether the effect occurred.",
  "Release expired leases so stale RUNNING rows can be claimed again.",
  "Decide, per job, whether a provider effect already happened; idempotency keys and provider references are the evidence.",
  "Promote unpromoted outbox entries, relying on the unique event key to prevent duplicates.",
  "Resume workers with provider gates still closed and confirm a clean pass.",
  "Re-open provider gates one at a time, confirming expected behaviour after each.",
]
