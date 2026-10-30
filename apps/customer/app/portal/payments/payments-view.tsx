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
import styles from "./transaction.module.css"

type Operation = "confirm_consent" | "start_checkout" | "refresh_checkout"

function openObligation(order: PaymentOrder): boolean {
  return order.obligations.some(item => item.state === "DUE" || item.state === "COLLECTING" || item.state === "AUTHENTICATION_REQUIRED" || item.state === "FAILED")
}

/** A due obligation stores its own amount. That is not the order total, and it is not the order total minus receipts. */
function recordedOutstanding(obligation: PaymentObligation): boolean {
  if (obligation.state !== "DUE") return false
  if (obligation.kind === "upfront") return true
  return obligation.invoice?.status === "ISSUED"
}

function obligationTone(state: PaymentObligation["state"]): string {
  if (state === "PAID") return styles.good
  if (state === "DUE" || state === "COLLECTING" || state === "AUTHENTICATION_REQUIRED") return styles.pending
  if (state === "FAILED") return styles.problem
  return styles.quiet
}

function actionFor(actions: PaymentAction[], kind: PaymentAction["kind"], orderRef: string) {
  return actions.find(item => item.kind === kind && item.orderRef === orderRef) ?? null
}

function dueObligations(order: PaymentOrder): PaymentObligation[] {
  return order.obligations.filter(recordedOutstanding)
}

type Figure = { caption: "Amount due" | "Amount paid" | "Order total"; minor: number; currency: string; kind: "due" | "paid" | "total" }

/**
 * The large figure is one stored amount. A receipt does not make the order paid,
 * and receipts are never subtracted from the order total.
 */
function prominentFigure(order: PaymentOrder): Figure {
  const dues = dueObligations(order)
  if (dues.length === 1) return { caption: "Amount due", minor: dues[0].amountMinor, currency: dues[0].currency, kind: "due" }
  const solePaid = order.obligations.length === 1 && order.obligations[0].state === "PAID" && order.receipts.length === 1
  if (solePaid) {
    const receipt = order.receipts[0]
    return { caption: "Amount paid", minor: receipt.amountMinor, currency: receipt.currency, kind: "paid" }
  }
  return { caption: "Order total", minor: order.amountMinor, currency: order.currency, kind: "total" }
}

function sameMoney(minor: number, currency: string, otherMinor: number, otherCurrency: string) {
  return minor === otherMinor && currency === otherCurrency
}

function receiptAbsence(order: PaymentOrder): string | null {
  if (order.receipts.length > 0) return null
  if (order.obligations.some(item => item.state === "PAID")) return null
  return openObligation(order) ? "No payment recorded yet." : "No payment was recorded."
}

export function PaymentsUnavailable() {
  return (
    <div className="payments-page state-panel">
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
    <div className={`payments-page ${styles.page}`}>
      {focused && cases[0] ? (
        <nav className="case-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li><a href="/portal/cases">Cases</a></li>
            <li><a href={`/portal/cases/${cases[0].reference}`}>{cases[0].reference}</a></li>
            <li aria-current="page">Payments</li>
          </ol>
        </nav>
      ) : null}
      <header className="payments-intro">
        <p className={styles.kicker}>Billing</p>
        <h1>{title}</h1>
        <p>Your payments and receipts.</p>
      </header>
      {notice ? <p className="payments-notice" role="alert">{notice}</p> : null}
      {cases.length === 0 ? <p className="state-panel">You don&apos;t have any payments yet.</p> : null}
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
  if (item.orders.length === 0) {
    return <p className="payments-empty-case">There isn&apos;t a payment for {item.businessName} ({item.reference}) yet.</p>
  }
  const grouped = item.orders.length > 1
  const labelId = grouped ? `payments-${item.reference}` : `payments-service-${item.orders[0].orderRef}`
  const context = [focused ? null : item.reference, item.locationName].filter(Boolean).join(" · ")
  return (
    <section className="payments-case" aria-labelledby={labelId}>
      {grouped ? (
        <header className="payments-case-context">
          <h2 id={labelId}>{item.businessName}</h2>
          {context ? <p>{context}</p> : null}
        </header>
      ) : null}
      {item.orders.map(order => (
        <OrderSection
          key={order.orderRef}
          item={item}
          order={order}
          focused={focused}
          grouped={grouped}
          labelId={grouped ? undefined : labelId}
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
  focused,
  grouped,
  labelId,
  busy,
  fresh,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  focused: boolean
  grouped: boolean
  labelId?: string
  busy: string | null
  fresh: boolean
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const figure = prominentFigure(order)
  const dues = dueObligations(order)
  const soleReceipt = figure.kind === "paid" ? order.receipts[0] : null
  const listedReceipts = soleReceipt ? [] : order.receipts
  const orderTotalVisible = figure.kind !== "total" && !sameMoney(figure.minor, figure.currency, order.amountMinor, order.currency)
  const single = order.obligations.length === 1 ? order.obligations[0] : null
  const support = grouped ? null : [item.businessName, focused ? null : item.reference].filter(Boolean).join(" · ")
  const priceNote = order.taxBehaviour === "EXCLUSIVE"
    ? "The total shown is the amount recorded on this quote."
    : "The total includes any applicable taxes. ProfileRelaunch does not add a further fee."
  const issuedInvoice = order.obligations.some(obligation => obligation.invoice?.status === "ISSUED")
  const track = trackLabel(item.serviceTrack)
  const ServiceHeading = grouped ? "h3" : "h2"
  return (
    <article className="payments-order">
      <div className="payments-card-top">
        <div className="payments-identity">
          <div className="payments-title-row">
            <ServiceHeading id={labelId} className="payments-service">{order.serviceName}</ServiceHeading>
            {single ? (
              <h4 className={`${styles.status} ${obligationTone(single.state)}`}>{obligationHeadline(single.kind, single.state)}</h4>
            ) : null}
          </div>
          {support ? <p className="payments-support">{support}</p> : null}
          {!grouped && item.locationName ? <p className="payments-support">{item.locationName}</p> : null}
          {grouped ? <p className="payments-order-ref">Order {order.orderRef}</p> : null}
        </div>
        <div className="payments-figure">
          <p className={styles.moneyCaption}>{figure.caption}</p>
          <p className={figure.kind === "due" ? "payments-outstanding" : "payments-amount"}>{moneyLabel(figure.minor, figure.currency)}</p>
          {orderTotalVisible ? <p className="payments-secondary-total">Order total {moneyLabel(order.amountMinor, order.currency)}</p> : null}
        </div>
      </div>
      {soleReceipt ? (
        <div className="payments-receipt">
          <p className="payments-paid-date">Paid on <time dateTime={soleReceipt.paidAt}>{formatPortalDate(soleReceipt.paidAt)}</time></p>
          <ReceiptActions orderRef={order.orderRef} receipt={soleReceipt} index={0} total={1} />
        </div>
      ) : null}
      {order.paymentModel === "SUCCESS_FEE" && !issuedInvoice ? <p className="payments-support">No charge is due yet.</p> : null}
      {order.obligations.map((obligation, index) => (
        <ObligationBlock
          key={`${order.orderRef}-${obligation.kind}-${index}`}
          item={item}
          order={order}
          obligation={obligation}
          invoiceAction={actionFor(item.actions, "invoice", order.orderRef)}
          busy={busy}
          fresh={fresh && obligation.kind === "upfront" && (obligation.state === "DUE" || obligation.state === "COLLECTING")}
          hideStatus={single !== null}
          showDueAmount={recordedOutstanding(obligation) && dues.length !== 1}
          suppressPaidDetail={obligation.state === "PAID" && order.receipts.length > 0}
          onSubmit={onSubmit}
        />
      ))}
      {listedReceipts.length > 0 ? (
        <div className="payments-receipts">
          <p className="payments-receipts-label">Receipts</p>
          <ul className="payments-receipt-list">
            {listedReceipts.map((receipt, index) => (
              <li key={receipt.selector}>
                <p className="payments-paid-line">Paid {moneyLabel(receipt.amountMinor, receipt.currency)} · {formatPortalDate(receipt.paidAt)}</p>
                <ReceiptActions orderRef={order.orderRef} receipt={receipt} index={index} total={listedReceipts.length} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {receiptAbsence(order) ? <p className="payments-support">{receiptAbsence(order)}</p> : null}
      <details className="portal-more">
        <summary>Payment details</summary>
        <p>Order {order.orderRef}</p>
        {figure.kind !== "total" && !orderTotalVisible ? <p>Order total {moneyLabel(order.amountMinor, order.currency)}</p> : null}
        {order.paymentModel === "UPFRONT" ? <p>One-time payment</p> : null}
        <p>{priceNote}</p>
        {track ? <p>{track}</p> : null}
        {order.paymentModel === "SUCCESS_FEE" ? (
          <div className="payments-authority">
            <h4>Managed service payment</h4>
            <p>The Managed success fee is invoiced only after documented success. Saving a card for an off-session charge is not available, and no card is charged automatically.</p>
          </div>
        ) : null}
      </details>
    </article>
  )
}

function ReceiptActions({
  orderRef,
  receipt,
  index,
  total,
}: {
  orderRef: string
  receipt: PaymentOrder["receipts"][number]
  index: number
  total: number
}) {
  const which = total > 1 ? ` ${index + 1}` : ""
  return (
    <p className="portal-actions payments-actions">
      <a className="portal-button" href={`/portal/payments/receipt?selector=${receipt.selector}`} aria-label={`View receipt${which} for ${orderRef}`}>View receipt</a>
      <a className="portal-button secondary" href={`/api/portal/payments/receipt?selector=${receipt.selector}`} aria-label={`Download PDF${which} for ${orderRef}`}>Download PDF</a>
    </p>
  )
}

function ObligationBlock({
  item,
  order,
  obligation,
  invoiceAction,
  busy,
  fresh,
  hideStatus,
  showDueAmount,
  suppressPaidDetail,
  onSubmit,
}: {
  item: PaymentCase
  order: PaymentOrder
  obligation: PaymentObligation
  invoiceAction: PaymentAction | null
  busy: string | null
  fresh: boolean
  hideStatus: boolean
  showDueAmount: boolean
  suppressPaidDetail: boolean
  onSubmit: (reference: string, selector: string, operation: Operation) => void
}) {
  const control = checkoutControl(order, item.actions, obligation)
  const slot = control ? `start_checkout:${control.selector}` : ""
  const refreshSlot = control ? `refresh_checkout:${control.selector}` : ""
  const detail = obligation.state === "DUE" || suppressPaidDetail ? null : obligationDetail(obligation.state)
  if (hideStatus && !showDueAmount && !detail && !control && !obligation.invoice) return null
  return (
    <div className="payments-obligation">
      {hideStatus ? null : (
        <h4 className={`${styles.status} ${obligationTone(obligation.state)}`}>{obligationHeadline(obligation.kind, obligation.state)}</h4>
      )}
      {showDueAmount ? (
        <>
          <p className={styles.moneyCaption}>Amount due</p>
          <p className="payments-outstanding">{moneyLabel(obligation.amountMinor, obligation.currency)}</p>
        </>
      ) : null}
      {detail ? <p>{detail}</p> : null}
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
            <p className="portal-actions payments-actions">
              <a className="portal-button" href={`/portal/payments/invoice?reference=${item.reference}&selector=${invoiceAction.selector}`} aria-label={`View payment request for ${order.orderRef}`}>
                View payment request
              </a>
              <a className="portal-button secondary" href={`/api/portal/payments/invoice-document?reference=${item.reference}&selector=${invoiceAction.selector}`} aria-label={`Download invoice for ${order.orderRef}`}>
                Download invoice
              </a>
            </p>
          ) : null}
          {obligation.invoice.hostedAvailable && invoiceAction ? (
            <p>
              <a href={`/api/portal/payments/invoice?reference=${item.reference}&selector=${invoiceAction.selector}`} aria-label={`Open invoice for ${order.orderRef}`}>
                Open invoice
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
