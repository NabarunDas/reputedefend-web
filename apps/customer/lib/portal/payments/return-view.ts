import type { ServiceTrack } from "../cases/parse"
import { formatMoney } from "../../../../../lib/money"
import type { CustomerPayments, PaymentCase, PaymentModel, PaymentOrder } from "./parse"

const ORDER_REF = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/

export type PaymentReturnLink = { href: string; label: string }

export type PaymentReturnView = {
  tone: "signed_out" | "unavailable" | "empty" | "pending" | "paid" | "failed"
  heading: string
  paragraphs: string[]
  links: PaymentReturnLink[]
  refresh: boolean
}

type Owned = { case: PaymentCase; order: PaymentOrder }

function money(amountMinor: number, currency: string): string | null {
  try {
    return formatMoney(amountMinor, currency.toUpperCase())
  } catch {
    return null
  }
}

export function paymentReturnUrl(origin: string, orderRef: string | null | undefined): string {
  const base = `${origin}/pay/return`
  if (!orderRef || !ORDER_REF.test(orderRef)) return base
  return `${base}?order=${orderRef}`
}

export function requestedOrderRef(query: Record<string, string | string[] | undefined>): string | null {
  const raw = query.order
  if (typeof raw !== "string" || !ORDER_REF.test(raw)) return null
  return raw
}

/**
 * One same-origin hop after a cross-site Stripe redirect.
 * The flag is not a credential. The order reference is the one already
 * present on the Checkout return URL, and only when it matches the public
 * order format.
 */
export function paymentReturnResumeHref(orderRef: string | null): string {
  const params = new URLSearchParams()
  if (orderRef && ORDER_REF.test(orderRef)) params.set("order", orderRef)
  params.set("resume", "1")
  return `/pay/return?${params.toString()}`
}

export function paymentReturnResumed(query: Record<string, string | string[] | undefined>): boolean {
  return query.resume === "1"
}

function paidAtLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted} UK`
}

function upfront(order: PaymentOrder) {
  return order.obligations.find(item => item.kind === "upfront") ?? null
}

function latestReceipt(order: PaymentOrder) {
  return [...order.receipts].sort((a, b) => a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0)[0] ?? null
}

function isPaid(order: PaymentOrder): boolean {
  const obligation = upfront(order)
  return order.receipts.length > 0 || obligation?.state === "PAID"
}

function isProcessing(order: PaymentOrder): boolean {
  const state = upfront(order)?.state
  return state === "COLLECTING" || state === "AUTHENTICATION_REQUIRED" || state === "DUE"
}

function isFailed(order: PaymentOrder): boolean {
  return upfront(order)?.state === "FAILED" && !isPaid(order) && !isProcessing(order)
}

function ownedOrders(payments: CustomerPayments): Owned[] {
  return payments.cases.flatMap(item => item.orders.map(order => ({ case: item, order })))
}

function selectOwned(payments: CustomerPayments, orderRef: string | null): Owned | null {
  const owned = ownedOrders(payments)
  if (orderRef) {
    return owned.find(item => item.order.orderRef === orderRef) ?? null
  }
  const paid = owned
    .filter(item => isPaid(item.order))
    .sort((a, b) => {
      const left = latestReceipt(a.order)?.paidAt ?? ""
      const right = latestReceipt(b.order)?.paidAt ?? ""
      return left < right ? 1 : left > right ? -1 : 0
    })
  if (paid[0]) return paid[0]
  const processing = owned.find(item => {
    const state = upfront(item.order)?.state
    return state === "COLLECTING" || state === "AUTHENTICATION_REQUIRED"
  })
  if (processing) return processing
  const due = owned.find(item => upfront(item.order)?.state === "DUE")
  if (due) return due
  return owned.find(item => isFailed(item.order)) ?? null
}

function caseLinks(item: PaymentCase): PaymentReturnLink[] {
  return [
    { href: `/portal/cases/${item.reference}`, label: "Open your case" },
    { href: `/portal/cases/${item.reference}/payments`, label: "View payments" },
  ]
}

function nextStep(track: ServiceTrack, model: PaymentModel, serviceName: string): string {
  if (model === "RECURRING_MONTHLY" || /guard/i.test(serviceName)) {
    return "A Guard subscription becomes current only after a confirmed recurring invoice payment."
  }
  if (track === "MANAGED" || model === "SUCCESS_FEE") {
    return "Your Managed service continues from this case. This payment does not mean Google has reinstated the profile."
  }
  return "Next, we prepare your Guided pack. You submit the finished pack to Google yourself. This payment does not mean Google has reinstated the profile."
}

function paidView(item: Owned): PaymentReturnView {
  const receipt = latestReceipt(item.order)
  const amount = money(receipt?.amountMinor ?? item.order.amountMinor, receipt?.currency ?? item.order.currency)
  const when = receipt ? paidAtLabel(receipt.paidAt) : ""
  const oneTime = item.order.paymentModel === "UPFRONT"
  const paragraphs = [
    `${item.order.serviceName} for order ${item.order.orderRef} is recorded on your account.`,
    amount ? `Amount received: ${amount}.` : "The amount received is on your receipt.",
    when ? `Paid ${when}.` : "",
    oneTime ? "This is a one-time payment. This is a receipt for the amount received. It is not a VAT invoice." : "This is a receipt for the amount received. It is not a VAT invoice.",
    nextStep(item.case.serviceTrack, item.order.paymentModel, item.order.serviceName),
  ].filter(paragraph => paragraph.length > 0)
  const links = caseLinks(item.case)
  if (receipt) links.unshift({ href: `/portal/payments/receipt?selector=${receipt.selector}`, label: "View your receipt" })
  return { tone: "paid", heading: "Payment received", paragraphs, links, refresh: false }
}

function pendingView(item: Owned): PaymentReturnView {
  return {
    tone: "pending",
    heading: "Payment is being confirmed",
    paragraphs: [
      `We are confirming your ${item.order.serviceName} payment for order ${item.order.orderRef}. You do not need to pay again while we finish this.`,
      "This usually finishes within a few minutes. You can open your case and come back. You will not be charged again for a payment that has already succeeded.",
    ],
    links: caseLinks(item.case),
    refresh: true,
  }
}

function failedView(item: Owned): PaymentReturnView {
  const retry = !isPaid(item.order) && !isProcessing(item.order)
  return {
    tone: "failed",
    heading: "This payment was not collected",
    paragraphs: [
      `The payment for order ${item.order.orderRef} was not collected. You have not been charged for this attempt.`,
      retry ? "You can review the payment from your case when you are ready to try again." : "A payment for this order is already being confirmed, so this page does not start another one.",
    ],
    links: retry
      ? [{ href: `/portal/cases/${item.case.reference}/payments`, label: "Review this payment" }, { href: `/portal/cases/${item.case.reference}`, label: "Open your case" }]
      : caseLinks(item.case),
    refresh: false,
  }
}

export function paymentReturnView(
  loaded: { status: "ready"; payments: CustomerPayments } | { status: "unauthenticated" } | { status: "unavailable" },
  orderRef: string | null,
): PaymentReturnView {
  if (loaded.status === "unauthenticated") {
    return {
      tone: "signed_out",
      heading: "Payment is being confirmed",
      paragraphs: [
        "Sign in to see whether your payment has been recorded.",
      ],
      links: [{ href: "/login", label: "Sign in" }],
      refresh: false,
    }
  }
  if (loaded.status === "unavailable") {
    return {
      tone: "unavailable",
      heading: "Payment is being confirmed",
      paragraphs: [
        "We could not load your payment status just now. Refresh this page in a moment and we will check again.",
      ],
      links: [],
      refresh: true,
    }
  }
  const selected = selectOwned(loaded.payments, orderRef)
  if (!selected) {
    return {
      tone: "empty",
      heading: "Payment is being confirmed",
      paragraphs: [
        "We could not find a payment on your account yet. If you have just paid, wait a moment and refresh this page.",
      ],
      links: [{ href: "/portal", label: "Open your portal" }],
      refresh: true,
    }
  }
  if (isPaid(selected.order)) return paidView(selected)
  if (isFailed(selected.order)) return failedView(selected)
  return pendingView(selected)
}
