import type { JourneyQuotePanel } from "@/lib/case-journey/quote"
import { isUuid } from "@/lib/records/model"
import { customerFacingTaxNote } from "../../../../../../lib/pricing"
import { CaseQuoteForm } from "../commercial/forms"
import {
  OfferQuoteActionForm,
  QuoteActionForm,
  RevokeQuoteActionForm,
  SetDraftTaxForm,
} from "../../../commercial/forms"

/**
 * Quote preparation, review, offer and acceptance on guided Step 6.
 * Payment, service activation and authorisation stay on Step 7.
 * The forms are the existing commercial commands.
 */
export function QuotePanel({
  panel,
  caseId,
  customerId,
  businessId,
  locationId,
  customerName,
  businessName,
}: {
  panel: JourneyQuotePanel
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customerName: string
  businessName: string
}) {
  const quote = panel.quote
  const businessHref = isUuid(businessId) ? `/records/business/${businessId}` : null
  const relationshipHref = isUuid(customerId) && isUuid(businessId)
    ? `/records/client/${customerId}/link?business=${businessId}`
    : null
  return <div className="guided-facts" data-quote={panel.headline}>
    <p>{panel.trackNote}</p>
    <p><strong>{panel.headline}.</strong> {panel.detail}</p>
    {quote && <dl className="quote-summary">
      <div><dt>Quote</dt><dd>{quote.publicRef}</dd></div>
      <div><dt>Service</dt><dd>{quote.serviceName}</dd></div>
      <div><dt>Amount</dt><dd>{quote.amountLabel}</dd></div>
      <div><dt>Customer price</dt><dd>{customerFacingTaxNote(quote.taxBehaviour)}</dd></div>
      <div><dt>Internal tax record</dt><dd>{quote.tax}</dd></div>
      <div><dt>Valid until</dt><dd>{quote.validUntilLabel}</dd></div>
      <div className="quote-summary-block"><dt>Scope</dt><dd className="preserve-lines">{quote.scope}</dd></div>
      <div className="quote-summary-block"><dt>Exclusions</dt><dd className="preserve-lines">{quote.exclusions}</dd></div>
      <div><dt>Wording template</dt><dd>{quote.templateVersion ?? "Not recorded on this quote"}</dd></div>
    </dl>}
    {quote?.templateVersion && <p>The saved scope keeps wording version {quote.templateVersion}. The customer quote view omits that trailing line. The stored wording is unchanged.</p>}
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {panel.remaining && <section aria-labelledby="quote-readiness-heading">
      <h3 id="quote-readiness-heading">{panel.remaining.title}</h3>
      <ul>{panel.remaining.items.map(item => <li key={item}>{item}</li>)}</ul>
      <p>
        {businessHref ? <a href={businessHref}>Open the business record</a> : "This case has no business record to open from here."}
        {relationshipHref ? <> <a href={relationshipHref}>Review the customer and business relationship</a></> : null}
      </p>
    </section>}
    {panel.commands.draft && panel.priceChoice && <CaseQuoteForm
      caseId={caseId}
      customerId={customerId}
      businessId={businessId}
      locationId={locationId}
      customerName={customerName}
      businessName={businessName}
      choice={panel.priceChoice}
    />}
    {panel.commands.setTax && quote && <SetDraftTaxForm quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} />}
    {panel.commands.offer && quote && <>
      <p>Review the scope and exclusions above before offering this quote. Those are the final words stored on this quote version.</p>
      <p>Offering this quote is the binding issuance. The button does not mean this draft is eligible. The purchasing establishment and the country and tax eligibility checks on the quote command still decide. This step does not add a country restriction and does not waive those checks.</p>
      <QuoteActionForm operation="offer" quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} label="Offer quote" />
    </>}
    {panel.commands.issueAcceptance && quote && <OfferQuoteActionForm quoteId={quote.quoteId} />}
    {panel.commands.revokeAcceptance && quote?.actionId && <RevokeQuoteActionForm quoteId={quote.quoteId} actionId={quote.actionId} />}
    <p>Saving, reviewing, offering or issuing a link does not accept the quote, take a payment, or activate the service.</p>
  </div>
}
