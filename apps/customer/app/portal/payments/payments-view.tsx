"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  checkoutControl,
  invoiceSentence,
  moneyLabel,
  obligationDetail,
  obligationHeadline,
  trackLabel,
} from "@/lib/portal/payments/model"
import type { PaymentAction, PaymentCase, PaymentObligation, PaymentOrder } from "@/lib/portal/payments/parse"
import { formatPortalDate } from "@/lib/portal/cases/model"
import { assignTrustedStripeCheckout } from "../../../../../lib/payments/stripe-url"

type Operation = "confirm_consent" | "start_checkout" | "refresh_checkout"

function actionFor(actions: PaymentAction[], kind: PaymentAction["kind"], orderRef: string) {
  return actions.find(item => item.kind === kind && item.orderRef === orderRef) ?? null
}

export function PaymentsUnavailable() {
  return (
    <div className="payments-page">
      <h1>We couldn&apos;t load payments</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal">Back to your dashboard</a></p>
    </div>
  )
}

export function PaymentsView({
  cases,
  focused,
  freshOrders = [],
}: {
  cases: PaymentCase[]
  focused: boolean
  freshOrders?: string[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
      if (assignTrustedStripeCheckout(payload?.checkoutUrl)) return
      if (payload?.checkoutUrl) {
        setNotice("Secure Stripe Checkout is not available yet.")
        return
      }
      if (response.ok && payload?.status === "ok") {
        delete keys.current[slot]
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
      <h1>{title}</h1>
      {notice ? <p className="payments-notice" role="alert">{notice}</p> : null}
      {cases.length === 0 ? <p>You don&apos;t have any payments yet.</p> : null}
      {cases.map(item => (
        <PaymentCaseSection
          key={item.reference}
          item={item}
          focused={focused}
          busy={busy}
          freshOrders={freshOrders}
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
  freshOrders,
  onSubmit,
}: {
  item: PaymentCase
  focused: boolean
  busy: string | null
  freshOrders: string[]
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
          fresh={freshOrders.includes(order.orderRef)}
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
  fresh,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  busy: string | null
  fresh: boolean
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const invoiceAction = actionFor(item.actions, "invoice", order.orderRef)
  const priceNote = order.taxBehaviour === "EXCLUSIVE"
    ? "The total shown is the amount recorded on this quote."
    : "The total includes any applicable taxes. ProfileRelaunch does not add a further fee."
  return (
    <article className="payments-order">
      <h3>{order.serviceName}</h3>
      <p className="payments-order-ref">Order {order.orderRef}</p>
      <p className="payments-amount">{moneyLabel(order.amountMinor, order.currency)}</p>
      <details className="portal-more">
        <summary>Payment notes</summary>
        {order.paymentModel === "UPFRONT" ? <p>One-time payment</p> : null}
        <p>{priceNote}</p>
        {order.paymentModel === "SUCCESS_FEE" ? (
          <div className="payments-authority">
            <h4>Managed service payment</h4>
            <p>The Managed success fee is invoiced only after documented success. Saving a card for an off-session charge is not available, and no card is charged automatically.</p>
          </div>
        ) : null}
      </details>
      {order.obligations.map((obligation, index) => (
        <ObligationBlock
          key={`${order.orderRef}-${obligation.kind}-${index}`}
          item={item}
          order={order}
          obligation={obligation}
          invoiceAction={invoiceAction}
          busy={busy}
          fresh={fresh && obligation.kind === "upfront" && (obligation.state === "DUE" || obligation.state === "COLLECTING")}
          onSubmit={onSubmit}
        />
      ))}
      {order.receipts.length > 0 ? (
        <div className="payments-receipts">
          <h4>Receipts</h4>
          <ul className="document-list">
            {order.receipts.map(receipt => (
              <li key={receipt.selector}>
                <p className="payments-paid-line">Paid {moneyLabel(receipt.amountMinor, receipt.currency)} · {formatPortalDate(receipt.paidAt)}</p>
                <p className="portal-actions">
                  <a className="portal-button" href={`/portal/payments/receipt?selector=${receipt.selector}`}>View receipt for {order.orderRef}</a>
                  <a className="portal-button secondary" href={`/api/portal/payments/receipt?selector=${receipt.selector}`}>Download receipt for {order.orderRef}</a>
                </p>
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
  fresh,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  obligation: PaymentObligation
  invoiceAction: PaymentAction | null
  busy: string | null
  fresh: boolean
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const control = checkoutControl(order, item.actions, obligation)
  const slot = control ? `start_checkout:${control.selector}` : ""
  const refreshSlot = control ? `refresh_checkout:${control.selector}` : ""
  const repeatAmount = obligation.amountMinor !== order.amountMinor || obligation.currency !== order.currency
  return (
    <div className="payments-obligation">
      <h4>{obligationHeadline(obligation.kind, obligation.state)}</h4>
      {repeatAmount ? <p>{moneyLabel(obligation.amountMinor, obligation.currency)}</p> : null}
      {obligation.state === "DUE" ? null : <p>{obligationDetail(obligation.state)}</p>}
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
      {control && fresh ? (
        <form
          className="payments-refresh"
          onSubmit={event => {
            event.preventDefault()
            onSubmit(item.reference, control.selector, "refresh_checkout")
          }}
        >
          <p id={`refresh-${order.orderRef}`}>The old payment page will be closed and a new one opened. No payment has been taken.</p>
          <button type="submit" className="secondary" disabled={busy !== null} aria-busy={busy === refreshSlot} aria-describedby={`refresh-${order.orderRef}`}>
            {busy === refreshSlot ? "Starting a fresh checkout" : "Start a fresh secure checkout"}
          </button>
        </form>
      ) : null}
      {obligation.invoice ? (
        <div className="payments-invoice">
          <p>{invoiceSentence(obligation.invoice.status, obligation.invoice.hostedAvailable)}</p>
          {obligation.invoice.status === "ISSUED" && invoiceAction ? (
            <>
              <p>
                <a href={`/portal/payments/invoice?reference=${item.reference}&selector=${invoiceAction.selector}`}>
                  View payment request for {order.orderRef}
                </a>
              </p>
              <p>
                <a href={`/api/portal/payments/invoice-document?reference=${item.reference}&selector=${invoiceAction.selector}`}>
                  Download invoice PDF for {order.orderRef}
                </a>
              </p>
            </>
          ) : null}
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
