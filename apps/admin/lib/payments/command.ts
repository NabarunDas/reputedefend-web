import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { paymentProvider } from "../../../../lib/payments"
import { PaymentsDisabledError } from "../../../../lib/payments/provider"
import { LOST_PAYMENT_LINK_NOTE } from "./model"
import { isPaymentOperation, paymentArgs } from "./validation"

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

function commandMessage(status: string | undefined): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That payment record changed. Reload the page and try again."
  if (status === "denied") return "That payment action is not allowed."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "reauth_required") return "Sign in again within the last five minutes to approve a success fee or issue a TEST-MODE hosted invoice fallback."
  return "The payment record could not be updated."
}

async function ensureStripeCustomer(customerId: string): Promise<string> {
  const prepared = await backend().rpc<{
    status?: string
    stripeCustomerId?: string
    needsCreate?: boolean
    providerOperationId?: string
    idempotencyKey?: string
  }>("payment_prepare_customer_v1", { p_customer: customerId })
  if (prepared.stripeCustomerId) return prepared.stripeCustomerId
  const created = await paymentProvider().createCustomer({
    idempotencyKey: prepared.idempotencyKey || "",
    customerId,
  })
  const mapped = await backend().rpc<{ status?: string; stripeCustomerId?: string }>("payment_record_customer_map_v1", {
    p_operation: prepared.providerOperationId, p_stripe_customer_id: created.id,
  })
  if (mapped.status !== "success" || !mapped.stripeCustomerId) throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
  return mapped.stripeCustomerId
}

export async function paymentCommand(request: NextRequest): Promise<NextResponse> {
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
    if (typeof operation !== "string" || !isPaymentOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = paymentArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    const issuesLink = operation.startsWith("issue_")
    if (issuesLink && !config.customerOrigin) return reply("The customer site origin is not configured.", 503)
    const secret = issuesLink ? newToken() : ""
    const version = args.version
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (issuesLink) payload.secretHash = tokenHash(secret)
    if (operation === "issue_invoice_fallback") {
      const prepared = await backend().rpc<{
        status?: string
        reason?: string
        replay?: boolean
        providerOperationId?: string
        idempotencyKey?: string
        attemptId?: string
        invoiceId?: string
        amountMinor?: number
        hostedInvoiceUrl?: string
        customerId?: string
        serviceOrderId?: string
        obligationId?: string
        orderRef?: string
      }>("payment_prepare_invoice_v1", { p_token: tokenHash(token), p_obligation: payload.obligationId })
      if (prepared.status === "reauth_required") return reply(commandMessage("reauth_required"), 403)
      if (prepared.status !== "success") return reply(commandMessage(prepared.status), mapStatus(prepared.status))
      if (!prepared.replay || !prepared.hostedInvoiceUrl) {
        try {
          const stripeCustomer = await ensureStripeCustomer(prepared.customerId || "")
          const invoice = await paymentProvider().createHostedInvoice({
            idempotencyKey: prepared.idempotencyKey || "",
            stripeCustomerId: stripeCustomer,
            amountMinor: prepared.amountMinor || 0,
            currency: "GBP",
            metadata: {
              customerId: prepared.customerId || "",
              serviceOrderId: prepared.serviceOrderId || "",
              obligationId: prepared.obligationId,
              attemptId: prepared.attemptId,
              providerOperationId: prepared.providerOperationId,
              orderRef: prepared.orderRef,
            },
          })
          const recorded = invoice.dueAt
            ? await backend().rpc<{ status?: string }>("payment_record_invoice_v1", {
              p_operation: prepared.providerOperationId,
              p_provider_invoice_id: invoice.id,
              p_hosted_url: invoice.hostedInvoiceUrl,
              p_amount_due: invoice.amountDueMinor,
              p_currency: invoice.currency,
              p_due_at: invoice.dueAt,
            })
            : await backend().rpc<{ status?: string }>("payment_record_invoice_v1", {
              p_operation: prepared.providerOperationId,
              p_provider_invoice_id: invoice.id,
              p_hosted_url: invoice.hostedInvoiceUrl,
              p_amount_due: invoice.amountDueMinor,
              p_currency: invoice.currency,
            })
          if (recorded.status !== "success") return reply("The TEST-MODE hosted invoice could not be recorded.", 409)
        } catch (error) {
          if (error instanceof PaymentsDisabledError) {
            return reply("TEST-MODE FOUNDATION: a hosted invoice cannot be issued until Stripe test payments and seller/tax configuration are enabled.", 503)
          }
          throw error
        }
      }
    }
    const result = await backend().rpc<{ status?: string; id?: string; obligationId?: string; expiresAt?: string; replay?: boolean }>("admin_payment_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    const issued = issuesLink && result.replay !== true && result.id && config.customerOrigin
    return reply(
      issued ? (operation === "issue_invoice_fallback"
        ? `TEST-MODE hosted invoice fallback is ready. Returning from the invoice page does not mark this paid. ${LOST_PAYMENT_LINK_NOTE}`
        : `The secure customer payment action is ready. ${LOST_PAYMENT_LINK_NOTE}`)
        : issuesLink ? "This payment action was already created. The secret cannot be shown again."
        : operation === "approve_success_fee" ? "The success fee is approved. Collection, if ready, is queued. This did not charge a card from this page."
        : "The payment record has been updated.",
      200,
      issued ? { id: result.id, actionUrl: `${config.customerOrigin}/action/${result.id}#t=${secret}`, expiresAt: result.expiresAt, obligationId: result.obligationId }
        : { id: result.id, obligationId: result.obligationId },
    )
  } catch {
    return reply("We couldn’t confirm the payment change. Reload the page before trying again.", 503)
  }
}
