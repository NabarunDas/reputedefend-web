import "server-only"
import { readEnquiryEmailConfig, runtimeAllowsSimulation, runtimeMayUseLiveProvider, type EnquiryEmailConfig } from "@/lib/enquiry-config"
import { buildInternalEnquiryMessage, buildCustomerAcknowledgementMessage, ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import type { EnquiryInput, EnquiryResult } from "@/lib/enquiry"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import { readSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database"
export type EnquiryReceipt = { status: "created" | "existing" | "conflict" | "invalid"; id?: string; attempt?: string; sendAck?: boolean }
type DeliveryStatus = "SENT" | "FAILED" | "UNKNOWN" | "SKIPPED"
export type GeneralIntakeOptions = {
  create?: (key: string, data: EnquiryInput, ack: boolean) => Promise<EnquiryReceipt>
  finish?: (id: string, attempt: string, internal: DeliveryStatus, ack: DeliveryStatus) => Promise<void>
  provider?: EnquiryProvider
  config?: EnquiryEmailConfig
  nodeEnv?: string
}
async function create(key: string, payload: EnquiryInput, ack: boolean): Promise<EnquiryReceipt> {
  const { data, error } = await createSupabaseServerClient().rpc("create_general_enquiry_v1", { p_key: key, p_data: payload as unknown as Json, p_ack: ack }).abortSignal(AbortSignal.timeout(8000))
  if (error || !data) throw new Error("Enquiry storage unavailable")
  return data as unknown as EnquiryReceipt
}
async function finish(id: string, attempt: string, internal: DeliveryStatus, ack: DeliveryStatus) {
  const { error } = await createSupabaseServerClient().rpc("finish_general_enquiry_notification_v1", { p_id: id, p_attempt: attempt, p_internal: internal, p_ack: ack }).abortSignal(AbortSignal.timeout(8000))
  if (error) throw new Error("Notification outcome unavailable")
}
async function send(provider: EnquiryProvider, message: Parameters<EnquiryProvider["send"]>[0]): Promise<DeliveryStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      provider.send(message),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8000) }),
    ])
    return result === null ? "UNKNOWN" : result.ok ? "SENT" : result.reason === "error" ? "UNKNOWN" : "FAILED"
  } catch { return "UNKNOWN" }
  finally { if (timer) clearTimeout(timer) }
}
/** Persist first. Duplicate submissions never trigger another notification attempt. */
export async function persistGeneralEnquiry(data: EnquiryInput, key: string, options: GeneralIntakeOptions = {}): Promise<EnquiryResult> {
  const config = options.config ?? readEnquiryEmailConfig(), nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  if (!options.create && !readSupabaseConfig().ready) {
    if (runtimeAllowsSimulation(nodeEnv)) return { ok: true, simulated: true, message: "Development simulation only. No enquiry has been saved or sent." }
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }
  let receipt: EnquiryReceipt
  try { receipt = await (options.create ?? create)(key, data, config.sendCustomerAck) }
  catch { return { ok: false, message: ENQUIRY_UNAVAILABLE } }
  if (receipt.status === "conflict" || receipt.status === "invalid") return { ok: false, message: "Please reload the form and submit your enquiry again." }
  if (receipt.status !== "created" && receipt.status !== "existing") return { ok: false, message: ENQUIRY_UNAVAILABLE }
  const success = { ok: true, persisted: true, message: "Your enquiry has been received." }
  if (receipt.status === "existing") return success
  // Any failure after the commit must leave the customer with a truthful receipt.
  if (!receipt.id || !receipt.attempt) return success
  let internal: DeliveryStatus = "FAILED", ack: DeliveryStatus = receipt.sendAck ? "FAILED" : "SKIPPED"
  try {
    const provider = options.provider ?? (config.ready && runtimeMayUseLiveProvider(nodeEnv) ? createResendEnquiryProvider(config.apiKey) : undefined)
    if (provider && config.ready) {
      internal = await send(provider, buildInternalEnquiryMessage(data, config, new Date()))
      if (receipt.sendAck && config.sendCustomerAck) ack = await send(provider, buildCustomerAcknowledgementMessage(data, config))
      else ack = "SKIPPED"
    }
  } catch { /* The saved enquiry remains actionable in the admin queue. */ }
  try { await (options.finish ?? finish)(receipt.id, receipt.attempt, internal, ack) }
  catch { console.error("[enquiry-intake] notification outcome could not be confirmed") }
  return success
}
