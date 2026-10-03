import Link from "next/link"
import type { CaseDetail } from "@/lib/cases/model"
import { isUuid } from "@/lib/records/model"
import type { CommercialWorkspaceModel } from "@/lib/commercial-workspace/model"
import {
  CreateVersionForm,
  OfferQuoteActionForm,
  QuoteActionForm,
  RevokeQuoteActionForm,
  SetDraftTaxForm,
} from "../../../commercial/forms"
import { ApproveSuccessFeeForm, IssuePaymentActionForm } from "../../../money/forms"
import { Notice } from "../../../ui"
import { CaseQuoteForm } from "./forms"

/**
 * Renders the commercial workspace model. Which command appears is already
 * decided; this component does not re-read quote or payment status codes.
 */
export function CommercialWorkspace({ model, caseDetail }: { model: CommercialWorkspaceModel; caseDetail: CaseDetail }) {
  const quote = model.quoteContext
  const order = model.orderContext
  const showCreate = model.commands.createQuote && model.priceChoices.length === 1
  return <>
    {model.notices.map(notice => <Notice key={notice} tone="warning">{notice}</Notice>)}

    <section className="panel" aria-labelledby="commercial-next-heading">
      <h2 id="commercial-next-heading">Next action</h2>
      <CaseAction model={model} />
    </section>

    <section className="panel" aria-labelledby="commercial-journey-heading">
      <h2 id="commercial-journey-heading">Quote, acceptance, order, payment</h2>
      <ol className="journey" aria-label="Commercial journey">
        {model.journey.map(stage => <li
          key={stage.id}
          className={`journey-step journey-${stage.tone === "attention" ? "needs-attention" : stage.tone === "not_started" || stage.tone === "not_applicable" ? "upcoming" : stage.tone}`}
          aria-current={stage.tone === "current" ? "step" : undefined}
        >
          <p className="journey-mark" aria-hidden="true">{stage.symbol}</p>
          <p className="journey-label">{stage.label}</p>
          <p className="journey-state">{stage.toneLabel}</p>
          <p>{stage.detail}</p>
        </li>)}
      </ol>
    </section>

    <section className="panel" aria-labelledby="commercial-summary-heading">
      <h2 id="commercial-summary-heading">Commercial agreement</h2>
      <p className="commercial-headline">{model.quoteHeadline}</p>
      <dl>
        {model.summary.map(row => <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className="preserve-lines">{row.value}</dd>
        </div>)}
      </dl>
    </section>

    <section className="panel" aria-labelledby="commercial-quote-heading">
      <h2 id="commercial-quote-heading">Quote</h2>
      {model.guardDiscount && <p>{model.guardDiscount.message} <Link href={model.guardDiscount.href}>{model.guardDiscount.hrefLabel}</Link></p>}
      {model.priceGap && <p>{model.priceGap.message} <Link href={model.priceGap.href}>{model.priceGap.hrefLabel}</Link></p>}
      {showCreate && <CaseQuoteForm
        caseId={caseDetail.id}
        customerId={caseDetail.customerId}
        businessId={caseDetail.businessId}
        locationId={caseDetail.locationId}
        customerName={caseDetail.client}
        businessName={caseDetail.business}
        choice={model.priceChoices[0]}
      />}
      {quote && model.commands.setTax && <SetDraftTaxForm quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} />}
      {quote && model.commands.offer && <QuoteActionForm operation="offer" quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} label="Offer quote" />}
      {quote && model.commands.newVersion && <CreateVersionForm quoteId={quote.quoteId} version={quote.version} />}
      {quote && model.commands.issueAcceptance && <OfferQuoteActionForm quoteId={quote.quoteId} />}
      {quote && model.commands.revokeAcceptance && quote.actionId && <RevokeQuoteActionForm quoteId={quote.quoteId} actionId={quote.actionId} />}
      {quote && model.commands.supersede && <QuoteActionForm operation="supersede" quoteId={quote.quoteId} version={quote.version} label="Supersede quote" />}
      {quote && model.commands.cancel && <QuoteActionForm operation="cancel" quoteId={quote.quoteId} version={quote.version} label="Cancel quote" />}
      {!showCreate && !model.priceGap && !quote && <p>There is no quote action to take on this case.</p>}
    </section>

    <section className="panel" aria-labelledby="commercial-order-heading">
      <h2 id="commercial-order-heading">Service order</h2>
      <p className="commercial-headline">{model.orderHeadline}</p>
      <p>{model.orderDetail}</p>
    </section>

    <section className="panel" aria-labelledby="commercial-payment-heading">
      <h2 id="commercial-payment-heading">Payment and setup</h2>
      <p className="commercial-headline">{model.paymentHeadline}</p>
      <p>{model.paymentDetail}</p>
      {model.guided && model.guided.kind !== "paid" && model.guided.kind !== "void" && <p>A completed checkout page is not a payment.</p>}
      {model.managed && <>
        <ol className="commercial-prereqs">
          {model.managed.rows.map(row => <li key={row.label}>
            <strong>{row.label}: {row.state}.</strong> {row.detail}
          </li>)}
        </ol>
        {model.managed.collectedNow && model.managed.collectedNow !== model.paymentDetail && <p>{model.managed.collectedNow}</p>}
        {model.managed.approval && <p>{model.managed.approval}</p>}
      </>}
      {model.guardNote && <p>{model.guardNote} <Link href="/money">Open Money for Guard billing</Link></p>}
      {order && model.commands.issueUpfront && <IssuePaymentActionForm serviceOrderId={order.orderId} version={order.version} operation="issue_guided_payment_action" label="Issue upfront payment link" />}
      {order && model.commands.issueManagedSetup && <IssuePaymentActionForm serviceOrderId={order.orderId} version={order.version} operation="issue_managed_setup_action" label="Issue payment-method setup link" />}
      {order && model.commands.issueRecovery && <IssuePaymentActionForm serviceOrderId={order.orderId} version={order.version} operation="issue_recovery_action" label="Issue recovery link" obligationId={order.obligationId} />}
      {order && model.commands.approveSuccessFee && (order.evidence.length > 0
        ? <ApproveSuccessFeeForm serviceOrderId={order.orderId} version={order.version} evidence={order.evidence} />
        : <p>Success-fee approval needs accepted evidence for this case.{isUuid(caseDetail.id) && <> <Link href={`/cases/${caseDetail.id}/evidence`}>Open evidence</Link></>}</p>)}
      <p className="muted"><Link href="/money">Outstanding obligations and Guard billing stay on Money</Link>. <Link href="/commercial">Catalogue and the quote queue stay on Commercial</Link>.</p>
    </section>

    {model.technical.length > 0 && <details className="panel">
      <summary>Technical identifiers</summary>
      <dl>
        {model.technical.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
      </dl>
    </details>}
  </>
}

function CaseAction({ model }: { model: CommercialWorkspaceModel }) {
  const action = model.caseAction
  if (action.kind === "none") return <p>This case has no outstanding action.</p>
  if (action.kind === "here") return <>
    <p className="commercial-headline">{action.label}</p>
    <p>{action.description}</p>
  </>
  return <>
    <p>The case&apos;s next action is outside Commercial and money.</p>
    <p className="commercial-headline">{action.label}</p>
    <p>{action.description}</p>
    {action.href && action.destinationLabel && <p><Link href={action.href}>{action.destinationLabel}</Link></p>}
  </>
}
