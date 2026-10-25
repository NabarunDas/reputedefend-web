import type { JourneySubmissionPanel } from "@/lib/case-journey/submission"
import { ukDate } from "@/lib/admin/activity"
import type { CaseDetail } from "@/lib/cases/model"
import { ResolveSubmission, SubmissionForm } from "../../forms"
import { ManagedNoticeForm } from "./managed-notice-form"

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
    {panel.noticeRecovery && <details>
      <summary>Send the customer update</summary>
      <ManagedNoticeForm c={caseDetail} kind={panel.noticeRecovery} />
    </details>}
    <p>Record the date, the channel, any Google reference, and the evidence that the submission was made outside ProfileRelaunch. An open attempt means a response is still pending. If Google asks for more information, record a follow-up submission rather than treating the attempt as successful. An unsuccessful response is a withdrawal or a later outcome that does not meet the success definition. A favourable reply still needs its own checks before any fee is approved. Saving this record does not submit anything to Google and does not record the case outcome. When outgoing mail is on, saving can queue one progress email. Queued is not delivered.</p>
  </div>
}
