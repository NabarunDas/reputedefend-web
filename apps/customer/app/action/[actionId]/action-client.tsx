"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ACTION_CODE_INVALID, ACTION_OTP_RETRY, ACTION_RATE_LIMITED, ACTION_UNAVAILABLE } from "@/lib/access"
import { CUSTOMER_OTP_PATTERN } from "@/lib/otp"
import { OtpInput } from "@/app/login/otp-input"
import { AgreementAcceptanceClosed, PaidServiceAgreementDocument } from "@/lib/commercial/agreement-document"
import { CustomerQuotation } from "@/lib/commercial/quotation"
import { assignTrustedStripeCheckout, trustedStripeUrl } from "../../../../../lib/payments/stripe-url"
import { QUOTATION_ACCEPTANCE } from "../../../../../lib/commercial/quotation-presentation"
import { customerFacingTaxNote } from "../../../../../lib/pricing"
import styles from "../../portal/payments/transaction.module.css"

function ActionFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={styles.action}>
      <div className={`${styles.actionCard} ${styles.page} ${wide ? styles.wide : ""}`}>
        <p className={styles.kicker}>Secure action</p>
        {children}
      </div>
    </div>
  )
}

const SERVICE_ACCEPTANCE = "I have read and agree to this service agreement and scope."
const PERMISSION_ACCEPTANCE = "I authorise ProfileRelaunch to carry out the agreed case-management work described in this permission. This is not payment, Google Manager access, or permission to submit."
const BUSINESS_PURPOSE = "I confirm that I am acting for the business named on this quotation and that I am authorised to bind it for the location on this quotation."
const MANAGED_FEE = "I acknowledge that the Managed success fee is payable only after documented success, within 14 calendar days of the invoice. No card is charged automatically and the fee is not collected before that documented success."
const GUARD_FEE = "I authorise monthly billing for Relaunch Guard for this exact location at the accepted monthly amount until cancelled under the agreed cancellation terms. This consent covers only this location and this accepted price. Opening a link or verifying a one-time code is not acceptance."

function quoteFeeLabel(quote: Quote) {
  if (quote.paymentModel === "SUCCESS_FEE") return MANAGED_FEE
  if (quote.paymentModel === "RECURRING_MONTHLY") return GUARD_FEE
  return null
}

function paidQuoteDecision(quote: Quote, form: FormData) {
  const fee = quote.paymentModel === "SUCCESS_FEE"
    ? { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" }
    : quote.paymentModel === "RECURRING_MONTHLY"
      ? { accepted: true, kind: "GUARD_RECURRING_CONSENT_V1", locationId: quote.locationId, amountMinor: quote.totalAmountMinor }
      : null
  return {
    accepted: form.get("purpose") === "true" && form.get("terms") === "true" && (fee === null || form.get("fee") === "true"),
    quoteVersionId: quote.versionId,
    businessPurpose: { accepted: form.get("purpose") === "true" },
    terms: { accepted: form.get("terms") === "true", version: quote.commercialAgreementVersion, hash: quote.commercialAgreementHash },
    feeBasis: fee,
  }
}

type Quote = {
  versionId: string
  versionNumber: number
  serviceCode: string
  serviceName: string
  paymentModel: string
  scope: string
  exclusions: string
  successDefinition: string
  standardAmountMinor: number
  discountPolicyId: string
  discountBps: number
  discountAmountMinor: number
  discountReason?: string | null
  quotedSubtotalMinor: number
  taxBehaviour: string
  taxRateBps: number | null
  taxAmountMinor: number
  taxCode: string | null
  taxJurisdiction: string | null
  totalAmountMinor: number
  currency: string
  validUntil: string
  paymentTiming: string
  termsReference: string
  locationId?: string
  commercialAgreementVersion?: string | null
  commercialAgreementHash?: string | null
  commercialAgreementBody?: string | null
  commercialAgreementReady?: boolean
}

type Session = {
  actionId: string
  kind: string
  status: string
  maskedEmail: string
  caseReference?: string
  businessName?: string
  locationName?: string | null
  agreement?: { title: string; body: string; scope: string; kind: string } | null
  authorization?: { id: string; kind: string; status: string } | null
  quote?: Quote | null
  payment?: {
    orderId: string
    orderRef: string
    serviceCode: string
    amountMinor: number
    currency: string
    taxBehaviour: string
    taxAmountMinor: number
    paymentModel: string
    successDefinition: string
    obligationId?: string | null
    obligationState?: string | null
    consentId?: string | null
    consentText: string
    consentVersion: string
    invoiceId?: string | null
    invoiceStatus?: string | null
    hostedInvoiceUrl?: string | null
  } | null
  guard?: {
    coverageId: string
    coverageBasis: string
    permissionVersion: string
    permissionText: string
    includedDays?: number | null
    includedOfferId?: string | null
    includedOfferStatus?: string | null
    includedEndAt?: string | null
  } | null
  subscription?: {
    subscriptionId: string
    amountMinor: number
    currency: string
    frequency: string
    taxBehaviour: string
    consentVersion: string
    consentText: string
    cancellationTermsVersion: string
    cancellationTermsText: string
    consentId?: string | null
    locationName?: string | null
    lifecycleState?: string
    paidThroughAt?: string | null
    cancelAtPeriodEnd?: boolean
    includedEndAt?: string | null
  } | null
  priceChange?: {
    offerId: string
    oldAmountMinor: number
    newAmountMinor: number
    currency: string
    effectiveRenewalAt?: string | null
    noticeVersion: string
    noticeText: string
    status: string
  } | null
}

function formatGbp(minor: number): string {
  const absolute = Math.abs(minor)
  return `${minor < 0 ? "-" : ""}£${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

type ActionPreview = {
  phase?: "start" | "otp" | "unavailable"
  maskedEmail?: string
  otpSent?: boolean
  code?: string
  message?: string
  resendIn?: number
  pending?: "" | "send" | "resend" | "verify"
}

/**
 * `preview` paints a verification state for a local visual fixture.
 * The action page does not pass it, and it is not read from the request.
 */
export function ActionClient({ actionId, preview }: { actionId: string; preview?: ActionPreview }) {
  const router = useRouter()
  const [phase, setPhase] = useState<"start" | "otp" | "review" | "done" | "unavailable">(preview?.phase ?? "start")
  const [otpSent, setOtpSent] = useState(preview?.otpSent ?? false)
  const [resendIn, setResendIn] = useState(preview?.resendIn ?? 0)
  const [message, setMessage] = useState(preview?.message ?? "")
  const [maskedEmail, setMaskedEmail] = useState(preview?.maskedEmail ?? "")
  const [code, setCode] = useState(preview?.code ?? "")
  const [pending, setPending] = useState<"" | "send" | "resend" | "verify">(preview?.pending ?? "")
  const [session, setSession] = useState<Session | null>(null)
  const secretRef = useRef<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const paintOnly = preview !== undefined
  const holdingResend = resendIn > 0
  useEffect(() => {
    if (paintOnly) return
    let active = true
    if (secretRef.current === null) {
      const hash = window.location.hash
      secretRef.current = hash.startsWith("#t=") ? hash.slice(3) : ""
      history.replaceState(null, "", window.location.pathname + window.location.search)
    }
    const secret = secretRef.current
    const timer = window.setTimeout(() => {
      // Development Strict Mode clears the first timer after the fragment has
      // already been removed. Keep the secret and start the check again.
      if (!active) return
      if (!secret) { setPhase("unavailable"); return }
      void fetch("/api/action/exchange", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, secret }),
      }).then(async response => {
        const result = await response.json() as { status?: string; maskedEmail?: string }
        if (!response.ok || result.status !== "ok") { setPhase("unavailable"); return }
        setMaskedEmail(result.maskedEmail || "")
        setPhase("otp")
      }).catch(() => setPhase("unavailable"))
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [actionId, paintOnly])
  useEffect(() => {
    if (paintOnly || !holdingResend) return
    const timer = window.setInterval(() => setResendIn(current => (current > 0 ? current - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [paintOnly, holdingResend])
  useEffect(() => {
    if (phase === "otp" && otpSent) codeInput.current?.focus()
  }, [phase, otpSent])

  async function sendOtp(event?: FormEvent) {
    event?.preventDefault()
    if (busyRef.current || pending || resendIn > 0) return
    busyRef.current = true
    setPending(otpSent ? "resend" : "send")
    setMessage("")
    try {
      const response = await fetch("/api/action/otp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      const result = await response.json() as { message?: string; maskedEmail?: string }
      if (!response.ok) {
        if (response.status === 429) {
          setMessage(ACTION_RATE_LIMITED)
          setResendIn(60)
          return
        }
        setPhase("unavailable")
        return
      }
      setMaskedEmail(result.maskedEmail || maskedEmail)
      setOtpSent(true)
      setCode("")
      setMessage("")
      setResendIn(60)
    } catch {
      setMessage(ACTION_OTP_RETRY)
    } finally {
      busyRef.current = false
      setPending("")
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || pending || !CUSTOMER_OTP_PATTERN.test(code)) return
    busyRef.current = true
    setPending("verify")
    setMessage("")
    try {
      const response = await fetch("/api/action/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
      const result = await response.json() as { message?: string; reason?: string; session?: Session }
      if (response.status === 429) {
        setMessage(ACTION_RATE_LIMITED)
        return
      }
      if (!response.ok || !result.session) {
        if (result.reason === "invalid_code") {
          setMessage(ACTION_CODE_INVALID)
          return
        }
        setPhase("unavailable")
        return
      }
      if (result.session.kind === "CASE_ACCESS" || result.session.kind === "COMMUNICATION_ACCESS") {
        router.push("/case")
        return
      }
      setSession(result.session)
      setPhase("review")
    } catch {
      setMessage(ACTION_OTP_RETRY)
    } finally {
      busyRef.current = false
      setPending("")
    }
  }
  async function decide(operation: "accept" | "decline" | "revoke", extra: Record<string, unknown>) {
    setMessage("")
    const response = await fetch("/api/action/command", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ operation, ...extra }),
    })
    if (!response.ok) { setPhase("unavailable"); return }
    setPhase("done")
    setMessage(operation === "decline" ? "You declined this action." : "This action is complete.")
  }
  async function subscription(operation: string, extra: Record<string, unknown> = {}) {
    setMessage("")
    const response = await fetch("/api/action/guard-subscription", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ operation, ...extra }),
    })
    const result = await response.json() as { status?: string; message?: string; checkoutUrl?: string }
    if (response.status === 403 && result.message) { setMessage(result.message); return }
    if (response.status === 503) { setMessage(result.message || "Secure Stripe Checkout is not available yet."); return }
    if (!response.ok) { setPhase("unavailable"); return }
    if (assignTrustedStripeCheckout(result.checkoutUrl)) return
    if (result.checkoutUrl) {
      setMessage("Secure Stripe Checkout is not available yet.")
      return
    }
    setMessage(result.message || "This subscription request is recorded.")
  }
  async function payment(operation: "confirm_consent" | "start_checkout", extra: Record<string, unknown> = {}) {
    setMessage("")
    const response = await fetch("/api/action/payment", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ operation, ...extra }),
    })
    const result = await response.json() as { status?: string; message?: string; checkoutUrl?: string }
    if (response.status === 403 && result.message) { setMessage(result.message); return }
    if (response.status === 503) { setMessage(result.message || "Secure Stripe Checkout is not available yet."); return }
    if (!response.ok) { setPhase("unavailable"); return }
    if (assignTrustedStripeCheckout(result.checkoutUrl)) return
    if (result.checkoutUrl) {
      setMessage("Secure Stripe Checkout is not available yet.")
      return
    }
    setMessage(result.message || "Consent recorded. No fee is due today.")
  }

  if (phase === "unavailable") return <section className="auth-card" data-phase="unavailable">
    <p className="eyebrow">Secure action</p>
    <h1>This link is not available</h1>
    <p className="lead">{ACTION_UNAVAILABLE}</p>
    <p className={styles.next}>Request a new link from ProfileRelaunch, or return to the page that sent you here. Do not reuse an expired code.</p>
  </section>
  if (phase === "start") return <section className="auth-card" data-phase="start">
    <p className="eyebrow">Secure action</p>
    <h1>Secure action</h1>
    <p className="muted">Checking this link…</p>
  </section>
  if (phase === "otp") {
    const recipient = maskedEmail || "the verified email for this action"
    const codeInvalid = message === ACTION_CODE_INVALID
    return <section className="auth-card" data-phase={otpSent ? "code" : "send"}>
      <p className="eyebrow">Secure action</p>
      <h1>Confirm it&apos;s you</h1>
      <p className="lead" role="status">{otpSent ? `We sent an eight-digit code to ${recipient}.` : `A one-time code will be sent to ${recipient}.`}</p>
      <p className="auth-note">This code confirms this secure action only. It does not sign you in to the customer portal.</p>
      {!otpSent && <form onSubmit={sendOtp} aria-busy={pending === "send"}>
        {message ? <p id="action-send-error" className="notice-danger" role="alert">{message}</p> : null}
        <button type="submit" disabled={pending !== "" || resendIn > 0}>
          {pending === "send" ? "Sending code…" : resendIn > 0 ? <>Send code (<span className="auth-count">{resendIn}</span>)</> : "Send code"}
        </button>
      </form>}
      {otpSent && <>
        <form onSubmit={verify} aria-busy={pending === "verify"}>
          <label htmlFor="action-code">Eight-digit code</label>
          <OtpInput id="action-code" value={code} onChange={setCode} inputRef={codeInput} invalid={codeInvalid} describedBy={codeInvalid ? "action-code-error" : undefined} />
          {message ? <p id="action-code-error" className="notice-danger" role="alert">{message}</p> : null}
          <button type="submit" disabled={pending !== "" || !CUSTOMER_OTP_PATTERN.test(code)}>{pending === "verify" ? "Verifying…" : "Verify code"}</button>
        </form>
        <div className="button-row">
          <button type="button" className="secondary" disabled={pending !== "" || resendIn > 0} onClick={() => void sendOtp()}>
            {pending === "resend" ? "Sending a new code…" : resendIn > 0 ? <>Resend code (<span className="auth-count">{resendIn}</span>)</> : "Resend code"}
          </button>
        </div>
      </>}
    </section>
  }
  if (phase === "done") return <ActionFrame><section><h1>Secure action</h1><p>{message}</p><p className={styles.next}>You can close this page. If this step continues in the customer portal, sign in there to see the updated case.</p></section></ActionFrame>
  const agreement = session?.agreement
  const quote = session?.quote
  const paymentDetails = session?.payment
  const permission = agreement?.kind === "CASE_MANAGEMENT_PERMISSION"
  if (session?.kind === "GUIDED_PAYMENT" && paymentDetails) {
    return <ActionFrame><section>
      <h1>Pay this accepted order</h1>
      <p>{paymentDetails.orderRef} · {session.caseReference} · {session.businessName}</p>
      <p>Amount due {formatGbp(paymentDetails.amountMinor)} {paymentDetails.currency}. {customerFacingTaxNote(paymentDetails.taxBehaviour)}</p>
      <p>Payment is due now for this Guided service. Stripe Checkout collects the accepted order amount only.</p>
      <form onSubmit={event => { event.preventDefault(); void payment("start_checkout") }}>
        <button type="submit">Pay securely with Stripe</button>
      </form>
      <p>Opening the secure payment page does not mark this paid. We confirm the payment before it shows as received.</p>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "MANAGED_PAYMENT_SETUP") {
    return <ActionFrame><section>
      <h1>Managed payment</h1>
      <p>{paymentDetails?.orderRef ? `${paymentDetails.orderRef} · ` : ""}{session.caseReference} · {session.businessName}</p>
      {paymentDetails ? <p>Agreed success fee {formatGbp(paymentDetails.amountMinor)} {paymentDetails.currency}.</p> : null}
      <p>The Managed success fee is invoiced only after documented success. Saving a card for an off-session charge is not available, and no card is charged automatically.</p>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "INVOICE_PAYMENT" && paymentDetails) {
    const invoiceUrl = trustedStripeUrl(paymentDetails.hostedInvoiceUrl, "invoice")
    return <ActionFrame><section>
      <h1>Pay this earned amount by invoice</h1>
      <p>{paymentDetails.orderRef} · {session.caseReference} · {session.businessName}</p>
      <p>Amount due {formatGbp(paymentDetails.amountMinor)} {paymentDetails.currency}. {customerFacingTaxNote(paymentDetails.taxBehaviour)}</p>
      <p>This invoice is for an amount already earned and not yet paid. Opening the invoice page does not mark this paid.</p>
      {invoiceUrl
        ? <p><a href={invoiceUrl}>Open the secure Stripe hosted invoice</a></p>
        : <p>The hosted invoice link is not available yet.</p>}
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "PAYMENT_RECOVERY" && paymentDetails) {
    return <ActionFrame><section>
      <h1>Complete this earned fee</h1>
      <p>{paymentDetails.orderRef}. Amount due {formatGbp(paymentDetails.amountMinor)} {paymentDetails.currency}.</p>
      <p>The previous off-session attempt needs additional authentication. This is not yet paid.</p>
      <form onSubmit={event => { event.preventDefault(); void payment("start_checkout") }}>
        <button type="submit">Continue securely with Stripe</button>
      </form>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "GUARD_SUBSCRIPTION_START" && session.subscription) {
    const sub = session.subscription
    return <ActionFrame><section>
      <h1>Start Relaunch Guard for this location</h1>
      <p>{session.businessName}{session.locationName ? ` · ${session.locationName}` : ""}</p>
      <p>Accepted monthly amount {formatGbp(sub.amountMinor)} {sub.currency}, billed {sub.frequency.toLowerCase()} for this exact location only.</p>
      <p>{customerFacingTaxNote(sub.taxBehaviour)}</p>
      <h2>Cancellation</h2>
      <p className="preserve-lines">{sub.cancellationTermsText}</p>
      <p>Opening this link or verifying the one-time code does not create a subscription or charge a card.</p>
      {!sub.consentId && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true", consentVersion: sub.consentVersion }) }}>
        <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />{sub.consentText}</label>
        <button type="submit">Accept monthly billing for this location</button>
      </form>}
      {sub.consentId && <form onSubmit={event => { event.preventDefault(); void subscription("start_checkout") }}>
        <button type="submit">Continue to secure Stripe Checkout</button>
      </form>}
      {sub.consentId && sub.lifecycleState === "PAST_DUE" && <form onSubmit={event => { event.preventDefault(); void subscription("start_recovery") }}>
        <button type="submit">Update the payment method securely</button>
      </form>}
      {sub.consentId && !sub.cancelAtPeriodEnd && <form onSubmit={event => { event.preventDefault(); void subscription("request_period_end_cancellation") }}>
        <button className="secondary" type="submit">Cancel at period end</button>
      </form>}
      {sub.consentId && sub.cancelAtPeriodEnd && <form onSubmit={event => { event.preventDefault(); void subscription("undo_period_end_cancellation") }}>
        <button type="submit">Keep this location subscription</button>
      </form>}
      {sub.consentId && <form onSubmit={event => { event.preventDefault(); void subscription("request_immediate_cancellation") }}>
        <button className="destructive" type="submit">Request immediate cancellation review</button>
      </form>}
      <p>Cancel at period end keeps already-paid service until paid-through. Immediate cancellation is a Finance review and does not promise a refund.</p>
      <p>The Stripe return page does not start Guard billing. A confirmed subscription invoice payment is required.</p>
      {sub.includedEndAt && <p>This is a paid continuation after included Guard. Included coverage does not automatically become a paid subscription.</p>}
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "GUARD_PRICE_CHANGE_ACCEPTANCE" && session.priceChange) {
    const offer = session.priceChange
    return <ActionFrame><section>
      <h1>Review this Guard price change</h1>
      <p>{session.businessName}{session.locationName ? ` · ${session.locationName}` : ""}</p>
      <p>Current monthly amount {formatGbp(offer.oldAmountMinor)} {offer.currency}.</p>
      <p>Proposed monthly amount {formatGbp(offer.newAmountMinor)} {offer.currency}.</p>
      {offer.effectiveRenewalAt && <p>If accepted, the new price applies at the next renewal on {new Date(offer.effectiveRenewalAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}. There is no mid-period increase and no proration.</p>}
      <p className="preserve-lines">{offer.noticeText}</p>
      <p>No response is not acceptance. Decline is not acceptance.</p>
      <div className="button-row">
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true" }) }}>
          <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />I accept this exact future price for this location only.</label>
          <button type="submit">Accept price change</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button className="secondary" type="submit">Decline</button></form>
      </div>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "GUARD_PERMISSION" && session.guard) {
    const guard = session.guard
    return <ActionFrame><section>
      <h1>Guard monitoring permission</h1>
      <p>{session.businessName}{session.locationName ? ` · ${session.locationName}` : ""}</p>
      {guard.coverageBasis === "INCLUDED" && <p>This also records your choice to take the included {guard.includedDays || 30}-day Relaunch Guard offer. The 30 days start only when Guard is activated, not when you accept this permission. No subscription exists by default and no automatic charge occurs at included expiry. Paid continuation requires a separate accepted Guard order and recurring consent.</p>}
      {guard.coverageBasis !== "INCLUDED" && <p>You already accepted the commercial quote. This is a separate operational permission for this location. It does not take payment or start monitoring.</p>}
      <h2>Permission wording</h2>
      <p className="preserve-lines">{guard.permissionText}</p>
      <p>Opening this link or verifying the one-time code is not acceptance.</p>
      <div className="button-row">
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true", permissionVersion: guard.permissionVersion }) }}>
          <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />I accept this exact permission text ({guard.permissionVersion}).</label>
          <button type="submit">Accept Guard permission</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button className="secondary" type="submit">Decline</button></form>
      </div>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  if (session?.kind === "QUOTE_ACCEPTANCE" && quote) {
    const taxOpen = quote.taxBehaviour !== "UNCONFIRMED"
    const agreementReady = taxOpen && quote.commercialAgreementReady === true
      && typeof quote.commercialAgreementVersion === "string"
      && typeof quote.commercialAgreementHash === "string"
      && typeof quote.commercialAgreementBody === "string"
      && quote.commercialAgreementBody.trim().length > 0
    const bound = Boolean(quote.commercialAgreementVersion && quote.commercialAgreementHash)
    const validUntilLabel = new Date(quote.validUntil).toLocaleString("en-GB", { timeZone: "Europe/London" })
    return <ActionFrame wide><section className="quotation-page">
      <h1>Your quotation</h1>
      <CustomerQuotation
        businessName={session.businessName}
        locationName={session.locationName}
        caseReference={session.caseReference}
        serviceName={quote.serviceName}
        serviceCode={quote.serviceCode}
        paymentModel={quote.paymentModel}
        scope={quote.scope}
        exclusions={quote.exclusions}
        successDefinition={quote.successDefinition}
        paymentTiming={quote.paymentTiming}
        termsReference={quote.termsReference}
        standardAmountMinor={quote.standardAmountMinor}
        discountAmountMinor={quote.discountAmountMinor}
        quotedAmountMinor={quote.quotedSubtotalMinor}
        taxBehaviour={quote.taxBehaviour}
        taxAmountMinor={quote.taxAmountMinor}
        totalAmountMinor={quote.totalAmountMinor}
        currency={quote.currency}
        validUntilLabel={validUntilLabel}
        validUntilIso={quote.validUntil}
        sectionHeading="h2"
      />
      {agreementReady ? (
        <PaidServiceAgreementDocument
          version={quote.commercialAgreementVersion!}
          hash={quote.commercialAgreementHash!}
          body={quote.commercialAgreementBody!}
        />
      ) : null}
      <div className="button-row quotation-actions">
        {agreementReady ? (
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", paidQuoteDecision(quote, form)) }}>
            <label className="checkbox"><input type="checkbox" name="purpose" value="true" required />{BUSINESS_PURPOSE}</label>
            <label className="checkbox"><input type="checkbox" name="terms" value="true" required />{QUOTATION_ACCEPTANCE}</label>
            {quoteFeeLabel(quote) ? <label className="checkbox"><input type="checkbox" name="fee" value="true" required />{quoteFeeLabel(quote)}</label> : null}
            <button type="submit">Accept quote</button>
          </form>
        ) : taxOpen && !bound ? (
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true" }) }}>
            <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />I accept this exact quote version. This is not payment authorisation and does not charge a card.</label>
            <button type="submit">Accept quote</button>
          </form>
        ) : taxOpen ? <AgreementAcceptanceClosed /> : <p>This quote cannot be accepted while tax treatment is unconfirmed.</p>}
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button className="secondary" type="submit">Decline</button></form>
      </div>
      <p role="status">{message}</p>
    </section></ActionFrame>
  }
  return <ActionFrame><section>
    <h1>{agreement?.title || "Review this action"}</h1>
    <p>{session?.caseReference} · {session?.businessName}{session?.locationName ? ` · ${session.locationName}` : ""}</p>
    {agreement && <>
      <h2>Agreement</h2>
      <p className="preserve-lines">{agreement.body}</p>
      <h2>Scope</h2>
      <p className="preserve-lines">{agreement.scope}</p>
      <div className="button-row">
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true" }) }}>
          <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />{permission ? PERMISSION_ACCEPTANCE : SERVICE_ACCEPTANCE}</label>
          <button type="submit">Accept</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button className="secondary" type="submit">Decline</button></form>
      </div>
    </>}
    {session?.kind === "AUTHORIZATION_REVOCATION" && session.authorization && <form onSubmit={event => { event.preventDefault(); void decide("revoke", { confirmed: true }) }}>
      <p>This will revoke the current {session.authorization.kind} authorisation. It does not refund a payment.</p>
      <button className="destructive" type="submit">Revoke authorisation</button>
    </form>}
    <p role="status">{message}</p>
  </section></ActionFrame>
}
