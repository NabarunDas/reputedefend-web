import { describe, expect, it } from "vitest"
import { jobReconciliationSequence, reconcileJobRecovery, type JobRecord, type OutboxRecord } from "./jobs"

const now = new Date("2026-10-01T12:00:00.000Z")

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: "job-1",
    jobType: "SYSTEM_HEALTH_PROBE",
    idempotencyKey: "rehearsal-job-0001",
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    leaseExpiresAt: null,
    leaseOwner: null,
    ...overrides,
  }
}

function outbox(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return { outboxId: "outbox-1", eventKey: "rehearsal-event-0001", topic: "SYSTEM_HEALTH_PROBE", promoted: true, hasJob: true, ...overrides }
}

function reconcile(jobs: JobRecord[], entries: OutboxRecord[] = [], providerGatesEnabled = false) {
  return reconcileJobRecovery({ jobs, outbox: entries, now, providerGatesEnabled })
}

describe("job and outbox recovery after a restore", () => {
  it("never authorises replaying everything", () => {
    const report = reconcile([job()])
    expect(report.blindReplayPermitted).toBe(false)
  })

  it("leaves a pending job to run on its own schedule", () => {
    const report = reconcile([job()])
    expect(report.findings[0].action).toBe("await_scheduled_run")
    expect(report.requiresHumanReview).toBe(false)
  })

  it("does not re-execute a completed idempotent provider action", () => {
    const report = reconcile([job({ status: "SUCCEEDED" })])
    expect(report.findings[0].action).toBe("no_action")
    expect(report.findings[0].detail).toContain("must not be re-executed")
  })

  it("keeps a dead letter visible for a person rather than clearing it", () => {
    const report = reconcile([job({ status: "DEAD_LETTER", attempts: 5 })])
    expect(report.findings[0].action).toBe("human_review_required")
    expect(report.findings[0].detail).toContain("never cleared")
    expect(report.requiresHumanReview).toBe(true)
  })

  it("releases an expired lease so restored work does not sit stuck", () => {
    const report = reconcile([
      job({ status: "RUNNING", leaseOwner: "worker-a", leaseExpiresAt: new Date("2026-10-01T11:00:00.000Z") }),
    ])
    expect(report.findings[0].action).toBe("release_stale_lease")
    expect(report.counts.release_stale_lease).toBe(1)
  })

  it("sends a live lease held by a vanished worker to review rather than reclaiming it", () => {
    const report = reconcile([
      job({ status: "RUNNING", leaseOwner: "worker-a", leaseExpiresAt: new Date("2026-10-01T13:00:00.000Z") }),
    ])
    expect(report.findings[0].action).toBe("human_review_required")
    expect(report.findings[0].detail).toContain("reached the provider")
  })

  it("sends a job that has used its attempts without dead-lettering to review", () => {
    const report = reconcile([job({ status: "RETRY", attempts: 5, maxAttempts: 5 })])
    expect(report.findings[0].action).toBe("human_review_required")
  })

  it("promotes an outbox entry the restore left unpromoted", () => {
    const report = reconcile([], [outbox({ promoted: false, hasJob: false })])
    expect(report.findings[0].action).toBe("promote_outbox_entry")
    expect(report.findings[0].detail).toContain("unique event key")
  })

  it("flags a promoted outbox entry whose job did not come back", () => {
    const report = reconcile([], [outbox({ promoted: true, hasJob: false })])
    expect(report.findings[0].action).toBe("reconcile_provider_effect")
    expect(report.requiresHumanReview).toBe(true)
  })

  it("asks for review when a provider gate is open during reconciliation", () => {
    const report = reconcile([job()], [], true)
    const gate = report.findings.find(finding => finding.reference === "provider-gates")
    expect(gate?.action).toBe("human_review_required")
    expect(gate?.detail).toContain("does not change a gate")
  })

  it("reports nothing to review when the restored queue is clean and gates are closed", () => {
    const report = reconcile([job({ status: "SUCCEEDED" }), job({ jobId: "job-2" })], [outbox()])
    expect(report.requiresHumanReview).toBe(false)
    expect(report.counts.human_review_required).toBe(0)
  })

  it("describes a review order that reconciles before it executes", () => {
    expect(jobReconciliationSequence[0]).toMatch(/workers and Cron stopped/)
    expect(jobReconciliationSequence.at(-1)).toMatch(/one at a time/)
    const resume = jobReconciliationSequence.findIndex(step => /Resume workers/.test(step))
    const reconcilePromoted = jobReconciliationSequence.findIndex(step => /Reconcile promoted outbox/.test(step))
    expect(reconcilePromoted).toBeLessThan(resume)
  })
})
