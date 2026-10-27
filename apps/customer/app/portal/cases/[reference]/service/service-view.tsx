"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { formatPortalDate } from "@/lib/portal/cases/model"
import { AgreementAcceptanceClosed, PaidServiceAgreementDocument } from "@/lib/commercial/agreement-document"
import { CustomerQuotation } from "@/lib/commercial/quotation"
import { QUOTATION_ACCEPTANCE } from "../../../../../../../lib/commercial/quotation-presentation"
import { agreementStatusText, paymentFollowUp, quoteStatusText, trackLabel } from "@/lib/portal/service/model"
import type { CustomerCaseService, ServiceAction, ServiceAgreement, ServiceQuote } from "@/lib/portal/service/parse"

type Operation = "accept_quote" | "decline_quote" | "accept_agreement" | "decline_agreement" | "revoke_authorization"

const CONFIRMATION: Record<Operation, Record<string, boolean>> = {
  accept_quote: { accepted: true },
  decline_quote: { confirmed: true },
  accept_agreement: { accepted: true },
  decline_agreement: { confirmed: true },
  revoke_authorization: { confirmed: true },
}

const BUSINESS_PURPOSE = "I confirm that I am acting for the business named on this quotation and that I am authorised to bind it for the location on this quotation."
const MANAGED_FEE = "I acknowledge that the Managed success fee is payable only after documented success, within 14 calendar days of the invoice. No card is charged automatically and the fee is not collected before that documented success."
const GUARD_FEE = "I authorise monthly billing for Relaunch Guard for this exact location at the accepted monthly amount until cancelled under the agreed cancellation terms. This consent covers only this location and this accepted price. Opening a link or verifying a one-time code is not acceptance."

function actionFor(actions: ServiceAction[], kind: ServiceAction["kind"], target?: ServiceAction["target"]) {
  return actions.find(item => item.kind === kind && (kind !== "revocation" || item.target === target)) ?? null
}

export function ServiceUnavailable() {
  return (
    <div className="service-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load service details</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

export function ServiceView({ service }: { service: CustomerCaseService }) {
  const router = useRouter()
  const item = service.case
  const track = trackLabel(item.serviceTrack)
  const [busy, setBusy] = useState<Operation | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [permissionAgreed, setPermissionAgreed] = useState(false)
  const [purposeAgreed, setPurposeAgreed] = useState(false)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [feeAgreed, setFeeAgreed] = useState(false)
  const keys = useRef<Record<string, string>>({})

  async function submit(operation: Operation, selector: string, confirmation?: Record<string, unknown>) {
    if (busy) return
    setBusy(operation)
    setNotice(null)
    const slot = `${operation}:${selector}`
    const requestKey = keys.current[slot] ?? crypto.randomUUID()
    keys.current[slot] = requestKey
    try {
      const response = await fetch("/api/portal/service", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestKey,
        },
        body: JSON.stringify({
          reference: item.reference,
          selector,
          operation,
          confirmation: confirmation ?? CONFIRMATION[operation],
        }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; status?: string } | null
      if (response.ok && payload?.status === "success") {
        delete keys.current[slot]
        setOpen(null)
        setAgreed(false)
        setPermissionAgreed(false)
        setPurposeAgreed(false)
        setTermsAgreed(false)
        setFeeAgreed(false)
        router.refresh()
        return
      }
      setNotice(typeof payload?.message === "string" ? payload.message : "We couldn't complete that step. Please try again shortly.")
    } catch {
      setNotice("We couldn't complete that step. Please try again shortly.")
    } finally {
      setBusy(null)
    }
  }

  const quoteAction = actionFor(service.actions, "quote")
  const agreementAction = actionFor(service.actions, "service_agreement")
  const permissionAction = actionFor(service.actions, "case_permission")
  const agreementRevoke = actionFor(service.actions, "revocation", "service_agreement")
  const permissionRevoke = actionFor(service.actions, "revocation", "case_permission")

  return (
    <div className="service-page">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li><a href={`/portal/cases/${item.reference}`}>{item.reference}</a></li>
          <li aria-current="page">Service and permissions</li>
        </ol>
      </nav>
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Service and permissions</h1>
      <p className="case-ref">{item.reference}</p>
      <p className="case-business">{item.businessName}</p>
      {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
      {track ? <p className="case-service">{track}</p> : null}
      {notice ? <p className="service-notice" role="alert">{notice}</p> : null}

      <QuoteSection
        reference={item.reference}
        businessName={item.businessName}
        locationName={item.locationName}
        quote={service.quote}
        action={quoteAction}
        busy={busy}
        open={open}
        setOpen={setOpen}
        purposeAgreed={purposeAgreed}
        termsAgreed={termsAgreed}
        feeAgreed={feeAgreed}
        setPurposeAgreed={setPurposeAgreed}
        setTermsAgreed={setTermsAgreed}
        setFeeAgreed={setFeeAgreed}
        onSubmit={submit}
      />
      <AgreementSection
        heading="Service agreement"
        headingId="agreement-heading"
        kind="agreement"
        item={service.serviceAgreement}
        empty="There isn't a service agreement for this case yet."
        acceptLabel="I have read and agree to this Service Agreement."
        agreed={agreed}
        setAgreed={setAgreed}
        action={agreementAction}
        revoke={agreementRevoke}
        busy={busy}
        open={open}
        setOpen={setOpen}
        onSubmit={submit}
        declineEffect="Declining this Service Agreement means you do not agree to it. It does not cancel a service order."
        revokeLabel="Withdraw this agreement"
        revokeEffect="Withdrawing this Service Agreement means it is no longer in effect. It does not cancel a service order."
      />
      <AgreementSection
        heading="Case management permission"
        headingId="permission-heading"
        kind="permission"
        item={service.casePermission}
        empty="There isn't a case management permission for this case yet."
        acceptLabel="I have read and agree to this case management permission."
        agreed={permissionAgreed}
        setAgreed={setPermissionAgreed}
        action={permissionAction}
        revoke={permissionRevoke}
        busy={busy}
        open={open}
        setOpen={setOpen}
        onSubmit={submit}
        declineEffect="Declining this permission means ProfileRelaunch will not use it. It does not cancel a service order."
        revokeLabel="Withdraw this permission"
        revokeEffect="Withdrawing this permission stops ProfileRelaunch using it. It does not cancel a service order."
      />
    </div>
  )
}

function QuoteSection({
  reference, businessName, locationName, quote, action, busy, open, setOpen, purposeAgreed, termsAgreed, feeAgreed,
  setPurposeAgreed, setTermsAgreed, setFeeAgreed, onSubmit,
}: {
  reference: string
  businessName: string
  locationName: string | null
  quote: ServiceQuote | null
  action: ServiceAction | null
  busy: Operation | null
  open: string | null
  setOpen: (value: string | null) => void
  purposeAgreed: boolean
  termsAgreed: boolean
  feeAgreed: boolean
  setPurposeAgreed: (value: boolean) => void
  setTermsAgreed: (value: boolean) => void
  setFeeAgreed: (value: boolean) => void
  onSubmit: (operation: Operation, selector: string, confirmation?: Record<string, unknown>) => void
}) {
  return (
    <section className="service-section" aria-labelledby="quote-heading">
      <h2 id="quote-heading">Your quotation</h2>
      {!quote ? <p>There isn&apos;t a quote for this case yet.</p> : (
        <>
          <p>{quoteStatusText(quote)}</p>
          <CustomerQuotation
            businessName={businessName}
            locationName={locationName}
            caseReference={reference}
            quoteReference={quote.reference}
            orderReference={quote.orderReference}
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
            quotedAmountMinor={quote.quotedAmountMinor}
            taxBehaviour={quote.taxBehaviour}
            taxAmountMinor={quote.taxAmountMinor}
            totalAmountMinor={quote.totalAmountMinor}
            currency={quote.currency}
            validUntilLabel={formatPortalDate(quote.validUntil)}
            validUntilIso={quote.validUntil}
            sectionHeading="h3"
          />
          {quote.status === "offered" || quote.status === "accepted" ? (
            <p>
              <a href={`/portal/cases/${reference}/quotation`}>View quotation</a>
              {" · "}
              <a href={`/api/portal/service/quotation?reference=${reference}`}>Download quotation PDF</a>
            </p>
          ) : null}
          {agreementReady(quote) ? (
            <PaidServiceAgreementDocument
              version={quote.commercialAgreementVersion}
              hash={quote.commercialAgreementHash}
              body={quote.commercialAgreementBody}
              heading="h3"
            />
          ) : null}
          {quote.paymentNext ? (
            <p>
              {paymentFollowUp(quote.paymentNext)}{" "}
              <a href={`/portal/cases/${reference}/payments`}>Open payments for {reference}</a>
            </p>
          ) : null}
          {quote.canAccept && action && agreementReady(quote) ? (
            <div className="service-confirm">
              {open === "accept-quote" && agreementReady(quote) ? (
                  <BoundQuoteAcceptance
                    quote={quote}
                    busy={busy !== null}
                    purposeAgreed={purposeAgreed}
                    termsAgreed={termsAgreed}
                    feeAgreed={feeAgreed}
                    onPurpose={setPurposeAgreed}
                    onTerms={setTermsAgreed}
                    onFee={setFeeAgreed}
                    onBack={() => setOpen(null)}
                    onAccept={() => onSubmit("accept_quote", action.selector, {
                      accepted: true,
                      businessPurpose: { accepted: true },
                      terms: { accepted: true, version: quote.commercialAgreementVersion, hash: quote.commercialAgreementHash },
                      feeBasis: feeBasisFor(quote),
                    })}
                  />
              ) : (
                <button type="button" disabled={busy !== null} onClick={() => setOpen("accept-quote")}>Accept this quote</button>
              )}
            </div>
          ) : quote.commercialAgreementVersion && quote.commercialAgreementHash && !agreementReady(quote) ? (
            <AgreementAcceptanceClosed />
          ) : quote.canAccept && action ? (
            <div className="service-confirm">
              {open === "accept-quote" ? (
                <>
                  <p>Accepting this quote confirms the service and amount shown above.</p>
                  <div className="button-row">
                    <button type="button" disabled={busy !== null} onClick={() => onSubmit("accept_quote", action.selector)}>
                      {busy === "accept_quote" ? "Accepting quote" : "Confirm acceptance"}
                    </button>
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(null)}>Back</button>
                  </div>
                </>
              ) : (
                <button type="button" disabled={busy !== null} onClick={() => setOpen("accept-quote")}>Accept this quote</button>
              )}
            </div>
          ) : null}
          {action && quote.status === "offered" ? (
            <div className="service-confirm">
              {open === "decline-quote" ? (
                <>
                  <p>Declining this quote means it will not go ahead. ProfileRelaunch would need to send a new quote if you want to continue.</p>
                  <div className="button-row">
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => onSubmit("decline_quote", action.selector)}>
                      {busy === "decline_quote" ? "Declining quote" : "Confirm decline"}
                    </button>
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(null)}>Back</button>
                  </div>
                </>
              ) : (
                <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen("decline-quote")}>Decline this quote</button>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function AgreementSection({
  heading, headingId, kind, item, empty, acceptLabel, agreed, setAgreed, action, revoke, busy, open, setOpen, onSubmit,   declineEffect, revokeLabel, revokeEffect,
}: {
  heading: string
  headingId: string
  kind: "agreement" | "permission"
  item: ServiceAgreement | null
  empty: string
  acceptLabel: string
  agreed: boolean
  setAgreed: (value: boolean) => void
  action: ServiceAction | null
  revoke: ServiceAction | null
  busy: Operation | null
  open: string | null
  setOpen: (value: string | null) => void
  onSubmit: (operation: Operation, selector: string) => void
  declineEffect: string
  revokeLabel: string
  revokeEffect: string
}) {
  const acceptKey = kind === "agreement" ? "accept-agreement" : "accept-permission"
  const declineKey = kind === "agreement" ? "decline-agreement" : "decline-permission"
  const revokeKey = kind === "agreement" ? "revoke-agreement" : "revoke-permission"
  const checkboxId = kind === "agreement" ? "agree-service" : "agree-permission"
  return (
    <section className="service-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      {!item ? <p>{empty}</p> : (
        <>
          <p>{agreementStatusText(kind, item)}</p>
          <p className="service-version">Version {item.versionNumber}</p>
          <h3>{item.title}</h3>
          <p className="service-prose">{item.body}</p>
          <h3>Scope</h3>
          <p className="service-prose">{item.scope}</p>
          {item.canAccept && action ? (
            <form className="service-confirm" onSubmit={event => { event.preventDefault(); if (agreed) onSubmit("accept_agreement", action.selector) }}>
              <label className="service-check" htmlFor={checkboxId}>
                <input id={checkboxId} type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
                <span>{acceptLabel}</span>
              </label>
              {open === acceptKey ? (
                <div className="button-row">
                  <button type="submit" disabled={!agreed || busy !== null}>
                    {busy === "accept_agreement" ? "Saving your confirmation" : "Confirm acceptance"}
                  </button>
                  <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(null)}>Back</button>
                </div>
              ) : (
                <button type="button" disabled={!agreed || busy !== null} onClick={() => setOpen(acceptKey)}>
                  {kind === "agreement" ? "Continue with the Service Agreement" : "Continue with this permission"}
                </button>
              )}
            </form>
          ) : null}
          {item.canDecline && action ? (
            <div className="service-confirm">
              {open === declineKey ? (
                <>
                  <p>{declineEffect}</p>
                  <div className="button-row">
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => onSubmit("decline_agreement", action.selector)}>
                      {busy === "decline_agreement" ? "Saving your decision" : "Confirm decline"}
                    </button>
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(null)}>Back</button>
                  </div>
                </>
              ) : (
                <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(declineKey)}>Decline</button>
              )}
            </div>
          ) : null}
          {revoke ? (
            <div className="service-confirm">
              {open === revokeKey ? (
                <>
                  <p>{revokeEffect}</p>
                  <div className="button-row">
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => onSubmit("revoke_authorization", revoke.selector)}>
                      {busy === "revoke_authorization" ? "Withdrawing permission" : "Confirm withdrawal"}
                    </button>
                    <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(null)}>Back</button>
                  </div>
                </>
              ) : (
                <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpen(revokeKey)}>{revokeLabel}</button>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function agreementReady(quote: ServiceQuote): quote is ServiceQuote & {
  commercialAgreementVersion: string
  commercialAgreementHash: string
  commercialAgreementBody: string
} {
  return quote.commercialAgreementReady
    && quote.commercialAgreementVersion !== null
    && quote.commercialAgreementHash !== null
    && quote.commercialAgreementBody !== null
}

function feeBasisFor(quote: ServiceQuote) {
  if (quote.paymentModel === "SUCCESS_FEE") return { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" }
  if (quote.paymentModel === "RECURRING_MONTHLY") {
    return { accepted: true, kind: "GUARD_RECURRING_CONSENT_V1", amountMinor: quote.totalAmountMinor }
  }
  return null
}

function BoundQuoteAcceptance({
  quote, busy, purposeAgreed, termsAgreed, feeAgreed, onPurpose, onTerms, onFee, onBack, onAccept,
}: {
  quote: ServiceQuote
  busy: boolean
  purposeAgreed: boolean
  termsAgreed: boolean
  feeAgreed: boolean
  onPurpose: (value: boolean) => void
  onTerms: (value: boolean) => void
  onFee: (value: boolean) => void
  onBack: () => void
  onAccept: () => void
}) {
  const feeLabel = quote.paymentModel === "SUCCESS_FEE" ? MANAGED_FEE : quote.paymentModel === "RECURRING_MONTHLY" ? GUARD_FEE : null
  const ready = purposeAgreed && termsAgreed && (feeLabel === null || feeAgreed)
  return (
    <>
      <p>Each acknowledgement starts unchecked. Accepting records this quotation together with the agreement shown above.</p>
      <label className="checkbox">
        <input type="checkbox" checked={purposeAgreed} onChange={event => onPurpose(event.target.checked)} />
        {BUSINESS_PURPOSE}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={termsAgreed} onChange={event => onTerms(event.target.checked)} />
        {QUOTATION_ACCEPTANCE}
      </label>
      {feeLabel ? (
        <label className="checkbox">
          <input type="checkbox" checked={feeAgreed} onChange={event => onFee(event.target.checked)} />
          {feeLabel}
        </label>
      ) : null}
      <div className="button-row">
        <button type="button" disabled={busy || !ready} onClick={onAccept}>Confirm acceptance</button>
        <button type="button" className="secondary" disabled={busy} onClick={onBack}>Back</button>
      </div>
    </>
  )
}
