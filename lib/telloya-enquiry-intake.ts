/**
 * Telloya enquiry intake - bridges Telloya types with existing enquiry infrastructure
 */

import "server-only"
import { readEnquiryEmailConfig, runtimeAllowsSimulation, runtimeMayUseLiveProvider } from "@/lib/enquiry-config"
import { readSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import type { Json } from "@/lib/supabase/database"
import { 
  type TelloyaEnquiryInput, 
  type TelloyaEnquiryResult,
  telloyaEnquiryToPayload 
} from "@/lib/telloya-enquiry"
import {
  buildTelloyaInternalMessage,
  buildTelloyaCustomerAcknowledgement,
} from "@/lib/telloya-enquiry-delivery"

type DeliveryStatus = "SENT" | "FAILED" | "UNKNOWN" | "SKIPPED"

const ENQUIRY_UNAVAILABLE = "We're unable to process enquiries right now. Please try again in a few minutes, or email us directly."

async function send(provider: any, message: any): Promise<DeliveryStatus> {
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

/**
 * Persist a Telloya enquiry using the existing general enquiry infrastructure
 * 
 * This function:
 * 1. Converts Telloya-specific fields to the database payload format
 * 2. Persists to the enquiries table with TY reference generation
 * 3. Sends Telloya-branded emails to customer and internal team
 * 4. Returns the TY reference to display to the customer
 * 
 * @param data Validated Telloya enquiry input
 * @param key Submission key for idempotency
 * @returns Result with TY reference
 */
export async function persistTelloyaEnquiry(
  data: TelloyaEnquiryInput,
  key: string,
): Promise<TelloyaEnquiryResult> {
  const config = readEnquiryEmailConfig()
  const nodeEnv = process.env.NODE_ENV

  // Check if database is ready
  if (!readSupabaseConfig().ready) {
    if (runtimeAllowsSimulation(nodeEnv)) {
      return { 
        ok: true, 
        simulated: true, 
        message: "Development simulation only. No enquiry has been saved or sent.",
        enquiryRef: "TY-26-DEMO00"
      }
    }
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  // Convert Telloya fields to database payload format
  const payload = telloyaEnquiryToPayload(data)

  // Persist enquiry to database
  let receipt: any
  try {
    const { data: rpcData, error } = await createSupabaseServerClient()
      .rpc("create_general_enquiry_v1", { 
        p_key: key, 
        p_data: payload as unknown as Json, 
        p_ack: config.sendCustomerAck 
      })
      .abortSignal(AbortSignal.timeout(8000))
    
    if (error || !rpcData) {
      throw new Error("Enquiry storage unavailable")
    }
    
    receipt = rpcData
  } catch {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  // Handle receipt status
  if (receipt.status === "conflict" || receipt.status === "invalid") {
    return { ok: false, message: "Please reload the form and submit your enquiry again." }
  }

  if (receipt.status !== "created" && receipt.status !== "existing") {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  const success = { 
    ok: true, 
    persisted: true, 
    message: "Your enquiry has been received.", 
    enquiryRef: receipt.enquiryRef 
  }

  // If this is an existing enquiry, return immediately
  if (receipt.status === "existing") {
    return success
  }

  // Send emails (only for newly created enquiries)
  if (!receipt.id || !receipt.attempt || !receipt.enquiryRef) {
    return success
  }

  let internal: DeliveryStatus = "FAILED"
  let ack: DeliveryStatus = receipt.sendAck ? "FAILED" : "SKIPPED"

  try {
    const provider = config.ready && runtimeMayUseLiveProvider(nodeEnv) 
      ? createResendEnquiryProvider(config.apiKey) 
      : undefined

    if (provider && config.ready) {
      // Send internal notification
      internal = await send(
        provider, 
        buildTelloyaInternalMessage(
          data,
          receipt.enquiryRef,
          config,
          new Date()
        )
      )

      // Send customer acknowledgement if configured
      if (receipt.sendAck && config.sendCustomerAck) {
        ack = await send(
          provider, 
          buildTelloyaCustomerAcknowledgement(
            data,
            receipt.enquiryRef,
            config
          )
        )
      } else {
        ack = "SKIPPED"
      }
    }
  } catch {
    // Email failure does not invalidate the persisted enquiry
  }

  // Update notification status
  try {
    await createSupabaseServerClient()
      .rpc("finish_general_enquiry_notification_v1", {
        p_id: receipt.id,
        p_attempt: receipt.attempt,
        p_internal: internal,
        p_ack: ack,
      })
      .abortSignal(AbortSignal.timeout(8000))
  } catch {
    console.error("[telloya-intake] notification outcome could not be confirmed")
  }

  return success
}
