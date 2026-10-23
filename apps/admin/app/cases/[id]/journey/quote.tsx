import type { JourneyQuotePanel } from "@/lib/case-journey/quote"
import {
  pricingStatusLabel,
  purchaserStatusLabel,
  type QuoteReadiness,
} from "@/lib/case-journey/quote-readiness"
import { emptyQuoteEmail, type QuoteEmailView } from "@/lib/case-journey/quote-email"
import { isUuid } from "@/lib/records/model"
import { customerPriceBoundary } from "../../../../../../lib/pricing"
import { formatGbp } from "@/lib/commerce/model"
import { CaseQuoteForm } from "../commercial/forms"
import { PurchaserForm } from "../../../commercial/purchaser-form"
import {
  ConfirmPricingForm,
  OfferQuoteActionForm,
  ProcessPendingQuotationEmail,
  QuoteActionForm,
  RevokeQuoteActionForm,
  SendQuotationForm,
  SetDraftTaxForm,
} from "../../../commercial/forms"

/**
 * Guided Step 6. Payment and service activation stay on Step 7.
 * Tax is saved only when the administrator presses Confirm Pricing.
 */
export function QuotePanel({
  panel,
  readiness,
  email = emptyQuoteEmail,
  caseId,
  customerId,
  businessId,
  locationId,
  customerName,
  businessName,
}: {
  panel: JourneyQuotePanel
  readiness: QuoteReadiness
  email?: QuoteEmailView
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customerName: string
  businessName: string
}) {
  const quote = panel.quote
  const next = nextAction(panel, readiness, email)
  const stages = stageState(next)
  const price = quote ? formatGbp(quote.amountMinor) : panel.priceChoice?.amountLabel ?? null
  const pricingConfirmed = readiness.taxPath === "uk_not_charged" && quote?.taxBehaviour === "NOT_APPLICABLE"
  const showPurchaserForm = isUuid(businessId) && (readiness.status === "missing" || readiness.status === "pending")
  const showUkPrice = readiness.taxPath === "uk_not_charged" && Boolean(price)
    && (!quote || quote.taxBehaviour === "UNCONFIRMED" || quote.taxBehaviour === "NOT_APPLICABLE")
  const recordedTax = Boolean(quote && quote.taxBehaviour !== "UNCONFIRMED" && (
    panel.headline === "Quote offered"
    || panel.headline === "Acceptance link expired"
    || panel.headline === "Quote accepted"
    || (panel.headline === "Draft quote" && readiness.taxPath === "review")
  ))
  return <div className="guided-facts quote-workspace" data-quote={panel.headline}>
    <h3>Quotation & Acceptance</h3>
    <ol className="quote-progress" aria-label="Quotation progress">
      <li data-stage="prepare" data-state={stages.prepare} aria-current={stages.prepare === "current" ? "step" : undefined}>Prepare Quotation</li>
      <li data-stage="offer" data-state={stages.offer} aria-current={stages.offer === "current" ? "step" : undefined}>Offer & Email</li>
      <li data-stage="acceptance" data-state={stages.acceptance} aria-current={stages.acceptance === "current" ? "step" : undefined}>Customer Acceptance</li>
    </ol>
    <dl className="quote-summary">
      {quote && <div><dt>Service</dt><dd>{quote.serviceName}</dd></div>}
      {quote && <div><dt>Quote</dt><dd>{quote.publicRef}</dd></div>}
      {price && <div><dt>Total customer price</dt><dd>{price}</dd></div>}
      {quote && <div><dt>Expiry</dt><dd>{quote.validUntilLabel}</dd></div>}
      <div><dt>Quotation status</dt><dd>{quotationStatus(panel, email)}</dd></div>
      <div><dt>Purchasing establishment</dt><dd>{purchaserStatusLabel(readiness)}</dd></div>
      <div><dt>Pricing</dt><dd>{recordedTax ? (pricingConfirmed ? "Pricing confirmed" : "Tax treatment recorded") : pricingStatusLabel(readiness, quote?.taxBehaviour ?? null, pricingConfirmed)}</dd></div>
    </dl>
    {showUkPrice && <>
      <p><strong>Total customer price: {price}</strong></p>
      <p>VAT: Not charged</p>
      <p>{customerPriceBoundary}</p>
    </>}
    {pricingConfirmed && <p><strong>Pricing confirmed</strong></p>}
    {readiness.status === "verified" && <details>
      <summary>View Verification Details</summary>
      <p>{readiness.legalName}</p>
      <p>{readiness.countryLabel}</p>
    </details>}
    {readiness.status === "pending" && <p>A saved note is not a verified purchasing establishment.</p>}
    {readiness.status === "conflicting" && <p>This step cannot treat the purchaser as verified.</p>}
    {panel.notices.map(notice => <p key={notice} className="notice">{notice}</p>)}
    {quote && <details className="guided-details" open={next === "offer" || undefined}>
      <summary>Review Service Details</summary>
      <h4>Scope</h4>
      <p className="preserve-lines">{quote.scope}</p>
      <h4>Exclusions</h4>
      <p className="preserve-lines">{quote.exclusions}</p>
    </details>}
    <section aria-labelledby="quote-next-heading" data-primary-action={next}>
      <h3 id="quote-next-heading">Next action</h3>
      {next === "unavailable" && <p>Purchasing verification could not be confirmed. Reload this step before continuing.</p>}
      {next === "verify" && !showPurchaserForm && <p>This case has no business record to open from here.</p>}
      {next === "verify" && showPurchaserForm && <PurchaserForm
        businessId={businessId}
        businessName={businessName}
        customerName={customerName}
        guided
      />}
      {next === "draft" && panel.priceChoice && <CaseQuoteForm
        caseId={caseId}
        customerId={customerId}
        businessId={businessId}
        locationId={locationId}
        customerName={customerName}
        businessName={businessName}
        choice={panel.priceChoice}
        submitLabel="Create Draft Quotation"
        compact
      />}
      {next === "confirm" && quote && <ConfirmPricingForm quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} />}
      {next === "review" && quote && <>
        <p><strong>Tax treatment needs review</strong></p>
        <details>
          <summary>Review tax treatment</summary>
          <SetDraftTaxForm quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} />
        </details>
      </>}
      {next === "offer" && quote && <>
        <p>Review the service details, then offer this quotation.</p>
        <QuoteActionForm operation="offer" quoteId={quote.quoteId} version={quote.version} quoteVersionId={quote.quoteVersionId} label="Review & Offer Quotation" />
      </>}
      {next === "email" && quote && <SendQuotationForm
        quoteId={quote.quoteId}
        publicRef={quote.publicRef}
        caseReference={quote.caseReference}
        serviceName={quote.serviceName}
        amountMinor={quote.amountMinor}
        currency={quote.currency}
        paymentModel={quote.paymentModel}
        scope={quote.scope}
        exclusions={quote.exclusions}
        validUntil={quote.validUntil}
      />}
      {next === "queued" && <>
        <p><strong>Quotation email queued</strong></p>
        <p>Queued is not sent, and it is not delivered.</p>
        {email.canProcessPending && email.communicationId
          ? <ProcessPendingQuotationEmail communicationId={email.communicationId} />
          : <p>The queued quotation email stays on this step. It is not created again from here.</p>}
      </>}
      {next === "submitted" && <p><strong>Quotation submitted to email provider</strong></p>}
      {next === "delivered" && <>
        <p><strong>Quotation delivered</strong></p>
        <p><strong>Waiting for Customer Acceptance</strong></p>
      </>}
      {next === "attention" && <>
        <p><strong>Email needs attention</strong></p>
        <p>This quotation email was not confirmed. It was not sent again.</p>
      </>}
      {next === "manual" && <p><strong>The acceptance link exists, but the quotation has not been emailed.</strong></p>}
      {next === "expired" && quote && <>
        <p><strong>Customer acceptance link expired — Issue Replacement</strong></p>
        <p>The replacement is issued only when you continue. This page does not revoke or create a link while it is shown.</p>
        <OfferQuoteActionForm quoteId={quote.quoteId} quoteValidUntil={quote.validUntil} submitLabel="Issue Replacement" />
      </>}
      {next === "accepted" && <p><strong>Quotation accepted — Continue to Step 7</strong> <a href={`/cases/${caseId}/journey?step=SERVICE_ACTIVATION`}>Continue to Step 7</a></p>}
      {next === "replace" && panel.priceChoice && <CaseQuoteForm
        caseId={caseId}
        customerId={customerId}
        businessId={businessId}
        locationId={locationId}
        customerName={customerName}
        businessName={businessName}
        choice={panel.priceChoice}
        submitLabel="Create Draft Quotation"
        compact
      />}
      {next === "blocked" && <p>{blockedCopy(panel, email)}</p>}
    </section>
    {next === "verify" && panel.commands.draft && panel.priceChoice && <details data-secondary="draft">
      <summary>Other actions</summary>
      <CaseQuoteForm
        caseId={caseId}
        customerId={customerId}
        businessId={businessId}
        locationId={locationId}
        customerName={customerName}
        businessName={businessName}
        choice={panel.priceChoice}
        submitLabel="Create Draft Quotation"
        compact
      />
    </details>}
    {panel.commands.issueAcceptance && quote && !quote.actionId && next !== "expired" && <details>
      <summary>More Options</summary>
      <p>A manual one-time link does not send the quotation email.</p>
      <OfferQuoteActionForm quoteId={quote.quoteId} quoteValidUntil={quote.validUntil} />
    </details>}
    {panel.commands.revokeAcceptance && quote?.actionId && <details>
      <summary>More Options</summary>
      <p>Revoking this link does not accept the quotation and does not take payment.</p>
      <RevokeQuoteActionForm quoteId={quote.quoteId} actionId={quote.actionId} />
    </details>}
    <p>Emailing or opening the quotation is not acceptance, and this step does not take payment.</p>
  </div>
}

function quotationStatus(panel: JourneyQuotePanel, email: QuoteEmailView): string {
  if (panel.headline === "Quote accepted") return "Accepted"
  if (panel.headline === "Quote declined") return "Declined"
  if (panel.headline === "Quote expired") return "Expired"
  if (panel.headline === "Acceptance link expired") return "Offered — acceptance link expired"
  if (panel.headline === "Quote offered") {
    if (email.phase === "queued") return "Offered — email queued"
    if (email.phase === "submitted") return "Offered — submitted to the email provider"
    if (email.phase === "delivered") return "Offered — delivered, waiting for the customer"
    if (email.phase === "attention" || email.phase === "unavailable") return "Offered — email needs attention"
    if (panel.quote?.actionId) return "Offered — link not emailed"
    return "Offered"
  }
  if (panel.headline === "Draft quote") return panel.quote?.taxBehaviour === "UNCONFIRMED" ? "Draft" : "Draft — pricing saved"
  if (panel.headline === "No quote") return "Not created"
  if (panel.headline === "Quote cancelled") return "Cancelled"
  if (panel.headline === "Quote superseded") return "Superseded"
  return "Needs attention"
}

type NextAction = "unavailable" | "verify" | "draft" | "confirm" | "review" | "offer" | "email" | "queued" | "submitted" | "delivered" | "attention" | "manual" | "expired" | "accepted" | "replace" | "blocked"

function stageState(next: NextAction): Record<"prepare" | "offer" | "acceptance", "done" | "current" | "upcoming"> {
  if (next === "accepted") return { prepare: "done", offer: "done", acceptance: "done" }
  if (next === "delivered" || next === "expired") return { prepare: "done", offer: "done", acceptance: "current" }
  if (next === "offer" || next === "email" || next === "queued" || next === "submitted" || next === "attention" || next === "manual") {
    return { prepare: "done", offer: "current", acceptance: "upcoming" }
  }
  return { prepare: "current", offer: "upcoming", acceptance: "upcoming" }
}

function offeredQuote(panel: JourneyQuotePanel): boolean {
  return panel.headline === "Quote offered" || panel.headline === "Acceptance link expired"
}

function blockedCopy(panel: JourneyQuotePanel, email: QuoteEmailView): string {
  if (email.phase === "unavailable" && offeredQuote(panel)) {
    return "The quotation email history could not be confirmed. Reload this step before continuing."
  }
  if (panel.headline === "Quote offered") {
    return "The quotation email stays closed until the customer's email and business authority are verified."
  }
  return "This quotation cannot be continued from here until the quote record is consistent."
}

function nextAction(panel: JourneyQuotePanel, readiness: QuoteReadiness, email: QuoteEmailView): NextAction {
  if (panel.notices.some(notice => /incomplete|could not be loaded|do not show the same status|shares the same relevance/i.test(notice))) {
    return "blocked"
  }
  if (panel.headline === "Quote accepted") return "accepted"
  if (offeredQuote(panel)) {
    if (panel.headline === "Acceptance link expired") return "expired"
    if (email.phase === "unavailable") return "blocked"
    if (email.phase === "attention") return "attention"
    if (email.phase === "queued") return "queued"
    if (email.phase === "submitted") return "submitted"
    if (email.phase === "delivered") return "delivered"
    if (panel.quote?.actionId) return "manual"
    if (panel.commands.issueAcceptance) return "email"
    return "blocked"
  }
  if (readiness.status === "unavailable") return "unavailable"
  if (readiness.status === "conflicting") return "blocked"
  if (readiness.status === "missing" || readiness.status === "pending") return "verify"
  if (panel.commands.draft && panel.headline === "No quote") return "draft"
  if (panel.commands.draft) return "replace"
  if (panel.commands.setTax && readiness.taxPath === "uk_not_charged") return "confirm"
  if (panel.commands.setTax) return "review"
  if (panel.commands.offer && readiness.status === "verified" && readiness.taxPath === "uk_not_charged" && panel.quote?.taxBehaviour === "NOT_APPLICABLE") return "offer"
  if (panel.commands.offer && readiness.status === "verified" && readiness.taxPath === "review" && panel.quote && panel.quote.taxBehaviour !== "UNCONFIRMED") return "offer"
  if (panel.commands.offer) return "review"
  return "blocked"
}
