/**
 * The case Commercial and money workspace, as a reading of facts already loaded.
 *
 * Quote rank, acceptance expiry and payment flags come from `summariseCommercial`
 * and `summarisePayment`. The next action is the one `resolveCaseFlow` already
 * chose. This module arranges those answers for the page. It does not decide
 * a second meaning of ready, paid, accepted or set up, and it does not read
 * the database.
 */

import { ukDate } from "../admin/activity"
import {
  commercialQuotesTied,
  summariseCommercial,
  summarisePayment,
  type CommercialView,
  type PaymentView,
} from "../case-flow/resolve"
import { isInternalPath } from "../case-flow/destinations"
import type { CaseFlowFacts, CaseFlowOrderFact, CaseNextAction } from "../case-flow/model"
import {
  formatGbp,
  paymentModelLabel,
  serviceLabel,
  taxLabel,
  type PriceVersion,
  type QuoteListItem,
  type ServiceOrder,
} from "../commerce/model"
import type { MoneyOrder } from "../payments/model"
import { isUuid } from "../records/model"

export type JourneyTone = "complete" | "current" | "attention" | "not_started" | "not_applicable" | "unknown"

export type JourneyStage = {
  id: "quote" | "acceptance" | "order" | "payment"
  label: string
  tone: JourneyTone
  toneLabel: string
  symbol: string
  detail: string
}

const toneLabels: Record<JourneyTone, string> = {
  complete: "Complete",
  current: "In progress",
  attention: "Needs attention",
  not_started: "Not started",
  not_applicable: "Not applicable",
  unknown: "Unknown — source data is incomplete",
}

const toneSymbols: Record<JourneyTone, string> = {
  complete: "✓",
  current: "●",
  attention: "!",
  not_started: "○",
  not_applicable: "—",
  unknown: "?",
}

export type QuoteKind =
  | "none"
  | "draft_unconfigured"
  | "draft_ready"
  | "offered_awaiting"
  | "offered_expired"
  | "offered_no_action"
  | "accepted"
  | "declined"
  | "superseded"
  | "cancelled"
  | "expired"
  | "unknown"
  | "ambiguous"

export type GuidedPaymentKind =
  | "not_started"
  | "due"
  | "action_issued"
  | "action_expired"
  | "collecting"
  | "authentication"
  | "failed"
  | "paid"
  | "void"
  | "unknown"
  | "contradictory"

export type CommercialCaseAction =
  | { kind: "here"; label: string; description: string }
  | { kind: "elsewhere"; label: string; description: string; href: string | null; destinationLabel: string | null }
  | { kind: "none" }

export type CommercialPriceChoice = {
  id: string
  serviceCode: string
  serviceName: string
  amountLabel: string
  paymentLabel: string
}

export type CommercialCommands = {
  createQuote: boolean
  setTax: boolean
  offer: boolean
  cancel: boolean
  newVersion: boolean
  issueAcceptance: boolean
  revokeAcceptance: boolean
  supersede: boolean
  issueUpfront: boolean
  issueRecovery: boolean
  issueManagedSetup: boolean
  approveSuccessFee: boolean
}

export type ManagedSetupRow = {
  label: string
  state: string
  detail: string
}

export type CommercialWorkspaceModel = {
  notices: string[]
  failClosed: boolean
  caseAction: CommercialCaseAction
  journey: JourneyStage[]
  summary: Array<{ label: string; value: string }>
  quoteHeadline: string
  orderHeadline: string
  orderDetail: string
  paymentHeadline: string
  paymentDetail: string
  guided: { kind: GuidedPaymentKind; label: string; detail: string } | null
  managed: { rows: ManagedSetupRow[]; collectedNow: string | null; approval: string | null } | null
  guardNote: string | null
  commands: CommercialCommands
  priceChoices: CommercialPriceChoice[]
  priceGap: { message: string; href: string; hrefLabel: string } | null
  quoteContext: { quoteId: string; version: number; quoteVersionId: string; actionId: string | null } | null
  orderContext: {
    orderId: string
    version: number
    obligationId: string | null
    evidence: Array<{ id: string; filename: string; versionNumber: number }>
  } | null
  technical: Array<{ label: string; value: string }>
}

const quoteHeadlines: Record<QuoteKind, string> = {
  none: "No quote",
  draft_unconfigured: "Draft quote — tax treatment is not confirmed",
  draft_ready: "Draft quote — ready to offer",
  offered_awaiting: "Offered — waiting for the customer",
  offered_expired: "Offered — the acceptance link has expired",
  offered_no_action: "Offered — the customer has no usable acceptance link",
  accepted: "Quote accepted",
  declined: "Quote declined",
  superseded: "Quote superseded",
  cancelled: "Quote cancelled",
  expired: "Quote expired",
  unknown: "Commercial records are incomplete",
  ambiguous: "More than one quote could be the current one",
}

const guidedLabels: Record<GuidedPaymentKind, string> = {
  not_started: "Payment not started",
  due: "Payment due",
  action_issued: "Waiting for the customer to pay",
  action_expired: "The payment link has expired",
  collecting: "Collection processing",
  authentication: "Customer needs to complete bank authentication",
  failed: "Payment failed",
  paid: "Paid",
  void: "Payment void",
  unknown: "Payment records are incomplete",
  contradictory: "The obligation is marked paid, but no receipt is recorded",
}

const COLLECTED_NOW = "£0 collected now. Payment method saved for the agreed success fee if the qualifying outcome is achieved and approved."

function stage(id: JourneyStage["id"], label: string, tone: JourneyTone, detail: string): JourneyStage {
  return { id, label, tone, toneLabel: toneLabels[tone], symbol: toneSymbols[tone], detail }
}

/** The service a case quote is allowed to sell. The command checks this again. */
export function quoteServiceForCase(track: string, caseType: string): string | null {
  if (track === "GUIDED" && caseType === "PROFILE_RECOVERY") return "GUIDED_RELAUNCH"
  if (track === "MANAGED" && caseType === "PROFILE_RECOVERY") return "MANAGED_RELAUNCH"
  if (track === "GUIDED" && caseType === "REVIEW_PROTECTION") return "GUIDED_REVIEW"
  if (track === "MANAGED" && caseType === "REVIEW_PROTECTION") return "MANAGED_REVIEW"
  return null
}

/**
 * The single approved price already in effect, or nothing.
 * More than one match is not a choice: `price_version_current_v1` refuses
 * that case, and this filter does not pick a winner for it.
 */
export function currentApprovedPrice(prices: PriceVersion[], serviceCode: string, now: string): PriceVersion | "ambiguous" | null {
  const nowMs = Date.parse(now)
  if (!Number.isFinite(nowMs)) return null
  const inForce = prices.filter(price => {
    if (price.serviceCode !== serviceCode || price.status !== "APPROVED") return false
    const from = Date.parse(price.effectiveFrom)
    if (!Number.isFinite(from) || from > nowMs) return false
    if (price.effectiveTo) {
      const to = Date.parse(price.effectiveTo)
      if (!Number.isFinite(to) || to <= nowMs) return false
    }
    return true
  })
  if (inForce.length === 0) return null
  if (inForce.length !== 1) return "ambiguous"
  return inForce[0]
}

function quoteKindOf(view: CommercialView): QuoteKind {
  if (view.truncated && !view.quote) return "unknown"
  if (!view.quote || view.state === "NONE") return "none"
  if (view.state === "UNKNOWN") return "unknown"
  if (view.state === "DRAFT_UNCONFIGURED") return "draft_unconfigured"
  if (view.state === "DRAFT_READY") return "draft_ready"
  if (view.state === "OFFERED_AWAITING") return "offered_awaiting"
  if (view.state === "OFFERED_NO_LINK") return view.acceptanceExpired ? "offered_expired" : "offered_no_action"
  if (view.state === "ACCEPTED") return "accepted"
  if (view.state === "DECLINED") return "declined"
  if (view.state === "EXPIRED") {
    if (view.quote.status === "SUPERSEDED") return "superseded"
    if (view.quote.status === "CANCELLED") return "cancelled"
    if (view.quote.status === "EXPIRED") return "expired"
    return "unknown"
  }
  return "unknown"
}

function expectedModel(serviceCode: string | null | undefined): string | null {
  if (serviceCode === "GUIDED_RELAUNCH" || serviceCode === "GUIDED_REVIEW") return "UPFRONT"
  if (serviceCode === "MANAGED_RELAUNCH" || serviceCode === "MANAGED_REVIEW") return "SUCCESS_FEE"
  if (serviceCode === "RELAUNCH_GUARD") return "RECURRING_MONTHLY"
  return null
}

function presentCaseAction(action: CaseNextAction | null): CommercialCaseAction {
  if (!action) return { kind: "none" }
  if (action.destination?.kind === "CASE_COMMERCIAL") {
    return { kind: "here", label: action.label, description: action.description }
  }
  const href = action.destination && isInternalPath(action.destination.href) ? action.destination.href : null
  return {
    kind: "elsewhere",
    label: action.label,
    description: action.description,
    href,
    destinationLabel: href ? action.destination?.label ?? null : null,
  }
}

function guidedKind(payment: PaymentView, facts: CaseFlowFacts, now: string): GuidedPaymentKind {
  if (payment.truncated && !payment.upfrontOrder) return "unknown"
  if (!payment.upfrontOrder) return "not_started"
  if (payment.upfrontPaid && !payment.upfrontOrder.receiptRecorded) return "contradictory"
  if (payment.upfrontPaid) return "paid"
  if (payment.upfrontState === "VOID") return "void"
  if (payment.upfrontAuthenticationRequired) return "authentication"
  if (payment.upfrontFailed) return "failed"
  if (payment.upfrontCollecting) return "collecting"
  const open = facts.customerActions.find(item =>
    (item.kind === "GUIDED_PAYMENT" || item.kind === "PAYMENT_RECOVERY") && item.status === "OPEN",
  )
  if (open && open.expiresAt <= now) return "action_expired"
  if (open) return "action_issued"
  if (payment.upfrontState === "DUE") return "due"
  if (!payment.upfrontState) return "not_started"
  return "unknown"
}

function moneyMode(serviceCode: string | null, paymentModel: string | null, track: string): "guided" | "managed" | "guard" | "none" {
  const model = paymentModel ?? expectedModel(serviceCode)
  if (model === "RECURRING_MONTHLY" || serviceCode === "RELAUNCH_GUARD") return "guard"
  if (model === "SUCCESS_FEE" || (model === null && track === "MANAGED")) return "managed"
  if (model === "UPFRONT" || (model === null && track === "GUIDED")) return "guided"
  return "none"
}

export function buildCommercialWorkspaceModel(input: {
  facts: CaseFlowFacts
  primaryAction: CaseNextAction | null
  now: string
  quotes: QuoteListItem[]
  orders: ServiceOrder[]
  money: MoneyOrder[]
  prices: PriceVersion[]
}): CommercialWorkspaceModel {
  const { facts, now } = input
  const commercial = summariseCommercial(facts, now)
  const payment = summarisePayment(facts)
  const tied = commercialQuotesTied(facts)
  const kind: QuoteKind = tied ? "ambiguous" : quoteKindOf(commercial)
  const notices: string[] = []
  const caseId = facts.caseId
  const caseQuotes = input.quotes.filter(quote => quote.caseId === caseId)
  const detail = commercial.quote ? caseQuotes.find(quote => quote.id === commercial.quote!.id) ?? input.quotes.find(quote => quote.id === commercial.quote!.id) ?? null : null

  if (commercial.truncated) {
    notices.push("The quote list this view reads is capped, so this is not proof of the full commercial position.")
  }
  if (payment.truncated) {
    notices.push("The payment list this view reads is capped, so this is not proof of the full payment position.")
  }
  if (tied) {
    notices.push("Commercial records disagree: more than one quote shares the same relevance, so none is treated as the current quote.")
  }
  if (detail && commercial.quote && detail.status !== commercial.quote.status) {
    notices.push("Commercial records disagree: the quote list and the case projection do not show the same quote status.")
  }

  const quoteOrderId = commercial.quote?.orderId ?? null
  const serviceOrder = input.orders.find(order => order.id === quoteOrderId)
    ?? input.orders.find(order => order.caseId === caseId && order.quoteId === commercial.quote?.id)
    ?? null
  const moneyOrder = input.money.find(order => order.orderId === (quoteOrderId || serviceOrder?.id))
    ?? input.money.find(order => order.caseId === caseId && order.orderId === serviceOrder?.id)
    ?? null
  const flowOrder = facts.payment.orders.find(order => order.orderId === (quoteOrderId || serviceOrder?.id))
    ?? (facts.payment.orders.length === 1 ? facts.payment.orders[0] : null)

  const serviceCode = detail?.currentVersion.serviceCode ?? null
  const paymentModel = flowOrder?.paymentModel ?? serviceOrder?.paymentModel ?? detail?.currentVersion.paymentModel ?? null
  const mode = moneyMode(serviceCode, paymentModel, facts.serviceTrack)

  const accepted = kind === "accepted"
  const listsComplete = !commercial.truncated && !payment.truncated
  const orderPresent = !!(serviceOrder || moneyOrder || (flowOrder && (!quoteOrderId || flowOrder.orderId === quoteOrderId)))
  const orderMissing = accepted && listsComplete && !orderPresent
  const orderUnexpected = listsComplete && !!flowOrder && kind !== "accepted" && kind !== "ambiguous" && kind !== "unknown"
  const orphanOrder = listsComplete && !!flowOrder && accepted && !!quoteOrderId && flowOrder.orderId !== quoteOrderId
  if (orderMissing) {
    notices.push(quoteOrderId
      ? "Commercial records disagree: the accepted quote names a service order that is not in the loaded records."
      : "Commercial records disagree: the quote is accepted but no service order was created.")
  }
  if (orderUnexpected || orphanOrder) {
    notices.push("Commercial records disagree: a service order is recorded without the matching accepted quote.")
  }

  const modelMismatch = !!paymentModel && !!serviceCode && expectedModel(serviceCode) !== null && expectedModel(serviceCode) !== paymentModel
  const quoteModelMismatch = !!detail && !!flowOrder && detail.currentVersion.paymentModel !== flowOrder.paymentModel
  const orderModelMismatch = !!serviceOrder && !!flowOrder && serviceOrder.paymentModel !== flowOrder.paymentModel
  if (modelMismatch || quoteModelMismatch || orderModelMismatch) {
    notices.push("Commercial records disagree: the payment model does not match the accepted service.")
  }

  const setupConflict = !!payment.successFeeOrder && payment.managedSetupReady && !payment.managedConsentRecorded
  if (setupConflict) {
    notices.push("Commercial records disagree: a reusable payment method is recorded without later-charge consent.")
  }
  const paidWithoutReceipt = !!payment.upfrontOrder && payment.upfrontPaid && !payment.upfrontOrder.receiptRecorded
  const receiptWithoutPaid = !!payment.upfrontOrder && payment.upfrontOrder.receiptRecorded && !payment.upfrontPaid
  if (paidWithoutReceipt || receiptWithoutPaid) {
    notices.push("Commercial records disagree: the paid obligation and the receipt do not match.")
  }

  const guided = mode === "guided" && !orderMissing && (accepted || !!payment.upfrontOrder) ? guidedKind(payment, facts, now) : null
  if (guided === "action_expired" && input.primaryAction?.id === "WAIT_FOR_UPFRONT_PAYMENT") {
    notices.push("Commercial records disagree: a payment action is still marked open after its expiry.")
  }
  const openPayment = facts.customerActions.find(item => item.kind === "MANAGED_PAYMENT_SETUP" && item.status === "OPEN")
  const managedSetupExpired = !!openPayment && openPayment.expiresAt <= now
  if (managedSetupExpired && input.primaryAction?.id === "WAIT_FOR_MANAGED_PAYMENT_SETUP") {
    notices.push("Commercial records disagree: a setup action is still marked open after its expiry.")
  }

  const failClosed = notices.some(notice => notice.startsWith("Commercial records disagree"))
  const quoteBlocked = failClosed || commercial.truncated || !detail
  const paymentBlocked = failClosed || payment.truncated

  const summary = summaryRows(detail, serviceOrder, moneyOrder, kind, commercial)
  const journey = buildJourney({ kind, commercial, accepted, orderMissing, orderUnexpected, orderPresent, mode, guided, payment, setupConflict, managedSetupExpired, listsComplete })

  const serviceForQuote = quoteServiceForCase(facts.serviceTrack, facts.caseType)
  const canStartQuote = kind === "none" || kind === "declined" || kind === "expired" || kind === "cancelled" || kind === "superseded"
  const price = serviceForQuote ? currentApprovedPrice(input.prices, serviceForQuote, now) : null
  const priceChoices: CommercialPriceChoice[] = price && price !== "ambiguous" ? [{
    id: price.id,
    serviceCode: price.serviceCode,
    serviceName: price.displayName || serviceLabel(price.serviceCode),
    amountLabel: formatGbp(price.amountMinor),
    paymentLabel: paymentModelLabel(price.paymentModel),
  }] : []
  const priceGap = priceGapFor({
    canStartQuote,
    blocked: commercial.truncated || tied || failClosed,
    serviceForQuote,
    price,
    caseHref: isUuid(caseId) ? `/cases/${caseId}` : "/cases",
  })

  const commands = commandsFor({
    kind,
    quoteBlocked,
    paymentBlocked,
    canStartQuote: canStartQuote && !commercial.truncated && !tied && !failClosed,
    actionOpen: commercial.quote?.actionStatus === "OPEN" && !!detail?.action?.id,
    guided,
    mode,
    hasOrderContext: !!moneyOrder,
    setupReady: payment.managedSetupReady,
    consent: payment.managedConsentRecorded,
    setupConflict,
    hasSuccessOrder: !!payment.successFeeOrder,
    approvalId: moneyOrder?.approvalId ?? null,
    recovery: moneyOrder?.paymentModel === "SUCCESS_FEE" && moneyOrder.obligationState === "AUTHENTICATION_REQUIRED" && !!moneyOrder.obligationId,
  })

  const managed = mode === "managed" && (accepted || !!payment.successFeeOrder) ? managedSection(payment, moneyOrder, setupConflict, managedSetupExpired) : null
  const guardNote = mode === "guard"
    ? "This is a recurring Guard subscription, not a one-off case payment. Accepting the quote does not start billing or take money. Guard billing exceptions stay on Money."
    : null

  return {
    notices,
    failClosed: notices.some(notice => notice.startsWith("Commercial records disagree")),
    caseAction: presentCaseAction(input.primaryAction),
    journey,
    summary,
    quoteHeadline: quoteHeadlines[kind],
    orderHeadline: orderHeadline(kind, orderMissing, orderUnexpected || orphanOrder, orderPresent, serviceOrder, moneyOrder, listsComplete),
    orderDetail: orderDetail(serviceOrder, moneyOrder, flowOrder, accepted, orderMissing),
    paymentHeadline: paymentHeadline(mode, guided, managed, guardNote, accepted),
    paymentDetail: paymentDetail(mode, guided, payment, managedSetupExpired),
    guided: guided ? { kind: guided, label: guidedLabels[guided], detail: paymentDetail(mode, guided, payment, managedSetupExpired) } : null,
    managed,
    guardNote,
    commands,
    priceChoices,
    priceGap,
    quoteContext: detail ? {
      quoteId: detail.id,
      version: detail.version,
      quoteVersionId: detail.currentVersion.id,
      actionId: detail.action?.status === "OPEN" ? detail.action.id : null,
    } : null,
    orderContext: moneyOrder ? {
      orderId: moneyOrder.orderId,
      version: moneyOrder.version,
      obligationId: moneyOrder.obligationId,
      evidence: moneyOrder.acceptedEvidence ?? [],
    } : null,
    technical: technicalRows(detail, serviceOrder, moneyOrder, commercial),
  }
}

function summaryRows(
  detail: QuoteListItem | null,
  serviceOrder: ServiceOrder | null,
  moneyOrder: MoneyOrder | null,
  kind: QuoteKind,
  commercial: CommercialView,
): Array<{ label: string; value: string }> {
  if (!detail) {
    const rows = [{ label: "Quote", value: quoteHeadlines[kind] }]
    if (commercial.acceptanceExpiresAt) rows.push({ label: "Acceptance link expires", value: ukDate(commercial.acceptanceExpiresAt) })
    return rows
  }
  const version = detail.currentVersion
  const rows: Array<{ label: string; value: string }> = [
    { label: "Service", value: version.serviceName || serviceLabel(version.serviceCode) },
    { label: "Quote", value: `${detail.publicRef} · version ${version.versionNumber}` },
    { label: "Standard amount", value: formatGbp(version.standardAmountMinor) },
    { label: "Discount", value: formatGbp(version.discountAmountMinor) },
    { label: "Quoted amount", value: `${formatGbp(version.totalAmountMinor)} ${version.currency}` },
    { label: "Tax", value: taxLabel(version.taxBehaviour) },
    { label: "Payment", value: `${paymentModelLabel(version.paymentModel)}. ${version.paymentTiming}` },
    { label: "Valid until", value: ukDate(version.validUntil) },
    { label: "Scope", value: version.scope },
    { label: "Exclusions", value: version.exclusions },
    { label: "Acceptance", value: quoteHeadlines[kind] },
  ]
  if (detail.acceptedAt) rows.push({ label: "Accepted", value: ukDate(detail.acceptedAt) })
  const orderRef = serviceOrder?.publicRef || detail.orderRef || moneyOrder?.orderRef
  if (orderRef) rows.push({ label: "Service order", value: orderRef })
  if (commercial.acceptanceExpiresAt && kind === "offered_awaiting") {
    rows.push({ label: "Acceptance link expires", value: ukDate(commercial.acceptanceExpiresAt) })
  }
  return rows
}

function orderHeadline(
  kind: QuoteKind,
  missing: boolean,
  unexpected: boolean,
  present: boolean,
  serviceOrder: ServiceOrder | null,
  moneyOrder: MoneyOrder | null,
  listsComplete: boolean,
): string {
  if (unexpected) return "A service order is recorded without a matching accepted quote"
  if (missing) return "The quote is accepted, but the service order is missing"
  if (!listsComplete && kind === "accepted" && !present) return "The order position is incomplete"
  if (present) return "Customer accepted the quote — service order created"
  if (kind === "unknown" || kind === "ambiguous") return "No service order can be confirmed"
  return "No service order yet"
}

function orderDetail(
  serviceOrder: ServiceOrder | null,
  moneyOrder: MoneyOrder | null,
  flowOrder: CaseFlowOrderFact | null,
  accepted: boolean,
  missing: boolean,
): string {
  if (missing) return "Actions that need the service order are unavailable until the quote and the order agree."
  if (!serviceOrder && !moneyOrder && !flowOrder) {
    return accepted ? "The accepted quote has not produced an order in the loaded records." : "An order is created only when the customer accepts a quote."
  }
  const ref = serviceOrder?.publicRef || moneyOrder?.orderRef || "Service order"
  const amount = serviceOrder ? formatGbp(serviceOrder.amountMinor) : moneyOrder ? formatGbp(moneyOrder.amountMinor) : null
  const model = paymentModelLabel(serviceOrder?.paymentModel || moneyOrder?.paymentModel || flowOrder?.paymentModel || "")
  const when = serviceOrder?.acceptedAt ? ukDate(serviceOrder.acceptedAt) : null
  return [ref, amount, model, when].filter(Boolean).join(" · ")
}

function buildJourney(input: {
  kind: QuoteKind
  commercial: CommercialView
  accepted: boolean
  orderMissing: boolean
  orderUnexpected: boolean
  orderPresent: boolean
  mode: "guided" | "managed" | "guard" | "none"
  guided: GuidedPaymentKind | null
  payment: PaymentView
  setupConflict: boolean
  managedSetupExpired: boolean
  listsComplete: boolean
}): JourneyStage[] {
  const quoteTone: JourneyTone =
    input.kind === "unknown" || input.kind === "ambiguous" ? "unknown"
    : input.kind === "none" ? "not_started"
    : input.kind === "draft_unconfigured" || input.kind === "declined" || input.kind === "cancelled" || input.kind === "superseded" || input.kind === "expired" || input.kind === "offered_expired" || input.kind === "offered_no_action"
      ? "attention"
    : input.kind === "draft_ready" ? "current"
    : "complete"
  const acceptanceTone: JourneyTone =
    input.kind === "unknown" || input.kind === "ambiguous" ? "unknown"
    : input.kind === "accepted" ? "complete"
    : input.kind === "offered_awaiting" ? "current"
    : input.kind === "offered_expired" || input.kind === "offered_no_action" || input.kind === "declined" ? "attention"
    : input.kind === "none" || input.kind === "draft_ready" || input.kind === "draft_unconfigured" ? "not_started"
    : "not_applicable"
  const orderTone: JourneyTone =
    input.orderMissing || input.orderUnexpected ? "attention"
    : input.orderPresent ? "complete"
    : input.accepted && !input.listsComplete ? "unknown"
    : input.kind === "unknown" || input.kind === "ambiguous" ? "unknown"
    : input.kind === "declined" || input.kind === "cancelled" || input.kind === "superseded" || input.kind === "expired" ? "not_applicable"
    : "not_started"
  return [
    stage("quote", "Quote", quoteTone, quoteHeadlines[input.kind]),
    stage("acceptance", "Acceptance", acceptanceTone, acceptanceDetail(input.kind, input.commercial)),
    stage("order", "Order", orderTone, orderTone === "complete" ? "Service order created" : orderTone === "attention" ? "The quote and the order do not agree" : orderTone === "unknown" ? "The order position is incomplete" : orderTone === "not_applicable" ? "No order follows this quote" : "No order expected yet"),
    stage("payment", "Payment/setup", paymentTone(input), paymentJourneyDetail(input)),
  ]
}

function acceptanceDetail(kind: QuoteKind, commercial: CommercialView): string {
  if (kind === "offered_awaiting" && commercial.acceptanceExpiresAt) return `Waiting for the customer. Link expires ${ukDate(commercial.acceptanceExpiresAt)}.`
  if (kind === "offered_expired") return "The acceptance link has expired."
  if (kind === "offered_no_action") return "No usable acceptance link."
  if (kind === "accepted") return "The customer accepted."
  if (kind === "declined") return "The customer declined."
  if (kind === "none" || kind === "draft_ready" || kind === "draft_unconfigured") return "Not offered for acceptance yet."
  if (kind === "unknown" || kind === "ambiguous") return "Acceptance cannot be confirmed."
  return "This quote is closed."
}

function paymentTone(input: {
  mode: "guided" | "managed" | "guard" | "none"
  guided: GuidedPaymentKind | null
  payment: PaymentView
  setupConflict: boolean
  accepted: boolean
  kind: QuoteKind
  orderMissing: boolean
}): JourneyTone {
  if (input.kind === "unknown" || input.kind === "ambiguous") return "unknown"
  if (input.orderMissing) return "attention"
  if (!input.accepted && input.mode !== "guard") {
    if (input.kind === "declined" || input.kind === "cancelled" || input.kind === "superseded" || input.kind === "expired") return "not_applicable"
    return "not_started"
  }
  if (input.payment.truncated && !input.payment.upfrontOrder && !input.payment.successFeeOrder) return "unknown"
  if (input.mode === "guard") return input.accepted ? "complete" : "not_started"
  if (input.mode === "guided") {
    if (input.guided === "paid") return "complete"
    if (input.guided === "unknown" || input.guided === "contradictory") return "unknown"
    if (input.guided === "failed" || input.guided === "authentication" || input.guided === "void" || input.guided === "action_expired") return "attention"
    if (input.guided === "not_started") return "not_started"
    return "current"
  }
  if (input.mode === "managed") {
    if (input.setupConflict) return "unknown"
    if (!input.payment.successFeeOrder) return "not_started"
    if (input.payment.managedSetupReady && input.payment.managedConsentRecorded) return "complete"
    if (input.payment.managedConsentRecorded && !input.payment.managedSetupReady) return "attention"
    return "current"
  }
  return "not_started"
}

function paymentJourneyDetail(input: {
  mode: "guided" | "managed" | "guard" | "none"
  guided: GuidedPaymentKind | null
  payment: PaymentView
  setupConflict: boolean
  accepted: boolean
  orderMissing: boolean
}): string {
  if (input.orderMissing) return "Payment or setup cannot start without the service order."
  if (input.mode === "guard" && input.accepted) return "Recurring Guard billing, not an upfront payment."
  if (input.mode === "guided" && input.guided) return guidedLabels[input.guided]
  if (input.mode === "managed") {
    if (input.setupConflict) return "Consent and the saved payment method disagree."
    if (input.payment.managedSetupReady && input.payment.managedConsentRecorded) return "Consent and a reusable payment method are in place. Nothing has been collected."
    if (!input.payment.successFeeOrder) return "No accepted success-fee order yet."
    if (!input.payment.managedConsentRecorded) return "Later-charge consent is missing."
    if (!input.payment.managedSetupReady) return "Consent is recorded. A usable payment method is still missing."
  }
  if (!input.accepted) return "Payment or setup starts after acceptance."
  return "Payment or setup cannot be confirmed."
}

function paymentHeadline(
  mode: "guided" | "managed" | "guard" | "none",
  guided: GuidedPaymentKind | null,
  managed: CommercialWorkspaceModel["managed"],
  guardNote: string | null,
  accepted: boolean,
): string {
  if (guardNote) return "Recurring Guard"
  if (guided) return guidedLabels[guided]
  if (managed) return managed.rows.every(row => row.state === "In place") ? "Setup ready — nothing collected" : "Success-fee setup is not complete"
  if (!accepted) return "No payment or setup yet"
  return "Payment or setup cannot be confirmed"
}

function paymentDetail(mode: "guided" | "managed" | "guard" | "none", guided: GuidedPaymentKind | null, payment: PaymentView, managedSetupExpired: boolean): string {
  if (mode === "guard") return "Recurring collection is a later Guard billing step. It is not taken by accepting this quote."
  if (guided === "collecting") return "Collection has started. A completed checkout page is not a payment."
  if (guided === "paid") return "The payment provider has confirmed the money was taken."
  if (guided === "authentication") return "The bank asked for extra authentication and it has not been given."
  if (guided === "failed") return "The last attempt failed and nothing has been collected."
  if (guided === "due") return "The upfront amount is due. It has not been collected."
  if (guided === "action_issued") return "A payment link is open. Returning from checkout does not mean the payment succeeded."
  if (guided === "action_expired") return "The payment link is marked open, but it has already expired. It cannot be shown again. Revoke it or issue another."
  if (guided === "contradictory") return "Do not treat this as paid until the obligation and the receipt agree."
  if (guided === "void") return "The obligation is void. Nothing is being collected."
  if (mode === "managed" && managedSetupExpired) return "The setup link is marked open, but it has already expired."
  if (mode === "managed" && payment.managedSetupReady && payment.managedConsentRecorded) return COLLECTED_NOW
  if (mode === "managed") return "£0 collected now. A success fee is not taken by saving a payment method, and it is not taken unless the qualifying outcome is achieved and approved."
  return "Nothing is due until a quote has been accepted and an order exists."
}

function managedSection(
  payment: PaymentView,
  moneyOrder: MoneyOrder | null,
  setupConflict: boolean,
  managedSetupExpired: boolean,
): NonNullable<CommercialWorkspaceModel["managed"]> {
  const hasOrder = !!payment.successFeeOrder
  const consent = payment.managedConsentRecorded
  const method = payment.managedSetupReady
  const ready = hasOrder && consent && method && !setupConflict
  const rows: ManagedSetupRow[] = [
    {
      label: "Accepted success-fee order",
      state: hasOrder ? "In place" : "Missing",
      detail: hasOrder ? "The accepted quote created the order the success fee would be charged against." : "There is no accepted success-fee order.",
    },
    {
      label: "Later-charge consent",
      state: consent ? "In place" : "Missing",
      detail: consent ? "Consent to a later charge is recorded." : "Consent to charge the success fee later has not been recorded.",
    },
    {
      label: "Reusable payment method",
      state: method ? "In place" : "Missing",
      detail: method ? "A usable saved payment method is on file." : consent ? "Consent is recorded, but no usable payment method is saved." : "No usable payment method is saved.",
    },
    {
      label: "Setup readiness",
      state: ready ? "In place" : "Missing",
      detail: setupConflict
        ? "A payment method is marked usable without later-charge consent, so setup is not treated as ready."
        : ready
          ? "Consent and a reusable payment method are both recorded. This is not a collection."
          : managedSetupExpired
            ? "The setup link has expired before setup became ready."
            : "Setup is ready only when the order, the consent and a usable payment method are all recorded.",
    },
  ]
  const collectedNow = hasOrder && ready ? COLLECTED_NOW : hasOrder ? "£0 collected now. Nothing has been collected." : null
  let approval: string | null = null
  if (hasOrder && ready && moneyOrder && !moneyOrder.approvalId) {
    approval = "Success-fee approval is required before a qualifying outcome can be charged. Approval uses the immutable accepted amount and accepted evidence. It does not charge a card."
  } else if (hasOrder && ready && moneyOrder?.approvalId) {
    approval = "Success-fee approval is recorded. That is not a collection, and it is not a charge."
  } else if (hasOrder && !ready) {
    approval = "The outcome is not yet chargeable. Setup is still incomplete, so success-fee approval is not available."
  }
  return { rows, collectedNow, approval }
}

function priceGapFor(input: {
  canStartQuote: boolean
  blocked: boolean
  serviceForQuote: string | null
  price: PriceVersion | "ambiguous" | null
  caseHref: string
}): CommercialWorkspaceModel["priceGap"] {
  if (!input.canStartQuote || input.blocked) return null
  if (!input.serviceForQuote) {
    return {
      message: "A quote cannot be created until this case has a service track that matches its case type. No price has been invented.",
      href: input.caseHref,
      hrefLabel: "Back to the case",
    }
  }
  if (input.price === "ambiguous") {
    return {
      message: `More than one approved ${serviceLabel(input.serviceForQuote)} price is in effect, so none can be selected from this case.`,
      href: "/commercial?tab=catalogue",
      hrefLabel: "Open the catalogue",
    }
  }
  if (!input.price) {
    return {
      message: `No current approved price is available for ${serviceLabel(input.serviceForQuote)}. A price has to be approved and already in effect before a quote can be drafted.`,
      href: "/commercial?tab=catalogue",
      hrefLabel: "Open the catalogue",
    }
  }
  return null
}

function commandsFor(input: {
  kind: QuoteKind
  quoteBlocked: boolean
  paymentBlocked: boolean
  canStartQuote: boolean
  actionOpen: boolean
  guided: GuidedPaymentKind | null
  mode: "guided" | "managed" | "guard" | "none"
  hasOrderContext: boolean
  setupReady: boolean
  consent: boolean
  setupConflict: boolean
  hasSuccessOrder: boolean
  approvalId: string | null
  recovery: boolean
}): CommercialCommands {
  const liveDraft = input.kind === "draft_unconfigured" || input.kind === "draft_ready"
  const liveOffered = input.kind === "offered_awaiting" || input.kind === "offered_expired" || input.kind === "offered_no_action"
  const quoteOpen = !input.quoteBlocked
  const payOpen = !input.paymentBlocked && input.hasOrderContext
  const upfrontOpen = input.guided === "due" || input.guided === "not_started" || input.guided === "failed" || input.guided === "authentication" || input.guided === "action_expired"
  return {
    createQuote: input.canStartQuote,
    setTax: quoteOpen && liveDraft,
    offer: quoteOpen && input.kind === "draft_ready",
    cancel: quoteOpen && (liveDraft || liveOffered),
    newVersion: quoteOpen && (liveDraft || liveOffered),
    issueAcceptance: quoteOpen && (input.kind === "offered_expired" || input.kind === "offered_no_action"),
    revokeAcceptance: quoteOpen && liveOffered && input.actionOpen,
    supersede: quoteOpen && liveOffered,
    issueUpfront: payOpen && input.mode === "guided" && upfrontOpen,
    issueRecovery: payOpen && input.recovery,
    issueManagedSetup: payOpen && input.mode === "managed" && input.hasSuccessOrder && !input.setupReady && !input.setupConflict,
    approveSuccessFee: payOpen && input.mode === "managed" && input.setupReady && input.consent && !input.setupConflict && !input.approvalId,
  }
}

function technicalRows(
  detail: QuoteListItem | null,
  serviceOrder: ServiceOrder | null,
  moneyOrder: MoneyOrder | null,
  commercial: CommercialView,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  if (commercial.quote) rows.push({ label: "Quote id", value: commercial.quote.id })
  if (detail) rows.push({ label: "Quote version id", value: detail.currentVersion.id })
  if (detail?.action) rows.push({ label: "Acceptance action", value: `${detail.action.id} · ${detail.action.status}` })
  const orderId = serviceOrder?.id || moneyOrder?.orderId || commercial.quote?.orderId
  if (orderId) rows.push({ label: "Service order id", value: orderId })
  if (moneyOrder?.obligationId) rows.push({ label: "Obligation id", value: `${moneyOrder.obligationId} · ${moneyOrder.obligationState ?? "none"}` })
  if (moneyOrder?.receiptId) rows.push({ label: "Receipt id", value: moneyOrder.receiptId })
  return rows
}
