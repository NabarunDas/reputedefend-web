import type { JourneyOutcomePanel } from "@/lib/case-journey/outcome"
import { ukDate } from "@/lib/admin/activity"
import type { CaseDetail } from "@/lib/cases/model"
import { RecordOutcomeForm } from "../../forms"
import { ApproveSuccessFeeForm, IssuePaymentActionForm, PauseSuccessFeeForm, RecordSuccessBaselineForm, RecordSuccessObservationForm, WithdrawSuccessCheckForm } from "../../../money/forms"
import { ManagedNoticeForm } from "./managed-notice-form"

/**
 * Step 10 records an outcome without closing the case, then reuses the existing
 * success-fee approval and hosted invoice. None of those commands marks an
 * obligation paid or charges a card.
 */
export function OutcomePanel({ caseDetail, panel }: { caseDetail: CaseDetail; panel: JourneyOutcomePanel }) {
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
    {panel.commands?.record && <details>
      <summary>Record outcome</summary>
      <RecordOutcomeForm c={caseDetail} />
    </details>}
    {panel.recordObservation && panel.verificationKnown && panel.order && !panel.baseline && <details>
      <summary>Record the contracted target</summary>
      <RecordSuccessBaselineForm serviceOrderId={panel.order.orderId} evidence={panel.order.evidence} />
    </details>}
    {panel.recordObservation && panel.verificationKnown && panel.order && panel.baseline && <details open>
      <summary>Record a success check</summary>
      <RecordSuccessObservationForm serviceOrderId={panel.order.orderId} baseline={panel.baseline} evidence={panel.order.evidence} checks={panel.checks} />
      {panel.checks.filter(check => !check.invalidated).map(check => <WithdrawSuccessCheckForm key={check.id} check={check} />)}
    </details>}
    {panel.commands?.approve && panel.order && <details>
      <summary>Approve the success fee</summary>
      <ApproveSuccessFeeForm serviceOrderId={panel.order.orderId} version={panel.order.version} evidence={panel.order.evidence} />
    </details>}
    {panel.pauseOrder && <details>
      <summary>{panel.collectionPause === "OPEN" ? "Decide the fee dispute" : "Pause collection"}</summary>
      <PauseSuccessFeeForm serviceOrderId={panel.pauseOrder.orderId} collectionPause={panel.collectionPause} />
    </details>}
    {panel.commands?.invoice && panel.order?.obligationId && <details>
      <summary>Issue success-fee invoice</summary>
      <IssuePaymentActionForm serviceOrderId={panel.order.orderId} version={panel.order.version} operation="issue_invoice_fallback" label="Issue success-fee invoice" obligationId={panel.order.obligationId} />
    </details>}
    {panel.invoiceRecovery && <details>
      <summary>Send the invoice update</summary>
      <ManagedNoticeForm c={caseDetail} kind="invoice" />
    </details>}
    <p>Recording an outcome does not close the case, approve a success fee, create an invoice, or take a payment. Approving a success fee does not take payment. An invoice link, a saved card and a checkout return are not settlement. Issuing the invoice can queue one email when outgoing mail is on. The customer opens it from the signed-in portal. Queued is not delivered. This step does not submit anything to Google and does not charge a card.</p>
  </div>
}
