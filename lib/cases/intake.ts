import "server-only"
import {
  developDevIntakeMailLane,
  featurePreviewMailLogLine,
  intakeMailLane,
  observeIntakeMailRuntime,
} from "@/lib/cases/persistence-config"
import {
  createMemoryIntakeMailLedger,
  planIntakeMailClaim,
  type IntakeMailLedger,
} from "@/lib/cases/intake-mail-ledger"

import {
  isCasePublicRef,
  isCaseType,
  mapFormServiceToCaseType,
  mapFormServiceToIssueSubtype,
  type CaseType,
} from "@/lib/cases/domain"
import {
  emailConfirmationStatus,
  planInitialEmailConfirmation,
} from "@/lib/cases/email-confirmation"
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
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
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
  mailLedger?: IntakeMailLedger
  /** A caller-supplied database client. Production creates its own. */
  supabaseClient?: SupabaseServerClient
  /**
   * Builds the one-time confirmation link for the first receipt.
   * Absent means the normal planner, which omits the button when a secure
   * link cannot be made. The returned URL is for the outbound message only.
   */
  resolveEmailConfirmation?: (input: { caseId: string; email: string }) => Promise<string | null>
}

const GENERIC_DELIVERY_ERROR = "Delivery failed."
const GENERIC_UNAVAILABLE_ERROR = "Delivery unavailable."
const FEATURE_PREVIEW_UNAVAILABLE = "Not sent. This preview does not send case email."

export type IntakeDeliveryOutcome = "sent" | "failed" | "unknown" | "skipped"

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

async function defaultResolveEmailConfirmation(
  caseId: string,
  email: string,
  client: SupabaseServerClient | null,
): Promise<string | null> {
  const plan = planInitialEmailConfirmation(caseId, email)
  if (!plan || !client) return null
  try {
    const prepared = await client.rpc("prepare_email_confirmation_challenge_v1", {
      p_case: caseId,
      p_challenge: plan.challengeId,
      p_email: plan.email,
      p_environment: plan.environment,
      p_token_hash: plan.tokenHash,
      p_key_version: plan.keyVersion,
    })
    if (prepared.error || emailConfirmationStatus(prepared.data) !== "ready") return null
    return plan.deliveryUrl
  } catch {
    console.error("[case-intake] email confirmation omitted")
    return null
  }
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

function messageWithIdempotency(message: EnquiryEmailMessage, id: string): EnquiryEmailMessage {
  return { ...message, idempotencyKey: `case-intake:${id}` }
}

async function deliverCommunication(options: {
  id: string | null
  status: string | null
  message: ReturnType<typeof buildCaseReceivedCustomerMessage>
  provider: EnquiryProvider | undefined
  configReady: boolean
  unavailableError: string
  now: Date
  updateCommunication: NonNullable<PersistGetHelpCaseOptions["updateCommunication"]>
  mailLedger: IntakeMailLedger
}): Promise<IntakeDeliveryOutcome> {
  if (!options.id) return "skipped"
  if (options.status === "SENT") return "sent"

  const subject = options.message.subject
  if (!options.provider || !options.configReady) {
    await options.updateCommunication(options.id, {
      subject,
      provider: "resend",
      status: "FAILED",
      error_message: options.unavailableError,
    })
    return "failed"
  }

  const claimed = await options.mailLedger.claim(options.id)
  if (claimed.outcome === "accepted") return "sent"
  if (claimed.outcome !== "claimed") return claimed.outcome === "exhausted" ? "failed" : "unknown"

  let result: Awaited<ReturnType<EnquiryProvider["send"]>>
  try {
    result = await options.provider.send(messageWithIdempotency(options.message, options.id))
  } catch {
    console.error("[case-intake] email threw")
    await options.mailLedger.recordUnknown(options.id, claimed.claim, { subject })
    return "unknown"
  }

  if (result.ok) {
    const wrote = await options.mailLedger.recordAccepted(options.id, claimed.claim, {
      subject,
      providerMessageId: result.id,
      sentAt: options.now.toISOString(),
    })
    return wrote ? "sent" : "unknown"
  }
  if (result.reason === "rejected") {
    await options.mailLedger.recordRejected(options.id, claimed.claim, { subject })
    return "failed"
  }
  await options.mailLedger.recordUnknown(options.id, claimed.claim, { subject })
  return "unknown"
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

  return (await deliverPersistedIntake(intake, options)).result
}

type PersistedIntakeDelivery = {
  result: EnquiryResult
  customer: IntakeDeliveryOutcome
  internal: IntakeDeliveryOutcome
}

async function deliverPersistedIntake(
  intake: CaseIntakeRpcResult,
  options: PersistGetHelpCaseOptions,
): Promise<PersistedIntakeDelivery> {
  const emailConfig = options.emailConfig ?? readEnquiryEmailConfig()
  const supabaseReady = readSupabaseConfig().ready
  const now = options.now ?? new Date()
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const client = options.updateCommunication
    ? null
    : (options.supabaseClient ?? (supabaseReady ? createSupabaseServerClient() : null))
  const updateCommunication = options.updateCommunication
    ?? (client ? defaultUpdateCommunication(client) : async () => {})

  const canonicalType = isCaseType(intake.case_type) ? intake.case_type : null
  const snapshot = parseIntakeSnapshot(intake.intake_snapshot)
  const customerRecipient = intake.customer_communication_recipient?.trim() || ""
  const internalRecipient = intake.internal_communication_recipient?.trim() || ""
  const customerNeedsDelivery = Boolean(intake.customer_communication_id) && needsDelivery(intake.customer_communication_status)
  const internalNeedsDelivery = Boolean(intake.internal_communication_id) && needsDelivery(intake.internal_communication_status)
  const featurePreview = intakeMailLane() === "feature-preview"
  const devClosed = (customerNeedsDelivery || internalNeedsDelivery) && featurePreview
  if (devClosed) {
    console.error(featurePreviewMailLogLine(observeIntakeMailRuntime()))
  }
  const provider = devClosed ? undefined : liveProvider(emailConfig, nodeEnv, options.provider)
  const unavailableError = devClosed ? FEATURE_PREVIEW_UNAVAILABLE : GENERIC_UNAVAILABLE_ERROR
  const mailLedger = resolveMailLedger(intake, options, client, updateCommunication)

  const success = {
    ok: true as const,
    persisted: true as const,
    caseRef: intake.public_ref,
    caseType: intake.case_type,
    message: "Your assessment has been received.",
  }

  const customerReceipt = (sent: boolean) => {
    if (sent) return { receiptEmailSent: true as const, receiptEmailStatus: "sent" as const }
    if (devClosed) return { receiptEmailSent: false as const, receiptEmailStatus: "suppressed" as const }
    return { receiptEmailSent: false as const, receiptEmailStatus: "unavailable" as const }
  }

  const report = (
    result: EnquiryResult,
    customer: IntakeDeliveryOutcome,
    internal: IntakeDeliveryOutcome,
  ): PersistedIntakeDelivery => ({ result, customer, internal })

  if (!customerNeedsDelivery && !internalNeedsDelivery) {
    return report({
      ...success,
      emailConfirmation: "omitted",
      ...customerReceipt(intake.customer_communication_status === "SENT"),
    }, intake.customer_communication_status === "SENT" ? "sent" : "skipped", intake.internal_communication_status === "SENT" ? "sent" : "skipped")
  }

  if (!canonicalType || !snapshot) {
    if (customerNeedsDelivery && intake.customer_communication_id) {
      await updateCommunication(intake.customer_communication_id, {
        status: "FAILED",
        error_message: unavailableError,
      })
    }
    if (internalNeedsDelivery && intake.internal_communication_id) {
      await updateCommunication(intake.internal_communication_id, {
        status: "FAILED",
        error_message: unavailableError,
      })
    }
    return report({
      ...success,
      emailConfirmation: "omitted",
      ...customerReceipt(intake.customer_communication_status === "SENT"),
    }, customerNeedsDelivery ? "failed" : "skipped", internalNeedsDelivery ? "failed" : "skipped")
  }

  const canonicalData = enquiryInputFromSnapshot(snapshot)
  const confirmationUrl = customerNeedsDelivery && customerRecipient
    ? await (options.resolveEmailConfirmation ?? ((input: { caseId: string; email: string }) =>
      defaultResolveEmailConfirmation(input.caseId, input.email, client)))({
      caseId: intake.case_id,
      email: customerRecipient,
    })
    : null
  const fromEmail = emailConfig.fromEmail || "undelivered"

  let customerOutcome: IntakeDeliveryOutcome = customerRecipient
    ? await deliverCommunication({
      id: intake.customer_communication_id,
      status: intake.customer_communication_status,
      message: buildCaseReceivedCustomerMessage(
        canonicalData,
        canonicalType,
        intake.public_ref,
        fromEmail,
        customerRecipient,
        confirmationUrl,
      ),
      provider,
      configReady: emailConfig.ready && !devClosed,
      unavailableError,
      now,
      updateCommunication,
      mailLedger,
    })
    : "skipped" as const

  if (!customerRecipient && customerNeedsDelivery && intake.customer_communication_id) {
    await updateCommunication(intake.customer_communication_id, {
      status: "FAILED",
      error_message: unavailableError,
    })
    customerOutcome = "failed"
  }

  let internalOutcome: IntakeDeliveryOutcome = internalRecipient
    ? await deliverCommunication({
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
      configReady: emailConfig.ready && !devClosed,
      unavailableError,
      now,
      updateCommunication,
      mailLedger,
    })
    : "skipped" as const

  if (!internalRecipient && internalNeedsDelivery && intake.internal_communication_id) {
    await updateCommunication(intake.internal_communication_id, {
      status: "FAILED",
      error_message: unavailableError,
    })
    internalOutcome = "failed"
  }

  return report({
    ...success,
    // Creating a challenge does not mean an email has gone out.
    // Only the provider-accepted customer receipt can be presented as sent.
    emailConfirmation: confirmationUrl && customerOutcome === "sent" ? "pending" : "omitted",
    ...customerReceipt(customerOutcome === "sent" || intake.customer_communication_status === "SENT"),
  }, customerOutcome, internalOutcome)
}

const CASE_ID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export type IntakeMailIdentity = { caseId: string; publicRef: string }

export type IntakeMailAudit = {
  caseId: string
  customer: IntakeDeliveryOutcome
  internal: IntakeDeliveryOutcome
}

function validIntakeIdentity(identity: IntakeMailIdentity) {
  return CASE_ID_PATTERN.test(identity.caseId) && isCasePublicRef(identity.publicRef)
}

function resolveMailLedger(
  intake: CaseIntakeRpcResult,
  options: PersistGetHelpCaseOptions,
  client: SupabaseServerClient | null,
  updateCommunication: NonNullable<PersistGetHelpCaseOptions["updateCommunication"]>,
): IntakeMailLedger {
  if (options.mailLedger) return options.mailLedger
  if (client && !options.updateCommunication) return createSupabaseIntakeMailLedger(client)
  const memory = createMemoryIntakeMailLedger(updateCommunication)
  if (intake.customer_communication_id) {
    memory.seed(intake.customer_communication_id, {
      status: intake.customer_communication_status,
      providerMessageId: null,
      metadata: {},
    })
  }
  if (intake.internal_communication_id) {
    memory.seed(intake.internal_communication_id, {
      status: intake.internal_communication_status,
      providerMessageId: null,
      metadata: {},
    })
  }
  return memory
}

function createSupabaseIntakeMailLedger(client: SupabaseServerClient): IntakeMailLedger {
  const held = new Map<string, Json>()

  const updateClaim = (id: string, claim: string, values: Database["public"]["Tables"]["communications"]["Update"]) =>
    client.from("communications").update(values).eq("id", id).filter("metadata->>intakeClaim", "eq", claim).select("id").maybeSingle()

  return {
    async claim(id) {
      const { data, error } = await client.from("communications")
        .select("status, provider_message_id, metadata")
        .eq("id", id)
        .maybeSingle()
      if (error || !data) return { outcome: "held" }
      const decision = planIntakeMailClaim({
        status: data.status,
        providerMessageId: data.provider_message_id,
        metadata: data.metadata,
      }, crypto.randomUUID())
      if (decision.outcome !== "claimed" || !decision.metadata) {
        return decision.outcome === "claimed" ? { outcome: "held" } : { outcome: decision.outcome }
      }
      const updated = await client.from("communications")
        .update({ metadata: decision.metadata, provider: "resend" })
        .eq("id", id)
        .in("status", ["PENDING", "FAILED"])
        .is("provider_message_id", null)
        .filter("metadata->>intakeClaim", "is", null)
        .select("id")
        .maybeSingle()
      if (updated.error || !updated.data) return { outcome: "held" }
      held.set(id, decision.metadata)
      return { outcome: "claimed", claim: decision.claim }
    },
    async recordAccepted(id, claim, write) {
      const metadata = { ...(held.get(id) as { [key: string]: Json | undefined } ?? {}), intakeState: "accepted" }
      const updated = await updateClaim(id, claim, {
        subject: write.subject,
        provider: "resend",
        status: "SENT",
        provider_message_id: write.providerMessageId,
        sent_at: write.sentAt,
        error_message: null,
        metadata,
      })
      if (!updated.error && updated.data) return true
      await updateClaim(id, claim, {
        subject: write.subject,
        provider: "resend",
        status: "FAILED",
        error_message: GENERIC_DELIVERY_ERROR,
        metadata: { ...(held.get(id) as { [key: string]: Json | undefined } ?? {}), intakeState: "unknown" },
      })
      return false
    },
    async recordRejected(id, claim, write) {
      await updateClaim(id, claim, {
        subject: write.subject,
        provider: "resend",
        status: "FAILED",
        error_message: GENERIC_DELIVERY_ERROR,
        metadata: { ...(held.get(id) as { [key: string]: Json | undefined } ?? {}), intakeClaim: null, intakeState: "rejected" },
      })
    },
    async recordUnknown(id, claim, write) {
      await updateClaim(id, claim, {
        subject: write.subject,
        provider: "resend",
        status: "FAILED",
        error_message: GENERIC_DELIVERY_ERROR,
        metadata: { ...(held.get(id) as { [key: string]: Json | undefined } ?? {}), intakeState: "unknown" },
      })
    },
  }
}

async function defaultLoadIntake(identity: IntakeMailIdentity): Promise<CaseIntakeRpcResult | null> {
  if (!readSupabaseConfig().ready) return null
  const client = createSupabaseServerClient()
  const { data: caseRow, error } = await client
    .from("cases")
    .select("id, public_ref, case_type, intake_snapshot")
    .eq("id", identity.caseId)
    .maybeSingle()
  if (error) {
    console.error("[case-intake] retry load failed")
    return null
  }
  if (!caseRow || caseRow.public_ref !== identity.publicRef || !isCasePublicRef(caseRow.public_ref) || !isCaseType(caseRow.case_type)) {
    return null
  }

  const { data: comms, error: commError } = await client
    .from("communications")
    .select("id, status, recipient, communication_type, created_at")
    .eq("case_id", caseRow.id)
    .in("communication_type", ["CASE_RECEIVED_CUSTOMER", "CASE_RECEIVED_INTERNAL"])
    .order("created_at", { ascending: true })
  if (commError || !comms) {
    console.error("[case-intake] retry load failed")
    return null
  }
  const customer = comms.find((row) => row.communication_type === "CASE_RECEIVED_CUSTOMER")
  const internal = comms.find((row) => row.communication_type === "CASE_RECEIVED_INTERNAL")
  return {
    case_id: caseRow.id,
    public_ref: caseRow.public_ref,
    case_type: caseRow.case_type,
    customer_id: caseRow.id,
    business_id: caseRow.id,
    location_id: caseRow.id,
    customer_communication_id: customer?.id ?? null,
    internal_communication_id: internal?.id ?? null,
    was_existing: true,
    customer_communication_status: customer?.status ?? null,
    internal_communication_status: internal?.status ?? null,
    intake_snapshot: caseRow.intake_snapshot,
    customer_communication_recipient: customer?.recipient ?? null,
    internal_communication_recipient: internal?.recipient ?? null,
  }
}

async function defaultAudit(event: IntakeMailAudit) {
  if (!readSupabaseConfig().ready) return
  const client = createSupabaseServerClient()
  const { error } = await client.from("case_events").insert({
    case_id: event.caseId,
    event_type: "CASE_INTAKE_MAIL_RETRY",
    actor_type: "ADMIN",
    event_data: { customer: event.customer, internal: event.internal },
  })
  if (error) console.error("[case-intake] retry audit failed")
}

/**
 * Sends the stored customer acknowledgement and internal notice for one
 * existing case. The case id and the public reference must both match the
 * stored row. A public reference on its own is not enough. This does not
 * insert a case, and it does not accept a recipient.
 */
export async function retryStoredIntakeMail(
  identity: IntakeMailIdentity,
  options: PersistGetHelpCaseOptions & {
    loadIntake?: (identity: IntakeMailIdentity) => Promise<CaseIntakeRpcResult | null>
    audit?: (event: IntakeMailAudit) => Promise<void>
  } = {},
): Promise<EnquiryResult> {
  if (!developDevIntakeMailLane() || !validIntakeIdentity(identity)) {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }
  const intake = await (options.loadIntake ?? defaultLoadIntake)(identity)
  if (!intake || intake.case_id !== identity.caseId || intake.public_ref !== identity.publicRef) {
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }
  const delivery = await deliverPersistedIntake(intake, options)
  try {
    await (options.audit ?? defaultAudit)({
      caseId: identity.caseId,
      customer: delivery.customer,
      internal: delivery.internal,
    })
  } catch {
    console.error("[case-intake] retry audit failed")
  }
  return delivery.result
}

export type { CaseType }
