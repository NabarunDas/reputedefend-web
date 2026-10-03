"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  checkoutControl,
  invoiceSentence,
  methodSentence,
  moneyLabel,
  obligationDetail,
  obligationHeadline,
  paidOn,
  taxNote,
  trackLabel,
} from "@/lib/portal/payments/model"
import type { PaymentAction, PaymentCase, PaymentObligation, PaymentOrder } from "@/lib/portal/payments/parse"

type Operation = "confirm_consent" | "start_checkout"

function actionFor(actions: PaymentAction[], kind: PaymentAction["kind"], orderRef: string) {
  return actions.find(item => item.kind === kind && item.orderRef === orderRef) ?? null
}

export function PaymentsUnavailable() {
  return (
    <div className="payments-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load payments</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal">Back to your dashboard</a></p>
    </div>
  )
}

export function PaymentsView({ cases, focused }: { cases: PaymentCase[]; focused: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [agreed, setAgreed] = useState<string | null>(null)
  const keys = useRef<Record<string, string>>({})

  async function submit(reference: string, selector: string, operation: Operation) {
    if (busy) return
    const slot = `${operation}:${selector}`
    setBusy(slot)
    setNotice(null)
    const requestKey = keys.current[slot] ?? crypto.randomUUID()
    keys.current[slot] = requestKey
    try {
      const response = await fetch("/api/portal/payments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestKey,
        },
        body: JSON.stringify({
          reference,
          selector,
          operation,
          confirmation: operation === "confirm_consent" ? { accepted: true } : {},
        }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; status?: string; checkoutUrl?: string } | null
      if (payload?.checkoutUrl) {
        window.location.assign(payload.checkoutUrl)
        return
      }
      if (response.ok && payload?.status === "ok") {
        delete keys.current[slot]
        setAgreed(null)
        setNotice(typeof payload.message === "string" ? payload.message : "We're confirming your payment.")
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

  const title = focused && cases.length === 1 ? `Payments for ${cases[0].reference}` : "Payments"

  return (
    <div className="payments-page">
      {focused && cases[0] ? (
        <nav className="case-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li><a href="/portal/cases">Cases</a></li>
            <li><a href={`/portal/cases/${cases[0].reference}`}>{cases[0].reference}</a></li>
            <li aria-current="page">Payments</li>
          </ol>
        </nav>
      ) : null}
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>{title}</h1>
      {notice ? <p className="payments-notice" role="alert">{notice}</p> : null}
      {cases.length === 0 ? <p>You don&apos;t have any payments yet.</p> : null}
      {cases.map(item => (
        <PaymentCaseSection
          key={item.reference}
          item={item}
          focused={focused}
          busy={busy}
          agreed={agreed}
          setAgreed={setAgreed}
          onSubmit={submit}
        />
      ))}
    </div>
  )
}

function PaymentCaseSection({
  item,
  focused,
  busy,
  agreed,
  setAgreed,
  onSubmit,
}: {
  item: PaymentCase
  focused: boolean
  busy: string | null
  agreed: string | null
  setAgreed: (value: string | null) => void
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const track = trackLabel(item.serviceTrack)
  return (
    <section className="payments-case" aria-labelledby={`payments-${item.reference}`}>
      {focused ? null : <h2 id={`payments-${item.reference}`}>{item.reference}</h2>}
      {focused ? <p className="case-ref" id={`payments-${item.reference}`}>{item.reference}</p> : null}
      <p className="case-business">{item.businessName}</p>
      {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
      {track ? <p className="case-service">{track}</p> : null}
      {focused ? null : (
        <p className="case-documents-link"><a href={`/portal/cases/${item.reference}/payments`}>View payments for {item.reference}</a></p>
      )}
      {item.orders.length === 0 ? <p>There isn&apos;t a payment for this case yet.</p> : null}
      {item.orders.map(order => (
        <OrderSection
          key={order.orderRef}
          item={item}
          order={order}
          busy={busy}
          agreed={agreed}
          setAgreed={setAgreed}
          onSubmit={onSubmit}
        />
      ))}
    </section>
  )
}

function OrderSection({
  item,
  order,
  busy,
  agreed,
  setAgreed,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  busy: string | null
  agreed: string | null
  setAgreed: (value: string | null) => void
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const setup = actionFor(item.actions, "managed_setup", order.orderRef)
  const invoiceAction = actionFor(item.actions, "invoice", order.orderRef)
  const consentSlot = setup ? `confirm_consent:${setup.selector}` : ""
  return (
    <article className="payments-order">
      <h3>{order.serviceName}</h3>
      <p className="payments-order-ref">Order {order.orderRef}</p>
      <dl className="service-facts">
        <div>
          <dt>Amount</dt>
          <dd>{moneyLabel(order.amountMinor, order.currency)}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{order.currency}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{moneyLabel(order.taxAmountMinor, order.currency)}. {taxNote(order.taxBehaviour)}</dd>
        </div>
      </dl>
      {order.paymentModel === "SUCCESS_FEE" ? (
        <div className="payments-authority">
          <h4>Managed service payment</h4>
          <p>{methodSentence(order.paymentMethodSaved)}</p>
          {order.consent?.recorded && order.consent.text ? (
            <>
              <p>Consent is recorded.</p>
              <p className="service-prose">{order.consent.text}</p>
            </>
          ) : null}
          {order.consent && !order.consent.recorded ? <p>Consent has not been recorded.</p> : null}
          {setup && order.consentOfferText ? (
            <form
              className="service-confirm"
              onSubmit={event => {
                event.preventDefault()
                if (agreed === setup.selector) onSubmit(item.reference, setup.selector, "confirm_consent")
              }}
            >
              <label className="service-check">
                <input
                  type="checkbox"
                  checked={agreed === setup.selector}
                  onChange={event => setAgreed(event.target.checked ? setup.selector : null)}
                />
                <span>{order.consentOfferText}</span>
              </label>
              <button type="submit" disabled={busy !== null || agreed !== setup.selector} aria-busy={busy === consentSlot}>
                {busy === consentSlot ? "Recording consent" : "Record consent"}
              </button>
            </form>
          ) : null}
          {setup && order.consent?.recorded ? (
            <form
              className="service-confirm"
              onSubmit={event => {
                event.preventDefault()
                onSubmit(item.reference, setup.selector, "start_checkout")
              }}
            >
              <p>No service fee is charged today.</p>
              <button type="submit" disabled={busy !== null} aria-busy={busy === `start_checkout:${setup.selector}`}>
                {busy === `start_checkout:${setup.selector}` ? "Opening secure checkout" : "Save payment method"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      {order.obligations.map((obligation, index) => (
        <ObligationBlock
          key={`${order.orderRef}-${obligation.kind}-${index}`}
          item={item}
          order={order}
          obligation={obligation}
          invoiceAction={invoiceAction}
          busy={busy}
          onSubmit={onSubmit}
        />
      ))}
      {order.receipts.length > 0 ? (
        <div className="payments-receipts">
          <h4>Receipts</h4>
          <ul className="document-list">
            {order.receipts.map(receipt => (
              <li key={receipt.selector}>
                <p>{moneyLabel(receipt.amountMinor, receipt.currency)} · {paidOn(receipt.paidAt)}</p>
                <p>{taxNote(receipt.taxBehaviour)}</p>
                <p><a href={`/api/portal/payments/receipt?selector=${receipt.selector}`}>Download receipt for {order.orderRef}</a></p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

function ObligationBlock({
  item,
  order,
  obligation,
  invoiceAction,
  busy,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  obligation: PaymentObligation
  invoiceAction: PaymentAction | null
  busy: string | null
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const control = checkoutControl(order, item.actions, obligation)
  const slot = control ? `start_checkout:${control.selector}` : ""
  return (
    <div className="payments-obligation">
      <h4>{obligationHeadline(obligation.kind, obligation.state)}</h4>
      <p>{moneyLabel(obligation.amountMinor, obligation.currency)}</p>
      <p>{obligationDetail(obligation.state)}</p>
      <p>{taxNote(obligation.taxBehaviour)}</p>
      {control ? (
        <form
          className="service-confirm"
          onSubmit={event => {
            event.preventDefault()
            onSubmit(item.reference, control.selector, "start_checkout")
          }}
        >
          <button type="submit" disabled={busy !== null} aria-busy={busy === slot}>
            {busy === slot ? "Opening secure checkout" : control.label}
          </button>
        </form>
      ) : null}
      {obligation.invoice ? (
        <div className="payments-invoice">
          <p>{invoiceSentence(obligation.invoice.status, obligation.invoice.hostedAvailable)}</p>
          {obligation.invoice.hostedAvailable && invoiceAction ? (
            <p>
              <a href={`/api/portal/payments/invoice?reference=${item.reference}&selector=${invoiceAction.selector}`}>
                Open invoice for {order.orderRef}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
