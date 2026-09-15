import "server-only"

import {
  isCasePublicRef,
  isCaseType,
  mapFormServiceToCaseType,
  mapFormServiceToIssueSubtype,
  type CaseType,
} from "@/lib/cases/domain"
import {
  buildCaseReceivedCustomerMessage,
  buildCaseReceivedInternalMessage,
} from "@/lib/cases/received-email"
import { buildIntakeSnapshot, enquiryInputFromSnapshot, parseIntakeSnapshot } from "@/lib/cases/snapshot"
import {
  readEnquiryEmailConfig,
  runtimeMayUseLiveProvider,
  type EnquiryEmailConfig,
} from "@/lib/enquiry-config"
import { type EnquiryResult } from "@/lib/enquiry"
import type { EnquiryInput } from "@/lib/enquiry"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import { readSupabaseConfig } from "@/lib/supabase/config"
import type { Database, Json } from "@/lib/supabase/database"
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server"

export type CaseIntakeRpcResult = {
  case_id: string
  public_ref: string
  case_type: string
  customer_id: string
  business_id: string
  location_id: string
  customer_communication_id: string | null
  internal_communication_id: string | null
  was_existing: boolean
  customer_communication_status: string | null
  internal_communication_status: string | null
  intake_snapshot: unknown
  customer_communication_recipient: string | null
  internal_communication_recipient: string | null
}

export type CaseIntakeRpcArgs = Database["public"]["Functions"]["create_case_intake_v1"]["Args"]

export type PersistGetHelpCaseOptions = {
  createIntake?: (args: CaseIntakeRpcArgs) => Promise<CaseIntakeRpcResult>
  updateCommunication?: (
    id: string,
    values: Database["public"]["Tables"]["communications"]["Update"],
  ) => Promise<void>
  provider?: EnquiryProvider
  emailConfig?: EnquiryEmailConfig
  now?: Date
  nodeEnv?: string
}

const GENERIC_DELIVERY_ERROR = "Delivery failed."
const GENERIC_UNAVAILABLE_ERROR = "Delivery unavailable."

function needsDelivery(status: string | null | undefined) {
  return status !== "SENT"
}

function asRpcRow(data: unknown): CaseIntakeRpcResult | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") return null
  const value = row as CaseIntakeRpcResult
  if (!value.case_id || !isCasePublicRef(value.public_ref) || !isCaseType(value.case_type)) {
    return null
  }
  return value
}

async function defaultCreateIntake(args: CaseIntakeRpcArgs): Promise<CaseIntakeRpcResult> {
  const client = createSupabaseServerClient()
  const { data, error } = await client.rpc("create_case_intake_v1", args)
  if (error) {
    console.error("[case-intake] rpc failed")
    throw new Error("CASE_INTAKE_RPC_FAILED")
  }
  const row = asRpcRow(data)
  if (!row) {
    console.error("[case-intake] rpc returned no case")
    throw new Error("CASE_INTAKE_RPC_FAILED")
  }
  return row
}

function defaultUpdateCommunication(client: SupabaseServerClient) {
  return async (
    id: string,
    values: Database["public"]["Tables"]["communications"]["Update"],
  ) => {
    const { error } = await client.from("communications").update(values).eq("id", id)
    if (error) console.error("[case-intake] communication update failed")
  }
}

function liveProvider(config: EnquiryEmailConfig, nodeEnv: string | undefined, injected?: EnquiryProvider) {
  if (injected) return injected
  if (!runtimeMayUseLiveProvider(nodeEnv) || !config.ready) return undefined
  return createResendEnquiryProvider(config.apiKey)
}

async function deliverCommunication(options: {
  id: string | null
  status: string | null
  message: ReturnType<typeof buildCaseReceivedCustomerMessage>
  provider: EnquiryProvider | undefined
  configReady: boolean
  now: Date
  updateCommunication: NonNullable<PersistGetHelpCaseOptions["updateCommunication"]>
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

  try {
    const result = await options.provider.send(options.message)
    if (result.ok) {
      await options.updateCommunication(options.id, {
        status: "SENT",
        provider_message_id: result.id,
        sent_at: options.now.toISOString(),
        error_message: null,
      })
      return true
    }
  } catch {
    console.error("[case-intake] email threw")
  }

  await options.updateCommunication(options.id, {
    status: "FAILED",
    error_message: GENERIC_DELIVERY_ERROR,
  })
  return false
}

export async function persistGetHelpCase(
  data: EnquiryInput,
  submissionKey: string,
  options: PersistGetHelpCaseOptions = {},
): Promise<EnquiryResult> {
  const caseType = mapFormServiceToCaseType(data.service)
  if (!caseType) {
    return { ok: false, message: "Please choose what you need help with." }
  }

  const emailConfig = options.emailConfig ?? readEnquiryEmailConfig()
  const supabaseReady = readSupabaseConfig().ready
  if (!options.createIntake && !supabaseReady) {
    console.error("[case-intake] supabase is not configured")
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  const args: CaseIntakeRpcArgs = {
    p_submission_key: submissionKey,
    p_case_type: caseType,
    p_issue_subtype: mapFormServiceToIssueSubtype(data.service),
    p_full_name: data.fullName,
    p_email: data.email,
    p_phone: data.phone || null,
    p_business_name: data.businessName,
    p_country: data.country,
    p_website_url: data.websiteUrl || null,
    p_business_profile_url: data.businessProfileUrl || null,
    p_review_url: data.reviewUrl || null,
    p_issue_description: data.details,
    p_information_accurate: data.informationAccurate,
    p_privacy_accepted: data.privacyAccepted,
    p_intake_snapshot: buildIntakeSnapshot(data) as Json,
    p_internal_recipient: emailConfig.toEmail || "undelivered",
  }

  let intake: CaseIntakeRpcResult
  try {
    intake = await (options.createIntake ?? defaultCreateIntake)(args)
  } catch {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  const now = options.now ?? new Date()
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const provider = liveProvider(emailConfig, nodeEnv, options.provider)
  const client = options.updateCommunication ? null : (supabaseReady ? createSupabaseServerClient() : null)
  const updateCommunication = options.updateCommunication
    ?? (client ? defaultUpdateCommunication(client) : async () => {})

  const canonicalType = isCaseType(intake.case_type) ? intake.case_type : null
  const snapshot = parseIntakeSnapshot(intake.intake_snapshot)
  const customerRecipient = intake.customer_communication_recipient?.trim() || ""
  const internalRecipient = intake.internal_communication_recipient?.trim() || ""
  const customerNeedsDelivery = Boolean(intake.customer_communication_id) && needsDelivery(intake.customer_communication_status)
  const internalNeedsDelivery = Boolean(intake.internal_communication_id) && needsDelivery(intake.internal_communication_status)

  const success = {
    ok: true as const,
    persisted: true as const,
    caseRef: intake.public_ref,
    caseType: intake.case_type,
    message: "Your assessment has been received.",
  }

  if (!customerNeedsDelivery && !internalNeedsDelivery) {
    return {
      ...success,
      receiptEmailSent: intake.customer_communication_status === "SENT",
    }
  }

  if (!canonicalType || !snapshot) {
    if (customerNeedsDelivery && intake.customer_communication_id) {
      await updateCommunication(intake.customer_communication_id, {
        status: "FAILED",
        error_message: GENERIC_UNAVAILABLE_ERROR,
      })
    }
    if (internalNeedsDelivery && intake.internal_communication_id) {
      await updateCommunication(intake.internal_communication_id, {
        status: "FAILED",
        error_message: GENERIC_UNAVAILABLE_ERROR,
      })
    }
    return {
      ...success,
      receiptEmailSent: intake.customer_communication_status === "SENT",
    }
  }

  const canonicalData = enquiryInputFromSnapshot(snapshot)
  const fromEmail = emailConfig.fromEmail || "undelivered"

  const customerSent = customerRecipient
    ? await deliverCommunication({
      id: intake.customer_communication_id,
      status: intake.customer_communication_status,
      message: buildCaseReceivedCustomerMessage(
        canonicalData,
        canonicalType,
        intake.public_ref,
        fromEmail,
        customerRecipient,
      ),
      provider,
      configReady: emailConfig.ready,
      now,
      updateCommunication,
    })
    : false

  if (!customerRecipient && customerNeedsDelivery && intake.customer_communication_id) {
    await updateCommunication(intake.customer_communication_id, {
      status: "FAILED",
      error_message: GENERIC_UNAVAILABLE_ERROR,
    })
  }

  if (internalRecipient) {
    await deliverCommunication({
      id: intake.internal_communication_id,
      status: intake.internal_communication_status,
      message: buildCaseReceivedInternalMessage(
        canonicalData,
        canonicalType,
        intake.public_ref,
        fromEmail,
        internalRecipient,
        emailConfig.extraReplyTo,
        now,
      ),
      provider,
      configReady: emailConfig.ready,
      now,
      updateCommunication,
    })
  } else if (internalNeedsDelivery && intake.internal_communication_id) {
    await updateCommunication(intake.internal_communication_id, {
      status: "FAILED",
      error_message: GENERIC_UNAVAILABLE_ERROR,
    })
  }

  return {
    ...success,
    receiptEmailSent: customerSent || intake.customer_communication_status === "SENT",
  }
}

export type { CaseType }
