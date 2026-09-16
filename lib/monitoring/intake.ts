import "server-only"

import { readEnquiryEmailConfig, runtimeMayUseLiveProvider, type EnquiryEmailConfig } from "@/lib/enquiry-config"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
import {
  buildMonitoringReceivedCustomerMessage,
  buildMonitoringReceivedInternalMessage,
} from "@/lib/monitoring/received-email"
import { isMonitoringRequestStatus } from "@/lib/monitoring/domain"
import { buildMonitoringIntakeSnapshot, parseMonitoringIntakeSnapshot, type MonitoringIntakeInput } from "@/lib/monitoring/snapshot"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import { readSupabaseConfig } from "@/lib/supabase/config"
import type { Database, Json } from "@/lib/supabase/database"
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server"

export type CreateMonitoringRequestV1Args = Database["public"]["Functions"]["create_monitoring_request_v1"]["Args"]

export type MonitoringIntakeRpcResult = {
  monitoring_request_id: string
  customer_id: string
  business_id: string
  location_id: string
  status: string
  number_of_locations: number
  was_existing: boolean
  customer_communication_id: string | null
  customer_communication_status: string | null
  customer_communication_recipient: string | null
  internal_communication_id: string | null
  internal_communication_status: string | null
  internal_communication_recipient: string | null
  intake_snapshot: unknown
}

export type MonitoringIntakeResult = {
  ok: boolean
  persisted?: boolean
  status?: string
  receiptEmailSent?: boolean
  message: string
}

export type PersistMonitoringRequestOptions = {
  createRequest?: (args: CreateMonitoringRequestV1Args) => Promise<MonitoringIntakeRpcResult>
  updateCommunication?: (
    id: string,
    values: Database["public"]["Tables"]["communications"]["Update"],
  ) => Promise<void>
  provider?: EnquiryProvider
  emailConfig?: EnquiryEmailConfig
  now?: Date
  nodeEnv?: string
}

type CommunicationUpdate = Database["public"]["Tables"]["communications"]["Update"]
type LedgerUpdater = (id: string, values: CommunicationUpdate) => Promise<boolean>

const GENERIC_DELIVERY_ERROR = "Delivery failed."
const GENERIC_UNAVAILABLE_ERROR = "Delivery unavailable."
export const MONITORING_RECEIVED_MESSAGE = "Your Relaunch Guard setup request has been received."

function logIntakeIssue(category: string) {
  console.error(`[monitoring-intake] ${category}`)
}

function needsDelivery(status: string | null | undefined) {
  return status !== "SENT"
}

function asRpcRow(data: unknown): MonitoringIntakeRpcResult | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") return null
  const value = row as MonitoringIntakeRpcResult
  if (!value.monitoring_request_id || !value.customer_id || !value.business_id || !value.location_id) {
    return null
  }
  if (typeof value.status !== "string" || typeof value.number_of_locations !== "number") {
    return null
  }
  return value
}

async function defaultCreateRequest(args: CreateMonitoringRequestV1Args): Promise<MonitoringIntakeRpcResult> {
  const client = createSupabaseServerClient()
  const { data, error } = await client.rpc("create_monitoring_request_v1", args)
  if (error) {
    logIntakeIssue("rpc-failed")
    throw new Error("MONITORING_INTAKE_RPC_FAILED")
  }
  const row = asRpcRow(data)
  if (!row) {
    logIntakeIssue("rpc-empty-result")
    throw new Error("MONITORING_INTAKE_RPC_FAILED")
  }
  return row
}

function defaultUpdateCommunication(client: SupabaseServerClient) {
  return async (
    id: string,
    values: CommunicationUpdate,
  ) => {
    const { error } = await client.from("communications").update(values).eq("id", id)
    if (error) {
      throw new Error("COMMUNICATION_LEDGER_UPDATE_FAILED")
    }
  }
}

function wrapLedgerUpdater(
  update: PersistMonitoringRequestOptions["updateCommunication"] | undefined,
): LedgerUpdater {
  const raw = update ?? (async () => {})
  return async (id, values) => {
    try {
      await raw(id, values)
      return true
    } catch {
      logIntakeIssue("communication-ledger-update-failed")
      return false
    }
  }
}

function liveProvider(config: EnquiryEmailConfig, nodeEnv: string | undefined, injected?: EnquiryProvider) {
  if (injected) return injected
  if (!runtimeMayUseLiveProvider(nodeEnv) || !config.ready) return undefined
  return createResendEnquiryProvider(config.apiKey)
}

async function markUnavailable(
  updateCommunication: LedgerUpdater,
  id: string | null | undefined,
) {
  if (!id) return
  await updateCommunication(id, {
    status: "FAILED",
    error_message: GENERIC_UNAVAILABLE_ERROR,
  })
}

async function deliverCommunication(options: {
  id: string | null
  status: string | null
  message: EnquiryEmailMessage
  provider: EnquiryProvider | undefined
  configReady: boolean
  now: Date
  updateCommunication: LedgerUpdater
}) {
  if (!options.id) return false
  if (options.status === "SENT") return true

  const subject = options.message.subject
  if (!options.provider || !options.configReady) {
    await options.updateCommunication(options.id, {
      subject,
      provider: "resend",
      status: "FAILED",
      error_message: GENERIC_UNAVAILABLE_ERROR,
    })
    return false
  }

  await options.updateCommunication(options.id, {
    subject,
    provider: "resend",
  })

  let accepted = false
  try {
    const result = await options.provider.send(options.message)
    if (result.ok) {
      accepted = true
      await options.updateCommunication(options.id, {
        status: "SENT",
        provider_message_id: result.id,
        sent_at: options.now.toISOString(),
        error_message: null,
      })
      return true
    }
  } catch {
    logIntakeIssue("email-provider-send-failed")
  }

  if (accepted) return true

  await options.updateCommunication(options.id, {
    status: "FAILED",
    error_message: GENERIC_DELIVERY_ERROR,
  })
  return false
}

function publicSuccess(status: string, receiptEmailSent: boolean): MonitoringIntakeResult {
  return {
    ok: true,
    persisted: true,
    status: isMonitoringRequestStatus(status) ? status : "REQUESTED",
    receiptEmailSent,
    message: MONITORING_RECEIVED_MESSAGE,
  }
}

async function processCustomerCommunication(options: {
  intake: MonitoringIntakeRpcResult
  snapshot: ReturnType<typeof parseMonitoringIntakeSnapshot>
  fromEmail: string
  provider: EnquiryProvider | undefined
  configReady: boolean
  now: Date
  updateCommunication: LedgerUpdater
}) {
  const { intake } = options
  if (intake.customer_communication_status === "SENT") return true
  if (!intake.customer_communication_id) return false

  if (!options.snapshot) {
    logIntakeIssue("invalid-persisted-snapshot")
    await markUnavailable(options.updateCommunication, intake.customer_communication_id)
    return false
  }

  const recipient = intake.customer_communication_recipient?.trim() || ""
  if (!recipient) {
    logIntakeIssue("missing-persisted-recipient")
    await markUnavailable(options.updateCommunication, intake.customer_communication_id)
    return false
  }

  return deliverCommunication({
    id: intake.customer_communication_id,
    status: intake.customer_communication_status,
    message: buildMonitoringReceivedCustomerMessage(options.snapshot, options.fromEmail, recipient),
    provider: options.provider,
    configReady: options.configReady,
    now: options.now,
    updateCommunication: options.updateCommunication,
  })
}

async function processInternalCommunication(options: {
  intake: MonitoringIntakeRpcResult
  snapshot: ReturnType<typeof parseMonitoringIntakeSnapshot>
  fromEmail: string
  extraReplyTo: string | undefined
  provider: EnquiryProvider | undefined
  configReady: boolean
  now: Date
  updateCommunication: LedgerUpdater
}) {
  const { intake } = options
  if (intake.internal_communication_status === "SENT") return true
  if (!intake.internal_communication_id) return false

  if (!options.snapshot) {
    logIntakeIssue("invalid-persisted-snapshot")
    await markUnavailable(options.updateCommunication, intake.internal_communication_id)
    return false
  }

  const recipient = intake.internal_communication_recipient?.trim() || ""
  if (!recipient) {
    logIntakeIssue("missing-persisted-recipient")
    await markUnavailable(options.updateCommunication, intake.internal_communication_id)
    return false
  }

  return deliverCommunication({
    id: intake.internal_communication_id,
    status: intake.internal_communication_status,
    message: buildMonitoringReceivedInternalMessage(
      options.snapshot,
      options.fromEmail,
      recipient,
      options.extraReplyTo,
      options.now,
      intake.monitoring_request_id,
    ),
    provider: options.provider,
    configReady: options.configReady,
    now: options.now,
    updateCommunication: options.updateCommunication,
  })
}

async function deliverAfterPersist(
  intake: MonitoringIntakeRpcResult,
  options: PersistMonitoringRequestOptions,
  emailConfig: EnquiryEmailConfig,
): Promise<MonitoringIntakeResult> {
  const customerAlreadySent = intake.customer_communication_status === "SENT"
  const customerNeedsDelivery = Boolean(intake.customer_communication_id) && needsDelivery(intake.customer_communication_status)
  const internalNeedsDelivery = Boolean(intake.internal_communication_id) && needsDelivery(intake.internal_communication_status)

  if (!customerNeedsDelivery && !internalNeedsDelivery) {
    return publicSuccess(intake.status, customerAlreadySent)
  }

  const now = options.now ?? new Date()
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const supabaseReady = readSupabaseConfig().ready
  let provider: EnquiryProvider | undefined
  let updateCommunication = wrapLedgerUpdater(options.updateCommunication)

  try {
    if (!options.updateCommunication && supabaseReady) {
      updateCommunication = wrapLedgerUpdater(defaultUpdateCommunication(createSupabaseServerClient()))
    }
    provider = liveProvider(emailConfig, nodeEnv, options.provider)
  } catch {
    logIntakeIssue("provider-setup-failed")
    if (customerNeedsDelivery) await markUnavailable(updateCommunication, intake.customer_communication_id)
    if (internalNeedsDelivery) await markUnavailable(updateCommunication, intake.internal_communication_id)
    return publicSuccess(intake.status, customerAlreadySent)
  }

  const snapshot = parseMonitoringIntakeSnapshot(intake.intake_snapshot)
  const fromEmail = emailConfig.fromEmail || "undelivered"
  let customerSent = customerAlreadySent

  try {
    customerSent = await processCustomerCommunication({
      intake,
      snapshot,
      fromEmail,
      provider,
      configReady: emailConfig.ready,
      now,
      updateCommunication,
    })
  } catch {
    logIntakeIssue("customer-communication-processing-failed")
    if (!customerSent) await markUnavailable(updateCommunication, intake.customer_communication_id)
  }

  try {
    await processInternalCommunication({
      intake,
      snapshot,
      fromEmail,
      extraReplyTo: emailConfig.extraReplyTo,
      provider,
      configReady: emailConfig.ready,
      now,
      updateCommunication,
    })
  } catch {
    logIntakeIssue("internal-communication-processing-failed")
    if (intake.internal_communication_status !== "SENT") {
      await markUnavailable(updateCommunication, intake.internal_communication_id)
    }
  }

  return publicSuccess(intake.status, customerSent)
}

/**
 * Atomic RPC first, then email. Email failure does not lose the request.
 * Does not insert customers/businesses/locations/requests itself.
 */
export async function persistMonitoringRequest(
  data: MonitoringIntakeInput,
  submissionKey: string,
  options: PersistMonitoringRequestOptions = {},
): Promise<MonitoringIntakeResult> {
  const emailConfig = options.emailConfig ?? readEnquiryEmailConfig()
  const supabaseReady = readSupabaseConfig().ready
  if (!options.createRequest && !supabaseReady) {
    logIntakeIssue("supabase-not-configured")
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  const args: CreateMonitoringRequestV1Args = {
    p_submission_key: submissionKey,
    p_full_name: data.fullName,
    p_email: data.email,
    p_phone: data.phone || null,
    p_business_name: data.businessName,
    p_country: data.country,
    p_website_url: data.websiteUrl || null,
    p_business_profile_url: data.businessProfileUrl,
    p_number_of_locations: data.numberOfLocations,
    p_terms_accepted: data.termsAccepted,
    p_intake_snapshot: buildMonitoringIntakeSnapshot(data) as Json,
    p_internal_recipient: emailConfig.toEmail || "undelivered",
  }

  let intake: MonitoringIntakeRpcResult
  try {
    intake = await (options.createRequest ?? defaultCreateRequest)(args)
  } catch {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  try {
    return await deliverAfterPersist(intake, options, emailConfig)
  } catch {
    logIntakeIssue("post-persistence-handling-failed")
    return publicSuccess(intake.status, intake.customer_communication_status === "SENT")
  }
}
