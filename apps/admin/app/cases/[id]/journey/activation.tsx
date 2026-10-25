import type { JourneyActivationPanel } from "@/lib/case-journey/activation"
import { emptyPaymentRequestEmail, offerPaymentRequestSend, type PaymentRequestEmailView } from "@/lib/case-journey/payment-request-email"
import { AuthorizationPanel } from "../authorization-forms"
import { ContinueAcceptedServiceForm } from "./continue-payment"
import { PaymentRequestForm } from "./payment-request-form"

/**
 * Guided and Managed activation on Step 7.
 * Guided payment sends one portal email and reuses an open payment action.
 * Pack preparation and Google submission stay on later steps.
 */
export function ActivationPanel({
  caseId, version, panel, email = emptyPaymentRequestEmail,
}: { caseId: string; version: number; panel: JourneyActivationPanel; email?: PaymentRequestEmailView }) {
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
    {panel.continueToPayment && <ContinueAcceptedServiceForm caseId={caseId} version={version} label={panel.continueToPayment.label} />}
    {panel.issueUpfront && <>
      <p>Payment status: outstanding. Stripe has not confirmed settlement, and a receipt is not stored. This step is not complete.</p>
      <p>Email status: {email.detail}</p>
      {offerPaymentRequestSend(email) && <PaymentRequestForm serviceOrderId={panel.issueUpfront.serviceOrderId} version={panel.issueUpfront.version} />}
    </>}
    {panel.track === "MANAGED" && <p>Email status: no upfront payment email is sent for a Managed success fee.</p>}
    {panel.authorization && <AuthorizationPanel caseId={caseId} data={panel.authorization} scope="activation" />}
    <p>Saving a link or recording manager access does not prepare a pack, submit anything to Google, or change the commercial agreement.</p>
  </div>
}
