import type { JourneyOutcomePanel } from "@/lib/case-journey/outcome"
import { ukDate } from "@/lib/admin/activity"
import { ApproveSuccessFeeForm, IssuePaymentActionForm } from "../../../money/forms"

/**
 * Step 10 reuses the existing success-fee approval and TEST-MODE hosted invoice.
 * Neither command closes the case or marks an obligation paid.
 */
export function OutcomePanel({ panel }: { panel: JourneyOutcomePanel }) {
  return <div className="guided-facts" data-outcome={panel.headline}>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    <p>Case outcome: {panel.outcomeLabel}. Service track: {panel.trackLabel}.</p>
    <p>Billing position: {panel.billingLabel}</p>
    {panel.attempts.length === 0
      ? <p>No Google decision or withdrawal is recorded.</p>
      : <ul>
        {panel.attempts.map(attempt => <li key={attempt.id}>
          <strong>{attempt.reference}: {attempt.state}.</strong> Submitted by {attempt.party} on {ukDate(attempt.submittedAt)}. Evidence: {attempt.evidence}
          {attempt.resultNote ? ` Result note: ${attempt.resultNote}` : ""}
        </li>)}
      </ul>}
    {panel.evidence.length > 0 && <p>Accepted evidence: {panel.evidence.join(", ")}.</p>}
    <ul>
      {panel.requirements.map(item => <li key={item.label}><strong>{item.label}: {item.state}.</strong> {item.detail}</li>)}
    </ul>
    <p><strong>Who must act.</strong> {panel.who}</p>
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {panel.commands?.approve && panel.order && <details>
      <summary>Approve the success fee</summary>
      <ApproveSuccessFeeForm serviceOrderId={panel.order.orderId} version={panel.order.version} evidence={panel.order.evidence} />
    </details>}
    {panel.commands?.invoice && panel.order?.obligationId && <details>
      <summary>Issue a TEST-MODE hosted invoice</summary>
      <IssuePaymentActionForm serviceOrderId={panel.order.orderId} version={panel.order.version} operation="issue_invoice_fallback" label="Issue TEST-MODE hosted invoice fallback" obligationId={panel.order.obligationId} />
    </details>}
    <p>Approving a success fee does not take payment. An invoice link, a saved card and a checkout return are not settlement. This step does not close the case, send email, or submit anything to Google.</p>
  </div>
}
