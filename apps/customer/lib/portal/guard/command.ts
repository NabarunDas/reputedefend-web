import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig } from "@/lib/config"
import { openGuardSubscriptionCheckout, settleGuardCancellation } from "@/lib/action/guard-subscription"
import { PaymentsDisabledError } from "../../../../../lib/payments/provider"
import { guardSubscriptionsEnabled } from "../../../../../lib/guard-billing/config"
import { paymentProvider } from "../../../../../lib/payments"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isGuardSelector } from "./parse"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to continue."
const MISSING = "We couldn't find that Guard location."
const UNAVAILABLE = "This Guard step is no longer available."
const STALE = "This page is out of date. Refresh it and try again."
const CONFIRM = "Confirm this step before continuing."
const RETRY = "We couldn't complete that step. Please try again shortly."
const DISABLED = "Secure Stripe Checkout is not available yet."
const PERMISSION_RECORDED = "Guard permission is recorded. Monitoring does not start until ProfileRelaunch activates it."
const PERMISSION_DECLINED = "Guard permission is declined."
const CONSENT_RECORDED = "Monthly billing consent is recorded. No subscription is active until a confirmed invoice payment."
const PRICE_RECORDED = "Your acceptance is recorded. The current price stays in place until the provider schedule is confirmed."
const PRICE_DECLINED = "This price change is declined. The current price stays in place."
const REVIEW = "Immediate cancellation is with ProfileRelaunch for review. A refund is not promised."

const ACTION_SELECTOR = /^ca-[a-f0-9]{64}$/
const OPERATIONS = [
  "accept_permission", "decline_permission", "accept_consent", "accept_price", "decline_price",
  "start_checkout", "start_recovery", "request_period_end_cancellation", "undo_period_end_cancellation",
  "request_immediate_cancellation",
] as const
type Operation = (typeof OPERATIONS)[number]

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return null }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return JSON.parse(raw || "{}") as Record<string, unknown> }
  catch { return null }
}

function originOk(request: NextRequest) {
  const config = customerBackendConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type GuardResult = {
  status?: string
  actionStatus?: string
  providerOperationId?: string
  idempotencyKey?: string
  stripeCustomerId?: string
  stripePriceId?: string
  stripeSubscriptionId?: string
  amountMinor?: number
  customerId?: string
  serviceOrderId?: string
  guardCoverageId?: string
  guardSubscriptionId?: string
  priceVersionId?: string
  continuationId?: string
  mode?: string
  reviewRequired?: boolean
  trialEnd?: string
  includedEndAt?: string
  providerOperationStatus?: string
  subscriptionItemId?: string
  newStripePriceId?: string
  oldStripePriceId?: string
  periodEnd?: string
  cancelAtPeriodEnd?: boolean
  unapplied?: boolean
  reason?: string
}

function confirmationFor(operation: Operation, value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (operation === "accept_permission") {
    if (keys.length !== 2 || value.accepted !== true || value.permissionVersion !== "GUARD_PERMISSION_V1") return null
    return { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" }
  }
  if (operation === "accept_consent") {
    if (keys.length !== 2 || value.accepted !== true || value.consentVersion !== "GUARD_RECURRING_CONSENT_V1") return null
    return { accepted: true, consentVersion: "GUARD_RECURRING_CONSENT_V1" }
  }
  if (operation === "accept_price") {
    if (keys.length !== 1 || value.accepted !== true) return null
    return { accepted: true }
  }
  if (operation === "decline_permission" || operation === "decline_price") {
    if (keys.length !== 0) return null
    return {}
  }
  if (keys.length !== 0) return null
  return {}
}

function present(result: GuardResult, message: string) {
  if (result.status === "conflict") return reply(STALE, 409)
  if (result.status === "invalid") return reply(CONFIRM, 400)
  if (result.status === "not_found") return reply(MISSING, 404)
  if (result.status !== "success") return reply(UNAVAILABLE, 403)
  return NextResponse.json({ status: "ok", message }, { headers: privateResponseHeaders })
}

export async function portalGuardCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(UNAVAILABLE, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply(SIGN_IN)
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 8192)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (!onlyKeys(body, ["selector", "actionSelector", "operation", "confirmation"])) return reply(SIGN_IN)
  if (typeof body.selector !== "string" || !isGuardSelector(body.selector)) return reply(MISSING, 404)
  if (typeof body.actionSelector !== "string" || !ACTION_SELECTOR.test(body.actionSelector)) return reply(UNAVAILABLE, 404)
  if (typeof body.operation !== "string" || !OPERATIONS.includes(body.operation as Operation)) return reply(UNAVAILABLE, 400)
  const operation = body.operation as Operation
  const confirmation = confirmationFor(operation, body.confirmation)
  if (!confirmation) return reply(CONFIRM, 400)
  const data = operation === "accept_permission" || operation === "accept_consent" || operation === "accept_price"
    || operation === "decline_permission" || operation === "decline_price"
    ? confirmation
    : { idempotencyKey: key }
  try {
    const result = await backend().rpc<GuardResult | null>("customer_portal_guard_command_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_selector: body.selector,
      p_action_selector: body.actionSelector,
      p_operation: operation,
      p_data: data,
    })
    if (result == null) return reply(SIGN_IN)
    if (operation === "accept_permission") return present(result, PERMISSION_RECORDED)
    if (operation === "decline_permission") return present(result, PERMISSION_DECLINED)
    if (operation === "accept_consent") return present(result, CONSENT_RECORDED)
    if (operation === "decline_price") return present(result, PRICE_DECLINED)
    if (operation === "accept_price") return presentPrice(result)
    if (operation === "request_immediate_cancellation") {
      if (result.status !== "success" || result.reviewRequired !== true) return present(result, REVIEW)
      return NextResponse.json({ status: "ok", message: REVIEW }, { headers: privateResponseHeaders })
    }
    if (result.status === "conflict") return reply(STALE, 409)
    if (result.status === "invalid") return reply(CONFIRM, 400)
    if (result.status === "not_found") return reply(MISSING, 404)
    if (result.status !== "success") return reply(UNAVAILABLE, 403)
    const config = customerBackendConfig()
    if (!config) return reply(RETRY, 503)
    if (operation === "request_period_end_cancellation" || operation === "undo_period_end_cancellation") {
      return settleGuardCancellation(result, operation === "request_period_end_cancellation")
    }
    const checkout = await openGuardSubscriptionCheckout(config.origin, result)
    if (checkout.status === 403) return reply(DISABLED, 503)
    return checkout
  } catch (error) {
    if (error instanceof PaymentsDisabledError) return reply(DISABLED, 503)
    return reply(RETRY, 503)
  }
}

async function presentPrice(result: GuardResult) {
  if (result.status !== "success") return present(result, PRICE_RECORDED)
  if (result.unapplied || !result.providerOperationId || !result.stripeSubscriptionId || !result.newStripePriceId) {
    return NextResponse.json({ status: "ok", message: PRICE_RECORDED }, { headers: privateResponseHeaders })
  }
  if (!guardSubscriptionsEnabled() || !result.subscriptionItemId || !result.oldStripePriceId || !result.periodEnd
    || result.providerOperationStatus === "SUCCEEDED") {
    return NextResponse.json({ status: "ok", message: PRICE_RECORDED }, { headers: privateResponseHeaders })
  }
  try {
    const provider = paymentProvider()
    const periodEnd = Math.floor(Date.parse(result.periodEnd) / 1000)
    if (!Number.isFinite(periodEnd)) return NextResponse.json({ status: "ok", message: PRICE_RECORDED }, { headers: privateResponseHeaders })
    const current = await provider.retrieveSubscription(result.stripeSubscriptionId)
    if (current?.scheduleId) {
      await backend().rpc("guard_record_price_schedule_v1", {
        p_operation: result.providerOperationId,
        p_schedule_id: current.scheduleId,
        p_subscription_item_id: result.subscriptionItemId,
      })
    } else {
      const schedule = await provider.createSubscriptionSchedule({
        idempotencyKey: result.idempotencyKey || result.providerOperationId,
        subscriptionId: result.stripeSubscriptionId,
        subscriptionItemId: result.subscriptionItemId,
        currentPriceId: result.oldStripePriceId,
        nextPriceId: result.newStripePriceId,
        periodEnd,
        customerId: result.stripeCustomerId,
      })
      await backend().rpc("guard_record_price_schedule_v1", {
        p_operation: result.providerOperationId,
        p_schedule_id: schedule.id,
        p_subscription_item_id: result.subscriptionItemId,
      })
    }
  } catch (error) {
    if (error instanceof PaymentsDisabledError) {
      return NextResponse.json({ status: "ok", message: PRICE_RECORDED }, { headers: privateResponseHeaders })
    }
    return reply(RETRY, 503)
  }
  return NextResponse.json({ status: "ok", message: PRICE_RECORDED }, { headers: privateResponseHeaders })
}
