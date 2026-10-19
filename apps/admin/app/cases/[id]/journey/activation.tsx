import type { JourneyActivationPanel } from "@/lib/case-journey/activation"
import { IssuePaymentActionForm } from "../../../money/forms"
import { AuthorizationPanel } from "../authorization-forms"

/**
 * Guided and Managed activation on Step 7.
 * The payment link and the authorisation forms are the existing commands.
 * Pack preparation and Google submission stay on later steps.
 */
export function ActivationPanel({ caseId, panel }: { caseId: string; panel: JourneyActivationPanel }) {
  const order = panel.order
  return <div className="guided-facts" data-activation={panel.headline}>
    <p>{panel.trackNote}</p>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    {order && <dl>
      <div><dt>Service order</dt><dd>{order.reference}</dd></div>
      <div><dt>Payment model</dt><dd>{order.paymentModel}</dd></div>
      {order.amountLabel && <div><dt>Amount</dt><dd>{order.amountLabel}</dd></div>}
      <div><dt>Order state</dt><dd>{order.orderState}</dd></div>
      <div><dt>Obligation</dt><dd>{order.obligationState ?? "None"}</dd></div>
    </dl>}
    {panel.requirements.length > 0 && <ul>
      {panel.requirements.map(item => <li key={item.label}><strong>{item.label}: {item.state}.</strong> {item.detail}</li>)}
    </ul>}
    <p><strong>Who must act.</strong> {panel.who}</p>
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {panel.issueUpfront && <>
      <p>Issuing this link uses the existing payment command. It does not mark the obligation paid, and it does not start a live charge from this page. Collection stays on the existing payment gate.</p>
      <IssuePaymentActionForm
        serviceOrderId={panel.issueUpfront.serviceOrderId}
        version={panel.issueUpfront.version}
        operation="issue_guided_payment_action"
        label="Issue upfront payment link"
      />
    </>}
    {panel.authorization && <AuthorizationPanel caseId={caseId} data={panel.authorization} scope="activation" />}
    <p>Saving a link or recording manager access does not prepare a pack, submit anything to Google, or change the commercial agreement.</p>
  </div>
}
