import { ukDate } from "@/lib/admin/activity"
import { heartbeatLabel, jobStatusLabel } from "@/lib/jobs/model"
import { loadJobHealth } from "@/lib/jobs/queries"
import { Badge, EmptyState, PageHeader } from "../../ui"
import { EnqueueProbeForm, ReplayJobForm } from "./forms"

export const metadata = { title: "Jobs" }

function heartbeatTone(status: string): "success" | "warning" | "neutral" {
  if (status === "HEALTHY") return "success"
  if (status === "LATE") return "warning"
  return "neutral"
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "SUCCEEDED") return "success"
  if (status === "RETRY" || status === "RUNNING") return "warning"
  if (status === "DEAD_LETTER") return "danger"
  return "neutral"
}

export default async function JobsPage() {
  const health = await loadJobHealth()
  const heartbeat = health.heartbeat
  return <section className="page">
    <PageHeader title="Operational health" description="Durable job queue, worker heartbeat and dead-letter replay. This page does not send customer email or call payment or Google providers." />
    <section className="panel">
      <h2>Worker</h2>
      <p>
        <Badge tone={heartbeatTone(heartbeat.status)}>{heartbeatLabel(heartbeat.status)}</Badge>
        {heartbeat.environment ? ` · ${heartbeat.environment}` : ""}
        {heartbeat.workerName ? ` · ${heartbeat.workerName}` : ""}
      </p>
      <p className="muted">
        Last started {heartbeat.lastStartedAt ? ukDate(heartbeat.lastStartedAt) : "never"}.
        Last completed {heartbeat.lastCompletedAt ? ukDate(heartbeat.lastCompletedAt) : "never"}.
        Last success {heartbeat.lastSuccessAt ? ukDate(heartbeat.lastSuccessAt) : "never"}.
      </p>
      {heartbeat.lastError && <p>Last worker error: {heartbeat.lastError}</p>}
      <p>Pending {health.counts.pending} · Running {health.counts.running} · Retry {health.counts.retry} · Dead letter {health.counts.deadLetter}</p>
      <EnqueueProbeForm />
    </section>
    <section className="panel">
      <h2>Recent jobs</h2>
      {!health.jobs.length ? <EmptyState>No jobs have been queued yet.</EmptyState> : <div className="table-scroll" role="region" aria-label="Recent jobs" tabIndex={0}>
        <table>
          <thead><tr><th>Type</th><th>Status</th><th>Scheduled</th><th>Attempts</th><th>Last error</th></tr></thead>
          <tbody>{health.jobs.map(job => <tr key={job.id}>
            <td>{job.summary}<br /><span className="muted">{job.jobType}</span></td>
            <td>
              <Badge tone={statusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
              {job.deadLetteredAt && <><br /><span className="muted">Dead lettered {ukDate(job.deadLetteredAt)}</span></>}
            </td>
            <td>{ukDate(job.scheduledAt)}</td>
            <td>{job.attempts}/{job.maxAttempts}{job.replayCount ? ` · replayed ${job.replayCount}` : ""}</td>
            <td>
              {job.lastError || "—"}
              {job.status === "DEAD_LETTER" && <ReplayJobForm jobId={job.id} version={job.version} />}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>
}
