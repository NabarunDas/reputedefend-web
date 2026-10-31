import type { JourneyQuotePanel } from "@/lib/case-journey/quote"
import {
  pricingStatusLabel,
  purchaserStatusLabel,
  type QuoteReadiness,
} from "@/lib/case-journey/quote-readiness"
import { emptyQuoteEmail, type QuoteEmailView } from "@/lib/case-journey/quote-email"
import { quoteActionExpiryWindow } from "@/lib/commerce/action-expiry"
import { isUuid } from "@/lib/records/model"
import { customerPriceBoundary } from "../../../../../../lib/pricing"
import { confirmedReplyMailbox } from "../../../../../../lib/email/reply-mailbox"
import { formatGbp } from "@/lib/commerce/model"
import type { Membership } from "@/lib/records/model"
import { MembershipForm } from "../../../records/forms"
import { RecoveryConfirmation } from "./forms"
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
  membership,
  emailRecovery = null,
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
  membership?: Membership
  emailRecovery?: "send" | "resend" | null
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
      {quote && <div><dt>Quotation number</dt><dd>{quote.publicRef}</dd></div>}
      {price && <div><dt>Total customer price</dt><dd>{price}</dd></div>}
      {quote && <div><dt>Expiry</dt><dd>{quote.validUntilLabel}</dd></div>}
      <div><dt>Quotation status</dt><dd>{quotationStatus(panel, email)}</dd></div>
      <div><dt>Customer email</dt><dd>{panel.trust.emailVerified ? "Verified" : "Not verified"}</dd></div>
      <div><dt>Purchasing establishment</dt><dd>{establishmentFact(readiness)}</dd></div>
      <div><dt>Business authority</dt><dd>{authorityFact(panel.trust.authority)}</dd></div>
      <div><dt>Quotation</dt><dd>{quotationFact(panel, readiness, email)}</dd></div>
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
        taxBehaviour={quote.taxBehaviour}
        replyTo={confirmedReplyMailbox()}
        scope={quote.scope}
        exclusions={quote.exclusions}
        validUntil={quote.validUntil}
      />}
      {next === "queued" && <>
        <p><strong>Queued for sending</strong></p>
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
      {next === "manual" && quote?.actionId && <>
        <p><strong>The acceptance link exists, but the quotation has not been emailed.</strong></p>
        <p>This one-time link cannot be retrieved after you leave this page. Revoke this unused link, then return to this step and send the quotation by email. Revoking it does not accept the quotation and does not take payment.</p>
        <RevokeQuoteActionForm quoteId={quote.quoteId} actionId={quote.actionId} />
      </>}
      {next === "expired" && quote && <SendQuotationForm
        quoteId={quote.quoteId}
        publicRef={quote.publicRef}
        caseReference={quote.caseReference}
        serviceName={quote.serviceName}
        amountMinor={quote.amountMinor}
        currency={quote.currency}
        paymentModel={quote.paymentModel}
        taxBehaviour={quote.taxBehaviour}
        replyTo={confirmedReplyMailbox()}
        scope={quote.scope}
        exclusions={quote.exclusions}
        validUntil={quote.validUntil}
        heading="Send replacement quotation email"
        submitLabel="Send replacement quotation email"
        lead="Review the email, then send the replacement. The expired acceptance link is revoked only as part of that send. Sending does not mean the customer has accepted."
      />}
      {next === "renew" && <>
        <p><strong>This quotation expires too soon for a replacement acceptance link.</strong></p>
        <p>An offered quotation cannot be given a longer expiry in place. Cancel it, then return to this step and create a new draft with a longer expiry. The new draft uses the current approved price and still has to pass the existing agreement and offer checks. Cancelling does not accept the quotation, does not take payment, and does not create the replacement by itself.</p>
        {quote && <QuoteActionForm operation="cancel" quoteId={quote.quoteId} version={quote.version} label="Cancel this quotation" />}
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
      {next === "confirm-email" && <>
        <p>Customer email is not verified. This step does not record that verification by hand.</p>
        {emailRecovery
          ? <RecoveryConfirmation caseId={caseId} mode={emailRecovery} />
          : <p><a href={`/cases/${caseId}/journey?step=CASE_RECEIVED`}>Open the existing email confirmation on Case Received</a></p>}
      </>}
      {(next === "verify-authority" || next === "review-authority") && (!isUuid(businessId) || !isUuid(customerId)) && <p>This case has no business record to open from here.</p>}
      {next === "verify-authority" && isUuid(businessId) && isUuid(customerId) && <details open>
        <summary>Verify business authority</summary>
        <p>Record evidence that this customer may represent this business. Preliminary screening, the purchasing establishment, and a verified email are not this record.</p>
        <MembershipForm customerId={customerId} businessId={businessId} membership={membership} submitLabel="Record business authority" journey />
      </details>}
      {next === "review-authority" && isUuid(businessId) && isUuid(customerId) && <details open>
        <summary>Review business authority</summary>
        <p>This relationship is not verified authority. Record a new evidenced check. A pending or withdrawn relationship does not open the quotation email.</p>
        <MembershipForm customerId={customerId} businessId={businessId} membership={membership} submitLabel="Record business authority review" journey />
      </details>}
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
    {next === "expired" && quote && <details data-secondary="manual-replacement">
      <summary>More Options</summary>
      <p>Issue manual replacement link does not email the customer. The one-time secret cannot be retrieved after you leave this page.</p>
      <OfferQuoteActionForm quoteId={quote.quoteId} quoteValidUntil={quote.validUntil} submitLabel="Issue manual replacement link" />
    </details>}
    {panel.commands.revokeAcceptance && quote?.actionId && next !== "manual" && <details>
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
    if (email.phase === "queued") return "Offered — Queued for sending"
    if (email.phase === "submitted") return "Offered — Sent to email provider"
    if (email.phase === "delivered") return "Offered — Delivered"
    if (email.phase === "attention" || email.phase === "unavailable") return "Offered — Delivery status needs review"
    if (panel.quote?.actionId) return "Offered — Preparing notification"
    return "Offered"
  }
  if (panel.headline === "Draft quote") return panel.quote?.taxBehaviour === "UNCONFIRMED" ? "Draft" : "Draft — pricing saved"
  if (panel.headline === "No quote") return "Not created"
  if (panel.headline === "Quote cancelled") return "Cancelled"
  if (panel.headline === "Quote superseded") return "Superseded"
  return "Needs attention"
}

type NextAction = "unavailable" | "verify" | "draft" | "confirm" | "review" | "offer" | "email" | "queued" | "submitted" | "delivered" | "attention" | "manual" | "expired" | "renew" | "accepted" | "replace" | "blocked" | "confirm-email" | "verify-authority" | "review-authority"

function stageState(next: NextAction): Record<"prepare" | "offer" | "acceptance", "done" | "current" | "upcoming"> {
  if (next === "accepted") return { prepare: "done", offer: "done", acceptance: "done" }
  if (next === "delivered" || next === "expired" || next === "renew") return { prepare: "done", offer: "done", acceptance: "current" }
  if (next === "offer" || next === "email" || next === "queued" || next === "submitted" || next === "attention" || next === "manual" || next === "confirm-email" || next === "verify-authority" || next === "review-authority") {
    return { prepare: "done", offer: "current", acceptance: "upcoming" }
  }
  return { prepare: "current", offer: "upcoming", acceptance: "upcoming" }
}

function trustAction(gap: NonNullable<JourneyQuotePanel["trust"]["gap"]>): NextAction {
  if (gap === "email") return "confirm-email"
  if (gap === "authority-review") return "review-authority"
  return "verify-authority"
}

function offeredQuote(panel: JourneyQuotePanel): boolean {
  return panel.headline === "Quote offered" || panel.headline === "Acceptance link expired"
}

function establishmentFact(readiness: QuoteReadiness): string {
  if (readiness.status === "verified" && readiness.countryLabel) return `Verified — ${readiness.countryLabel}`
  return purchaserStatusLabel(readiness)
}

function authorityFact(authority: JourneyQuotePanel["trust"]["authority"]): string {
  if (authority === "verified") return "Verified"
  if (authority === "pending") return "Pending review"
  if (authority === "revoked") return "Withdrawn — needs an evidenced review"
  return "Not yet verified"
}

function quotationFact(panel: JourneyQuotePanel, readiness: QuoteReadiness, email: QuoteEmailView): string {
  const offered = panel.headline === "Quote offered" || panel.headline === "Acceptance link expired"
  const price = panel.quote ? formatGbp(panel.quote.amountMinor) : null
  const confirmed = readiness.taxPath === "uk_not_charged" && panel.quote?.taxBehaviour === "NOT_APPLICABLE"
  if (offered && confirmed && price) return `Offered; ${price} pricing confirmed`
  if (offered) return quotationStatus(panel, email)
  return quotationStatus(panel, email)
}

function blockedCopy(panel: JourneyQuotePanel, email: QuoteEmailView): string {
  if (email.phase === "unavailable" && offeredQuote(panel)) {
    return "The quotation email history could not be confirmed. Reload this step before continuing."
  }
  return "This quotation cannot be continued from here until the quote record is consistent."
}

function nextAction(panel: JourneyQuotePanel, readiness: QuoteReadiness, email: QuoteEmailView): NextAction {
  if (panel.notices.some(notice => /incomplete|could not be loaded|do not show the same status|shares the same relevance/i.test(notice))) {
    return "blocked"
  }
  if (panel.headline === "Quote accepted") return "accepted"
  if (offeredQuote(panel)) {
    if (panel.headline === "Acceptance link expired") {
      if (!panel.quote || !quoteActionExpiryWindow(panel.quote.validUntil).ready) return "renew"
      if (panel.trust.gap) return trustAction(panel.trust.gap)
      return "expired"
    }
    if (email.phase === "unavailable") return "blocked"
    if (email.phase === "attention") return "attention"
    if (email.phase === "queued") return "queued"
    if (email.phase === "submitted") return "submitted"
    if (email.phase === "delivered") return "delivered"
    if (email.phase === "none" && panel.trust.gap) return trustAction(panel.trust.gap)
    if (panel.quote?.actionId) return "manual"
    if (panel.commands.issueAcceptance && panel.quote && !quoteActionExpiryWindow(panel.quote.validUntil).ready) return "renew"
    if (panel.commands.issueAcceptance) return "email"
    if (panel.trust.gap) return trustAction(panel.trust.gap)
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
