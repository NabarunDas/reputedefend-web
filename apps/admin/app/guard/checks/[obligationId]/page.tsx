import Link from "next/link"
import { notFound } from "next/navigation"
import { loadGuardCheck } from "@/lib/guard/checks-queries"
import { localWindowLabel, londonDateTime, obligationStateLabel, windowLabel } from "@/lib/guard/checks-model"
import { Badge, PageHeader } from "../../../ui"
import { CancelForm, ClaimForm, CompleteObservationForm, FailRetryForm, ReleaseForm } from "../forms"

export const metadata = { title: "Guard check" }

export default async function GuardCheckDetailPage({ params }: { params: Promise<{ obligationId: string }> }) {
  const { obligationId } = await params
  const detail = await loadGuardCheck(obligationId)
  const row = detail.obligation
  if (!row) notFound()
  const configured = detail.scheduleConfigured
  return <section className="page">
    <PageHeader
      title={`${row.locationName || "Location"} · ${windowLabel(row.windowCode)}`}
      description="Manual observation only. Completing this check does not send a customer alert, email, or Google request."
    />
    <p><Link href="/guard/checks">Back to Guard checks</Link></p>
    <section className="panel">
      <h2>Obligation</h2>
      <p>{row.businessName} · {row.customerName}</p>
      <p>UK service date {row.serviceDate}. {localWindowLabel(row.localStart, row.localEnd, configured)}</p>
      <p>Window {londonDateTime(row.windowStartAt)} to {londonDateTime(row.windowEndAt)} Europe/London.</p>
      <p><Badge>{obligationStateLabel(row.state)}</Badge> · {row.coverageBasis === "INCLUDED" ? "Included" : "Direct"}</p>
      <p>Attempts {row.attemptCount}. Retries {row.retryCount}.</p>
      <p>Queue wait {row.queueWaitSeconds ?? "—"}s. Handling {row.handlingSeconds ?? "—"}s.</p>
      {row.missedAt && <p>Missed at {londonDateTime(row.missedAt)}. Late history is kept if this is later completed.</p>}
      {row.late && <p>Late by {row.secondsLate} seconds. Late completion stays late.</p>}
      <p>Baseline {row.baselineAvailable ? "verified" : "missing"}.</p>
      {row.previousObservation && <p>Previous observation {row.previousObservation.classification} at {londonDateTime(row.previousObservation.observedAt)}.</p>}
    </section>
    <section className="panel">
      <h2>Work</h2>
      {row.state === "PENDING" && <ClaimForm obligationId={row.id} version={row.version} />}
      {row.state === "CLAIMED" && <>
        <ReleaseForm obligationId={row.id} version={row.version} />
        <CompleteObservationForm obligationId={row.id} version={row.version} />
        <FailRetryForm obligationId={row.id} version={row.version} />
        <CancelForm obligationId={row.id} version={row.version} />
      </>}
      {row.state === "CANCELLED" && <p className="muted">This check is cancelled. Historical observations are unchanged.</p>}
    </section>
    <section className="panel">
      <h2>Attempts</h2>
      {!(detail.attempts || []).length ? <p className="muted">No attempts yet.</p> : (detail.attempts || []).map(attempt => (
        <p key={attempt.id}>
          Attempt {attempt.attemptNumber} · {attempt.outcome || "Open"} · handling {attempt.handlingSeconds ?? "—"}s
          {attempt.failureReason ? ` · ${attempt.failureReason}` : ""}
        </p>
      ))}
    </section>
    {detail.observation && <section className="panel">
      <h2>Observation</h2>
      <p>{detail.observation.classification} · {detail.observation.profileAvailability}</p>
      <p>{detail.observation.displayedBusinessName}. Reviews {detail.observation.reviewCount ?? "not recorded"}.</p>
      <p>Comparison {detail.observation.comparisonStatus}. {(detail.observation.changeCodes || []).join(", ") || "No change codes"}.</p>
      <p className="muted">{detail.observation.notes}</p>
    </section>}
  </section>
}
