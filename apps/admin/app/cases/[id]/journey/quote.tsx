import type { JourneyQuotePanel } from "@/lib/case-journey/quote"
import {
  pricingStatusLabel,
  purchaserStatusLabel,
  type QuoteReadiness,
} from "@/lib/case-journey/quote-readiness"
import { isUuid } from "@/lib/records/model"
import { customerPriceBoundary } from "../../../../../../lib/pricing"
import { formatGbp } from "@/lib/commerce/model"
import { CaseQuoteForm } from "../commercial/forms"
import { PurchaserForm } from "../../../commercial/purchaser-form"
import {
  ConfirmPricingForm,
  OfferQuoteActionForm,
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
  caseId,
  customerId,
  businessId,
  locationId,
  customerName,
  businessName,
}: {
  panel: JourneyQuotePanel
  readiness: QuoteReadiness
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customerName: string
  businessName: string
}) {
  const quote = panel.quote
  const stages = stageState(panel)
  const price = quote ? formatGbp(quote.amountMinor) : panel.priceChoice?.amountLabel ?? null
  const pricingConfirmed = readiness.taxPath === "uk_not_charged" && quote?.taxBehaviour === "NOT_APPLICABLE"
  const showPurchaserForm = isUuid(businessId) && (readiness.status === "missing" || readiness.status === "pending")
  const showUkPrice = readiness.taxPath === "uk_not_charged" && Boolean(price)
    && (!quote || quote.taxBehaviour === "UNCONFIRMED" || quote.taxBehaviour === "NOT_APPLICABLE")
  const next = nextAction(panel, readiness)
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
      <div><dt>Quotation status</dt><dd>{quotationStatus(panel)}</dd></div>
      <div><dt>Purchasing establishment</dt><dd>{purchaserStatusLabel(readiness)}</dd></div>
      <div><dt>Pricing</dt><dd>{pricingStatusLabel(readiness, quote?.taxBehaviour ?? null, pricingConfirmed)}</dd></div>
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
    <section aria-labelledby="quote-next-heading">
      <h3 id="quote-next-heading">Next action</h3>
      {next === "unavailable" && <p>Purchasing verification could not be confirmed. Reload this step before continuing.</p>}
      {next === "verify" && !showPurchaserForm && <p>This case has no business record to open from here.</p>}
      {next === "verify" && showPurchaserForm && <PurchaserForm
        businessId={businessId}
        businessName={businessName}
        customerName={customerName}
        guided
      />}
      {(next === "draft" || (next === "verify" && panel.commands.draft)) && panel.priceChoice && <CaseQuoteForm
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
      {(next === "offer" || (next === "review" && panel.commands.offer)) && quote && <>
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
      {next === "wait" && <p><strong>Waiting for Customer Acceptance</strong></p>}
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
      {next === "blocked" && <p>This quotation cannot be continued from here until the quote record is consistent.</p>}
    </section>
    {panel.commands.issueAcceptance && quote && <details>
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

function quotationStatus(panel: JourneyQuotePanel): string {
  if (panel.headline === "Quote accepted") return "Accepted"
  if (panel.headline === "Quote declined") return "Declined"
  if (panel.headline === "Quote expired" || panel.headline === "Acceptance link expired") return "Expired"
  if (panel.headline === "Quote offered") return panel.quote?.actionId ? "Offered — waiting for the customer" : "Offered"
  if (panel.headline === "Draft quote") return panel.quote?.taxBehaviour === "UNCONFIRMED" ? "Draft" : "Draft — pricing saved"
  if (panel.headline === "No quote") return "Not created"
  if (panel.headline === "Quote cancelled") return "Cancelled"
  if (panel.headline === "Quote superseded") return "Superseded"
  return "Needs attention"
}

function stageState(panel: JourneyQuotePanel): Record<"prepare" | "offer" | "acceptance", "done" | "current" | "upcoming"> {
  const accepted = panel.headline === "Quote accepted"
  const linkOpen = Boolean(panel.quote?.actionId) && !accepted
  if (accepted) return { prepare: "done", offer: "done", acceptance: "done" }
  if (linkOpen || panel.headline === "Acceptance link expired") return { prepare: "done", offer: "done", acceptance: "current" }
  if (panel.commands.offer || panel.commands.issueAcceptance || panel.headline === "Quote offered") {
    return { prepare: "done", offer: "current", acceptance: "upcoming" }
  }
  return { prepare: "current", offer: "upcoming", acceptance: "upcoming" }
}

function nextAction(panel: JourneyQuotePanel, readiness: QuoteReadiness): "unavailable" | "verify" | "draft" | "confirm" | "review" | "offer" | "email" | "wait" | "accepted" | "replace" | "blocked" {
  if (panel.notices.some(notice => /incomplete|could not be loaded|do not show the same status|shares the same relevance/i.test(notice))) {
    return "blocked"
  }
  if (panel.headline === "Quote accepted") return "accepted"
  if (panel.quote?.actionId && panel.headline !== "Quote accepted") return "wait"
  if (readiness.status === "unavailable" || readiness.status === "conflicting") {
    if (panel.commands.offer || panel.commands.setTax) return "review"
    return "unavailable"
  }
  if (readiness.status === "missing" || readiness.status === "pending") return "verify"
  if (panel.commands.draft && panel.headline === "No quote") return "draft"
  if (panel.commands.draft) return "replace"
  if (panel.commands.setTax && readiness.taxPath === "uk_not_charged") return "confirm"
  if (panel.commands.setTax || readiness.taxPath === "review") return "review"
  if (panel.commands.offer && readiness.taxPath === "uk_not_charged" && panel.quote?.taxBehaviour === "NOT_APPLICABLE") return "offer"
  if (panel.commands.offer) return "review"
  if (panel.commands.issueAcceptance) return "email"
  if (panel.headline === "Quote offered") return "wait"
  return "blocked"
}
