import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { paymentProvider } from "../../../../lib/payments"
import { PaymentsDisabledError } from "../../../../lib/payments/provider"
import { guardActivationEnabled, guardRefundsEnabled, guardSubscriptionsEnabled } from "./gate"
import { isGuardOperation, guardArgs } from "./validation"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit = 16384): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return reply("That request is too large.", 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return { body: JSON.parse(raw || "{}") } } catch { return reply("Please check the form and try again.", 400) }
}

function mapStatus(status: string | undefined): number {
  switch (status) {
    case "success": return 200
    case "unauthorized": return 401
    case "conflict": return 409
    case "denied": return 403
    case "invalid": return 400
    case "reauth_required": return 403
    default: return 503
  }
}

function commandMessage(status: string | undefined, reason?: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict" && reason === "coverage_exists") return "This location already has Guard coverage that has not ended."
  if (status === "conflict") return "That Guard record changed. Reload the page and try again."
  if (status === "reauth_required") return "Sign in again within the last five minutes to activate Guard or change billing."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "denied" && reason === "paid_not_ready") return "Payment entitlement is present but Guard cannot activate yet. An urgent exception was recorded."
  if (status === "denied" && reason === "requested_count") return "All requested locations for this monitoring request have already been identified."
  if (status === "denied" && reason === "activation_disabled") return "Guard activation is disabled until the live activation gate is enabled."
  if (status === "denied" && reason === "subscriptions_disabled") return "Guard subscriptions are disabled until the live subscription gate is enabled."
  if (status === "denied" && reason === "refunds_disabled") return "Guard refunds are disabled until the live refund gate is enabled."
  if (status === "denied") return "That Guard action is not allowed."
  return "The Guard record could not be updated."
}

export async function guardCommand(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    const operation = body && typeof body === "object" && !Array.isArray(body) ? (body as { operation?: unknown }).operation : null
    if (typeof operation !== "string" || !isGuardOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = guardArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    if (operation === "activate" && !guardActivationEnabled()) {
      return reply("Guard activation is disabled until the live activation gate is enabled.", 403, { reason: "activation_disabled" })
    }
    const providerOps = [
      "schedule_period_end_cancellation", "undo_scheduled_cancellation", "map_provider_price",
      "approve_immediate_cancellation",
    ]
    if (providerOps.includes(operation) && !guardSubscriptionsEnabled()) {
      return reply("Guard subscriptions are disabled until the live subscription gate is enabled.", 403, { reason: "subscriptions_disabled" })
    }
    if (operation === "approve_refund" && !guardRefundsEnabled()) {
      return reply("Guard refunds are disabled until the live refund gate is enabled.", 403, { reason: "refunds_disabled" })
    }
    const issuesLink = operation === "issue_permission_action" || operation === "issue_subscription_start_action" || operation === "issue_price_change_action"
    if (issuesLink && !config.customerOrigin) return reply("The customer site origin is not configured.", 503)
    const secret = issuesLink ? newToken() : ""
    const version = "version" in args ? args.version : null
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (issuesLink) payload.secretHash = tokenHash(secret)
    const result = await backend().rpc<{
      status?: string; id?: string; version?: number; expiresAt?: string; replay?: boolean
      exceptionId?: string; reason?: string; activatedAt?: string; offerId?: string
      providerOperationId?: string; idempotencyKey?: string; stripeSubscriptionId?: string
      paymentIntentId?: string; amountMinor?: number; priceVersionId?: number | string
      providerOperationStatus?: string; customerId?: string; serviceOrderId?: string
      guardSubscriptionId?: string; guardRefundId?: string
    }>("admin_guard_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status, result.reason), mapStatus(result.status), {
      ...(result.exceptionId ? { exceptionId: result.exceptionId } : {}),
    })
    if (shouldContinueProviderOperation(result.providerOperationStatus, result.providerOperationId, result.idempotencyKey)) {
      try {
        await executeProviderFollowThrough(operation, result)
      } catch (error) {
        if (error instanceof PaymentsDisabledError) {
          return reply("The request is recorded. Stripe remains disabled, so no provider object was created.", 200, {
            id: result.id, version: result.version, providerPending: true,
          })
        }
        throw error
      }
    }
    const issued = issuesLink && result.replay !== true && result.id && config.customerOrigin
    return reply(
      issued ? "The secure customer action is ready. Copy the customer link now; the secret cannot be shown again."
        : issuesLink ? "This customer action was already created. The secret cannot be shown again."
        : operation === "activate" ? "Guard is active for this location. Live twice-daily checks remain disabled until the check gate and an approved schedule are configured."
        : operation === "create_direct_coverage" ? "Direct Guard coverage was created. Billing stays pending until a confirmed invoice is paid."
        : operation === "create_included_offer" ? "The included 30-day Guard offer is recorded. The customer must still accept it."
        : operation === "create_included_continuation" ? "Included-to-paid continuation is recorded. Recurring consent is still required."
        : "The Guard record has been updated. This does not take payment or start live monitoring.",
      200,
      issued ? { id: result.id, actionUrl: `${config.customerOrigin}/action/${result.id}#t=${secret}`, expiresAt: result.expiresAt }
        : { id: result.id, version: result.version, exceptionId: result.exceptionId, activatedAt: result.activatedAt, offerId: result.offerId },
    )
  } catch {
    return reply("We couldn’t confirm the Guard change. Reload the page before trying again.", 503)
  }
}

function shouldContinueProviderOperation(status?: string, operationId?: string, idempotencyKey?: string) {
  if (!operationId || !idempotencyKey) return false
  return status !== "SUCCEEDED" && status !== "FAILED" && status !== "CANCELLED"
}

async function executeProviderFollowThrough(operation: string, result: {
  providerOperationId?: string
  idempotencyKey?: string
  stripeSubscriptionId?: string
  paymentIntentId?: string
  amountMinor?: number
  priceVersionId?: number | string
  customerId?: string
  serviceOrderId?: string
  guardSubscriptionId?: string
  guardRefundId?: string
  id?: string
}) {
  if (!result.providerOperationId || !result.idempotencyKey) return
  const provider = paymentProvider()
  if (operation === "schedule_period_end_cancellation" || operation === "undo_scheduled_cancellation") {
    if (!result.stripeSubscriptionId) return
    const updated = await provider.setCancelAtPeriodEnd({
      id: result.stripeSubscriptionId,
      idempotencyKey: result.idempotencyKey,
      cancel: operation === "schedule_period_end_cancellation",
    })
    await backend().rpc("guard_confirm_cancellation_v1", {
      p_operation: result.providerOperationId,
      p_object_id: updated.id,
      p_cancel: updated.cancelAtPeriodEnd,
      p_status: "SUCCEEDED",
    })
    return
  }
  if (operation === "approve_immediate_cancellation") {
    if (!result.stripeSubscriptionId) return
    const cancelled = await paymentProvider().cancelSubscriptionImmediate({
      id: result.stripeSubscriptionId,
      idempotencyKey: result.idempotencyKey,
    })
    await backend().rpc("guard_confirm_immediate_cancellation_v1", {
      p_operation: result.providerOperationId, p_object_id: cancelled.id,
    })
    return
  }
  if (operation === "map_provider_price" && result.priceVersionId && result.amountMinor) {
    const created = await provider.createRecurringPrice({
      idempotencyKey: result.idempotencyKey,
      amountMinor: result.amountMinor,
      currency: "GBP",
      priceVersionId: String(result.priceVersionId),
      providerOperationId: result.providerOperationId,
    })
    await backend().rpc("guard_record_provider_price_map_v1", {
      p_operation: result.providerOperationId,
      p_price_version: result.priceVersionId,
      p_product_id: created.productId,
      p_price_id: created.priceId,
      p_actor: null,
    })
    return
  }
  if (operation === "approve_refund" && result.paymentIntentId && result.amountMinor) {
    const refund = await provider.createRefund({
      idempotencyKey: result.idempotencyKey,
      paymentIntentId: result.paymentIntentId,
      amountMinor: result.amountMinor,
      ...(result.customerId && result.serviceOrderId && (result.guardSubscriptionId || result.id) ? {
        metadata: {
          customerId: result.customerId,
          serviceOrderId: result.serviceOrderId,
          guardSubscriptionId: result.guardSubscriptionId || result.id || "",
          providerOperationId: result.providerOperationId,
          guardRefundId: result.guardRefundId || result.id,
        },
      } : {}),
    })
    await backend().rpc("guard_record_refund_v1", {
      p_operation: result.providerOperationId,
      p_refund_id: refund.id,
      p_status: refund.status,
      p_failure: refund.failureReason || "",
    })
  }
}
