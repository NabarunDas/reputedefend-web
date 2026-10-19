import type { JourneySubmissionPanel } from "@/lib/case-journey/submission"
import { ukDate } from "@/lib/admin/activity"
import type { CaseDetail } from "@/lib/cases/model"
import { ResolveSubmission, SubmissionForm } from "../../forms"

/**
 * Step 9 reuses the existing submission commands.
 * Neither form submits anything to Google.
 */
export function SubmissionPanel({ caseDetail, panel }: { caseDetail: CaseDetail; panel: JourneySubmissionPanel }) {
  const byId = new Map(caseDetail.submissions.map(row => [row.id, row]))
  return <div className="guided-facts" data-submission={panel.headline}>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    {panel.attempts.length === 0 && <p>No submission recorded. A prepared pack is not a submitted appeal.</p>}
    <ul>
      {panel.attempts.map(attempt => {
        const row = byId.get(attempt.id)
        return <li key={attempt.id}>
          <strong>{attempt.reference}: {attempt.state}.</strong> Submitted by {attempt.party} on {ukDate(attempt.submittedAt)} via {attempt.channel}. Evidence: {attempt.evidence}
          {attempt.resultNote ? ` Result note: ${attempt.resultNote}` : ""}
          {panel.commands?.resolveIds.includes(attempt.id) && row && <details>
            <summary>Record a decision or withdrawal<span className="sr-only">: {attempt.reference}</span></summary>
            <ResolveSubmission c={caseDetail} s={row} />
          </details>}
        </li>
      })}
    </ul>
    <ul>
      {panel.requirements.map(item => <li key={item.label}><strong>{item.label}: {item.state}.</strong> {item.detail}</li>)}
    </ul>
    <p><strong>Who must act.</strong> {panel.who}</p>
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {panel.commands?.record && <details>
      <summary>Record an externally completed submission</summary>
      <SubmissionForm c={caseDetail} />
    </details>}
    <p>Saving a submission or a result does not submit anything to Google, does not send email, and does not record the case outcome.</p>
  </div>
}
